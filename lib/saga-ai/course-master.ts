/**
 * コース属性定義マスタ
 * 
 * straight_type: 'flat' (平坦), 'slope' (坂あり/急坂)
 * straight_len: 'long' (長い), 'short' (短い), 'standard' (標準)
 * turn: 'right' (右回り), 'left' (左回り)
 * 
 * ※ lib/course-database.ts と連携して詳細なコース情報を提供
 */

import { COURSE_DATABASE, getCourseData as getDetailedCourseInfo } from '../course-data';
import type { CourseCharacteristics as DetailedCourseInfo } from '@/types/course-characteristics';

export interface CourseInfo {
  straight_type: 'flat' | 'slope';
  straight_len: 'long' | 'short' | 'standard';
  turn: 'right' | 'left';
  notes: string[];
  // 距離別の特徴
  distanceNotes?: Record<string, string[]>;
}

// 詳細コース情報をエクスポート
export { getDetailedCourseInfo, COURSE_DATABASE };
export type { DetailedCourseInfo };

export const COURSE_MASTER: Record<string, CourseInfo> = {
  // --- 中央競馬 ---
  '京都': {
    straight_type: 'flat',
    straight_len: 'standard',
    turn: 'right',
    notes: ['下り坂', '平坦', 'イン突き', '内回り/外回り'],
    distanceNotes: {
      '芝1200': ['内回り', '下り坂スタート', '先行有利'],
      '芝1400': ['外回り', '下り坂スタート'],
      '芝1600': ['外回り', '瞬発力勝負になりやすい'],
      '芝1800': ['外回り', '上がり勝負'],
      '芝2000': ['内回り', 'コーナー4つ', '器用さ必要'],
      '芝2200': ['外回り', 'スタミナ必要'],
      '芝2400': ['外回り', 'スタミナ勝負'],
      '芝3000': ['外回り', '超長距離', 'スタミナ最重要'],
      'ダ1200': ['直線平坦', '先行有利'],
      'ダ1400': ['直線平坦', '差しも届く'],
      'ダ1800': ['直線平坦', '差し有利'],
      'ダ1900': ['直線平坦', '差し有利'],
    }
  },
  '阪神': {
    straight_type: 'slope',
    straight_len: 'standard',
    turn: 'right',
    notes: ['急坂', 'タフ', 'パワー必要', '内回り/外回り'],
    distanceNotes: {
      '芝1200': ['内回り', '急坂', '先行有利'],
      '芝1400': ['内回り', '急坂', 'パワー必要'],
      '芝1600': ['外回り', '急坂', 'マイルCS舞台'],
      '芝1800': ['外回り', '急坂', 'パワー必要'],
      '芝2000': ['内回り', 'コーナー4つ', '器用さ必要'],
      '芝2200': ['内回り', 'コーナー4つ', '宝塚記念舞台'],
      '芝2400': ['外回り', '急坂', 'スタミナ必要'],
      '芝3000': ['内回り', '長距離', '消耗戦'],
      'ダ1200': ['急坂', '先行有利'],
      'ダ1400': ['急坂', 'パワー必要'],
      'ダ1800': ['急坂', 'パワー必要'],
      'ダ2000': ['急坂', 'タフ'],
    }
  },
  '東京': {
    straight_type: 'slope',
    straight_len: 'long',
    turn: 'left',
    notes: ['だらだら坂', '瞬発力', '長い直線', '左回り', '大箱'],
    distanceNotes: {
      '芝1400': ['直線長い', '差し有利'],
      '芝1600': ['直線長い', '瞬発力勝負', '安田記念舞台'],
      '芝1800': ['直線長い', '上がり勝負'],
      '芝2000': ['直線長い', '上がり勝負', '府中牝馬S舞台'],
      '芝2400': ['直線長い', '日本ダービー舞台', 'スタミナも必要'],
      '芝2500': ['直線長い', '有馬記念舞台'],
      'ダ1300': ['左回り', '先行有利'],
      'ダ1400': ['左回り', '差しも届く'],
      'ダ1600': ['左回り', 'フェブラリーS舞台'],
      'ダ2100': ['左回り', 'タフ'],
    }
  },
  '中山': {
    straight_type: 'slope',
    straight_len: 'short',
    turn: 'right',
    notes: ['急坂', '小回り', 'トリッキー', '器用さ必要'],
    distanceNotes: {
      '芝1200': ['内回り', '先行有利', 'スプリンターズS舞台'],
      '芝1600': ['外回り', '急坂', '器用さ必要'],
      '芝1800': ['内回り', 'コーナー4つ', '器用さ重要'],
      '芝2000': ['内回り', 'コーナー4つ', '皐月賞舞台', '先行有利'],
      '芝2200': ['外回り', '急坂'],
      '芝2500': ['内回り', '有馬記念舞台', '急坂', 'スタミナ必要'],
      'ダ1200': ['急坂', '先行有利'],
      'ダ1800': ['急坂', 'パワー必要'],
    }
  },
  '新潟': {
    straight_type: 'flat',
    straight_len: 'long',
    turn: 'left',
    notes: ['平坦', '左回り', '超直線', '外回り直線659m'],
    distanceNotes: {
      '芝1000': ['直線競馬', '瞬発力のみ'],
      '芝1200': ['直線長い', '差し有利'],
      '芝1400': ['直線長い', '差し有利'],
      '芝1600': ['外回り', '直線超長い', '差し馬天国'],
      '芝1800': ['外回り', '直線超長い', '上がり勝負'],
      '芝2000': ['内回り', 'コーナー4つ'],
      '芝2200': ['外回り', '直線長い'],
      'ダ1200': ['平坦', '先行有利'],
      'ダ1800': ['平坦', '差しも届く'],
    }
  },
  '小倉': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['平坦', '小回り', '滞在', '先行有利'],
    distanceNotes: {
      '芝1200': ['小回り', '先行有利'],
      '芝1700': ['小回り', '先行有利'],
      '芝1800': ['小回り', '器用さ必要'],
      '芝2000': ['小回り', 'コーナー4つ'],
      '芝2600': ['小回り', 'スタミナ必要'],
      'ダ1000': ['短距離', '先行有利'],
      'ダ1700': ['小回り', '先行有利'],
    }
  },
  '中京': {
    straight_type: 'slope',
    straight_len: 'long',
    turn: 'left',
    notes: ['左回り', 'タフ', '急坂', '直線長い'],
    distanceNotes: {
      '芝1200': ['急坂', '先行有利'],
      '芝1400': ['急坂', 'パワー必要'],
      '芝1600': ['急坂', '直線長い'],
      '芝2000': ['急坂', '直線長い', 'コーナー4つ'],
      '芝2200': ['急坂', '直線長い'],
      'ダ1200': ['急坂', '先行有利'],
      'ダ1400': ['急坂', 'パワー必要'],
      'ダ1800': ['急坂', 'タフ'],
      'ダ1900': ['急坂', 'タフ'],
    }
  },
  '函館': {
    straight_type: 'slope',
    straight_len: 'short',
    turn: 'right',
    notes: ['洋芝', '小回り', '滞在', '時計かかる'],
    distanceNotes: {
      '芝1200': ['洋芝', '小回り', '先行有利'],
      '芝1800': ['洋芝', '小回り', '器用さ必要'],
      '芝2000': ['洋芝', '小回り', 'スタミナ必要'],
      '芝2600': ['洋芝', '長距離', 'スタミナ勝負'],
      'ダ1000': ['短距離', '先行有利'],
      'ダ1700': ['小回り', '先行有利'],
    }
  },
  '札幌': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['洋芝', '大回り', '平坦', '時計かかる'],
    distanceNotes: {
      '芝1200': ['洋芝', '平坦', '先行有利'],
      '芝1500': ['洋芝', '平坦'],
      '芝1800': ['洋芝', '平坦'],
      '芝2000': ['洋芝', '平坦', '札幌記念舞台'],
      '芝2600': ['洋芝', '長距離'],
      'ダ1000': ['短距離', '先行有利'],
      'ダ1700': ['平坦', '先行有利'],
    }
  },
  '福島': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['小回り', '平坦', '荒れやすい'],
    distanceNotes: {
      '芝1200': ['小回り', '先行有利'],
      '芝1800': ['小回り', '器用さ必要'],
      '芝2000': ['小回り', 'コーナー4つ'],
      '芝2600': ['小回り', 'スタミナ必要'],
      'ダ1150': ['短距離', '先行有利'],
      'ダ1700': ['小回り', '先行有利'],
    }
  },

  // --- 地方競馬（主要） ---
  '大井': {
    straight_type: 'flat',
    straight_len: 'long',
    turn: 'right',
    notes: ['右回り', '外回り長い', 'TCK', '直線長い'],
    distanceNotes: {
      'ダ1200': ['内回り', '先行有利'],
      'ダ1400': ['外回り', '差しも届く'],
      'ダ1600': ['外回り', '直線長い'],
      'ダ1800': ['外回り', '直線長い', '差し有利'],
      'ダ2000': ['外回り', '直線長い', '東京大賞典舞台'],
      'ダ2400': ['外回り', 'スタミナ必要'],
    }
  },
  '船橋': {
    straight_type: 'flat',
    straight_len: 'standard',
    turn: 'left',
    notes: ['左回り', 'スパイラルカーブ', '先行有利'],
    distanceNotes: {
      'ダ1000': ['短距離', '先行有利'],
      'ダ1200': ['先行有利'],
      'ダ1400': ['先行有利'],
      'ダ1600': ['かしわ記念舞台'],
      'ダ1800': ['差しも届く'],
      'ダ2400': ['スタミナ必要'],
    }
  },
  '川崎': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'left',
    notes: ['左回り', '小回り', '先行有利'],
    distanceNotes: {
      'ダ900': ['短距離', '先行有利'],
      'ダ1400': ['小回り', '先行有利'],
      'ダ1500': ['小回り', '先行有利'],
      'ダ1600': ['川崎記念舞台'],
      'ダ2100': ['小回り', 'スタミナ必要'],
    }
  },
  '浦和': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['右回り', '小回り', '先行有利'],
    distanceNotes: {
      'ダ800': ['超短距離', '先行有利'],
      'ダ1400': ['小回り', '先行有利'],
      'ダ1500': ['小回り', '先行有利'],
      'ダ1600': ['小回り', '先行有利'],
      'ダ2000': ['小回り', 'スタミナ必要'],
    }
  },
  '盛岡': {
    straight_type: 'slope',
    straight_len: 'long',
    turn: 'left',
    notes: ['左回り', '高低差', '直線長い', '芝あり'],
    distanceNotes: {
      '芝1000': ['直線競馬'],
      '芝1600': ['直線長い'],
      '芝1700': ['直線長い'],
      '芝2400': ['スタミナ必要'],
      'ダ1200': ['先行有利'],
      'ダ1600': ['差しも届く'],
      'ダ1800': ['差し有利'],
      'ダ2000': ['マーキュリーC舞台'],
    }
  },
  '門別': {
    straight_type: 'flat',
    straight_len: 'standard',
    turn: 'right',
    notes: ['右回り', '北海道', 'ナイター', '砂深め'],
    distanceNotes: {
      'ダ1000': ['短距離', '先行有利'],
      'ダ1200': ['先行有利'],
      'ダ1700': ['差しも届く'],
      'ダ1800': ['差しも届く'],
      'ダ2000': ['スタミナ必要'],
    }
  },
  '園田': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['右回り', '小回り', '先行有利'],
    distanceNotes: {
      'ダ820': ['超短距離', '先行有利'],
      'ダ1230': ['先行有利'],
      'ダ1400': ['先行有利'],
      'ダ1700': ['小回り', '先行有利'],
      'ダ1870': ['小回り', '先行有利'],
    }
  },
  '高知': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['右回り', '小回り', '砂深め'],
    distanceNotes: {
      'ダ800': ['超短距離'],
      'ダ1300': [],
      'ダ1400': [],
      'ダ1600': [],
      'ダ1900': ['スタミナ必要'],
    }
  },
  '佐賀': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'right',
    notes: ['右回り', '小回り', '先行有利', '逃げ有利'],
    distanceNotes: {
      'ダ900': ['短距離', '逃げ有利'],
      'ダ1300': ['先行有利'],
      'ダ1400': ['先行有利'],
      'ダ1750': ['先行有利'],
      'ダ1860': ['先行有利'],
      'ダ2000': ['スタミナ必要'],
    }
  },
  '名古屋': {
    straight_type: 'flat',
    straight_len: 'short',
    turn: 'left',
    notes: ['左回り', '小回り', '先行有利', '前残り'],
    distanceNotes: {
      'ダ920': ['短距離', '先行有利'],
      'ダ1400': ['先行有利'],
      'ダ1500': ['先行有利'],
      'ダ1700': ['先行有利'],
      'ダ1900': ['先行有利'],
      'ダ2100': ['スタミナ必要'],
    }
  },
};

/**
 * コース情報を取得
 */
export function getCourseInfo(place: string): CourseInfo | null {
  return COURSE_MASTER[place] || null;
}

/**
 * 距離別のコース特徴を取得
 */
export function getDistanceNotes(place: string, surface: '芝' | 'ダ', distance: number): string[] {
  const course = COURSE_MASTER[place];
  if (!course || !course.distanceNotes) return [];
  
  const key = `${surface}${distance}`;
  return course.distanceNotes[key] || [];
}

/**
 * 類似コースを検索（平坦/坂、直線長短で判定）
 */
export function findSimilarCourses(place: string): string[] {
  const target = COURSE_MASTER[place];
  if (!target) return [];
  
  const similar: string[] = [];
  
  for (const [name, info] of Object.entries(COURSE_MASTER)) {
    if (name === place) continue;
    
    // 同じ直線タイプ（平坦/坂）かつ同じ直線長さなら類似
    if (info.straight_type === target.straight_type && 
        info.straight_len === target.straight_len) {
      similar.push(name);
    }
  }
  
  return similar;
}

