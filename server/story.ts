import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Story } from '../src/engine/types';
import { validateStory } from '../src/engine/validate';

const STORY_PATH = fileURLToPath(new URL('../src/content/story.json', import.meta.url));

/**
 * 用同步读取而不是 import json，
 * 避免 Node ESM 的 import assertions 在不同版本下行为不一致。
 */
export const story: Story = JSON.parse(readFileSync(STORY_PATH, 'utf8')) as Story;

const report = validateStory(story);

if (report.errors.length) {
  console.error('[story] 剧情校验未通过:');
  for (const err of report.errors) console.error('  - ' + err);
  // 开发阶段直接失败，生产阶段只告警（避免线上直接黑屏）
  if (process.env.NODE_ENV !== 'production') process.exit(1);
}
