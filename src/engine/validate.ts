import type { Story } from './types';

export interface Report {
  errors: string[];
  warnings: string[];
  stats: {
    nodes: number;
    endings: number;
    freeActions: number;
    branchPoints: number;
    words: number;
  };
}

/**
 * 剧情图静态校验。
 * 目的：把「玩到一半断链」这种事故在构建期就拦住，而不是等评审点到。
 */
export function validateStory(story: Story): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = Object.keys(story.nodes);

  if (!story.nodes[story.meta.start]) {
    errors.push(`起点节点不存在: ${story.meta.start}`);
  }

  let words = 0;
  let endings = 0;
  let freeActions = 0;
  let branchPoints = 0;

  for (const id of ids) {
    const node = story.nodes[id];
    if (node.id !== id) errors.push(`节点 ${id} 的 id 字段与 key 不一致 (${node.id})`);
    if (!node.lines?.length) errors.push(`节点 ${id} 没有任何台词`);

    words += node.lines.reduce((sum, l) => sum + l.text.length, 0);

    if (node.ending) endings++;
    if (node.freeAction) freeActions++;
    if ((node.choices?.length ?? 0) >= 2) branchPoints++;

    // 引用完整性
    if (node.next && !story.nodes[node.next]) {
      errors.push(`节点 ${id} 的 next 指向不存在的节点: ${node.next}`);
    }
    for (const rule of node.routes ?? []) {
      if (!story.nodes[rule.to]) {
        errors.push(`节点 ${id} 的条件跳转指向不存在的节点: ${rule.to}`);
      }
    }
    for (const choice of node.choices ?? []) {
      if (!story.nodes[choice.next]) {
        errors.push(`节点 ${id} 的选项 ${choice.id} 指向不存在的节点: ${choice.next}`);
      }
    }
    if (node.freeAction) {
      const { allowed, fallback } = node.freeAction;
      if (allowed.length < 2) errors.push(`节点 ${id} 的自由行动白名单少于 2 个候选`);
      for (const target of allowed) {
        if (!story.nodes[target]) {
          errors.push(`节点 ${id} 的自由行动白名单含不存在节点: ${target}`);
        }
      }
      if (!allowed.includes(fallback)) {
        errors.push(`节点 ${id} 的兜底节点不在白名单内: ${fallback}`);
      }
      if (!node.freeAction.suggestions?.length) {
        warnings.push(`节点 ${id} 未提供快捷建议，首次玩家可能不知如何下手`);
      }
    }

    // 出路检查
    const hasExit =
      Boolean(node.ending) ||
      Boolean(node.next) ||
      Boolean(node.routes?.length) ||
      Boolean(node.choices?.length) ||
      Boolean(node.freeAction);
    if (!hasExit) errors.push(`节点 ${id} 是死胡同：既没有结局也没有任何去向`);
  }

  // 可达性（BFS）
  const reachable = new Set<string>();
  const queue = [story.meta.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id) || !story.nodes[id]) continue;
    reachable.add(id);
    const node = story.nodes[id];
    const outs = [
      node.next,
      ...(node.routes ?? []).map((r) => r.to),
      ...(node.choices ?? []).map((c) => c.next),
      ...(node.freeAction?.allowed ?? []),
    ].filter(Boolean) as string[];
    queue.push(...outs);
  }
  for (const id of ids) {
    if (!reachable.has(id)) warnings.push(`节点 ${id} 从起点不可达`);
  }

  if (endings < 3) errors.push(`结局数量不足：只有 ${endings} 个，至少需要 3 个`);
  if (freeActions < 3) warnings.push(`自由行动节点只有 ${freeActions} 个，AIGC 深度可能不够`);
  if (branchPoints < 2) errors.push(`关键岔路不足：只有 ${branchPoints} 个，至少需要 2 个`);

  return {
    errors,
    warnings,
    stats: { nodes: ids.length, endings, freeActions, branchPoints, words },
  };
}

/** 校验不通过时抛错，供服务端 / 构建脚本使用 */
export function assertStory(story: Story): void {
  const report = validateStory(story);
  if (report.errors.length) {
    throw new Error(`剧情校验失败:\n${report.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}
