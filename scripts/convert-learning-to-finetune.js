/**
 * 学習データをOpenAIファインチューニング用JSONLに変換
 * 
 * 目的：
 * - 指数と次走成績の関係をAIに学習させる
 * - 「期待値が高い馬」の判断基準を学習させる
 */

const fs = require('fs');
const path = require('path');

// 設定
const INPUT_PATH = path.join(__dirname, '../data/learning-data/learning-data-full.json');
const OUTPUT_DIR = path.join(__dirname, '../data/fine-tuning');

// 閾値設定（分析結果に基づく）
const THRESHOLDS = {
  potential: {
    excellent: 6,    // 回収率150%超
    good: 5,         // 回収率100%超
    average: 4,      // 回収率80%超
  },
  makikaeshi: {
    sweetSpot: { min: 2, max: 6 },  // 回収率100%超のゾーン
    best: { min: 2, max: 3 },       // 最高回収率125%
  }
};

// 評価コメント生成
function generateEvaluation(horse) {
  const comments = [];
  const warnings = [];
  let score = 0;
  
  // ポテンシャル評価
  if (horse.potential !== null) {
    if (horse.potential >= THRESHOLDS.potential.excellent) {
      comments.push(`ポテンシャル${horse.potential.toFixed(1)}は非常に高く、期待値◎`);
      score += 3;
    } else if (horse.potential >= THRESHOLDS.potential.good) {
      comments.push(`ポテンシャル${horse.potential.toFixed(1)}は水準以上、期待値あり`);
      score += 2;
    } else if (horse.potential >= THRESHOLDS.potential.average) {
      comments.push(`ポテンシャル${horse.potential.toFixed(1)}は標準レベル`);
      score += 1;
    } else {
      warnings.push(`ポテンシャル${horse.potential.toFixed(1)}は低め`);
    }
  }
  
  // 巻き返し評価
  if (horse.makikaeshi !== null) {
    const m = horse.makikaeshi;
    if (m >= THRESHOLDS.makikaeshi.best.min && m <= THRESHOLDS.makikaeshi.best.max) {
      comments.push(`巻き返し${m.toFixed(1)}は最適ゾーン、前走軽い不利からの巻き返し期待`);
      score += 3;
    } else if (m >= THRESHOLDS.makikaeshi.sweetSpot.min && m <= THRESHOLDS.makikaeshi.sweetSpot.max) {
      comments.push(`巻き返し${m.toFixed(1)}で反撃期待`);
      score += 2;
    } else if (m > THRESHOLDS.makikaeshi.sweetSpot.max) {
      warnings.push(`巻き返し${m.toFixed(1)}は高すぎ、前走の不利度が大きすぎる可能性`);
    } else if (m < 1) {
      warnings.push(`巻き返し${m.toFixed(1)}は低い、前走恵まれた可能性`);
    }
  }
  
  // L4F評価（低いほど良い）
  if (horse.L4F !== null && horse.L4F <= 45) {
    comments.push(`後半4F指数${horse.L4F.toFixed(1)}は速力あり`);
    score += 1;
  }
  
  // T2F評価（低いほど良い）
  if (horse.T2F !== null && horse.T2F <= 22.5) {
    comments.push(`前半2F指数${horse.T2F.toFixed(1)}で先行力あり`);
    score += 1;
  }
  
  // メンバーレベル評価
  if (horse.member_level === 'A') {
    comments.push('前走はハイレベル戦');
    score += 1;
  } else if (horse.member_level === 'B') {
    comments.push('前走は中〜高レベル戦');
  }
  
  // ===== 新規: ラップパターン評価 =====
  if (horse.lap_pattern === '加速' || horse.lap_pattern === '非減速') {
    comments.push(`前走は${horse.lap_pattern}ラップで価値あり`);
    score += 1;
  }
  if (horse.is_reverse) {
    comments.push('前走は逆行（ハイペース＋非減速/加速）の価値高いレース');
    score += 2;
  }
  
  // ===== 新規: 時計評価 =====
  if (horse.is_top_time) {
    comments.push('前走は同条件トップクラスの時計');
    score += 2;
  } else if (horse.is_high_level_time) {
    comments.push('前走は同条件で上位の時計');
    score += 1;
  }
  
  // ===== 新規: 不利馬評価 =====
  if (horse.is_disadvantaged) {
    if (horse.disadvantage_type === '差し損ね') {
      comments.push(`前走は差し損ね（${horse.disadvantage_reason}）→巻き返し期待`);
      score += 2;
    } else if (horse.disadvantage_type === '前潰れ') {
      comments.push(`前走はハイペースで前潰れ（${horse.disadvantage_reason}）→展開変われば`);
      score += 1;
    } else if (horse.disadvantage_type === 'スロー不利') {
      comments.push(`前走はスローで脚を使えず（${horse.disadvantage_reason}）→流れれば`);
      score += 1;
    } else if (horse.disadvantage_type === '人気裏切り') {
      comments.push(`前走は人気裏切り（${horse.disadvantage_reason}）→見直し`);
      score += 1;
    }
  }
  
  // ===== 新規: 位置取り改善 =====
  if (horse.position_improved) {
    comments.push('位置取り改善（前走後方→今走前方）');
    score += 1;
  }
  
  // 総合判定
  let recommendation = '';
  if (score >= 6) {
    recommendation = '◎本命候補';
  } else if (score >= 4) {
    recommendation = '○有力候補';
  } else if (score >= 2) {
    recommendation = '▲押さえ';
  } else if (warnings.length > 0) {
    recommendation = '△軽視';
  } else {
    recommendation = '無印';
  }
  
  return {
    comments,
    warnings,
    score,
    recommendation
  };
}

// 馬データをテキスト化
function horseToText(horse) {
  const lines = [];
  lines.push(`馬名: ${horse.horse_name || '不明'}`);
  lines.push(`前走: ${horse.place || ''}${horse.distance || ''} ${horse.finish_position || ''}着 (${horse.popularity || ''}人気)`);
  
  if (horse.margin) lines.push(`着差: ${horse.margin}`);
  if (horse.last_3f) lines.push(`上がり3F: ${horse.last_3f}秒`);
  if (horse.jockey) lines.push(`騎手: ${horse.jockey}`);
  
  // 指数
  const indices = [];
  if (horse.potential !== null) indices.push(`ポテンシャル${horse.potential.toFixed(1)}`);
  if (horse.makikaeshi !== null) indices.push(`巻き返し${horse.makikaeshi.toFixed(1)}`);
  if (horse.L4F !== null) indices.push(`L4F${horse.L4F.toFixed(1)}`);
  if (horse.T2F !== null) indices.push(`T2F${horse.T2F.toFixed(1)}`);
  if (indices.length > 0) lines.push(`指数: ${indices.join(', ')}`);
  
  if (horse.member_level) lines.push(`メンバーレベル: ${horse.member_level}`);
  
  return lines.join('\n');
}

// 学習データ変換
async function convertToFineTuning() {
  console.log('=== ファインチューニングデータ変換 ===\n');
  
  // データ読み込み
  if (!fs.existsSync(INPUT_PATH)) {
    console.error('❌ 学習データが見つかりません:', INPUT_PATH);
    console.log('先に node scripts/export-learning-data.js を実行してください');
    process.exit(1);
  }
  
  console.log('1. 学習データを読み込み中...');
  const rawData = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  console.log(`   読み込み件数: ${rawData.length.toLocaleString()}件`);
  
  // 有効なデータのみフィルタ（指数があり、次走結果がある）
  const validData = rawData.filter(d => 
    (d.potential !== null || d.makikaeshi !== null) &&
    d.next_finish !== null &&
    d.next_finish > 0
  );
  console.log(`   有効データ: ${validData.length.toLocaleString()}件`);
  
  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 3種類のファインチューニングデータを生成
  console.log('\n2. ファインチューニングデータを生成中...\n');
  
  // ===== パターン1: 単一馬評価学習 =====
  console.log('   [1] 単一馬評価データ...');
  const singleHorseData = [];
  
  // サンプリング（全データは多すぎるので）
  const sampleSize = Math.min(10000, validData.length);
  const sampled = validData
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize);
  
  for (const horse of sampled) {
    const eval_ = generateEvaluation(horse);
    const actualResult = horse.next_finish <= 3 ? '好走' : '凡走';
    const actualText = `実際の次走: ${horse.next_finish}着`;
    
    const systemPrompt = `あなたは競馬予想AIです。馬のデータを分析し、次走の評価を行ってください。
評価基準:
- ポテンシャル指数: 5以上で期待値プラス、6以上で非常に高い
- 巻き返し指数: 2〜6が最適ゾーン、特に2〜3が最高
- L4F: 45以下で速力あり
- T2F: 22.5以下で先行力あり`;

    const userContent = `以下の馬を評価してください:\n\n${horseToText(horse)}`;
    
    const assistantContent = [
      `【評価】${eval_.recommendation}`,
      '',
      eval_.comments.length > 0 ? `【プラス要素】\n${eval_.comments.map(c => '・' + c).join('\n')}` : '',
      eval_.warnings.length > 0 ? `【注意点】\n${eval_.warnings.map(w => '・' + w).join('\n')}` : '',
      '',
      `（参考: ${actualText}）`
    ].filter(Boolean).join('\n');
    
    singleHorseData.push({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent }
      ]
    });
  }
  
  const singlePath = path.join(OUTPUT_DIR, 'finetune-single-horse.jsonl');
  fs.writeFileSync(singlePath, singleHorseData.map(d => JSON.stringify(d)).join('\n'));
  console.log(`   ✅ ${singlePath} (${singleHorseData.length}件)`);
  
  // ===== パターン2: 期待値判定学習 =====
  console.log('   [2] 期待値判定データ...');
  const valueData = [];
  
  // 期待値プラス条件を満たす馬（正例）
  const positiveExamples = validData.filter(d => 
    (d.potential !== null && d.potential >= 5) ||
    (d.makikaeshi !== null && d.makikaeshi >= 2 && d.makikaeshi <= 6)
  ).slice(0, 3000);
  
  // 期待値マイナス条件の馬（負例）
  const negativeExamples = validData.filter(d =>
    (d.potential !== null && d.potential < 4) &&
    (d.makikaeshi !== null && (d.makikaeshi < 1 || d.makikaeshi > 7))
  ).slice(0, 3000);
  
  for (const horse of [...positiveExamples, ...negativeExamples]) {
    const isPositive = 
      (horse.potential !== null && horse.potential >= 5) ||
      (horse.makikaeshi !== null && horse.makikaeshi >= 2 && horse.makikaeshi <= 6);
    
    const userContent = `この馬は期待値が取れる馬ですか？
ポテンシャル: ${horse.potential !== null ? horse.potential.toFixed(1) : 'なし'}
巻き返し: ${horse.makikaeshi !== null ? horse.makikaeshi.toFixed(1) : 'なし'}
L4F: ${horse.L4F !== null ? horse.L4F.toFixed(1) : 'なし'}
メンバーレベル: ${horse.member_level || 'なし'}`;
    
    const actualHit = horse.next_finish <= 3;
    const assistantContent = isPositive
      ? `期待値あり。${horse.potential >= 5 ? `ポテンシャル${horse.potential.toFixed(1)}は基準(5以上)を満たす。` : ''}${horse.makikaeshi >= 2 && horse.makikaeshi <= 6 ? `巻き返し${horse.makikaeshi.toFixed(1)}は最適ゾーン(2〜6)。` : ''} 次走結果: ${horse.next_finish}着(${actualHit ? '的中' : '外れ'})`
      : `期待値なし。${horse.potential < 4 ? `ポテンシャル${horse.potential?.toFixed(1) || 'なし'}は基準未満。` : ''}${horse.makikaeshi < 1 ? `巻き返し${horse.makikaeshi?.toFixed(1)}は低く、前走恵まれた可能性。` : ''} 次走結果: ${horse.next_finish}着`;
    
    valueData.push({
      messages: [
        { role: 'system', content: '競馬の期待値判定AIです。指数から期待値の有無を判定します。' },
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent }
      ]
    });
  }
  
  const valuePath = path.join(OUTPUT_DIR, 'finetune-value-judgment.jsonl');
  fs.writeFileSync(valuePath, valueData.map(d => JSON.stringify(d)).join('\n'));
  console.log(`   ✅ ${valuePath} (${valueData.length}件)`);
  
  // ===== パターン3: 好走・凡走パターン学習 =====
  console.log('   [3] 好走パターンデータ...');
  const patternData = [];
  
  // 好走した馬
  const goodRuns = validData.filter(d => d.next_finish <= 3).slice(0, 3000);
  // 凡走した馬
  const badRuns = validData.filter(d => d.next_finish > 5).slice(0, 3000);
  
  for (const horse of [...goodRuns, ...badRuns]) {
    const isGood = horse.next_finish <= 3;
    
    const features = [];
    if (horse.potential !== null) features.push(`ポテンシャル${horse.potential.toFixed(1)}`);
    if (horse.makikaeshi !== null) features.push(`巻き返し${horse.makikaeshi.toFixed(1)}`);
    if (horse.L4F !== null) features.push(`L4F${horse.L4F.toFixed(1)}`);
    if (horse.member_level) features.push(`レベル${horse.member_level}`);
    if (horse.position_improved) features.push('位置取り改善');
    if (horse.is_agari_4th) features.push('上がり4位');
    
    const userContent = `次走で好走できる馬ですか？
${features.join(' / ')}
前走: ${horse.finish_position}着 (${horse.popularity}人気)`;
    
    const reasons = [];
    if (isGood) {
      if (horse.potential >= 5) reasons.push('ポテンシャル高');
      if (horse.makikaeshi >= 2 && horse.makikaeshi <= 6) reasons.push('巻き返しゾーン');
      if (horse.position_improved) reasons.push('位置取り改善');
      if (horse.L4F <= 45) reasons.push('速い上がり');
    } else {
      if (horse.potential < 4) reasons.push('ポテンシャル不足');
      if (horse.makikaeshi < 1) reasons.push('前走恵まれ');
      if (horse.makikaeshi > 7) reasons.push('前走不利大きすぎ');
    }
    
    const assistantContent = isGood
      ? `好走期待あり。${reasons.length > 0 ? '理由: ' + reasons.join('、') : ''} → 実際${horse.next_finish}着`
      : `好走は厳しい。${reasons.length > 0 ? '理由: ' + reasons.join('、') : ''} → 実際${horse.next_finish}着`;
    
    patternData.push({
      messages: [
        { role: 'system', content: '競馬の好走予測AIです。データから次走の好走可能性を判定します。' },
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent }
      ]
    });
  }
  
  const patternPath = path.join(OUTPUT_DIR, 'finetune-pattern.jsonl');
  fs.writeFileSync(patternPath, patternData.map(d => JSON.stringify(d)).join('\n'));
  console.log(`   ✅ ${patternPath} (${patternData.length}件)`);
  
  // 統計出力
  console.log('\n=== 生成完了 ===');
  console.log(`出力先: ${OUTPUT_DIR}`);
  console.log(`\n生成ファイル:`);
  console.log(`  1. finetune-single-horse.jsonl - 単一馬評価 (${singleHorseData.length}件)`);
  console.log(`  2. finetune-value-judgment.jsonl - 期待値判定 (${valueData.length}件)`);
  console.log(`  3. finetune-pattern.jsonl - 好走パターン (${patternData.length}件)`);
  
  console.log('\n=== 次のステップ ===');
  console.log('1. 管理画面でファインチューニングを実行');
  console.log('   - /admin ページの「ファインチューニング」セクション');
  console.log('   - 上記JSONLファイルをアップロード');
  console.log('\n2. または手動でOpenAI APIを使用:');
  console.log('   openai api fine_tuning.jobs.create \\');
  console.log('     -t "finetune-pattern.jsonl" \\');
  console.log('     -m "gpt-4o-mini-2024-07-18"');
}

convertToFineTuning().catch(console.error);
