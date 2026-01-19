/**
 * OpenAI APIを使用した「俺AI」コメント生成
 * 
 * 過去の予想パターンを学習し、嵯峨風のコメントを生成
 */

import OpenAI from 'openai';
import { SagaAnalysis, HorseAnalysisInput, SagaBrain } from './saga-brain';
import { getCourseInfo, getDistanceNotes } from './course-master';

// ========================================
// 型定義
// ========================================

export interface OpenAISagaResult {
  horseName: string;
  horseNumber: number;
  // 基本分析（ルールベース）
  ruleBasedAnalysis: SagaAnalysis;
  // AIによる追加コメント
  aiComment: string;
  // 総合評価
  overallRating: 'S' | 'A' | 'B' | 'C' | 'D';
  // 推奨度（100点満点）
  recommendationScore: number;
  // タグ
  tags: string[];
}

// ========================================
// 嵯峨風表現パターン
// ========================================

const SAGA_EXPRESSIONS = {
  // コース評価
  course_positive: [
    'このコースは得意舞台だね',
    'ここでの実績は申し分ない',
    'コース適性は文句なし',
    'このコースなら狙える',
    '舞台設定は◎',
  ],
  course_negative: [
    'このコースでは苦戦傾向',
    'コース適性に疑問符',
    'ここでの実績がイマイチ',
    '舞台設定が合わないか',
  ],
  
  // ローテーション
  rotation_rest_positive: [
    '休み明けでも走るタイプ',
    '鉄砲実績があるから問題ない',
    'フレッシュな状態で勝負',
    '休み明けを活かせるタイプ',
  ],
  rotation_rest_negative: [
    '休み明けは割引',
    '叩いてからが本番か',
    '中間の調整過程が気になる',
    '休養明け初戦は様子見',
  ],
  rotation_tight_positive: [
    '間隔詰めて使われて結果を出すタイプ',
    '連戦で調子を上げてきた',
    '使い込んで良くなるタイプ',
  ],
  rotation_tight_negative: [
    '間隔詰めると成績が落ちる傾向',
    '連戦の疲れが心配',
    '使い詰めはマイナス',
  ],
  
  // 距離
  distance_shorten_positive: [
    '短縮でスピードが生きる',
    '距離短縮は◎',
    '短い距離で本領発揮',
    '短縮で位置取りが楽になる',
  ],
  distance_extend_positive: [
    '距離延長でスタミナを活かせる',
    '延長は歓迎',
    'しまいを生かしやすくなる',
    '長い距離で真価を発揮',
  ],
  
  // 脚質
  style_escape_positive: [
    '逃げられればしぶとい',
    'ハナを切れれば粘り込める',
    '単騎逃げなら期待できる',
  ],
  style_lead_positive: [
    '好位から抜け出す競馬が得意',
    '番手で競馬を進められれば',
    '先行力があるから展開が向く',
  ],
  style_sashi_positive: [
    '直線で脚を使えるタイプ',
    '末脚の切れは侮れない',
    '差し込んでくれば怖い存在',
  ],
  style_oikomi_positive: [
    '展開が向けば一気に差し切る',
    '嵌まれば怖い存在',
    '直線で突っ込んでくるタイプ',
  ],
  
  // 結論
  conclusion_positive: [
    'ここは狙ってみたい',
    '妙味がある一頭',
    '穴で狙うならこの馬',
    '人気でも信頼できる',
    '本命候補の一頭',
  ],
  conclusion_negative: [
    '今回は見送り',
    '人気でも疑ってみたい',
    'ここは静観',
    '妙味が薄い',
  ],
  conclusion_neutral: [
    '押さえ程度',
    '紐候補',
    '3着候補',
    '連下まで',
  ],
};

// ========================================
// プロンプトテンプレート
// ========================================

function buildSystemPrompt(): string {
  return `あなたは競馬予想の専門家「嵯峨」です。以下の特徴を持って予想コメントを生成してください：

【キャラクター特徴】
- 冷静かつ論理的な分析
- データと実績を重視
- 曖昧な表現を避け、根拠を明確に
- 「〜だね」「〜か」「〜だろう」など砕けた口調
- 穴馬を狙うのが得意だが、本命も外さない

【コメント生成ルール】
1. 必ず具体的な数値や実績を引用する
2. 「なんとなく」「たぶん」などの曖昧表現は禁止
3. コースや距離の適性は過去実績ベースで語る
4. ローテーション（間隔）の影響を重視する
5. 指数（T2F, L4F）が高い馬はその点を強調
6. 不利な条件がある馬には警告を出す

【禁止事項】
- 一般的すぎるコメント（例：「頑張ってほしい」）
- 根拠のない期待（例：「雰囲気が良さそう」）
- 矛盾した評価

【出力フォーマット】
- 2〜4文程度のコンパクトなコメント
- 【結論】で始まる最終評価を最後に付ける`;
}

function buildUserPrompt(
  horse: HorseAnalysisInput,
  analysis: SagaAnalysis,
  raceContext: {
    place: string;
    distance: number;
    surface: '芝' | 'ダ';
    raceDate: string;
    totalHorses: number;
  }
): string {
  const courseInfo = getCourseInfo(raceContext.place);
  const distanceNotes = getDistanceNotes(raceContext.place, raceContext.surface, raceContext.distance);
  
  // 過去走サマリー（競走除外等は「除外」と表示）
  const formatFinish = (pos: number) => {
    if (pos <= 0 || pos >= 30) return '除外';
    return `${pos}着`;
  };
  const pastRacesSummary = horse.pastRaces.slice(0, 5).map((r, i) => {
    return `${i + 1}走前: ${r.place}${r.surface}${r.distance}m ${formatFinish(r.finishPosition)}(${r.popularity}番人気)`;
  }).join('\n');
  
  // 指数情報
  const indicesInfo = horse.indices ? `
T2F指数: ${horse.indices.T2F?.toFixed(1) || '不明'}${horse.memberRanks?.T2F ? ` (メンバー${horse.memberRanks.T2F}位)` : ''}
L4F指数: ${horse.indices.L4F?.toFixed(1) || '不明'}${horse.memberRanks?.L4F ? ` (メンバー${horse.memberRanks.L4F}位)` : ''}
ポテンシャル: ${horse.indices.potential?.toFixed(1) || '不明'}
巻き返し指数: ${horse.indices.makikaeshi?.toFixed(1) || '不明'}` : '';
  
  // ルールベース分析のサマリー
  const ruleAnalysisSummary = `
コース適性: ${analysis.courseMatch.rating}評価 - ${analysis.courseMatch.reason}
タグ: ${analysis.tags.join(', ') || 'なし'}
警告: ${analysis.warnings.join(', ') || 'なし'}
ローテーション: ${analysis.rotationNote || '情報なし'}`;

  return `【レース情報】
${raceContext.place} ${raceContext.surface}${raceContext.distance}m
コース特徴: ${courseInfo?.notes.join('、') || '不明'}
距離特徴: ${distanceNotes.join('、') || '不明'}
出走頭数: ${raceContext.totalHorses}頭

【馬情報】
馬名: ${horse.horseName} (${horse.horseNumber}番)
枠: ${horse.waku}枠
競うスコア偏差値: ${horse.scoreDeviation?.toFixed(1) || '不明'}${horse.memberRanks?.kisoScore ? ` (メンバー${horse.memberRanks.kisoScore}位)` : ''}

【指数情報】${indicesInfo || 'なし'}

【過去5走】
${pastRacesSummary || 'データなし'}

【事前分析結果】
${ruleAnalysisSummary}
${analysis.comments.length > 0 ? '\n既存コメント:\n' + analysis.comments.join('\n') : ''}

上記の情報を基に、この馬についての嵯峨風コメントを生成してください。`;
}

// ========================================
// OpenAI クライアント
// ========================================

export class OpenAISaga {
  private client: OpenAI | null = null;
  private sagaBrain: SagaBrain;
  private isEnabled: boolean = false;
  
  constructor() {
    this.sagaBrain = new SagaBrain();
    
    // 環境変数からAPIキーを取得
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('[OpenAISaga] OPENAI_API_KEY exists:', !!apiKey, 'starts with sk-:', apiKey?.startsWith('sk-'));
    
    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 10) {
      this.client = new OpenAI({ apiKey });
      this.isEnabled = true;
      console.log('[OpenAISaga] OpenAI API enabled');
    } else {
      console.log('[OpenAISaga] OpenAI API disabled - invalid or missing API key');
    }
  }
  
  /**
   * OpenAI APIが有効かどうか
   */
  isOpenAIEnabled(): boolean {
    return this.isEnabled;
  }
  
  /**
   * 1頭を分析（ルールベース + AI）
   */
  async analyzeHorse(
    horse: HorseAnalysisInput,
    raceContext: {
      place: string;
      distance: number;
      surface: '芝' | 'ダ';
      raceDate: string;
      totalHorses: number;
    }
  ): Promise<OpenAISagaResult> {
    // まずルールベース分析
    const ruleAnalysis = this.sagaBrain.analyzeHorse(horse);
    
    let aiComment = '';
    
    // OpenAI APIが有効なら追加コメント生成
    if (this.isEnabled && this.client) {
      try {
        const response = await this.client.chat.completions.create({
          model: 'gpt-4o-mini', // コスト効率の良いモデル
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(horse, ruleAnalysis, raceContext) },
          ],
          max_tokens: 300,
          temperature: 0.7,
        });
        
        aiComment = response.choices[0]?.message?.content || '';
      } catch (error) {
        console.error('OpenAI API Error:', error);
        aiComment = '※AI分析は一時的に利用できません';
      }
    }
    
    // 総合評価を決定
    const overallRating = this.determineOverallRating(ruleAnalysis, horse);
    const recommendationScore = this.calculateRecommendationScore(ruleAnalysis, horse);
    
    return {
      horseName: horse.horseName,
      horseNumber: horse.horseNumber,
      ruleBasedAnalysis: ruleAnalysis,
      aiComment,
      overallRating,
      recommendationScore,
      tags: ruleAnalysis.tags,
    };
  }
  
  /**
   * 全馬を分析
   */
  async analyzeRace(
    horses: HorseAnalysisInput[],
    raceContext: {
      place: string;
      distance: number;
      surface: '芝' | 'ダ';
      raceDate: string;
    }
  ): Promise<OpenAISagaResult[]> {
    const context = {
      ...raceContext,
      totalHorses: horses.length,
    };
    
    // 並列処理（ただしレートリミット対策で少し間隔を空ける）
    const results: OpenAISagaResult[] = [];
    
    for (const horse of horses) {
      const result = await this.analyzeHorse(horse, context);
      results.push(result);
      
      // OpenAI API使用時はレートリミット対策
      if (this.isEnabled) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // スコア順にソート
    return results.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }
  
  /**
   * 総合評価を決定
   */
  private determineOverallRating(analysis: SagaAnalysis, horse: HorseAnalysisInput): 'S' | 'A' | 'B' | 'C' | 'D' {
    let score = analysis.score;
    
    // 競うスコア偏差値で補正
    if (horse.scoreDeviation) {
      if (horse.scoreDeviation >= 70) score += 15;
      else if (horse.scoreDeviation >= 60) score += 10;
      else if (horse.scoreDeviation >= 55) score += 5;
      else if (horse.scoreDeviation < 40) score -= 10;
    }
    
    // コース適性で補正
    if (analysis.courseMatch.rating === 'S') score += 10;
    else if (analysis.courseMatch.rating === 'A') score += 5;
    else if (analysis.courseMatch.rating === 'D') score -= 10;
    
    // 警告があれば減点
    score -= analysis.warnings.length * 5;
    
    // レーティング決定
    if (score >= 80) return 'S';
    if (score >= 65) return 'A';
    if (score >= 50) return 'B';
    if (score >= 35) return 'C';
    return 'D';
  }
  
  /**
   * 推奨度スコアを計算
   */
  private calculateRecommendationScore(analysis: SagaAnalysis, horse: HorseAnalysisInput): number {
    let score = analysis.score;
    
    // 競うスコア偏差値で大きく補正
    if (horse.scoreDeviation) {
      score += (horse.scoreDeviation - 50) * 0.8;
    }
    
    // 指数による加点
    if (horse.memberRanks) {
      if (horse.memberRanks.T2F && horse.memberRanks.T2F <= 3) score += 8;
      if (horse.memberRanks.L4F && horse.memberRanks.L4F <= 3) score += 8;
      if (horse.memberRanks.kisoScore && horse.memberRanks.kisoScore <= 3) score += 10;
    }
    
    // コース適性
    const courseBonus = { S: 12, A: 8, B: 4, C: 0, D: -8 };
    score += courseBonus[analysis.courseMatch.rating];
    
    // 好材料タグ
    const goodTags = ['休み明け◎', '間隔詰め◎', '短縮◎', '延長◎', '距離実績◎', '好枠'];
    for (const tag of analysis.tags) {
      if (goodTags.includes(tag)) score += 5;
    }
    
    // 警告で減点
    score -= analysis.warnings.length * 8;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

/**
 * シングルトンインスタンス
 */
let openAISagaInstance: OpenAISaga | null = null;

export function getOpenAISaga(): OpenAISaga {
  if (!openAISagaInstance) {
    openAISagaInstance = new OpenAISaga();
  }
  return openAISagaInstance;
}

