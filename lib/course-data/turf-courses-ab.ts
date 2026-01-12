/**
 * 芝コース（パターンA・B）
 * パターンA: 最初のコーナーまで300m未満
 * パターンB: 最初のコーナーまで300～500m
 */

import type { CourseCharacteristics } from '@/types/course-characteristics';

export const TURF_COURSES_A_B: Record<string, CourseCharacteristics> = {
  // ========================================
  // パターンA（芝・300m未満）- 21コース
  // ========================================
  
  '東京_芝_2000': {
    courseId: '東京_芝_2000', racecourse: '東京', distance: 2000, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 525,
    hasSlope: true, slopeDescription: '緩やかな坂（高低差2m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['直線が長い（525m）', '差し・追込が届きやすい', '最初のコーナーまで近い', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '府中牝馬S・青葉賞開催コース'
  },
  '中山_芝_1600': {
    courseId: '中山_芝_1600', racecourse: '中山', distance: 1600, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり（高低差2.2m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['小回りコース', '直線が短い（310m）', '直線に急坂がある', '先行有利の傾向', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '小回りで持続力勝負。差し馬は厳しい展開が多い'
  },
  '東京_芝_1800': {
    courseId: '東京_芝_1800', racecourse: '東京', distance: 1800, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 525,
    hasSlope: true, slopeDescription: '緩やかな坂（高低差2m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['毎日王冠開催コース', '直線が長い（525m）', '最初のコーナーまで近い', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '毎日王冠舞台'
  },
  '阪神_芝_1200': {
    courseId: '阪神_芝_1200', racecourse: '阪神', distance: 1200, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 356,
    hasSlope: true, slopeDescription: '直線に急坂あり（高低差1.8m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['内回りコース', '急坂', '先行有利', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '短距離戦は前有利'
  },
  '中山_芝_1200': {
    courseId: '中山_芝_1200', racecourse: '中山', distance: 1200, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり（高低差2.2m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['スプリンターズS開催コース', '直線が短い（310m）', '急坂', '先行有利', '内枠有利'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: 'スプリンターズSコース'
  },
  '中山_芝_1800': {
    courseId: '中山_芝_1800', racecourse: '中山', distance: 1800, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['内回りコース', 'コーナー4つ', '器用さが必要', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '内回りで立ち回り重要'
  },
  '中山_芝_2500': {
    courseId: '中山_芝_2500', racecourse: '中山', distance: 2500, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['有馬記念開催コース', '内回りコース', 'コーナー6つ', '器用さとスタミナが最重要', '内枠有利'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '有馬記念コース'
  },
  '中京_芝_1600': {
    courseId: '中京_芝_1600', racecourse: '中京', distance: 1600, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 412,
    hasSlope: true, slopeDescription: '直線に坂あり（高低差2.0m）',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['直線が長い（412m）', '急坂', '最初のコーナーまで近い', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '急坂克服力が問われる'
  },
  '札幌_芝_1500': {
    courseId: '札幌_芝_1500', racecourse: '札幌', distance: 1500, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['洋芝コース', '直線が短い（266m）', '平坦', '時計がかかる', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '洋芝で持続力勝負'
  },
  '札幌_芝_1800': {
    courseId: '札幌_芝_1800', racecourse: '札幌', distance: 1800, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['洋芝コース', '平坦', 'コーナー4つ', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '洋芝で器用さが必要'
  },
  '函館_芝_1000': {
    courseId: '函館_芝_1000', racecourse: '函館', distance: 1000, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 262,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['洋芝コース', '超短距離戦', '時計がかかる', '内枠有利'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '洋芝の超短距離戦'
  },
  '函館_芝_1800': {
    courseId: '函館_芝_1800', racecourse: '函館', distance: 1800, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 262,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['洋芝コース', '小回り', 'コーナー4つ', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '洋芝で器用さが必要'
  },
  '小倉_芝_1700': {
    courseId: '小倉_芝_1700', racecourse: '小倉', distance: 1700, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['小回りコース', '直線が短い（293m）', '平坦', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '小回りで立ち回り重要'
  },
  '小倉_芝_1800': {
    courseId: '小倉_芝_1800', racecourse: '小倉', distance: 1800, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['小回りコース', '平坦', 'コーナー4つ', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '小回りで器用さが必要'
  },
  '京都_芝_3000': {
    courseId: '京都_芝_3000', racecourse: '京都', distance: 3000, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 250, coursePattern: 'A',
    characteristics: ['菊花賞開催コース', '外回り', 'スタミナが最重要', '内枠有利の傾向'],
    paceTendency: '前傾ラップになりやすい', gateAdvantage: '内枠有利',
    runningStyleAdvantage: ['先行', '差し'], notes: '菊花賞コース'
  },

  // ========================================
  // パターンB（芝・300～500m）- 27コース
  // ========================================
  
  '福島_芝_1200': {
    courseId: '福島_芝_1200', racecourse: '福島', distance: 1200, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['小回りコース', '直線が短い（292m）', '平坦', '先行有利'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '小回り平坦は前有利'
  },
  '福島_芝_1800': {
    courseId: '福島_芝_1800', racecourse: '福島', distance: 1800, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['小回りコース', '直線が短い（292m）', '平坦'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '小回りで器用さが必要'
  },
  '札幌_芝_1200': {
    courseId: '札幌_芝_1200', racecourse: '札幌', distance: 1200, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['洋芝コース', '直線が短い（266m）', '平坦', '時計がかかる'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '洋芝で時計がかかる'
  },
  '札幌_芝_2000': {
    courseId: '札幌_芝_2000', racecourse: '札幌', distance: 2000, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['札幌記念開催コース', '洋芝', '平坦'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '札幌記念コース'
  },
  '京都_芝_1200': {
    courseId: '京都_芝_1200', racecourse: '京都', distance: 1200, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 328,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['下り坂からのスパート', '平坦な直線', 'スピード勝負'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '下り坂を利用したスピード勝負'
  },
  '京都_芝_2000': {
    courseId: '京都_芝_2000', racecourse: '京都', distance: 2000, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 328,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['秋華賞開催コース', '内回り', 'コーナー4つ', '器用さが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '秋華賞コース'
  },
  '京都_芝_2200': {
    courseId: '京都_芝_2200', racecourse: '京都', distance: 2200, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['エリザベス女王杯開催コース', '外回り', '直線が長い（404m）'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'エリザベス女王杯コース'
  },
  '中京_芝_1200': {
    courseId: '中京_芝_1200', racecourse: '中京', distance: 1200, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 412,
    hasSlope: true, slopeDescription: '直線に坂あり（高低差2.0m）',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['高松宮記念開催コース', '直線が長い（412m）', '急坂'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '高松宮記念コース'
  },
  '中京_芝_2000': {
    courseId: '中京_芝_2000', racecourse: '中京', distance: 2000, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 412,
    hasSlope: true, slopeDescription: '直線に坂あり（高低差2.0m）',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['金鯱賞開催コース', '直線が長い（412m）', '急坂'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '金鯱賞コース'
  },
  '中山_芝_2000': {
    courseId: '中山_芝_2000', racecourse: '中山', distance: 2000, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['皐月賞開催コース', '内回り', 'コーナー4つ', '急坂を2回上る'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '皐月賞コース'
  },
  '中山_芝_2200': {
    courseId: '中山_芝_2200', racecourse: '中山', distance: 2200, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '短い', straightDistance: 310,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['外回りコース', '急坂を2回上る', 'スタミナ重視'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: 'スタミナと急坂克服力が重要'
  },
  '阪神_芝_1400': {
    courseId: '阪神_芝_1400', racecourse: '阪神', distance: 1400, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 356,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['内回りコース', '急坂', 'パワーが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '急坂克服力が問われる'
  },
  '阪神_芝_1600': {
    courseId: '阪神_芝_1600', racecourse: '阪神', distance: 1600, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 473,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['阪神JF・桜花賞開催コース', '外回り', '直線が長い（473m）', '急坂'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '外回り長い直線で差し馬有利'
  },
  '阪神_芝_2000': {
    courseId: '阪神_芝_2000', racecourse: '阪神', distance: 2000, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 356,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['大阪杯開催コース', '内回り', 'コーナー4つ', '器用さが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '大阪杯コース'
  },
  '阪神_芝_2400': {
    courseId: '阪神_芝_2400', racecourse: '阪神', distance: 2400, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 473,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['外回りコース', '直線が長い', '急坂', 'スタミナ重視'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'スタミナと瞬発力が問われる'
  },
  '新潟_芝_1200': {
    courseId: '新潟_芝_1200', racecourse: '新潟', distance: 1200, surface: '芝',
    direction: '左回り', trackSize: '内回り', straightLength: '標準', straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['内回りコース', '平坦'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '平坦短距離はスピード勝負'
  },
  '東京_芝_1400': {
    courseId: '東京_芝_1400', racecourse: '東京', distance: 1400, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 525,
    hasSlope: true, slopeDescription: '緩やかな坂（高低差2m）',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['直線が長い（525m）', '緩やかな坂', '差しが届きやすい'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '長い直線を活かせる差し馬にチャンス'
  },
  '東京_芝_2400': {
    courseId: '東京_芝_2400', racecourse: '東京', distance: 2400, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 525,
    hasSlope: true, slopeDescription: '緩やかな坂（高低差2m）',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['日本ダービー・オークス開催コース', '直線が長い（525m）', 'スタミナと瞬発力の両立が必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'ダービーコース。スタミナと瞬発力の両方が問われる'
  },
  '小倉_芝_1200': {
    courseId: '小倉_芝_1200', racecourse: '小倉', distance: 1200, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['小回りコース', '直線が短い（293m）', '平坦', '先行有利'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '小回り平坦は前有利'
  },
  '小倉_芝_2000': {
    courseId: '小倉_芝_2000', racecourse: '小倉', distance: 2000, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['小倉記念開催コース', '小回り', 'コーナー4つ'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '小倉記念コース'
  },
  '函館_芝_1200': {
    courseId: '函館_芝_1200', racecourse: '函館', distance: 1200, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 262,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['函館スプリントS開催コース', '洋芝', '時計がかかる'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['逃げ', '先行'], notes: '函館スプリントSコース'
  },
  '函館_芝_2000': {
    courseId: '函館_芝_2000', racecourse: '函館', distance: 2000, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 262,
    hasSlope: true, slopeDescription: '緩やかな起伏',
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['函館記念開催コース', '洋芝', '小回り'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '函館記念コース'
  },
};









