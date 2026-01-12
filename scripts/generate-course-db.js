/**
 * コースデータベース生成スクリプト
 * 
 * 全106コースのJSONデータを生成
 */

const fs = require('fs');
const path = require('path');

// コースパターン定義
const PATTERN_A = { // 芝・300m未満
  distanceToFirstCorner: 250,
  pattern: 'A',
  courses: [
    '東京_芝_2000', '中山_芝_1600', '東京_芝_1800', '小倉_芝_2600', '札幌_芝_2600',
    '東京_芝_2300', '札幌_芝_1500', '阪神_芝_1200', '小倉_芝_1700', '東京_芝_3400',
    '札幌_芝_1800', '函館_芝_2600', '中山_芝_2500', '小倉_芝_1800', '中京_芝_1600',
    '中山_芝_1200', '中山_芝_1800', '函館_芝_1800', '福島_芝_2600', '函館_芝_1000',
    '京都_芝_3000'
  ]
};

const PATTERN_B = { // 芝・300～500m
  distanceToFirstCorner: 400,
  pattern: 'B',
  courses: [
    '福島_芝_1800', '札幌_芝_1200', '京都_芝_2000', '福島_芝_1200', '中京_芝_2000',
    '京都_芝_3200', '中京_芝_1200', '中山_芝_2200', '京都_芝_1200', '新潟_芝_2000_内',
    '阪神_芝_2000', '阪神_芝_1600', '阪神_芝_2400', '新潟_芝_1200', '中山_芝_3600',
    '東京_芝_2500', '東京_芝_1400', '小倉_芝_1200', '阪神_芝_3000', '阪神_芝_1400',
    '東京_芝_2400', '小倉_芝_2000', '札幌_芝_2000', '函館_芝_2000', '京都_芝_2200',
    '函館_芝_1200', '中山_芝_2000'
  ]
};

const PATTERN_C = { // 芝・500m以上
  distanceToFirstCorner: 550,
  pattern: 'C',
  courses: [
    '福島_芝_2000', '新潟_芝_2200', '京都_芝_1400_外', '阪神_芝_1800', '中京_芝_2200',
    '新潟_芝_1400', '京都_芝_1400_内', '京都_芝_1600_外', '中京_芝_1400', '京都_芝_1600_内',
    '阪神_芝_2200', '新潟_芝_1800', '阪神_芝_2600', '新潟_芝_2400', '東京_芝_1600',
    '京都_芝_1800', '新潟_芝_1600', '新潟_芝_2000_外', '京都_芝_2400'
  ]
};

const PATTERN_D = { // ダート・300m未満
  distanceToFirstCorner: 250,
  pattern: 'D',
  courses: [
    '札幌_ダート_2400', '京都_ダート_1800', '中山_ダート_2400', '函館_ダート_2400',
    '東京_ダート_2100', '中京_ダート_1800', '札幌_ダート_1700', '福島_ダート_2400',
    '札幌_ダート_1000', '阪神_ダート_1800'
  ]
};

const PATTERN_E = { // ダート・300～400m
  distanceToFirstCorner: 350,
  pattern: 'E',
  courses: [
    '中山_ダート_2500', '新潟_ダート_2500', '小倉_ダート_2400', '小倉_ダート_1000',
    '函館_ダート_1700', '函館_ダート_1000', '福島_ダート_1700', '中山_ダート_1800',
    '東京_ダート_1300', '京都_ダート_1900', '小倉_ダート_1700', '新潟_ダート_1800',
    '阪神_ダート_1200', '中京_ダート_1900'
  ]
};

const PATTERN_F = { // ダート・400m以上
  distanceToFirstCorner: 450,
  pattern: 'F',
  courses: [
    '中京_ダート_1200', '福島_ダート_1150', '京都_ダート_1200', '東京_ダート_2400',
    '東京_ダート_1400', '阪神_ダート_1400', '阪神_ダート_2000', '中京_ダート_1400',
    '中山_ダート_1200', '京都_ダート_1400', '新潟_ダート_1200', '東京_ダート_1600'
  ]
};

// 競馬場情報
const RACECOURSE_INFO = {
  '東京': {
    direction: '左回り',
    straightLength: { '芝': 525, 'ダート': 501 },
    hasSlope: true,
    slopeDesc: '緩やかな坂（高低差2m）',
    notes: ['直線が長い', '瞬発力勝負', '大箱コース']
  },
  '中山': {
    direction: '右回り',
    straightLength: { '芝': 310, 'ダート': 308 },
    hasSlope: true,
    slopeDesc: '直線に急坂あり（高低差2.2m）',
    notes: ['小回り', '急坂', 'トリッキー', '器用さ必要']
  },
  '阪神': {
    direction: '右回り',
    straightLength: { '芝_内': 356, '芝_外': 473, 'ダート': 352 },
    hasSlope: true,
    slopeDesc: '直線に急坂あり（高低差1.8m）',
    notes: ['急坂', 'パワー必要', 'タフ']
  },
  '京都': {
    direction: '右回り',
    straightLength: { '芝_内': 328, '芝_外': 404, 'ダート': 329 },
    hasSlope: false,
    slopeDesc: '3コーナーに下り坂',
    notes: ['平坦', '下り坂', '瞬発力']
  },
  '中京': {
    direction: '左回り',
    straightLength: { '芝': 412, 'ダート': 410 },
    hasSlope: true,
    slopeDesc: '直線に坂あり（高低差2.0m）',
    notes: ['左回り', '急坂', 'タフ']
  },
  '新潟': {
    direction: '左回り',
    straightLength: { '芝_内': 359, '芝_外': 659, 'ダート': 354 },
    hasSlope: false,
    notes: ['平坦', '左回り', '外回り直線超長い']
  },
  '小倉': {
    direction: '右回り',
    straightLength: { '芝': 293, 'ダート': 291 },
    hasSlope: false,
    notes: ['平坦', '小回り', '先行有利']
  },
  '福島': {
    direction: '右回り',
    straightLength: { '芝': 292, 'ダート': 295 },
    hasSlope: false,
    notes: ['平坦', '小回り', '荒れやすい']
  },
  '札幌': {
    direction: '右回り',
    straightLength: { '芝': 266, 'ダート': 264 },
    hasSlope: false,
    notes: ['洋芝', '平坦', '時計かかる']
  },
  '函館': {
    direction: '右回り',
    straightLength: { '芝': 262, 'ダート': 260 },
    hasSlope: true,
    slopeDesc: '緩やかな起伏',
    notes: ['洋芝', '小回り', '時計かかる']
  }
};

// コース特性生成関数
function generateCourseData(courseId, pattern, distanceToFirstCorner) {
  const parts = courseId.split('_');
  const racecourse = parts[0];
  const surface = parts[1];
  const distance = parseInt(parts[2], 10);
  const trackSize = parts[3];

  const info = RACECOURSE_INFO[racecourse];
  if (!info) return null;

  // 直線長さを判定
  let straightLength;
  let straightDist = info.straightLength[surface] || info.straightLength['芝'] || 350;
  if (trackSize === '内') {
    straightDist = info.straightLength[`${surface}_内`] || straightDist;
  } else if (trackSize === '外') {
    straightDist = info.straightLength[`${surface}_外`] || straightDist;
  }
  
  if (straightDist < 300) straightLength = '短い';
  else if (straightDist > 450) straightLength = '長い';
  else straightLength = '標準';

  // 特徴リストを生成
  const characteristics = [];
  
  // 直線長さに基づく特徴
  if (straightDist >= 500) {
    characteristics.push(`直線が長い（${straightDist}m）`);
    characteristics.push('差し・追込が届きやすい');
  } else if (straightDist < 300) {
    characteristics.push(`直線が短い（${straightDist}m）`);
    characteristics.push('先行有利の傾向');
  }

  // 坂に基づく特徴
  if (info.hasSlope && info.slopeDesc) {
    characteristics.push(info.slopeDesc);
    if (info.slopeDesc.includes('急坂')) {
      characteristics.push('パワーが問われる');
    }
  } else {
    characteristics.push('平坦コース');
  }

  // コーナーまでの距離に基づく特徴
  if (distanceToFirstCorner < 300) {
    characteristics.push('最初のコーナーまで近い');
    characteristics.push('内枠有利の傾向');
  } else if (distanceToFirstCorner > 500) {
    characteristics.push('最初のコーナーまで余裕あり');
    characteristics.push('枠順影響少ない');
  }

  // 洋芝
  if (info.notes.includes('洋芝')) {
    characteristics.push('洋芝コース（時計がかかる）');
  }

  // 小回り
  if (info.notes.includes('小回り')) {
    characteristics.push('小回りコース');
    characteristics.push('器用さが必要');
  }

  // ペース傾向
  let paceTendency;
  if (distanceToFirstCorner < 300) {
    paceTendency = '前傾ラップになりやすい';
  } else if (distanceToFirstCorner > 500) {
    paceTendency = '前半抑えて後半勝負のラップになりやすい';
  } else {
    paceTendency = '標準的なペース配分';
  }

  // 枠有利不利
  let gateAdvantage;
  if (distanceToFirstCorner < 300) {
    gateAdvantage = '内枠有利';
  } else if (distanceToFirstCorner > 500) {
    gateAdvantage = '枠順影響少ない';
  } else if (surface === 'ダート' && distance <= 1400) {
    gateAdvantage = '外枠やや有利';
  } else {
    gateAdvantage = '枠順影響少ない';
  }

  // 脚質適性
  let runningStyleAdvantage;
  if (distanceToFirstCorner < 300 || straightDist < 300) {
    runningStyleAdvantage = ['逃げ', '先行'];
  } else if (straightDist > 450) {
    runningStyleAdvantage = ['差し', '追込'];
  } else {
    runningStyleAdvantage = ['先行', '差し'];
  }

  return {
    courseId,
    racecourse,
    distance,
    surface,
    direction: info.direction,
    trackSize: trackSize ? (trackSize === '内' ? '内回り' : '外回り') : undefined,
    straightLength,
    straightDistance: straightDist,
    hasSlope: info.hasSlope,
    slopeDescription: info.slopeDesc,
    distanceToFirstCorner,
    coursePattern: pattern,
    characteristics,
    paceTendency,
    gateAdvantage,
    runningStyleAdvantage,
    notes: info.notes.join('、')
  };
}

// メイン処理
function generateAllCourses() {
  const database = {};

  const patterns = [PATTERN_A, PATTERN_B, PATTERN_C, PATTERN_D, PATTERN_E, PATTERN_F];
  
  for (const patternData of patterns) {
    for (const courseId of patternData.courses) {
      const data = generateCourseData(courseId, patternData.pattern, patternData.distanceToFirstCorner);
      if (data) {
        database[courseId] = data;
      }
    }
  }

  return database;
}

// JSONファイル出力
const database = generateAllCourses();
const outputPath = path.join(__dirname, '..', 'data', 'course-characteristics.json');
fs.writeFileSync(outputPath, JSON.stringify(database, null, 2), 'utf-8');

console.log(`✅ コースデータベース生成完了`);
console.log(`📍 登録コース数: ${Object.keys(database).length}`);
console.log(`📁 出力先: ${outputPath}`);

// パターン別統計
const stats = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
for (const course of Object.values(database)) {
  stats[course.coursePattern]++;
}
console.log('\n📊 パターン別統計:');
console.log(`  パターンA（芝・300m未満）: ${stats.A}コース`);
console.log(`  パターンB（芝・300～500m）: ${stats.B}コース`);
console.log(`  パターンC（芝・500m以上）: ${stats.C}コース`);
console.log(`  パターンD（ダート・300m未満）: ${stats.D}コース`);
console.log(`  パターンE（ダート・300～400m）: ${stats.E}コース`);
console.log(`  パターンF（ダート・400m以上）: ${stats.F}コース`);









