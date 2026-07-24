/**
 * ai-position-adjust テスト
 * 実行: npx tsx lib/race-dynamics/ai-position-adjust.test.ts
 *
 * 検証:
 *  - 上位評価馬だけ前方向補正（中央値以下は0）
 *  - 低評価馬を後方へ下げない（appliedBonusMeters >= 0）
 *  - 脚質別メートル上限を超えない
 *  - 脚質帯を越えない（前帯馬までの隙間内に収まる）
 *  - 同点は同じ bonusStrength（horseNumber をタイブレークに使わない）
 *  - 全馬同点 / 有効スコア不足 / スコア欠損 → 補正0
 *  - テーパー: 発馬直後0→formationで1→ゴール前(0.62以降)で0
 */
import {
  computeCompetitionFormationBonus,
  formationBonusTaperWeight,
  STYLE_MAX_FRACTION,
  MIN_VALID_SCORES,
  type BonusInputHorse,
} from './ai-position-adjust';

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

console.log('=== ai-position-adjust ===');

const RD = 1600;

// 10頭: escape(1,2) front(3,4,5) stalker(6,7,8) closer(9,10)
// baseFormationMeters は大きいほど前。escape>front>stalker>closer。
function field(): BonusInputHorse[] {
  return [
    { horseNumber: 1, runningStyle: 'escape', competitionScore: 55, baseFormationMeters: 32 },
    { horseNumber: 2, runningStyle: 'escape', competitionScore: 48, baseFormationMeters: 30 },
    { horseNumber: 3, runningStyle: 'front', competitionScore: 82, baseFormationMeters: 26 }, // 最上位付近
    { horseNumber: 4, runningStyle: 'front', competitionScore: 40, baseFormationMeters: 24 },
    { horseNumber: 5, runningStyle: 'front', competitionScore: 35, baseFormationMeters: 25 },
    { horseNumber: 6, runningStyle: 'stalker', competitionScore: 30, baseFormationMeters: 16 },
    { horseNumber: 7, runningStyle: 'stalker', competitionScore: 90, baseFormationMeters: 14 }, // 最上位
    { horseNumber: 8, runningStyle: 'stalker', competitionScore: 20, baseFormationMeters: 15 },
    { horseNumber: 9, runningStyle: 'closer', competitionScore: 70, baseFormationMeters: 6 },
    { horseNumber: 10, runningStyle: 'closer', competitionScore: 10, baseFormationMeters: 5 },
  ];
}

// 1) 上位のみ前方向 / 非負 / メートル上限
{
  const res = computeCompetitionFormationBonus(field(), RD);
  let allNonNeg = true;
  let allUnderMax = true;
  for (const r of res.values()) {
    if (r.appliedBonusMeters < 0) allNonNeg = false;
    const cap = (STYLE_MAX_FRACTION[r.runningStyle] ?? STYLE_MAX_FRACTION.unknown) * RD;
    if (r.appliedBonusMeters > cap + 1e-9) allUnderMax = false;
  }
  check('全馬 appliedBonusMeters >= 0（後退させない）', allNonNeg);
  check('全馬 脚質別メートル上限以内', allUnderMax);

  const top = res.get(7)!; // 最高スコア → percentile 0 → strength 1
  check('最上位(7) は前方向補正あり', top.bonusStrength > 0.99 && top.appliedBonusMeters > 0, `strength=${top.bonusStrength} applied=${top.appliedBonusMeters}`);

  const low = res.get(10)!; // 最下位
  check('最下位(10) は補正0（中央値以下）', low.appliedBonusMeters === 0 && low.provenance === 'zero-below-median');

  const belowMedian = res.get(8)!; // score20, 下位
  check('下位(8) は補正0', belowMedian.appliedBonusMeters === 0);
}

// 2) 脚質帯を越えない（stalker7 は最も後方の front 馬より前へ出ない）
{
  const f = field();
  const res = computeCompetitionFormationBonus(f, RD);
  const s7 = res.get(7)!;
  const minFront = Math.min(...f.filter((h) => h.runningStyle === 'front').map((h) => h.baseFormationMeters)); // 24
  const s7Base = 14;
  const adjusted = s7Base + s7.appliedBonusMeters;
  check('stalker(7) 補正後も front 帯へ食い込まない', adjusted < minFront, `adjusted=${adjusted} minFront=${minFront}`);
  // 隙間の半分以内
  check('stalker(7) は前帯までの隙間の半分以内', s7.appliedBonusMeters <= 0.5 * (minFront - s7Base) + 1e-9);
}

// 3) 同点は同じ bonusStrength
{
  const f: BonusInputHorse[] = [
    { horseNumber: 1, runningStyle: 'front', competitionScore: 60, baseFormationMeters: 20 },
    { horseNumber: 2, runningStyle: 'front', competitionScore: 60, baseFormationMeters: 22 },
    { horseNumber: 3, runningStyle: 'stalker', competitionScore: 40, baseFormationMeters: 12 },
    { horseNumber: 4, runningStyle: 'stalker', competitionScore: 30, baseFormationMeters: 10 },
    { horseNumber: 5, runningStyle: 'closer', competitionScore: 20, baseFormationMeters: 5 },
  ];
  const res = computeCompetitionFormationBonus(f, RD);
  check('同点(1,2)は同じ bonusStrength', Math.abs(res.get(1)!.bonusStrength - res.get(2)!.bonusStrength) < 1e-9);
  check('同点(1,2)は同じ percentile', Math.abs(res.get(1)!.percentile - res.get(2)!.percentile) < 1e-9);
}

// 4) 全馬同点 → 全馬0
{
  const f: BonusInputHorse[] = Array.from({ length: 6 }, (_, i) => ({
    horseNumber: i + 1,
    runningStyle: 'front' as const,
    competitionScore: 50,
    baseFormationMeters: 20 - i,
  }));
  const res = computeCompetitionFormationBonus(f, RD);
  let allZero = true;
  for (const r of res.values()) if (r.appliedBonusMeters !== 0 || r.provenance !== 'tie') allZero = false;
  check('全馬同点 → 全馬 補正0 / provenance=tie', allZero);
}

// 5) 有効スコア不足（< MIN_VALID_SCORES）→ 全馬0
{
  const f: BonusInputHorse[] = Array.from({ length: MIN_VALID_SCORES - 1 }, (_, i) => ({
    horseNumber: i + 1,
    runningStyle: 'front' as const,
    competitionScore: 10 + i * 20,
    baseFormationMeters: 20 - i,
  }));
  const res = computeCompetitionFormationBonus(f, RD);
  let allZero = true;
  for (const r of res.values()) if (r.appliedBonusMeters !== 0 || r.provenance !== 'insufficient-field') allZero = false;
  check('有効スコア不足 → 全馬0 / insufficient-field', allZero);
}

// 6) スコア欠損馬 → 補正0 / missing-score（有効馬は補正されうる）
{
  const f = field();
  f.push({ horseNumber: 11, runningStyle: 'stalker', competitionScore: undefined, baseFormationMeters: 13 });
  const res = computeCompetitionFormationBonus(f, RD);
  const miss = res.get(11)!;
  check('欠損馬 → 補正0 / missing-score', miss.appliedBonusMeters === 0 && miss.provenance === 'missing-score' && miss.competitionScore === undefined);
}

// 7) テーパー: 発馬直後0 / formationで1 / ゴール前(0.62以降)0
{
  check('taper(0)=0', formationBonusTaperWeight(0) === 0);
  check('taper(0.02)≈0', formationBonusTaperWeight(0.02) < 0.01);
  check('taper(0.35)≈1', formationBonusTaperWeight(0.35) > 0.99);
  check('taper(0.62)=0（ゴール前ブレンド開始0.70より前に0）', formationBonusTaperWeight(0.62) === 0);
  check('taper(0.70)=0', formationBonusTaperWeight(0.7) === 0);
  check('taper(1.0)=0', formationBonusTaperWeight(1.0) === 0);
  // 立ち上げ・立ち下げが単調
  let up = true;
  for (let p = 0.05; p <= 0.2; p += 0.01) if (formationBonusTaperWeight(p + 0.005) < formationBonusTaperWeight(p) - 1e-9) up = false;
  check('立ち上げ区間は単調増加', up);
  let down = true;
  for (let p = 0.5; p <= 0.62; p += 0.01) if (formationBonusTaperWeight(p + 0.005) > formationBonusTaperWeight(p) + 1e-9) down = false;
  check('立ち下げ区間は単調減少', down);
}

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} : ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
