import { Router } from 'express';
import type { Request, Response } from 'express';
import { story } from './story.ts';
import { chat, extractJson, getOllamaState, readConfig } from './llm.ts';
import type { EndingKey, Vars } from '../src/engine/types';
import {
  PREWRITTEN,
  PREWRITTEN_EPILOGUE,
  fillEpilogue,
  pickNarration,
} from '../src/content/prewritten.ts';

export const api = Router();

/* ------------------------------------------------------------------ */
/* 工具：中文二元组相似度（无 Key 时的本地裁定）                          */
/* ------------------------------------------------------------------ */

function bigrams(text: string): Set<string> {
  const clean = text.replace(/[\s\p{P}]/gu, '');
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

function similarity(a: string, b: string): number {
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (!sa.size || !sb.size) return 0;
  let hit = 0;
  for (const g of sa) if (sb.has(g)) hit++;
  return hit / Math.min(sa.size, sb.size);
}

/**
 * 无模型时的本地裁定：按字面相似度把玩家动作匹配到最接近的候选分支。
 * 至少保证「玩家写了什么」不会被完全无视。
 */
function localVerdict(nodeId: string, action: string): { nodeId: string; narration: string } {
  const free = story.nodes[nodeId]?.freeAction;
  if (!free) return { nodeId, narration: '' };

  const scored = free.allowed
    .map((id) => {
      const node = story.nodes[id];
      const corpus = `${node.title}${node.lines.map((l) => l.text).join('')}`;
      return { id, score: similarity(action, corpus) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const matched = Boolean(best && best.score > 0.08);
  const target = matched ? best.id : free.fallback;

  // 二级兜底：预写裁定库（按命中的支线取对应描写），比通用句更像人写的
  const bank = PREWRITTEN[nodeId];
  const pool = matched ? bank?.candidates[target] : bank?.fallback;

  return {
    nodeId: target,
    narration:
      pickNarration(pool) ??
      (matched
        ? '你按自己的方式做了。记忆沿着这条线，往下走了一段。'
        : '这条路没有走通。你退回来，选了最稳妥的那一条。'),
  };
}

/* ------------------------------------------------------------------ */
/* POST /api/narrate —— 自由行动裁定                                    */
/* ------------------------------------------------------------------ */

interface NarrateBody {
  nodeId?: string;
  action?: string;
  vars?: Vars;
}

interface Verdict {
  verdict: 'success' | 'partial' | 'fail';
  narration: string;
  nodeId: string;
}

api.post('/narrate', async (req: Request, res: Response) => {
  const { nodeId, action } = (req.body ?? {}) as NarrateBody;

  const node = nodeId ? story.nodes[nodeId] : undefined;
  if (!node?.freeAction) {
    return res.status(400).json({ ok: false, error: 'NOT_A_FREE_ACTION_NODE' });
  }

  const text = (action ?? '').trim().slice(0, 120);
  if (!text) {
    return res.status(400).json({ ok: false, error: 'EMPTY_ACTION' });
  }

  const free = node.freeAction;
  const cfg = readConfig();

  // 无 Key：本地降级，不报错
  if (!cfg.enabled) {
    const fallback = localVerdict(node.id, text);
    return res.json({
      ok: true,
      degraded: true,
      reason: 'NO_API_KEY',
      nodeId: fallback.nodeId,
      narration: fallback.narration,
      verdict: 'partial',
    });
  }

  const candidates = free.allowed
    .map((id) => {
      const n = story.nodes[id];
      return `- ${id}：${n.title}｜${n.lines[0]?.text ?? ''}`;
    })
    .join('\n');

  const system = [
    '你是互动影游《回声》的叙事裁判。玩家写下一个行动，你判断它通向哪条支线，并写两三句衔接描写。',
    '',
    '文风要求（很重要，不遵守会被判为不合格）：',
    '- 第二人称，短句，白描。只写具体的动作和感官细节。',
    '- 禁止：比喻、夸张词（猛地/瞬间/踉跄/如利刃悬颈/仿佛/如同）、形容词堆砌、心理独白、感叹号。',
    '- 单句不超过 25 字，全文 40-70 字。',
    '- 只写角色采取行动的这几秒，不要写行动的结果，也不要提前写下一场景会发生什么。',
    '- 参考写法：「你把监控拖进解码器。雨大得看不清人脸。进度条跳了九十秒。」',
    '',
    '规则：',
    `1. nodeId 只能从下列候选里选一个，不能编造：${free.allowed.join(', ')}`,
    '2. verdict 只能是 success / partial / fail 之一，表示这个动作的顺利程度。',
    '只输出 JSON，形如：{"nodeId":"...","verdict":"partial","narration":"..."}',
  ].join('\n');

  const user = [
    `当前场景：${node.title}`,
    `场景原文：${node.lines.map((l) => l.text).join(' ')}`,
    `玩家提问：${free.prompt}`,
    `玩家行动：${text}`,
    '候选支线：',
    candidates,
  ].join('\n');

  try {
    const raw = await chat(cfg, { system, user, temperature: 0.8, timeoutMs: 9000 });
    const parsed = extractJson<Verdict>(raw);

    // 双保险：模型可能返回白名单外的节点，一律回退
    const safeNode =
      parsed && free.allowed.includes(parsed.nodeId) ? parsed.nodeId : free.fallback;
    const narration =
      parsed?.narration && parsed.narration.length <= 140
        ? parsed.narration
        : '你做了该做的事。接下来的部分，记忆自己会接上。';

    console.log(`[narrate] ${node.id} -> ${safeNode} (${parsed ? 'llm' : 'parse-fallback'})`);

    return res.json({
      ok: true,
      degraded: false,
      nodeId: safeNode,
      narration,
      verdict: parsed?.verdict ?? 'partial',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    console.warn(`[narrate] 调用失败，已降级: ${message}`);
    const fallback = localVerdict(node.id, text);
    return res.json({
      ok: true,
      degraded: true,
      reason: 'LLM_ERROR',
      nodeId: fallback.nodeId,
      narration: fallback.narration,
      verdict: 'partial',
    });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/epilogue —— 个性化结案摘要                                 */
/* ------------------------------------------------------------------ */

interface EpilogueBody {
  endingKey?: EndingKey;
  vars?: Vars;
}

/** 无模型时的模板摘要：从预写库里随机取一条，保证结局页永远有像样的内容 */
function localEpilogue(body: EpilogueBody): string {
  const integrity = body.vars?.integrity ?? 0;
  const pool = body.endingKey ? PREWRITTEN_EPILOGUE[body.endingKey] : undefined;
  const template = pickNarration(pool);
  if (template) return fillEpilogue(template, integrity);
  return `档案编号 7F3A 结案摘要：本案共调取记忆碎片 ${integrity} 片，材料已归档。`;
}

api.post('/epilogue', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as EpilogueBody;
  const cfg = readConfig();

  if (!cfg.enabled) {
    return res.json({ ok: true, degraded: true, text: localEpilogue(body) });
  }

  const system = [
    '你是互动影游《回声》的档案员。',
    '根据玩家的行动轨迹，写一段 80-110 字的「结案摘要」。',
    '要求：第二人称、冷静克制、像一份官方档案但结尾有一句人味。不要煽情，不要用感叹号。',
    '只输出正文，不要标题。',
  ].join('\n');

  const user = [
    `结局：${body.endingKey}`,
    `路线：${body.vars?.route ?? '未定'}`,
    `信任值：${body.vars?.trust ?? 0}／6`,
    `记忆完整度：${body.vars?.integrity ?? 0}／8`,
    `自由行动次数：${body.vars?.freeActions ?? 0}`,
    `关键选择：${(body.vars?.choiceLog ?? []).join(' → ') || '无'}`,
  ].join('\n');

  try {
    const raw = await chat(cfg, { system, user, temperature: 0.9, timeoutMs: 8000 });
    const text = raw.replace(/^["「]|["」]$/g, '').slice(0, 260);
    if (!text) throw new Error('EMPTY');
    return res.json({ ok: true, degraded: false, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    console.warn(`[epilogue] 调用失败，已降级: ${message}`);
    return res.json({ ok: true, degraded: true, text: localEpilogue(body) });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/health —— 让玩家/评审一眼看出模型是否接上                     */
/* ------------------------------------------------------------------ */

api.get('/health', (_req: Request, res: Response) => {
  const cfg = readConfig();
  const ollama = getOllamaState();

  res.json({
    ok: true,
    story: {
      title: story.meta.title,
      nodes: Object.keys(story.nodes).length,
      version: story.meta.version,
    },
    llm: {
      enabled: cfg.enabled,
      kind: cfg.kind,
      model: cfg.enabled ? cfg.model : null,
      source: cfg.source,
      ollama: {
        available: ollama.available,
        models: ollama.models.slice(0, 5),
      },
      note: cfg.enabled
        ? '模型已接入，自由行动由模型裁定'
        : '未检测到可用模型，将使用预写裁定库（不影响通关）',
    },
  });
});
