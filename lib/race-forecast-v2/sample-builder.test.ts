/**
 * sample-builder テスト（DB実データ仕様の吸収を検証）
 * 実行: npx tsx lib/race-forecast-v2/sample-builder.test.ts
 */
import {
  buildPastRaceSample,
  dateNumberFromRaceId,
  dedupeAndSortPastRaces,
  filterPastRacesBefore,
  normalizeHorseName,
  parseCorners,
  parseDistanceField,
  parseFinishPositionV2,
  parseIntInRange,
  parseNumberV2,
  toHalfWidthDigits,
} from './sample-builder';
import type { PastRaceSample } from './types';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  NG  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}
function section(t: string) {
  console.log(`\n--- ${t} ---`);
}

// ============================================================
section('着順パース（全角混在・中止除外）');
// ============================================================
{
  // 実データの表記そのまま（末尾に空白あり）
  for (const [raw, expect] of [
    ['１       ', 1], ['２       ', 2], ['３       ', 3], ['９       ', 9],
    ['10      ', 10], ['16      ', 16], ['18      ', 18],
  ] as const) {
    const r = parseFinishPositionV2(raw);
    check(`着順 "${String(raw).trim()}" → ${expect}`, r.position === expect && !r.abnormal, JSON.stringify(r));
  }

  // legacy の罠: parseInt では NaN になる
  check('全角「１」は parseInt では読めない（罠の確認）', Number.isNaN(parseInt('１', 10)));
  check('v2 は全角「１」を 1 として読む', parseFinishPositionV2('１').position === 1);

  // 中止・除外・取消
  for (const raw of ['止       ', '外       ', '消       ']) {
    const r = parseFinishPositionV2(raw);
    check(`"${raw.trim()}" は abnormal・着順null`, r.position === null && r.abnormal === true, JSON.stringify(r));
  }

  // 丸数字
  check('丸数字 ① → 1', parseFinishPositionV2('①').position === 1);
  check('丸数字 ④ → 4', parseFinishPositionV2('④').position === 4);

  // 空・欠損
  check('空文字 → null / abnormalではない', parseFinishPositionV2('').position === null && !parseFinishPositionV2('').abnormal);
  check('null → null', parseFinishPositionV2(null).position === null);
  check('"----" → null', parseFinishPositionV2('----').position === null);
  check('99 は着順として返さない（範囲外）', parseFinishPositionV2('99').position === null);
}

// ============================================================
section('数値パース');
// ============================================================
{
  check('"35.3" → 35.3', parseNumberV2('35.3') === 35.3);
  check('"-0.1"（勝ち馬の着差）→ -0.1', parseNumberV2('-0.1') === -0.1);
  check('"----" → null', parseNumberV2('----') === null);
  check('"" → null', parseNumberV2('') === null);
  check('"0.0" → 0（0を欠損にしない）', parseNumberV2('0.0') === 0);
  check('0（number）→ 0', parseNumberV2(0) === 0);
  check('null → null', parseNumberV2(null) === null);
  check('NaN → null', parseNumberV2(NaN) === null);
  check('"+4"（増減）→ 4', parseNumberV2('+4') === 4);
  check('全角数字 "３５.３" → 35.3', parseNumberV2('３５.３') === 35.3);
  check('toHalfWidthDigits', toHalfWidthDigits('１２３') === '123');

  check('parseIntInRange 範囲内', parseIntInRange('16', 1, 18) === 16);
  check('parseIntInRange 範囲外は null', parseIntInRange('25', 1, 18) === null);
  check('parseIntInRange 空は null', parseIntInRange('', 1, 18) === null);
}

// ============================================================
section('距離・日付パース');
// ============================================================
{
  check('"芝1600" → 芝/1600', (() => { const r = parseDistanceField('芝1600'); return r.surface === '芝' && r.distanceMeters === 1600; })());
  check('"ダ1200" → ダ/1200', (() => { const r = parseDistanceField('ダ1200'); return r.surface === 'ダ' && r.distanceMeters === 1200; })());
  check('"芝2860" → 芝/2860', parseDistanceField('芝2860').distanceMeters === 2860);
  check('空 → null/null', (() => { const r = parseDistanceField(''); return r.surface === null && r.distanceMeters === null; })());

  check('race_id → 日付', dateNumberFromRaceId('2019010508010111') === 20190105);
  check('不正 race_id → 0', dateNumberFromRaceId('abc') === 0);
  check('null → 0', dateNumberFromRaceId(null) === 0);
}

// ============================================================
section('コーナー（右詰め格納への対応）');
// ============================================================
{
  // 実データ: 芝1600 は corner_1/2 が空で corner_3/4 に値
  const twoCorner = parseCorners('', '', '6', '7', 17);
  check('2コーナーレース: 最初の有効コーナー = corner_3', twoCorner.firstCornerPosition === 6, JSON.stringify(twoCorner));
  check('2コーナーレース: 最後 = corner_4', twoCorner.lastCornerPosition === 7);
  check('2コーナーレース: corners[0] は null', twoCorner.corners[0] === null);

  // 4コーナーレース
  const fourCorner = parseCorners('3', '4', '5', '6', 16);
  check('4コーナーレース: 最初 = corner_1', fourCorner.firstCornerPosition === 3);
  check('4コーナーレース: 最後 = corner_4', fourCorner.lastCornerPosition === 6);

  // 3コーナー（-234）
  const threeCorner = parseCorners('', '4', '5', '6', 16);
  check('3コーナーレース: 最初 = corner_2', threeCorner.firstCornerPosition === 4);

  // 全空（直線競走等）
  const none = parseCorners('', '', '', '', 16);
  check('全空 → 両方 null', none.firstCornerPosition === null && none.lastCornerPosition === null);

  // 頭数を超える値は除外
  const bad = parseCorners('', '', '20', '5', 16);
  check('頭数超過の通過順位は除外', bad.corners[2] === null && bad.firstCornerPosition === 5);

  // 全角
  const zen = parseCorners('', '', '６', '７', 17);
  check('全角コーナー順位も読める', zen.firstCornerPosition === 6 && zen.lastCornerPosition === 7);
}

// ============================================================
section('buildPastRaceSample（実データ1行）');
// ============================================================
{
  // investigate-columns.ts で取得した実行データ
  const row = {
    race_id: '2019010508010111',
    date: '2019. 1. 5',
    place: '京都',
    course_type: '外',
    distance: '芝1600',
    class_name: 'Ｇ３',
    track_condition: '良',
    field_size: '17',
    finish_position: '15',
    last_3f: '35.3',
    margin: '0.6',
    rpci: '51.8',
    pci: '52.3',
    corner_1: '',
    corner_2: '',
    corner_3: '6',
    corner_4: '7',
    umaban: '1',
    waku: '1',
    horse_name: 'ストーミーシー',
  };
  const idx = { L4F: 47.3, T2F: 24.6, pfs_past: 42.3, potential: 3.7, makikaeshi: 0, cushion: 9.3, corner_lane: 2 };
  const s = buildPastRaceSample(row, idx);

  check('raceId', s.raceId === '2019010508010111');
  check('dateNumber', s.dateNumber === 20190105);
  check('surface / distance', s.surface === '芝' && s.distanceMeters === 1600);
  check('fieldSize', s.fieldSize === 17);
  check('finishPosition', s.finishPosition === 15 && !s.abnormalFinish);
  check('margin', s.marginSeconds === 0.6);
  check('last3f', s.last3fSeconds === 35.3);
  check('pci / rpci', s.pci === 52.3 && s.rpci === 51.8);
  check('コーナー右詰め対応', s.firstCornerPosition === 6 && s.lastCornerPosition === 7);
  check('指数が入る', s.l4fSeconds === 47.3 && s.t2fSeconds === 24.6 && s.pfsPast === 42.3);
  check('makikaeshi の 0 が保持される（欠損にしない）', s.makikaeshi === 0);
  check('place / courseType / trackCondition', s.place === '京都' && s.courseType === '外' && s.trackCondition === '良');

  // indices が無い場合
  const noIdx = buildPastRaceSample(row, null);
  check('indices欠損 → 指数は全部 null', noIdx.l4fSeconds === null && noIdx.t2fSeconds === null && noIdx.potential === null);
  check('indices欠損でも umadata 由来は残る', noIdx.last3fSeconds === 35.3 && noIdx.finishPosition === 15);

  // 全角着順の実データ
  const zenRow = { ...row, finish_position: '７       ' };
  check('全角着順の行も正しく読める', buildPastRaceSample(zenRow, idx).finishPosition === 7);

  // 中止の行
  const abnRow = { ...row, finish_position: '止       ', margin: '----' };
  const abn = buildPastRaceSample(abnRow, idx);
  check('中止の行: finishPosition=null / abnormal=true', abn.finishPosition === null && abn.abnormalFinish);
  check('中止の行: margin "----" → null', abn.marginSeconds === null);
}

// ============================================================
section('重複除去・日付降順・未来情報遮断');
// ============================================================
{
  function s(raceId: string, dateNumber: number): PastRaceSample {
    return buildPastRaceSample(
      { race_id: raceId, field_size: '16', distance: '芝1600', finish_position: '5', corner_3: '5', corner_4: '5' },
      null
    ) as PastRaceSample & { dateNumber: number };
  }

  // 実データは同一レースが最大30行重複する
  const dup = [
    s('2026010406010101', 20260104),
    s('2026010406010101', 20260104),
    s('2026010406010101', 20260104),
    s('2025120106010101', 20251201),
  ];
  const deduped = dedupeAndSortPastRaces(dup);
  check('重複が除去される', deduped.length === 2, `len=${deduped.length}`);
  check('重複除去後も新しい順', deduped[0].raceId === '2026010406010101' && deduped[1].raceId === '2025120106010101');

  // 30回重複しても1走として数える（recency weight が壊れないこと）
  const dup30 = Array.from({ length: 30 }, () => s('2026010406010101', 20260104));
  check('30重複 → 1走', dedupeAndSortPastRaces(dup30).length === 1);

  // 日付降順
  const unsorted = [
    s('2025060106010101', 20250601),
    s('2026030106010101', 20260301),
    s('2025120106010101', 20251201),
  ];
  const sorted = dedupeAndSortPastRaces(unsorted);
  check('日付降順に並ぶ',
    sorted[0].dateNumber === 20260301 && sorted[1].dateNumber === 20251201 && sorted[2].dateNumber === 20250601,
    JSON.stringify(sorted.map((x) => x.dateNumber)));

  // 上限件数
  const many = Array.from({ length: 12 }, (_, i) => s(`202601${String(i + 10).padStart(2, '0')}06010101`, 20260110 + i));
  check('上限5走に絞られる', dedupeAndSortPastRaces(many, 5).length === 5);
  check('上限を変えられる', dedupeAndSortPastRaces(many, 3).length === 3);

  // 未来情報の遮断
  const mixed = [
    s('2026070106010101', 20260701), // 対象レース後
    s('2026060106010101', 20260601), // 対象レース前
    s('2026062906010101', 20260629), // 対象レース当日
  ];
  const filtered = filterPastRacesBefore(mixed, 20260629);
  check('対象レース日以降を除外', filtered.length === 1 && filtered[0].dateNumber === 20260601,
    JSON.stringify(filtered.map((x) => x.dateNumber)));
  check('同日開催も除外（未来情報混入防止）', !filtered.some((x) => x.dateNumber === 20260629));
  check('対象日が不正なら空', filterPastRacesBefore(mixed, 0).length === 0);

  check('馬名の空白除去', normalizeHorseName('ストーミーシー   ') === 'ストーミーシー');
}

// ============================================================
console.log('\n' + '='.repeat(60));
console.log(` sample-builder: pass=${pass} fail=${fail}`);
console.log('='.repeat(60));
if (fail > 0) process.exit(1);
