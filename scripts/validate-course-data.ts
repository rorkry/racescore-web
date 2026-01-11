/**
 * コースデータベース検証スクリプト
 * 
 * 全コースが正しく登録されているか確認
 */

// CommonJS形式で読み込み（ts-node用）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { COURSE_DATABASE, getAllCourses, getCoursesByRacecourse } = require('../lib/course-database');

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
// 検証関数
// ========================================

function validateCourseData() {
  console.log('========================================');
  console.log('コースデータベース検証開始');
  console.log('========================================\n');

  const registeredCourses = Object.keys(COURSE_DATABASE);
  console.log(`登録済みコース数: ${registeredCourses.length}\n`);

  let totalExpected = 0;
  let totalFound = 0;
  let totalMissing = 0;
  const missing: string[] = [];

  // 競馬場ごとにチェック
  for (const [racecourse, surfaces] of Object.entries(EXPECTED_COURSES)) {
    console.log(`\n📍 ${racecourse}競馬場`);
    console.log('-'.repeat(40));

    for (const [surface, distances] of Object.entries(surfaces)) {
      const surfaceKey = surface === '芝' ? '芝' : 'ダート';
      
      for (const distance of distances) {
        totalExpected++;
        const courseId = `${racecourse}_${surfaceKey}_${distance}`;
        
        if (COURSE_DATABASE[courseId]) {
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

  if (missing.length > 0) {
    console.log('\n❌ 未登録のコース:');
    missing.forEach(course => console.log(`  - ${course}`));
  } else {
    console.log('\n✅ 全コースが登録されています');
  }

  // 競馬場ごとの統計
  console.log('\n========================================');
  console.log('競馬場別統計');
  console.log('========================================');
  
  const racecourses = ['中山', '東京', '阪神', '京都', '新潟', '小倉', '福島', '札幌', '函館', '中京'];
  
  for (const racecourse of racecourses) {
    const courses = getCoursesByRacecourse(racecourse);
    const turfCount = courses.filter(c => c.surface === '芝').length;
    const dirtCount = courses.filter(c => c.surface === 'ダート').length;
    console.log(`  ${racecourse}: 芝${turfCount}コース / ダート${dirtCount}コース`);
  }

  // データ品質チェック
  console.log('\n========================================');
  console.log('データ品質チェック');
  console.log('========================================');

  let qualityIssues = 0;
  
  for (const [courseId, course] of Object.entries(COURSE_DATABASE)) {
    const issues: string[] = [];

    // 必須フィールドチェック
    if (!course.characteristics || course.characteristics.length === 0) {
      issues.push('特徴が未設定');
    }
    if (course.distanceToFirstCorner <= 0) {
      issues.push('最初のコーナーまでの距離が未設定');
    }
    if (!course.coursePattern) {
      issues.push('コースパターンが未設定');
    }

    if (issues.length > 0) {
      qualityIssues++;
      console.log(`  ⚠️ ${courseId}: ${issues.join(', ')}`);
    }
  }

  if (qualityIssues === 0) {
    console.log('  ✅ 全コースのデータ品質は良好です');
  } else {
    console.log(`\n  ⚠️ ${qualityIssues}件の品質問題が見つかりました`);
  }

  console.log('\n========================================');
  console.log('検証完了');
  console.log('========================================\n');

  return {
    totalExpected,
    totalFound,
    totalMissing,
    missing,
    qualityIssues,
  };
}

// ========================================
// 実行
// ========================================

validateCourseData();

