import { readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Jimp, JimpMime } from 'jimp';

/**
 * 素材后处理。
 * 1) AIGC 原图（png，约 2MB）→ 裁掉右下角水印区 → 压到 1600px 宽 / 质量 82
 * 2) 已压过的 jpg 只做「超宽才缩放」，可以安全重复执行
 *
 * 用法：npm run gen:optimize
 * 首次执行会把 png 转成 jpg 并删除 png；之后执行只做兜底缩放。
 */

const DIR = resolve('public/assets/bg');
const ORDER = [
  'studio',
  'station',
  'flashback',
  'basement',
  'studio_day',
  'bathroom',
  'archive',
  'station_day',
];

const TARGET_WIDTH = 1600;
const QUALITY = 82;

const pngs = readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
const jpgs = readdirSync(DIR)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort();

if (!pngs.length && !jpgs.length) {
  console.log('没有待处理的素材。');
  process.exit(0);
}

let index = 0;
for (const file of pngs) {
  const name = ORDER[index++] ?? `scene_${index}`;
  const src = join(DIR, file);
  const dst = join(DIR, `${name}.jpg`);

  const image = await Jimp.read(src);
  const { width, height } = image.bitmap;

  // 裁掉底部 7%（生成模型水印区）
  try {
    image.crop({ x: 0, y: 0, w: width, h: Math.round(height * 0.93) });
  } catch {
    /* 裁剪失败则保留原图 */
  }
  if (image.bitmap.width > TARGET_WIDTH) {
    image.resize({ w: TARGET_WIDTH });
  }

  writeFileSync(dst, await image.getBuffer(JimpMime.jpeg, { quality: QUALITY }));
  unlinkSync(src);
  console.log(`  png → ${name}.jpg  ${Math.round(statSync(dst).size / 1024)} KB`);
}

// 已存在的 jpg：仅在超宽时缩一次，避免无谓的重复压缩
for (const file of jpgs) {
  const path = join(DIR, file);
  const image = await Jimp.read(path);
  const before = statSync(path).size;
  if (image.bitmap.width <= TARGET_WIDTH && before < 600 * 1024) continue;

  if (image.bitmap.width > TARGET_WIDTH) image.resize({ w: TARGET_WIDTH });
  writeFileSync(path, await image.getBuffer(JimpMime.jpeg, { quality: QUALITY }));
  console.log(`  重压 ${file}  ${Math.round(before / 1024)} → ${Math.round(statSync(path).size / 1024)} KB`);
}

console.log('完成。');
