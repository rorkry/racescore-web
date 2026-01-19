/**
 * ダートコース（パターンD・E・F）
 * パターンD: 最初のコーナーまで300m未満
 * パターンE: 最初のコーナーまで300～400m
 * パターンF: 最初のコーナーまで400m以上
 */

import type { CourseCharacteristics } from '@/types/course-characteristics';

export const DIRT_COURSES: Record<string, CourseCharacteristics> = {
  // ========================================
  // パターンD（ダート・300m未満）- 10コース
  // ========================================
  
  '札幌_ダート_1000': {
    courseId: '札幌_ダート_1000', racecourse: '札幌', distance: 1000, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 264,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['超短距離戦', '平坦', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート超短距離はスピード勝負'
  },
  '札幌_ダート_1700': {
    courseId: '札幌_ダート_1700', racecourse: '札幌', distance: 1700, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 264,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['平坦', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナとスピードのバランス'
  },
  '札幌_ダート_2400': {
    courseId: '札幌_ダート_2400', racecourse: '札幌', distance: 2400, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 264,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['長距離ダート', '平坦', 'スタミナ勝負', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '京都_ダート_1800': {
    courseId: '京都_ダート_1800', racecourse: '京都', distance: 1800, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 329,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['平坦', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'ダート中距離の基準コース'
  },
  '中山_ダート_2400': {
    courseId: '中山_ダート_2400', racecourse: '中山', distance: 2400, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 308,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['長距離ダート', '急坂', 'スタミナ勝負', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナと急坂克服力が問われる'
  },
  '函館_ダート_2400': {
    courseId: '函館_ダート_2400', racecourse: '函館', distance: 2400, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 260,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['長距離ダート', 'スタミナ勝負', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '東京_ダート_2100': {
    courseId: '東京_ダート_2100', racecourse: '東京', distance: 2100, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 501,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['ダート中距離', 'スタミナ重視', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'ダート中距離はスタミナ勝負'
  },
  '中京_ダート_1800': {
    courseId: '中京_ダート_1800', racecourse: '中京', distance: 1800, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 410,
    hasSlope: true, slopeDescription: '直線に坂あり',
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['チャンピオンズC開催コース', '急坂', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'チャンピオンズCコース'
  },
  '福島_ダート_2400': {
    courseId: '福島_ダート_2400', racecourse: '福島', distance: 2400, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 295,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['長距離ダート', '平坦', 'スタミナ勝負', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '阪神_ダート_1800': {
    courseId: '阪神_ダート_1800', racecourse: '阪神', distance: 1800, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 352,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 250, coursePattern: 'D',
    characteristics: ['急坂', 'パワー必要', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'ダート中距離の基準コース'
  },

  // ========================================
  // パターンE（ダート・300～400m）- 14コース
  // ========================================
  
  '中山_ダート_1800': {
    courseId: '中山_ダート_1800', racecourse: '中山', distance: 1800, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 308,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['急坂', 'パワー必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '外枠やや有利',
    runningStyleAdvantage: ['先行', '差し'], notes: 'パワーと持続力が問われるコース'
  },
  '中山_ダート_2500': {
    courseId: '中山_ダート_2500', racecourse: '中山', distance: 2500, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 308,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['長距離ダート', '急坂', 'スタミナ勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナと急坂克服力が問われる'
  },
  '東京_ダート_1300': {
    courseId: '東京_ダート_1300', racecourse: '東京', distance: 1300, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 501,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['直線が長い', '芝スタート', 'スピード勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '外枠やや有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '芝スタートで外枠有利'
  },
  '新潟_ダート_1800': {
    courseId: '新潟_ダート_1800', racecourse: '新潟', distance: 1800, surface: 'ダート',
    direction: '左回り', straightLength: '標準', straightDistance: 354,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['平坦', 'スタミナが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナ勝負'
  },
  '新潟_ダート_2500': {
    courseId: '新潟_ダート_2500', racecourse: '新潟', distance: 2500, surface: 'ダート',
    direction: '左回り', straightLength: '標準', straightDistance: 354,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['長距離ダート', '平坦', 'スタミナ勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '小倉_ダート_1000': {
    courseId: '小倉_ダート_1000', racecourse: '小倉', distance: 1000, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 291,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['超短距離戦', '平坦', 'スピード勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '外枠やや有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート超短距離はスピード勝負'
  },
  '小倉_ダート_1700': {
    courseId: '小倉_ダート_1700', racecourse: '小倉', distance: 1700, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 291,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['小回り', '平坦'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナとスピードのバランス'
  },
  '小倉_ダート_2400': {
    courseId: '小倉_ダート_2400', racecourse: '小倉', distance: 2400, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 291,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['長距離ダート', '小回り', 'スタミナ勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '函館_ダート_1000': {
    courseId: '函館_ダート_1000', racecourse: '函館', distance: 1000, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 260,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['超短距離戦', 'スピード勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '外枠やや有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート超短距離はスピード勝負'
  },
  '函館_ダート_1700': {
    courseId: '函館_ダート_1700', racecourse: '函館', distance: 1700, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 260,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['小回り'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナとスピードのバランス'
  },
  '福島_ダート_1700': {
    courseId: '福島_ダート_1700', racecourse: '福島', distance: 1700, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 295,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['小回り', '平坦'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナとスピードのバランス'
  },
  '京都_ダート_1900': {
    courseId: '京都_ダート_1900', racecourse: '京都', distance: 1900, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 329,
    hasSlope: false,
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['平坦', 'スタミナが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナ勝負'
  },
  '阪神_ダート_1200': {
    courseId: '阪神_ダート_1200', racecourse: '阪神', distance: 1200, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 352,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['急坂', 'パワーが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '外枠やや有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート短距離はスピード勝負'
  },
  '中京_ダート_1900': {
    courseId: '中京_ダート_1900', racecourse: '中京', distance: 1900, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 410,
    hasSlope: true, slopeDescription: '直線に坂あり',
    distanceToFirstCorner: 350, coursePattern: 'E',
    characteristics: ['急坂', 'スタミナが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナ勝負'
  },

  // ========================================
  // パターンF（ダート・400m以上）- 12コース
  // ========================================
  
  '中山_ダート_1200': {
    courseId: '中山_ダート_1200', racecourse: '中山', distance: 1200, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 308,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    turfStartDirt: true, turfStartDescription: 'ダート唯一の芝スタート、外枠が芝部分を長く走れる',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '急坂', 'スピードと持続力が必要'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['逃げ', '先行'],
    notes: 'ダート唯一の芝スタート。外枠が芝を長く走れる',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝部分でスピードに乗りやすい', '外枠が芝を長く走れる'],
        notes: '芝スタートの恩恵が最大。外枠からダッシュが効きやすい'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利だが良馬場ほどではない'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['芝部分も滑りやすい', 'パワー型有利'],
        notes: '芝スタートの優位性が薄れる。内枠も走れる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['全体的にパワー勝負', '道悪巧者が台頭'],
        notes: '馬場が均一化し枠順の影響が小さくなる'
      }
    }
  },
  '東京_ダート_1400': {
    courseId: '東京_ダート_1400', racecourse: '東京', distance: 1400, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 501,
    hasSlope: false,
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['直線が長い', '差しが届きやすい', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'ダート1400mは差しも届く'
  },
  '東京_ダート_1600': {
    courseId: '東京_ダート_1600', racecourse: '東京', distance: 1600, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 501,
    hasSlope: false,
    turfStartDirt: true, turfStartDescription: 'スタート後芝部分を走る、外枠が芝部分を長く走れる',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['フェブラリーS施行コース', '芝スタート', '直線が長い'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['先行', '差し'],
    notes: 'GIフェブラリーSコース。芝スタート',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠がスムーズ', '直線長く差しも届く'],
        notes: '芝部分で外枠有利。直線が長いので差しも展開次第'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利は継続するがやや軽減'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利', '差し馬にもチャンス'],
        notes: '芝スタートの優位性が薄れ、内枠も走れる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
  '東京_ダート_2400': {
    courseId: '東京_ダート_2400', racecourse: '東京', distance: 2400, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 501,
    hasSlope: false,
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['長距離ダート', '直線が長い', 'スタミナ勝負', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナが重要'
  },
  '中京_ダート_1200': {
    courseId: '中京_ダート_1200', racecourse: '中京', distance: 1200, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 410,
    hasSlope: true, slopeDescription: '直線に坂あり',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['急坂', 'スピード勝負', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート短距離はスピード勝負'
  },
  '中京_ダート_1400': {
    courseId: '中京_ダート_1400', racecourse: '中京', distance: 1400, surface: 'ダート',
    direction: '左回り', straightLength: '長い', straightDistance: 410,
    hasSlope: true, slopeDescription: '直線に坂あり',
    turfStartDirt: true, turfStartDescription: '2コーナー奥の芝部分からスタート',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '急坂', '差しも届きやすい'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['先行', '差し'],
    notes: '芝スタートで1コーナーまで距離あり',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠スムーズ', '急坂でスタミナ必要'],
        notes: '芝部分で外枠が有利にポジション取り'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利', '急坂がよりタフに'],
        notes: '内枠も走れるようになる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
  '福島_ダート_1150': {
    courseId: '福島_ダート_1150', racecourse: '福島', distance: 1150, surface: 'ダート',
    direction: '右回り', straightLength: '短い', straightDistance: 295,
    hasSlope: false,
    turfStartDirt: true, turfStartDescription: '直線入口付近まで芝を走る',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '平坦', 'スピード勝負'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['逃げ', '先行'],
    notes: '芝スタートでスピード勝負',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠ダッシュ効く', 'スピード勝負'],
        notes: '芝部分が長く外枠が有利'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利'],
        notes: '芝スタートの優位性が薄れる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
  '京都_ダート_1200': {
    courseId: '京都_ダート_1200', racecourse: '京都', distance: 1200, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 329,
    hasSlope: false,
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['平坦', 'スピード勝負', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'ダート短距離はスピード勝負'
  },
  '京都_ダート_1400': {
    courseId: '京都_ダート_1400', racecourse: '京都', distance: 1400, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 329,
    hasSlope: false,
    turfStartDirt: true, turfStartDescription: '向正面芝部分からスタート',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '平坦', '差しも届きやすい'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['先行', '差し'],
    notes: '芝スタートで1コーナーまで距離あり',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠スムーズ', '平坦でスピード活かせる'],
        notes: '芝部分で外枠が有利にポジション取り'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利'],
        notes: '内枠も走れるようになる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
  '阪神_ダート_1400': {
    courseId: '阪神_ダート_1400', racecourse: '阪神', distance: 1400, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 352,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    turfStartDirt: true, turfStartDescription: '向正面芝部分からスタート',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '急坂', 'パワーとスピードが必要'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['先行', '差し'],
    notes: '芝スタート＋急坂',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠スムーズ', '急坂でスタミナ必要'],
        notes: '芝部分で外枠が有利。急坂克服力も重要'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい', '急坂がよりタフに'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利', '急坂がさらにタフ'],
        notes: '内枠も走れるようになる。パワー型が台頭'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭', '急坂で脚が上がる馬多い'],
        notes: '馬場が重く枠順の影響が小さくなる。スタミナ勝負'
      }
    }
  },
  '阪神_ダート_2000': {
    courseId: '阪神_ダート_2000', racecourse: '阪神', distance: 2000, surface: 'ダート',
    direction: '右回り', straightLength: '標準', straightDistance: 352,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    turfStartDirt: true, turfStartDescription: '芝スタートの中距離ダート',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '急坂', 'スタミナとパワーが必要'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['先行', '差し'],
    notes: '芝スタートの中距離ダート',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠スムーズ', '中距離でスタミナ勝負'],
        notes: '芝部分で外枠が有利。中距離なので総合力必要'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい', 'スタミナ勝負'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利', 'スタミナ消耗激しい'],
        notes: '内枠も走れるようになる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭', 'スタミナ消耗大きい'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
  '新潟_ダート_1200': {
    courseId: '新潟_ダート_1200', racecourse: '新潟', distance: 1200, surface: 'ダート',
    direction: '左回り', straightLength: '標準', straightDistance: 354,
    hasSlope: false,
    turfStartDirt: true, turfStartDescription: 'スタート後しばらく芝を走る',
    distanceToFirstCorner: 450, coursePattern: 'F',
    characteristics: ['芝スタート', '平坦', 'スピード勝負'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい',
    gateAdvantage: '良馬場時は外枠有利（重馬場では枠順影響少ない）',
    runningStyleAdvantage: ['逃げ', '先行'],
    notes: '芝スタートでスピード勝負',
    conditionNotes: {
      良: {
        gateAdvantage: '外枠有利',
        characteristics: ['芝スタートで外枠ダッシュ効く', 'スピード勝負'],
        notes: '芝部分で外枠が有利。スピード型が活躍'
      },
      稍: {
        gateAdvantage: '外枠やや有利',
        characteristics: ['芝部分がやや滑りやすい'],
        notes: '外枠有利は継続'
      },
      重: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー型有利'],
        notes: '芝スタートの優位性が薄れる'
      },
      不: {
        gateAdvantage: '枠順影響少ない',
        characteristics: ['パワー勝負', '道悪巧者が台頭'],
        notes: '馬場が重く枠順の影響が小さくなる'
      }
    }
  },
};

