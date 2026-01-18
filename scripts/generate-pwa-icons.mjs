/**
 * PWAアイコン生成スクリプト
 * サイトの芝生グラフィック背景 + ロゴを中央配置
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

/**
 * 芝生グラフィック背景を生成（SVG）
 * サイトの背景スタイルを再現：
 * - ベース: ダークグリーン (#0a1f13)
 * - 左側に緑の光
 * - 右上に明るい緑の光
 * - 右下にゴールドの光
 * - 薄い縦線パターン（芝生のテクスチャ）
 */
function createTurfBackgroundSvg(size) {
  // 左が緑 → 右が白のグラデーション + スマホで見える太い縦線
  const lineSpacing = size > 100 ? 6 : 3; // 縦線の間隔（広め）
  const lineWidth = size > 100 ? 2 : 1;   // 縦線の太さ（太め）
  
  // 縦線を直接描画（位置に応じて色と透明度を調整）
  let lines = '';
  for (let x = 0; x < size; x += lineSpacing) {
    const progress = x / size; // 0（左）〜 1（右）
    
    // 単色：緑の縦線（全体同じ色）
    const r = 34;
    const g = 197;
    const b = 94;
    
    // 透明度は固定（スマホで見えるレベル）
    const opacity = 0.5;
    
    lines += `<line x1="${x}" y1="0" x2="${x}" y2="${size}" stroke="rgb(${r},${g},${b})" stroke-width="${lineWidth}" stroke-opacity="${opacity.toFixed(2)}"/>`;
  }
  
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- 単色の薄緑背景 -->
        <linearGradient id="greenToWhiteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#d1fae5"/>
          <stop offset="100%" stop-color="#d1fae5"/>
        </linearGradient>
        
        <!-- 上下の深み（微妙な陰影） -->
        <linearGradient id="verticalDepth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.015"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      
      <!-- グラデーション背景（左緑→右白） -->
      <rect width="${size}" height="${size}" fill="url(#greenToWhiteGrad)"/>
      
      <!-- 芝生の縦線（左は濃い緑、右はグレー） -->
      ${lines}
      
      <!-- 微妙な上下の深み -->
      <rect width="${size}" height="${size}" fill="url(#verticalDepth)"/>
    </svg>
  `;
}

async function generateIcon(size) {
  const padding = Math.round(size * PADDING_RATIO);
  const logoSize = size - (padding * 2);

  // 芝生グラフィック背景を生成
  const turfBgSvg = createTurfBackgroundSvg(size);
  const turfBackground = await sharp(Buffer.from(turfBgSvg))
    .png()
    .toBuffer();

  // 元のロゴを読み込んでリサイズ
  const { data, info } = await sharp(INPUT_LOGO)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBAバッファを作成（白を透明に置き換え）
  const rgbaData = Buffer.alloc(info.width * info.height * 4);
  
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // 白に近い色（RGB各200以上）は透明に
    if (r > 200 && g > 200 && b > 200) {
      rgbaData[j] = 0;
      rgbaData[j + 1] = 0;
      rgbaData[j + 2] = 0;
      rgbaData[j + 3] = 0; // 透明
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

  // 背景にロゴを合成
  const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
  
  await sharp(turfBackground)
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

  // 芝生グラフィック背景を生成
  const turfBgSvg = createTurfBackgroundSvg(size);
  const turfBackground = await sharp(Buffer.from(turfBgSvg))
    .png()
    .toBuffer();

  // 元のロゴを読み込んでリサイズ
  const { data, info } = await sharp(INPUT_LOGO)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBAバッファを作成（白を透明に置き換え）
  const rgbaData = Buffer.alloc(info.width * info.height * 4);
  
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    if (r > 200 && g > 200 && b > 200) {
      rgbaData[j] = 0;
      rgbaData[j + 1] = 0;
      rgbaData[j + 2] = 0;
      rgbaData[j + 3] = 0;
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

  // 背景にロゴを合成してPNG出力
  const faviconPng = path.join(OUTPUT_DIR, 'favicon.png');
  await sharp(turfBackground)
    .composite([{
      input: processedLogo,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(faviconPng);

  console.log(`✅ Generated: ${faviconPng}`);

  // app/favicon.icoも生成
  const faviconIco = path.join(__dirname, '../app/favicon.ico');
  await sharp(turfBackground)
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
  console.log(`背景: 芝生グラフィック（サイトと同じスタイル）\n`);

  // PWAアイコン生成
  for (const size of ICON_SIZES) {
    await generateIcon(size);
  }

  // ファビコン生成
  await generateFavicon();

  console.log('\n✨ 完了！');
}

main().catch(console.error);
