/**
 * 自動生成されたルール
 * 
 * 生成日時: 2026-01-23T12:56:44.210Z
 * 学習データから発見されたパターンに基づく
 * 
 * 使用方法:
 * 1. このファイルの内容を lib/ai-chat/prediction-rules.ts にコピー
 * 2. PREDICTION_RULES オブジェクトに追加
 */

// ===== 自動発見されたルール =====


  // 高ポテンシャル + 巻き返しゾーン
  // 回収率: 139.6%, 3着内率: 44.3%, データ数: 5032
  AUTO_COMBO_高ポテンシャル_+_巻き返しゾーン: {
    id: 'auto_combo_高ポテンシャル_+_巻き返しゾーン',
    name: '高ポテンシャル + 巻き返しゾーン',
    type: 'POSITIVE',
    category: 'combo',
    priority: 100,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      // 条件: potential >= 5 && makikaeshi >= 2 && makikaeshi <= 4
      
      // 複合条件: 高ポテンシャル + 巻き返しゾーン
      // potential >= 5 && makikaeshi >= 2 && makikaeshi <= 4
      const matchesCondition = true; // TODO: 実際の条件に置き換え
      if (matchesCondition) {
        
      return {
        reason: `高ポテンシャル + 巻き返しゾーン（回収率140%）`,
        confidence: 'high' as const,
        scoreAdjust: 7,
      };
      }
      return null;
    },
  },


// ===== システムプロンプト用説明 =====
export const DISCOVERED_PATTERN_DESCRIPTIONS = `
【データ分析から発見されたパターン】
- 高ポテンシャル + 巻き返しゾーン: 回収率140%、3着内率44%
`;
