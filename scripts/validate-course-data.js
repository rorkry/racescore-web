/**
 * コースデータベース検証スクリプト
 * 
 * 全コースが正しく登録されているか確認
 * 
 * 実行: node scripts/validate-course-data.js
 */

// ========================================
// 期待されるコース一覧
// ========================================

const EXPECTED_COURSES = {
  // 中山
  '中山': {
    '芝': [1200, 1600, 1800, 2000, 2200, 2500],
    'ダート': [1200, 1800],
  },
  // 東京
  '東京': {
    '芝': [1400, 1600, 1800, 2000, 2400],
    'ダート': [1300, 1400, 1600, 2100],
  },
  // 阪神
  '阪神': {
    '芝': [1200, 1400, 1600, 1800, 2000, 2200],
    'ダート': [1200, 1400, 1800],
  },
  // 京都
  '京都': {
    '芝': [1200, 1400, 1600, 1800, 2000, 2200, 2400, 3000],
    'ダート': [1200, 1400, 1800, 1900],
  },
  // 新潟
  '新潟': {
    '芝': [1000, 1200, 1400, 1600, 1800, 2000],
    'ダート': [1200, 1800],
  },
  // 小倉
  '小倉': {
    '芝': [1200, 1700, 1800, 2000],
    'ダート': [1000, 1700],
  },
  // 福島
  '福島': {
    '芝': [1200, 1800, 2000],
    'ダート': [1150, 1700],
  },
  // 札幌
  '札幌': {
    '芝': [1200, 1500, 1800, 2000],
    'ダート': [1000, 1700],
  },
  // 函館
  '函館': {
    '芝': [1000, 1200, 1800, 2000],
    'ダート': [1000, 1700],
  },
  // 中京
  '中京': {
    '芝': [1200, 1400, 1600, 2000, 2200],
    'ダート': [1200, 1400, 1800, 1900],
  },
};

// ========================================
// TypeScriptファイルを読み込んでデータベースを抽出
// ========================================

const fs = require('fs');
const path = require('path');

function extractCourseIds() {
  const filePath = path.join(__dirname, '..', 'lib', 'course-database.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // COURSE_DATABASE のキーを抽出
  const courseIds = [];
  const regex = /"([^"]+)":\s*\{[\s\S]*?courseId:\s*"([^"]+)"/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    courseIds.push(match[1]);
  }
  
  return courseIds;
}

// ========================================
// 検証関数
// ========================================

function validateCourseData() {
  console.log('========================================');
  console.log('コースデータベース検証開始');
  console.log('========================================\n');

  const registeredCourses = extractCourseIds();
  console.log(`登録済みコース数: ${registeredCourses.length}\n`);
  
  // 登録済みコースを表示
  console.log('登録済みコース一覧:');
  registeredCourses.forEach(c => console.log(`  - ${c}`));

  let totalExpected = 0;
  let totalFound = 0;
  let totalMissing = 0;
  const missing = [];

  console.log('\n========================================');
  console.log('コース登録チェック');
  console.log('========================================');

  // 競馬場ごとにチェック
  for (const [racecourse, surfaces] of Object.entries(EXPECTED_COURSES)) {
    console.log(`\n📍 ${racecourse}競馬場`);
    console.log('-'.repeat(40));

    for (const [surface, distances] of Object.entries(surfaces)) {
      for (const distance of distances) {
        totalExpected++;
        const courseId = `${racecourse}_${surface}_${distance}`;
        
        if (registeredCourses.includes(courseId)) {
          totalFound++;
          console.log(`  ✅ ${surface}${distance}m`);
        } else {
          totalMissing++;
          missing.push(courseId);
          console.log(`  ❌ ${surface}${distance}m (未登録)`);
        }
      }
    }
  }

  // サマリー
  console.log('\n========================================');
  console.log('検証結果サマリー');
  console.log('========================================');
  console.log(`期待コース数: ${totalExpected}`);
  console.log(`登録済み: ${totalFound}`);
  console.log(`未登録: ${totalMissing}`);
  console.log(`カバー率: ${((totalFound / totalExpected) * 100).toFixed(1)}%`);

  if (missing.length > 0) {
    console.log('\n❌ 未登録のコース:');
    missing.forEach(course => console.log(`  - ${course}`));
  } else {
    console.log('\n✅ 全コースが登録されています');
  }

  console.log('\n========================================');
  console.log('検証完了');
  console.log('========================================\n');

  return {
    totalExpected,
    totalFound,
    totalMissing,
    missing,
    registeredCourses,
  };
}

// ========================================
// 実行
// ========================================

validateCourseData();






