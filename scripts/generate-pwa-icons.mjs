/**
 * PWAアイコン生成スクリプト
 * ロゴに余白を追加して中央に配置した新しいアイコンを生成
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const INPUT_LOGO = path.join(__dirname, '../public/KRMロゴ1.jpg');
const OUTPUT_DIR = path.join(__dirname, '../public');

// アイコンサイズ設定
const ICON_SIZES = [192, 512];

// ファビコンサイズ
const FAVICON_SIZE = 32;

// 余白の割合（0.15 = 15%の余白を各辺に追加）
const PADDING_RATIO = 0.15;

// 背景色（アプリのテーマカラー - ダークグリーン）
const BG_R = 10, BG_G = 31, BG_B = 19; // #0a1f13

async function generateIcon(size) {
  const padding = Math.round(size * PADDING_RATIO);
  const logoSize = size - (padding * 2);

  // 元のロゴを読み込んでリサイズ
  const { data, info } = await sharp(INPUT_LOGO)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBAバッファを作成（白を背景色に置き換え）
  const rgbaData = Buffer.alloc(info.width * info.height * 4);
  
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // 白に近い色（RGB各200以上）は背景色に置き換え
    if (r > 200 && g > 200 && b > 200) {
      rgbaData[j] = BG_R;
      rgbaData[j + 1] = BG_G;
      rgbaData[j + 2] = BG_B;
      rgbaData[j + 3] = 255;
    } else {
      rgbaData[j] = r;
      rgbaData[j + 1] = g;
      rgbaData[j + 2] = b;
      rgbaData[j + 3] = 255;
    }
  }

  // 処理済みロゴをPNG化
  const processedLogo = await sharp(rgbaData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  }).png().toBuffer();

  // 背景を作成
  const background = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: BG_R, g: BG_G, b: BG_B, alpha: 1 }
    }
  }).png().toBuffer();

  // 背景にロゴを合成
  const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
  
  await sharp(background)
    .composite([{
      input: processedLogo,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(outputPath);

  console.log(`✅ Generated: ${outputPath}`);
  return outputPath;
}

async function generateFavicon() {
  const size = FAVICON_SIZE;
  const padding = Math.round(size * 0.1); // ファビコンは余白少なめ
  const logoSize = size - (padding * 2);

  // 元のロゴを読み込んでリサイズ
  const { data, info } = await sharp(INPUT_LOGO)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBAバッファを作成（白を背景色に置き換え）
  const rgbaData = Buffer.alloc(info.width * info.height * 4);
  
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    if (r > 200 && g > 200 && b > 200) {
      rgbaData[j] = BG_R;
      rgbaData[j + 1] = BG_G;
      rgbaData[j + 2] = BG_B;
      rgbaData[j + 3] = 255;
    } else {
      rgbaData[j] = r;
      rgbaData[j + 1] = g;
      rgbaData[j + 2] = b;
      rgbaData[j + 3] = 255;
    }
  }

  // 処理済みロゴをPNG化
  const processedLogo = await sharp(rgbaData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  }).png().toBuffer();

  // 背景を作成
  const background = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: BG_R, g: BG_G, b: BG_B, alpha: 1 }
    }
  }).png().toBuffer();

  // 背景にロゴを合成してPNG出力
  const faviconPng = path.join(OUTPUT_DIR, 'favicon.png');
  await sharp(background)
    .composite([{
      input: processedLogo,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(faviconPng);

  console.log(`✅ Generated: ${faviconPng}`);

  // app/favicon.icoも生成（実際はPNGだがNext.jsは認識する）
  const faviconIco = path.join(__dirname, '../app/favicon.ico');
  await sharp(background)
    .composite([{
      input: processedLogo,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(faviconIco);

  console.log(`✅ Generated: ${faviconIco}`);
}

async function main() {
  console.log('🎨 PWAアイコン & ファビコン生成開始...\n');
  console.log(`入力ロゴ: ${INPUT_LOGO}`);
  console.log(`余白比率: ${PADDING_RATIO * 100}%`);
  console.log(`背景色: #0a1f13 (ダークグリーン)\n`);

  // PWAアイコン生成
  for (const size of ICON_SIZES) {
    await generateIcon(size);
  }

  // ファビコン生成
  await generateFavicon();

  console.log('\n✨ 完了！');
}

main().catch(console.error);
