/**
 * 研究AI ツールレジストリ
 * OpenAI Function Calling 用のツール定義
 */

import { ChatCompletionTool } from 'openai/resources/chat/completions';

export const RESEARCH_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'sire_analysis',
      description: '種牡馬（父馬）の成績・適性を分析する。産駒の得意距離・馬場、血統タイプを判定',
      parameters: {
        type: 'object',
        properties: {
          horse_name: { type: 'string', description: '馬名' },
          race_surface: { type: 'string', enum: ['芝', 'ダート'] },
          race_distance: { type: 'number', description: '距離（メートル）' }
        },
        required: ['horse_name', 'race_surface', 'race_distance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'broodmare_sire_analysis',
      description: '母父（Broodmare Sire）の影響を分析。母系の特徴、父×母父の相性（ニックス）を判定',
      parameters: {
        type: 'object',
        properties: {
          horse_name: { type: 'string', description: '馬名' },
          race_surface: { type: 'string', enum: ['芝', 'ダート'], description: '芝/ダート（省略可）' },
          race_distance: { type: 'number', description: '距離（メートル・省略可）' }
        },
        required: ['horse_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'time_correction',
      description: 'レースの走破タイムを馬場状態・斤量・ペースで補正し、真の実力を推定',
      parameters: {
        type: 'object',
        properties: {
          horse_name: { type: 'string' },
          past_race_date: { type: 'string', description: 'YYYY.MM.DD' },
          past_race_place: { type: 'string' },
          past_race_distance: { type: 'string', description: '芝2000 等' }
        },
        required: ['horse_name', 'past_race_date', 'past_race_place', 'past_race_distance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'waku_analysis',
      description: '枠順の有利不利を分析。競馬場・距離別の枠別成績を取得',
      parameters: {
        type: 'object',
        properties: {
          race_place: { type: 'string', description: '競馬場名' },
          race_distance: { type: 'number' },
          track_type: { type: 'string', enum: ['芝', 'ダート'] },
          waku_number: { type: 'number', description: '1-8' }
        },
        required: ['race_place', 'race_distance', 'track_type', 'waku_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'style_analysis',
      description: 'レース展開を予測。先行馬の数からペース（ハイ/スロー）を判定',
      parameters: {
        type: 'object',
        properties: {
          race_key: { type: 'string', description: 'YYYY/MMDD/場所/R' }
        },
        required: ['race_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'course_analysis',
      description: 'コース特性を分析。高低差・直線長・馬の過去このコースでの成績',
      parameters: {
        type: 'object',
        properties: {
          place: { type: 'string' },
          distance: { type: 'number' },
          surface: { type: 'string', enum: ['芝', 'ダート'] },
          horse_name: { type: 'string', description: '馬名（省略可）' }
        },
        required: ['place', 'distance', 'surface']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'level_analysis',
      description: 'レースのレベル（S/A/B/C/D）を判定。過去走の質を評価',
      parameters: {
        type: 'object',
        properties: {
          race_id: { type: 'string', description: '16桁のレースID' }
        },
        required: ['race_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'odds_analysis',
      description: 'オッズから人気・期待値を分析。過大評価/過小評価を判定',
      parameters: {
        type: 'object',
        properties: {
          race_key: { type: 'string' },
          horse_number: { type: 'number' }
        },
        required: ['race_key', 'horse_number']
      }
    }
  }
];

// 将来の拡張用
// export function registerTool(tool: ChatCompletionTool) {
//   RESEARCH_TOOLS.push(tool);
// }
