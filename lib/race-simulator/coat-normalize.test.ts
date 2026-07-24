/**
 * coat-normalize テスト
 * 実行: npx tsx lib/race-simulator/coat-normalize.test.ts
 */
import { normalizeCoatColor } from './coat-normalize';
import { coatIndexFromName, coatIndexFor, COAT_PALETTE } from './broadcast-cel-horse';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

console.log('=== coat-normalize ===');

check('鹿毛 → bay', normalizeCoatColor('鹿毛') === 'bay');
check(' 鹿毛　 → bay', normalizeCoatColor(' 鹿毛　') === 'bay');
check('鹿毛（父系）→ bay', normalizeCoatColor('鹿毛（父系）') === 'bay');
check(' 黒鹿毛  → darkBay', normalizeCoatColor(' 黒鹿毛 ') === 'darkBay');
check('全角空白・改行', normalizeCoatColor('　青毛\n') === 'black');
check('BOM付き鹿毛', normalizeCoatColor('\uFEFF鹿毛') === 'bay');
check('改行混入', normalizeCoatColor('栗\r\n毛') === 'chestnut');
check('葦毛 → gray', normalizeCoatColor('葦毛') === 'gray');
check('芦毛 → gray', normalizeCoatColor('芦毛') === 'gray');
check('青毛 → black', normalizeCoatColor('青毛') === 'black');
check('青鹿毛 → darkBay', normalizeCoatColor('青鹿毛') === 'darkBay');
check('栗毛 → chestnut', normalizeCoatColor('栗毛') === 'chestnut');
check('栃栗毛 → darkChestnut', normalizeCoatColor('栃栗毛') === 'darkChestnut');
check('白毛 → white', normalizeCoatColor('白毛') === 'white');
check('括弧注釈除去', normalizeCoatColor('鹿毛（濃）') === 'bay');
check('null → null', normalizeCoatColor(null) === null);
check('undefined → null', normalizeCoatColor(undefined) === null);
check('空文字 → null', normalizeCoatColor('') === null);
check('未知 → null（fallbackへ）', normalizeCoatColor('斑毛XYZ') === null);
check('未知は coatIndexFromName=-1', coatIndexFromName('斑毛XYZ') === -1);

check('coatIndexFromName 鹿毛→0', coatIndexFromName('鹿毛') === 0);
check('coatIndexFromName 青毛→2', coatIndexFromName('青毛') === 2);
check('coatIndexFromName 栃栗→5', coatIndexFromName('栃栗毛') === 5);
check('coatIndexFromName 白毛→6', coatIndexFromName('白毛') === 6);
check('coatIndexFromName 未知→-1', coatIndexFromName('未知色') === -1);

// BL 優先: 正規化できる名前は fallback より優先（index >= 0）
check('BL由来が fallback より優先', coatIndexFromName('栗毛') >= 0 && coatIndexFromName('栗毛') !== coatIndexFor(99));

// 決定的 fallback
const a = coatIndexFor(7);
const b = coatIndexFor(7);
check('同じ馬番は同じ fallback', a === b);
check('fallback はパレット範囲内', a >= 0 && a < COAT_PALETTE.length);
check('別馬番で分散し得る', coatIndexFor(1) !== coatIndexFor(2) || coatIndexFor(3) !== coatIndexFor(4));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
