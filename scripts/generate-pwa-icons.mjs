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
  // アイコンサイズに応じて縦線の間隔を調整
  const lineSpacing = size > 100 ? 6 : 3;
  
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- ベースグラデーション（より深みのある緑） -->
        <linearGradient id="baseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0d2818;stop-opacity:1" />
          <stop offset="40%" style="stop-color:#0a1f13;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#071510;stop-opacity:1" />
        </linearGradient>
        
        <!-- 左下の緑の光（強め） -->
        <radialGradient id="greenGlow1" cx="15%" cy="70%" r="60%">
          <stop offset="0%" style="stop-color:#166534;stop-opacity:0.5" />
          <stop offset="50%" style="stop-color:#14532d;stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:#166534;stop-opacity:0" />
        </radialGradient>
        
        <!-- 右上の明るい緑の光 -->
        <radialGradient id="greenGlow2" cx="85%" cy="15%" r="50%">
          <stop offset="0%" style="stop-color:#22c55e;stop-opacity:0.25" />
          <stop offset="60%" style="stop-color:#16a34a;stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:#22c55e;stop-opacity:0" />
        </radialGradient>
        
        <!-- 中央のゴールドの光（アクセント） -->
        <radialGradient id="goldGlow" cx="50%" cy="50%" r="45%">
          <stop offset="0%" style="stop-color:#d4af37;stop-opacity:0.08" />
          <stop offset="100%" style="stop-color:#d4af37;stop-opacity:0" />
        </radialGradient>
        
        <!-- 芝生の縦線パターン（より目立つ） -->
        <pattern id="turfLines" patternUnits="userSpaceOnUse" width="${lineSpacing}" height="${size}">
          <rect width="${lineSpacing}" height="${size}" fill="transparent"/>
          <line x1="1" y1="0" x2="1" y2="${size}" stroke="rgba(34,197,94,0.12)" stroke-width="1"/>
        </pattern>
        
        <!-- 斜めの芝生テクスチャ -->
        <pattern id="turfTexture" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="transparent"/>
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(22,101,52,0.06)" stroke-width="2"/>
        </pattern>
        
        <!-- 周囲のビネット効果 -->
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" style="stop-color:transparent;stop-opacity:0" />
          <stop offset="100%" style="stop-color:#000000;stop-opacity:0.4" />
        </radialGradient>
      </defs>
      
      <!-- ベース背景 -->
      <rect width="${size}" height="${size}" fill="url(#baseGrad)"/>
      
      <!-- 光のエフェクト（レイヤー順に重ねる） -->
      <rect width="${size}" height="${size}" fill="url(#greenGlow1)"/>
      <rect width="${size}" height="${size}" fill="url(#greenGlow2)"/>
      <rect width="${size}" height="${size}" fill="url(#goldGlow)"/>
      
      <!-- 芝生パターン（縦線 + 斜めテクスチャ） -->
      <rect width="${size}" height="${size}" fill="url(#turfLines)"/>
      <rect width="${size}" height="${size}" fill="url(#turfTexture)"/>
      
      <!-- 周囲のビネット効果（深み） -->
      <rect width="${size}" height="${size}" fill="url(#vignette)" opacity="0.3"/>
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
