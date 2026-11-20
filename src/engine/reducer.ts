import type { Condition, GameState, Story, StoryNode, Vars } from './types';
import { START_VARS } from './types';

/* ------------------------------------------------------------------ */
/* 变量结算                                                            */
/* ------------------------------------------------------------------ */

export function applyEffect(vars: Vars, effect?: Partial<Vars>): Vars {
  if (!effect) return vars;
  const next: Vars = { ...vars };
  if (typeof effect.trust === 'number') next.trust = clamp(next.trust + effect.trust, 0, 6);
  if (typeof effect.integrity === 'number') {
    next.integrity = clamp(next.integrity + effect.integrity, 0, 8);
  }
  if (effect.route) next.route = effect.route;
  if (typeof effect.freeActions === 'number') next.freeActions += effect.freeActions;
  if (effect.choiceLog) next.choiceLog = [...next.choiceLog, ...effect.choiceLog];
  return next;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 判断条件是否满足（未写的字段视为不限制） */
export function matchCondition(cond: Condition, vars: Vars): boolean {
  if (cond.route && cond.route !== vars.route) return false;
  if (typeof cond.trustGte === 'number' && vars.trust < cond.trustGte) return false;
  if (typeof cond.integrityGte === 'number' && vars.integrity < cond.integrityGte) return false;
  return true;
}

/** 解析节点去向：routes 优先，其次 next */
export function resolveNext(node: StoryNode, vars: Vars): string | undefined {
  if (node.routes) {
    const hit = node.routes.find((rule) => matchCondition(rule.when, vars));
    if (hit) return hit.to;
  }
  return node.next;
}

/* ------------------------------------------------------------------ */
/* 状态迁移                                                            */
/* ------------------------------------------------------------------ */

export function startGame(story: Story): GameState {
  return enterNode(
    {
      nodeId: story.meta.start,
      lineIndex: 0,
      vars: { ...START_VARS },
      history: [],
      startedAt: Date.now(),
    },
    story,
    story.meta.start,
  );
}

/** 进入某节点：结算 effect、重置行号、记录轨迹 */
export function enterNode(
  state: GameState,
  story: Story,
  nodeId: string,
  extraEffect?: Partial<Vars>,
): GameState {
  const node = story.nodes[nodeId];
  if (!node) return state;

  const merged = { ...node.effect, ...extraEffect };
  const vars = applyEffect(state.vars, merged);

  return {
    ...state,
    nodeId,
    lineIndex: 0,
    vars,
    history: [...state.history, nodeId],
    // 离开结局节点时不残留结算状态
    finishedAt: node.ending ? state.finishedAt : undefined,
    endingKey: node.ending ? state.endingKey : undefined,
  };
}

/** 当前节点是否已到末行、正在等玩家做决定 */
export function awaitingDecision(state: GameState, story: Story): boolean {
  const node = story.nodes[state.nodeId];
  if (!node) return false;
  if (state.lineIndex < node.lines.length - 1) return false;
  return Boolean(node.choices?.length || node.freeAction);
}

/** 点击「继续」：推进一行，或按规则跳转 / 结算结局 */
export function advance(state: GameState, story: Story): GameState {
  if (state.finishedAt) return state;
  const node = story.nodes[state.nodeId];
  if (!node) return state;

  if (state.lineIndex < node.lines.length - 1) {
    return { ...state, lineIndex: state.lineIndex + 1 };
  }

  // 末行且有待选分支：交给 UI，不自动推进
  if (awaitingDecision(state, story)) return state;

  const nextId = resolveNext(node, state.vars);
  if (nextId) return enterNode(state, story, nextId);

  if (node.ending) {
    return { ...state, finishedAt: Date.now(), endingKey: node.ending.key };
  }
  return state;
}

/** 选择固定选项 */
export function chooseOption(state: GameState, story: Story, choiceId: string): GameState {
  const node = story.nodes[state.nodeId];
  const choice = node?.choices?.find((c) => c.id === choiceId);
  if (!choice) return state;

  const vars = applyEffect(state.vars, {
    ...choice.effect,
    choiceLog: [...(choice.effect?.choiceLog ?? []), `${node.id}:${choice.id}`],
  });

  return enterNode({ ...state, vars }, story, choice.next);
}

/** 自由行动结算完成（无论模型裁定还是降级），跳转到目标节点 */
export function resolveFreeAction(
  state: GameState,
  story: Story,
  targetNodeId: string,
  narration?: string,
): GameState {
  const node = story.nodes[state.nodeId];
  const allowed = node?.freeAction?.allowed ?? [];
  // 二次防线：即使调用方传了非法节点也不放行
  const safeTarget = allowed.includes(targetNodeId)
    ? targetNodeId
    : (node?.freeAction?.fallback ?? targetNodeId);

  const vars = applyEffect(state.vars, { freeActions: 1 });
  const next = enterNode({ ...state, vars }, story, safeTarget);

  if (!narration) return next;

  // 把模型裁定的一句话作为该节点的开场旁白，保持叙事连贯
  return {
    ...next,
    vars: { ...next.vars, choiceLog: [...next.vars.choiceLog, `free:${safeTarget}`] },
  };
}

/* ------------------------------------------------------------------ */
/* 存档序列化                                                          */
/* ------------------------------------------------------------------ */

export const SAVE_KEY = 'echo.save.v1';

export function serializeSave(state: GameState): string {
  return JSON.stringify({ ...state, savedAt: Date.now() });
}

/** 校验存档可用性，坏档返回 null 而不是抛错 */
export function parseSave(raw: string | null, story: Story): GameState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as GameState;
    if (!data?.nodeId || !story.nodes[data.nodeId]) return null;
    if (typeof data.lineIndex !== 'number' || data.lineIndex < 0) return null;
    if (!data.vars || typeof data.vars.trust !== 'number') return null;
    return {
      nodeId: data.nodeId,
      lineIndex: Math.min(data.lineIndex, story.nodes[data.nodeId].lines.length - 1),
      vars: { ...START_VARS, ...data.vars, choiceLog: data.vars.choiceLog ?? [] },
      history: Array.isArray(data.history) ? data.history : [],
      startedAt: data.startedAt ?? Date.now(),
      finishedAt: data.finishedAt,
      endingKey: data.endingKey,
    };
  } catch {
    return null;
  }
}
