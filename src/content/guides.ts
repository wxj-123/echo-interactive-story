/**
 * 新手指引文案与已读记录。
 *
 * 原则：只在玩家第一次遇到某个操作时才提示一次，说完就不再打扰。
 * 用浮层而不是弹窗，避免打断影游的沉浸感。
 */

export type GuideKey = 'click' | 'choice' | 'free';

export const GUIDES: Record<GuideKey, string> = {
  click: '点击空白处继续。文字还没出完时点一下，可以直接跳过打字。',
  choice: '这道选择会决定你走哪一整章。选项下面的小字，是它的代价。',
  free: '这里不是选择题——写下你想做的任何事，系统会判断它通向哪里。没头绪的话，点下面的示例。',
};

const STORAGE_KEY = 'echo.guide.seen';

export function readSeenGuides(): GuideKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as GuideKey[]) : [];
  } catch {
    return [];
  }
}

export function writeSeenGuides(keys: GuideKey[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* 隐私模式下写入失败，最多是下次再提示一遍 */
  }
}
