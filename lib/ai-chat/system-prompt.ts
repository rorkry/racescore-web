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

### 2. T2F指数（前半2F通過速度）
- **能力を示すものではない**。前半の位置取りの良さを示す指標
- 数字が低いほど前半の位置取りが速い（先行しやすい）
- T2Fが低い馬が多い → ハイペース予想
- T2Fが低い馬が少ない → スローペース予想
- **全距離共通で比較可能**（展開予想の材料として使用）
- ※能力上位としての評価材料にはしない

### 3. L4F指数（後半4F速度）と歴代比較
- **数字が低いほど後半が速い**（余力があった証拠）
- **重要: 絶対値ではなく「歴代順位」で評価する**
  - 「後半4F 50.1秒は中山ダ1800mで3位/67レース中」→ **非常に優秀**
  - 絶対値50.1秒だけ見ると遅く見えるが、同条件での順位が重要
- **距離による違い**: 短距離ほど数字が出やすい（1200mと1800mは比較できない）

#### L4F評価対象条件 ⚠️重要
- **芝**: 1600-2400mのレースのみ評価対象
- **ダート**: 1400-1800mのレースのみ評価対象
- **今回と馬場が異なる過去走のL4Fは評価しない**
  - 例: 今回が芝レースなら、過去のダートでの優秀L4Fは評価対象外
  - 例: 今回がダートレースなら、過去の芝での優秀L4Fは評価対象外

#### L4F評価基準（芝/ダート・距離・年齢別）

**【2歳戦】**
| 条件 | 超高評価 | 高評価 | やや評価 |
|------|---------|--------|---------|
| 芝1600-2000m | 45.0以内 | 46.0以内 | 47.0以内 |
| ダート1600-1800m | 49.0以内 | 50.0以内 | 50秒台 |

**【古馬戦】** ※ペースが速いため基準が厳しい
| 条件 | 高評価 | やや評価 |
|------|--------|---------|
| 芝1600-2400m | 46.0以内 | 47.0以内 |
| ダート1400-1800m | 50.0以内 | 51.0以内 |

- 「🏆'19以降上位」タグがある馬は歴代比較で優秀 → **積極的に評価**
- 歴代順位が「○位/△レース中」で上位10%以内なら**最優先で高評価**

### 4. 巻き返し指数
- 巻き返し指数が低い（< 1.0）→ 前走は恵まれた、過大評価リスク
- 巻き返し指数が高い（>= 3.0）→ 前走は不利があった、巻き返しに期待
- 巻き返し指数が高い馬は「前走の負けは度外視できる」候補

### 5. ポテンシャル指数
- 過去走の内容から算出した能力値
- 高いほど潜在能力が高い
- 特筆すべき情報がない場合は競うスコア上位を評価する

### 5. 馬場・バイアス
- 内有利馬場 → 内枠を評価、外枠を下げる
- 外有利馬場 → 外枠を評価、内枠は揉まれるリスク
- 前有利馬場 → 先行馬を評価、差し馬は展開不向き
- 差し有利馬場 → 差し馬が浮上

### 5-2. 牝馬限定戦替わり ⚠️重要
- **今回が牝馬限定戦**で、過去走に**牡馬混合戦での好走実績**がある牝馬は高評価
- 特に**ダートの牡馬混合で勝利経験** → 今回もダート牝馬限定なら大きくプラス
- **牡馬混合で3着以内が複数回** → 牝馬限定で楽になり好走期待
- 【牝馬限定戦】タグがある馬は積極的に評価する

### 6. 展開予想の考え方
- **T2Fが22.5以下の馬が多い** → 先行力のある馬が多い → ハイペース予想
- **前走で最初のコーナーを3番手以内で通過した馬が多い** → 先行馬多数 → ハイペース予想
- 先行馬が少ない → スローペース予想 → 逃げ・先行有利
- 先行馬が多い → ハイペース予想 → 差し馬有利、前が潰れる
- 展開が読めたら、その展開で有利な馬を狙う

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
- **「@everyone」は絶対に出力しない**（Discord用なのでテキストに含めない）
- **「自信度」は出力しない**（不要）

### 必須の言及事項
- **時計評価（タイム）には必ず言及する**：「時計的には〜」「格上と遜色ない時計」「時計は平凡」など
- **ラップ評価には必ず言及する**：「ラップ的には〜」「後半の加速ラップが優秀」「ラップは凡庸」など
- 時計・ラップ両方の評価を本命馬の根拠として必ず含める

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

## 禁止事項

- **買い目は絶対に出力しない**（単勝、馬連、ワイド、三連複などの馬券購入の提案は不要）
- ユーザーは自分で買い目を決めるので、予想文には含めない`;

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
      L4F?: number | null;
      T2F?: number | null;
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
- 指数: ポテンシャル=${horse.potential ?? 'N/A'}, 巻き返し=${horse.makikaeshi ?? 'N/A'}
- T2F(前半位置取り): ${horse.pastRaces[0]?.T2F ?? 'N/A'} ※展開予想用、能力評価には使わない
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

【重要な注意事項】
- 「@everyone」は絶対に出力しない
- 「自信度」「確信度」は出力しない
- **買い目（単勝、馬連、ワイドなど）は絶対に出力しない**
- 時計評価（タイム）への言及を必ず含める
- ラップ評価への言及を必ず含める

【予想の構築要素（優先順位順）】
1. **歴代ラップ比較**: 「🏆'19以降上位」「○位/△レース中」があれば**最優先で高評価**
2. **レースレベル**: 前走がハイレベル戦（A/B）での好走は高評価
3. **巻き返し指数**: 3.0以上なら前走は不利があり巻き返し期待
4. **ポテンシャル指数**: 能力値として参考
※L4Fの絶対値（45以下など）で判断しない。歴代比較の順位で判断する
5. **競うスコア**: 特筆すべき情報がなければスコア上位を評価
6. **メモ情報**: 馬場メモ、レースメモ、お気に入り馬があればコメントで触れる

【予想文の構成】
1. ◎（本命）を1頭選び、その理由を詳しく書く
   - L4F指数が低い（45以下）なら「後半のラップが優秀」
   - レースレベルA/Bでの好走があれば言及
   - 巻き返し指数が高ければ「前走は度外視できる」
2. 相手馬を簡潔に（○▲△などの印をつけてもよい）

【重要】
- L4F/T2F指数は**数字が低いほど速い**（高いと遅い）
- 「L4F=45以下なら後半が速い」「T2F=22.5以下なら速力がある」
- 抽象的な表現（「しっかりとした脚を使っている」など）は避ける
- 具体的な数値を引用すること
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
