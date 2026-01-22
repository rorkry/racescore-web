/**
 * AI予想のシステムプロンプト
 * 
 * ユーザーの予想スタイル・考え方を詳細に記述
 * AIはこれを「思考の枠組み」として使用
 */

export const PREDICTION_SYSTEM_PROMPT = `あなたは競馬予想を書くAIです。
以下の「考え方」と「データ」を基に、自分で思考して予想を組み立ててください。

## 予想の考え方（思考フレームワーク）

### 1. レースレベル評価
- レースレベルA/B（ハイレベル）での好走は高評価
- レースレベルC/D（低レベル）での好走は過信禁物
- 今回のレースがメンバー手薄なら、過去ハイレベル戦で好走した馬を狙う

### 2. 時計評価
- 同日の格上クラス（例：2勝クラス）と時計を比較
- 0.5〜1.0秒差以内なら「格上と遜色ない」として高評価
- 時計評価S/Aは優秀、C/D/LOWは平凡

### 3. ラップ評価
- 競走馬は全力で走れるのは約3F（600m）程度
- 残り5Fからペースアップして、ラストもラップが落ち込まずまとめていたらハイレベル
- 逃げ馬以外がハイレベルラップで好走していたら、後ろから追いかけていた分さらに優秀
- ラップ評価S/Aは優秀、C/D/LOWは平凡

### 4. 恵まれ判定（巻き返し指数ベース）
- 巻き返し指数が低い（< 1.0）→ 前走は恵まれた、過大評価リスク
- 巻き返し指数が高い（>= 3.0）→ 前走は不利があった、巻き返しに期待
- スロー、内有利、展開などの恵まれは巻き返し指数に反映される

### 5. 馬場・バイアス
- 内有利馬場 → 内枠を評価、外枠を下げる
- 外有利馬場 → 外枠を評価、内枠は揉まれるリスク
- 前有利馬場 → 先行馬を評価、差し馬は展開不向き
- 差し有利馬場 → 差し馬が浮上

### 6. 展開予想
- 先行馬が少ない → スローペース予想 → 逃げ・先行有利
- 先行馬が多い → ハイペース予想 → 差し馬有利、前が潰れる

### 7. 成長・上積み
- 馬体を増やしながら着順も良化 → 成長の兆候
- 追切りで自己ベスト更新 → デキに上積み
- 休み明けから使いつつ良化 → 立て直し

### 8. 度外視できるケース
- ワンターン戦 → 1周競馬の馬が履歴にないレースは度外視
- 大幅な距離変更 → 合わない条件は参考外
- スローで後手を踏んだ → かみ合わなかっただけ
- 乗り替わりで折り合い欠いた → 鞍上変更で変わる可能性

### 9. 嫌う条件（過大評価を疑う）
- 着順は良いがレースレベルが低い
- 着順は良いがラップ・時計が平凡
- 巻き返し指数が低い（恵まれた）のに人気
- 前有利馬場で前残りしただけ

### 10. 狙う条件（過小評価を疑う）
- 着順は悪いがレースレベルが高く着差僅差（1秒以内）
- 着順は悪いがラップ・時計は優秀
- 巻き返し指数が高い（不利があった）
- 履歴にない条件で凡走しただけ

## 文章の書き方

### 文体ルール
- 「です・ます」調は使わない
- 「〜と思われる」は使わない
- 過度な断定（「絶対」「間違いなく」）は使わない

### 表現パターン
- 「通用していい」「通用する証明」で実力を表現
- 「かみ合う/かみ合っていない」で条件適性を表現
- 「度外視」「参考外」で前走を切る
- 「上積み」「変わり身」で好転を表現
- 「嫌う」「紐にとどめる」で消極評価
- 「〜はず」「〜そう」「〜していい」で断定を避ける

### 判定別の表現例

【過大評価を嫌う場合】
- 「〜が売れているけど前走は恵まれた印象」
- 「中身が伴っていない」
- 「再現性には疑問」
- 「嫌ってみたい」
- 「メンバーレベル高くないところでの好走」

【過小評価を狙う場合】
- 「着順は悪いが着差〜秒で中身は評価できる」
- 「前走は不利があった」
- 「立て直した今回は巻き返しに期待」
- 「一発あっていい」
- 「レースレベルの高いところで僅差」

### 文章構造
1. 人気馬への疑問、または本命馬の実績から入る
2. 前走の敗因分析（度外視できる理由）
3. 今回の好転要素（枠、鞍上、距離、馬場など）
4. 結論（確信度に応じた表現）
5. 相手馬（簡潔に）
6. 買い目

## 買い目の書き方

単勝 [馬番]
馬連、ワイド [本命]-[相手1].[相手2]

※相手が多い場合は3頭まで
※ワイドはオッズ次第で調整コメントを入れる`;

/**
 * レースデータをプロンプト用にフォーマット
 */
export function formatRaceDataForPrompt(
  raceInfo: {
    place: string;
    raceNumber: number;
    distance: number;
    surface: '芝' | 'ダ';
    trackCondition: string;
    className?: string;
  },
  horses: Array<{
    number: number;
    name: string;
    jockey: string;
    waku: number;
    estimatedPopularity: number;
    lapRating: string;
    timeRating: string;
    potential: number | null;
    makikaeshi: number | null;
    pastRaces: Array<{
      place: string;
      distance: number;
      surface: string;
      finishPosition: number;
      margin: string;
      raceLevel: string | null;
      trackCondition: string;
    }>;
    matchedRules: Array<{
      type: string;
      reason: string;
    }>;
    totalScore: number;
    recommendation: string;
    // SagaBrain分析結果
    sagaAnalysis?: {
      score: number;
      timeEvaluation?: string;
      lapEvaluation?: string;
      raceLevelNote?: string;
      courseMatch: { rating: string; reason: string };
      comments: string[];
      warnings: string[];
    };
  }>,
  settings: {
    trackBias?: string;
    paceExpectation?: string;
  }
): string {
  let text = `
## 今回のレース

**${raceInfo.place} ${raceInfo.raceNumber}R ${raceInfo.surface}${raceInfo.distance}m ${raceInfo.trackCondition}**
${raceInfo.className ? `クラス: ${raceInfo.className}` : ''}

### ユーザー設定
- 馬場傾向: ${settings.trackBias || '未設定'}
- 展開予想: ${settings.paceExpectation || '未設定'}

### 出走馬分析

`;

  // スコア順にソート
  const sortedHorses = [...horses].sort((a, b) => b.totalScore - a.totalScore);

  for (const horse of sortedHorses) {
    const last = horse.pastRaces[0];
    const last2 = horse.pastRaces[1];
    const saga = horse.sagaAnalysis;
    
    text += `
**${horse.number}番 ${horse.name}** [${horse.recommendation}] (想定${horse.estimatedPopularity}人気)
- 騎手: ${horse.jockey} / 枠: ${horse.waku}枠
- Stride評価: ラップ=${horse.lapRating}, 時計=${horse.timeRating}
- 指数: ポテンシャル=${horse.potential ?? 'N/A'}, 巻き返し=${horse.makikaeshi ?? 'N/A'}
`;

    if (last) {
      text += `- 前走: ${last.place}${last.surface}${last.distance}m ${last.finishPosition}着 ${last.margin} (${last.trackCondition}, レベル${last.raceLevel || '?'})\n`;
    }
    if (last2) {
      text += `- 2走前: ${last2.place}${last2.surface}${last2.distance}m ${last2.finishPosition}着\n`;
    }

    // SagaBrain分析結果
    if (saga) {
      text += `- 【Stride AI分析】スコア: ${saga.score}点\n`;
      if (saga.timeEvaluation) {
        text += `  📊 ${saga.timeEvaluation}\n`;
      }
      if (saga.lapEvaluation) {
        text += `  🏃 ${saga.lapEvaluation}\n`;
      }
      if (saga.raceLevelNote) {
        text += `  📈 ${saga.raceLevelNote}\n`;
      }
      if (saga.courseMatch && saga.courseMatch.rating !== 'C') {
        text += `  🎯 コース適性: ${saga.courseMatch.rating} - ${saga.courseMatch.reason}\n`;
      }
      if (saga.comments.length > 0) {
        text += `  💡 ${saga.comments.slice(0, 3).join(' / ')}\n`;
      }
      if (saga.warnings.length > 0) {
        text += `  ⚠️ ${saga.warnings.join(' / ')}\n`;
      }
    }

    // ルール判定結果
    if (horse.matchedRules.length > 0) {
      text += `- 【ルール判定】\n`;
      for (const rule of horse.matchedRules) {
        const icon = rule.type === 'POSITIVE' ? '✅' : 
                     rule.type === 'NEGATIVE' ? '⚠️' : 
                     rule.type === 'DISMISS' ? '🔄' : '📝';
        text += `  ${icon} ${rule.reason}\n`;
      }
    }
    
    text += `- 総合スコア: ${horse.totalScore}点\n`;
  }

  text += `
---

上記のデータとルール判定結果を踏まえて、予想文を生成してください。
◎（本命）を1頭選び、その理由を詳しく書いてください。
相手馬と買い目も含めてください。
`;

  return text;
}

/**
 * 参考予想を追加
 */
export function addSamplePredictions(samples: string[]): string {
  if (samples.length === 0) return '';
  
  return `
## 参考予想（過去の予想文の例）

以下は過去の予想文です。この文体・ニュアンス・考え方を参考にしてください。

${samples.map((s, i) => `### 例${i + 1}
${s}`).join('\n\n')}
`;
}
