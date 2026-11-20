import { Router } from 'express';
import type { Request, Response } from 'express';
import { story } from './story.ts';
import { chat, extractJson, readConfig } from './llm.ts';
import type { EndingKey, Vars } from '../src/engine/types';

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

  return {
    nodeId: matched ? best.id : free.fallback,
    narration: matched
      ? '你按自己的方式做了。记忆沿着这条线，往下走了一段。'
      : '这条路没有走通。你退回来，选了最稳妥的那一条。',
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
    '你是互动影游《回声》的叙事裁判。玩家会写下一个行动，你要判断它把剧情引向哪一条支线。',
    '严格要求：',
    `1. nodeId 只能从下列候选里选一个，不能编造：${free.allowed.join(', ')}`,
    '2. narration 是 40-70 字的中文第二人称描写，承接动作、带画面感，不要解释规则，不要出现"选项""分支"这类词。',
    '3. verdict 只能是 success / partial / fail 之一，表示这个动作的顺利程度。',
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

const ROUTE_LABEL: Record<string, string> = {
  hide: '把修复好的记忆收了起来，决定独自追查',
  tell: '把屏幕转向了委托人，选择一起面对',
};

/** 无模型时的模板摘要，保证结局页永远有内容 */
function localEpilogue(body: EpilogueBody): string {
  const { vars, endingKey } = body;
  const route = vars?.route ? ROUTE_LABEL[vars.route] : '没有走到需要选择的那一步';
  const tone =
    endingKey === 'yongye'
      ? '你删掉了自己，把这一夜还给了空白。'
      : endingKey === 'huisheng'
        ? '你把真相寄了出去，然后一个人站在原地等回音。'
        : '你把不属于你的东西还了回去，月台上终于有人等到了答案。';
  return `档案编号 7F3A 结案摘要：你在修复一段记忆的过程中${route}；共调取记忆碎片 ${vars?.integrity ?? 0} 片。${tone}`;
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
  res.json({
    ok: true,
    story: {
      title: story.meta.title,
      nodes: Object.keys(story.nodes).length,
      version: story.meta.version,
    },
    llm: { enabled: cfg.enabled, model: cfg.enabled ? cfg.model : null },
  });
});
