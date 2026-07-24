/**
 * トラッキング時系列サンプル（1レース分）
 * 実行: npx tsx scripts/verify-tracking-timeseries.ts
 */
import { simulateRaceDynamics } from '../lib/race-dynamics';
import {
  buildHorseInputsFromSimulation,
  buildForecastLayoutsFromSimulation,
  interpolateDynamicsForDisplay,
} from '../lib/race-simulator/race-3d-integration';
import {
  trackingInputsFromDynamics,
  buildTrackingRows,
} from '../lib/race-simulator/tracking-rows';

function makeSim(n: number) {
  const horses = Array.from({ length: n }, (_, i) => {
    const hn = i + 1;
    return {
      horseNumber: hn,
      horseName: `サンプル${hn}`,
      position: i + 1,
      waku: ((hn - 1) % 8) + 1,
      currentDistance: 180 - i * 2.5,
      lateralPosition: ((((hn - 1) % 8) + 1) - 4.5) * 2.5,
      capabilities: {
        startSpeed: 50 + (i % 5),
        cruiseSpeed: 45 + ((i * 11) % 40),
        acceleration: 40 + ((i * 9) % 45),
        stamina: 55,
        cornerSkill: 50,
      },
    };
  });
  const finish = [...horses]
    .sort((a, b) => b.capabilities.cruiseSpeed - a.capabilities.cruiseSpeed)
    .map((h, idx) => ({ ...h, position: idx + 1 }));
  return {
    raceKey: 'verify_tracking_ts',
    raceDistance: 1600,
    phases: { start: { horses } },
    finalStandings: finish,
  };
}

function main() {
  const sim = makeSim(14);
  const raceDistance = 1600;
  const layouts = buildForecastLayoutsFromSimulation(sim, raceDistance)!;
  const inputs = buildHorseInputsFromSimulation(sim);
  const dyn = simulateRaceDynamics(inputs, { raceDistance, trackWidth: 25, seed: 99 });

  // timeline 秒に相当するサンプル点（dynamics totalTime を正規化）
  const sampleFracs = [
    { label: '10s相当', frac: 10 / 120 },
    { label: '30s相当', frac: 30 / 120 },
    { label: '50s相当', frac: 50 / 120 },
    { label: 'ゴール前', frac: 0.90 },
    { label: '入線時', frac: 0.99 },
  ];

  console.log('=== React path ===');
  console.log('rAF → syncTrackingRows(timeline, currentTimeRef) [100ms throttle]');
  console.log('  → interpolateDynamicsForDisplay(dynamics, dynTime, forecastLayoutsRef)');
  console.log('  → trackingInputsFromDynamics → buildTrackingRows → setTrackingRows');
  console.log('  → <RaceTrackingPanel rows={trackingRows} />');
  console.log('seek: onChange → syncTrackingRows(timeline, newTime)');

  console.log('dynamics.totalTime(s)=', dyn.totalTime.toFixed(2));
  console.log('\n| time | 馬番 | rank | raceProgress(m) | 走破距離 | 先頭差 | gapLabel |');
  console.log('|---|---:|---:|---:|---:|---:|---|');

  let prevRun = new Map<number, number>();
  let allOk = true;

  for (const s of sampleFracs) {
    const t = dyn.totalTime * s.frac;
    const frame = interpolateDynamicsForDisplay(dyn, t, layouts);
    const trackingInputs = trackingInputsFromDynamics(frame, raceDistance, (n) => `サンプル${n}`);
    const rows = buildTrackingRows(trackingInputs, {
      wakuOf: (hn) => ((hn - 1) % 8) + 1,
      raceDistance,
    });

    // 先頭3頭を出力（raceProgress はメートル）
    for (const r of rows.slice(0, 3)) {
      const f = frame.find((x) => x.horseNumber === r.horseNumber)!;
      console.log(
        `| ${s.label} (t=${t.toFixed(1)}s) | ${r.horseNumber} | ${r.position} | ${f.raceProgress.toFixed(1)} | ${r.distanceRun.toFixed(1)} | ${r.gap.toFixed(1)} | ${r.gapLabel} |`,
      );
      if (!Number.isFinite(r.distanceRun) || !Number.isFinite(r.gap) || r.gap < 0) allOk = false;
      if (Number.isNaN(f.raceProgress)) allOk = false;
    }

    // 走破距離が増えること（同一馬で）
    for (const r of rows) {
      const prev = prevRun.get(r.horseNumber);
      if (prev != null && r.distanceRun + 1e-6 < prev) {
        console.error('distance decreased', r.horseNumber, prev, r.distanceRun);
        allOk = false;
      }
      prevRun.set(r.horseNumber, r.distanceRun);
    }

    // 後続が全員0でない（ゴール前以降は差があるはず）
    if (s.frac >= 0.2) {
      const nonLeadGaps = rows.filter((r) => r.position > 1);
      if (!nonLeadGaps.some((r) => r.gap > 0)) {
        console.error('all trailing gaps are 0 at', s.label);
        allOk = false;
      }
    }
  }

  // seek 相当: ゴール前 → 30s相当へ戻す
  const tGoal = dyn.totalTime * 0.90;
  const tBack = dyn.totalTime * (30 / 120);
  const atGoal = buildTrackingRows(
    trackingInputsFromDynamics(interpolateDynamicsForDisplay(dyn, tGoal, layouts), raceDistance),
    { wakuOf: () => 1, raceDistance },
  );
  const atBack = buildTrackingRows(
    trackingInputsFromDynamics(interpolateDynamicsForDisplay(dyn, tBack, layouts), raceDistance),
    { wakuOf: () => 1, raceDistance },
  );
  console.log('\nseek back: goal前 走破先頭=', atGoal[0].distanceRun.toFixed(1),
    '→ 30s相当=', atBack[0].distanceRun.toFixed(1),
    'PASS:', atBack[0].distanceRun < atGoal[0].distanceRun);

  console.log('\nALL_OK:', allOk && atBack[0].distanceRun < atGoal[0].distanceRun);
  if (!allOk) process.exit(1);
}

main();
