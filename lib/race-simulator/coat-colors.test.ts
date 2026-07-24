/**
 * fetchCoatColors テスト（毛色取得の非破壊性）
 * 実行: npx tsx lib/race-simulator/coat-colors.test.ts
 *
 * 検証:
 *  - umadata に keiro 列が無い環境では空 Map を返す（例外を投げない＝sim を止めない）
 *  - keiro 列がある環境では horse_name→毛色名 を正しく返す（トリム込み）
 *  - keiro 取得クエリが失敗しても空 Map（フォールバック）
 *  - coatIndexFromName が実データ毛色名（鹿毛/黒鹿毛/青鹿毛/栗毛/芦毛）を正しく分類する
 */
import { fetchCoatColors, __resetCoatColumnCacheForTest } from './data-fetcher';
import { coatIndexFromName } from './broadcast-cel-horse';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

console.log('=== coat-colors ===');

// 簡易 db モック: prepare(sql).all(...params) を返す
function makeDb(handler: (sql: string, params: any[]) => any[]) {
  return {
    prepare(sql: string) {
      return {
        all: async (...params: any[]) => handler(sql, params),
      };
    },
  };
}

async function main() {
  // 1) keiro 列が存在しない → 空 Map（例外なし）
  __resetCoatColumnCacheForTest();
  {
    const db = makeDb((sql) => {
      if (sql.includes('information_schema.columns')) return []; // 列なし
      throw new Error('SELECT keiro が呼ばれてはいけない');
    });
    const m = await fetchCoatColors(db, ['ドレドレ', 'テストウマ']);
    check('列なし: 空 Map', m.size === 0);
  }

  // 2) keiro 列あり → 正しくマップ（トリム込み）
  __resetCoatColumnCacheForTest();
  {
    const db = makeDb((sql, params) => {
      if (sql.includes('information_schema.columns')) return [{ '?column?': 1 }];
      // ANY($1::text[]) の params[0] は配列
      check('クエリ: 配列パラメータ', Array.isArray(params[0]));
      return [
        { horse_name: 'ドレドレ', keiro: '栗毛' },
        { horse_name: ' テストウマ ', keiro: ' 鹿毛 ' },
      ];
    });
    const m = await fetchCoatColors(db, ['ドレドレ', 'テストウマ']);
    check('列あり: ドレドレ=栗毛', m.get('ドレドレ') === '栗毛');
    check('列あり: トリムして格納', m.get('テストウマ') === '鹿毛');
  }

  // 3) keiro クエリが失敗しても空 Map（フォールバック）
  __resetCoatColumnCacheForTest();
  {
    const db = makeDb((sql) => {
      if (sql.includes('information_schema.columns')) return [{ '?column?': 1 }];
      throw new Error('DB エラー');
    });
    const m = await fetchCoatColors(db, ['ドレドレ']);
    check('クエリ失敗: 空 Map（例外を投げない）', m.size === 0);
  }

  // 4) 空入力
  __resetCoatColumnCacheForTest();
  {
    const db = makeDb(() => { throw new Error('呼ばれてはいけない'); });
    const m = await fetchCoatColors(db, []);
    check('空入力: 空 Map', m.size === 0);
  }

  // 5) coatIndexFromName の分類（実データ毛色名）
  check('鹿毛→0', coatIndexFromName('鹿毛') === 0);
  check('黒鹿毛→1', coatIndexFromName('黒鹿毛') === 1);
  check('青鹿毛→2', coatIndexFromName('青鹿毛') === 2);
  check('栗毛→3', coatIndexFromName('栗毛') === 3);
  check('栃栗毛→3', coatIndexFromName('栃栗毛') === 3);
  check('芦毛→4', coatIndexFromName('芦毛') === 4);
  check('白毛→4', coatIndexFromName('白毛') === 4);
  check('未知→-1', coatIndexFromName('謎毛') === -1);
  check('null→-1', coatIndexFromName(null) === -1);

  console.log(`\n結果: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
