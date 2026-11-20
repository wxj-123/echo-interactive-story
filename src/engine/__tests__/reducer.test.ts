import { describe, expect, it } from 'vitest';
import storyJson from '../../content/story.json';
import type { GameState, Story } from '../types';
import {
  advance,
  awaitingDecision,
  chooseOption,
  parseSave,
  resolveFreeAction,
  serializeSave,
  startGame,
} from '../reducer';
import { validateStory } from '../validate';

const story = storyJson as unknown as Story;

/**
 * 按决策表把游戏从头走到结局。
 * 这是一条「自动化通关」测试：任何断链、环、无出口都会直接抛错。
 */
function play(decisions: Record<string, string>): GameState {
  let state = startGame(story);

  for (let guard = 0; guard < 400; guard++) {
    if (state.finishedAt) return state;

    const node = story.nodes[state.nodeId];
    if (!node) throw new Error(`节点不存在: ${state.nodeId}`);

    if (awaitingDecision(state, story)) {
      if (node.choices?.length) {
        const id = decisions[node.id];
        if (!id) throw new Error(`缺少决策: ${node.id}`);
        state = chooseOption(state, story, id);
      } else if (node.freeAction) {
        state = resolveFreeAction(state, story, node.freeAction.fallback);
      }
      continue;
    }

    const next = advance(state, story);
    if (next === state) throw new Error(`卡在节点: ${state.nodeId}`);
    state = next;
  }

  throw new Error('超过步数上限，剧情可能存在死循环');
}

describe('剧情数据', () => {
  it('通过静态校验，无断链与死胡同', () => {
    const report = validateStory(story);
    expect(report.errors).toEqual([]);
  });

  it('至少有两个关键岔路与三个结局', () => {
    const report = validateStory(story);
    expect(report.stats.branchPoints).toBeGreaterThanOrEqual(2);
    expect(report.stats.endings).toBeGreaterThanOrEqual(3);
    expect(report.stats.freeActions).toBeGreaterThanOrEqual(3);
  });
});

describe('三条路线都能通关', () => {
  it('隐瞒 + 删除 → 永夜', () => {
    const state = play({ p0_wake: 'read', c1_choice: 'hide', c3_choice: 'delete' });
    expect(state.endingKey).toBe('yongye');
    expect(state.vars.route).toBe('hide');
  });

  it('隐瞒 + 保留 → 回声', () => {
    const state = play({ p0_wake: 'read', c1_choice: 'hide', c3_choice: 'keep' });
    expect(state.endingKey).toBe('huisheng');
  });

  it('坦白 + 保留 → 归还', () => {
    const state = play({ p0_wake: 'skip', c1_choice: 'tell', c3_choice: 'keep' });
    expect(state.endingKey).toBe('guihuan');
    expect(state.vars.route).toBe('tell');
  });

  it('两条第二章路线走到的节点集合不相同', () => {
    const hide = play({ p0_wake: 'read', c1_choice: 'hide', c3_choice: 'keep' });
    const tell = play({ p0_wake: 'read', c1_choice: 'tell', c3_choice: 'keep' });
    const overlap = hide.history.filter((id) => tell.history.includes(id));
    expect(overlap.length).toBeLessThan(hide.history.length);
    expect(hide.history).not.toEqual(tell.history);
  });
});

describe('自由行动的约束', () => {
  it('白名单外的节点会被强制回退到 fallback', () => {
    let state = startGame(story);
    // 推到第一个自由行动节点
    while (!story.nodes[state.nodeId].freeAction) {
      state = advance(state, story);
      if (awaitingDecision(state, story) && story.nodes[state.nodeId].choices?.length) {
        state = chooseOption(state, story, story.nodes[state.nodeId].choices![0].id);
      }
    }
    const nodeId = state.nodeId;
    const fallback = story.nodes[nodeId].freeAction!.fallback;
    const hacked = resolveFreeAction(state, story, 'end_yongye');
    expect(hacked.nodeId).toBe(fallback);
  });

  it('自由行动会累计次数', () => {
    const state = play({ p0_wake: 'read', c1_choice: 'tell', c3_choice: 'keep' });
    expect(state.vars.freeActions).toBeGreaterThanOrEqual(1);
  });
});

describe('存档', () => {
  it('序列化后能原样读回', () => {
    const state = play({ p0_wake: 'read', c1_choice: 'tell', c3_choice: 'keep' });
    const restored = parseSave(serializeSave(state), story);
    expect(restored?.nodeId).toBe(state.nodeId);
    expect(restored?.vars.route).toBe(state.vars.route);
    expect(restored?.history.length).toBe(state.history.length);
  });

  it('坏档不会抛错，只返回 null', () => {
    expect(parseSave('{not json', story)).toBeNull();
    expect(parseSave('{"nodeId":"nope"}', story)).toBeNull();
    expect(parseSave(null, story)).toBeNull();
  });
});
