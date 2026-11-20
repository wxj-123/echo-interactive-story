import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Story } from '../src/engine/types';
import { validateStory } from '../src/engine/validate';

/**
 * 构建前的剧情体检：一条命令确认「没有断链、没有死胡同、三个结局都在」。
 * 用法：npm run validate
 */
const path = fileURLToPath(new URL('../src/content/story.json', import.meta.url));
const story = JSON.parse(readFileSync(path, 'utf8')) as Story;
const report = validateStory(story);

const line = '─'.repeat(52);
console.log(`\n${line}`);
console.log(`  《${story.meta.title}》剧情校验  v${story.meta.version}`);
console.log(line);
console.log(`  节点总数      ${report.stats.nodes}`);
console.log(`  结局数量      ${report.stats.endings}`);
console.log(`  关键岔路      ${report.stats.branchPoints}`);
console.log(`  自由行动      ${report.stats.freeActions}`);
console.log(`  剧情字数      ${report.stats.words}`);
console.log(`  预估时长      ${story.meta.estimatedMinutes} 分钟`);
console.log(line);

if (report.warnings.length) {
  console.log('  提示：');
  for (const w of report.warnings) console.log(`   · ${w}`);
}

if (report.errors.length) {
  console.error('\n  校验失败：');
  for (const e of report.errors) console.error(`   ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ 全部通过：所有分支指向有效节点，无死胡同\n');
