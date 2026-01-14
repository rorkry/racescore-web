/**
 * 芝コース（パターンC）
 * パターンC: 最初のコーナーまで500m以上
 */

import type { CourseCharacteristics } from '@/types/course-characteristics';

export const TURF_COURSES_C: Record<string, CourseCharacteristics> = {
  // ========================================
  // パターンC（芝・500m以上）- 19コース
  // ========================================
  
  '福島_芝_2000': {
    courseId: '福島_芝_2000', racecourse: '福島', distance: 2000, surface: '芝',
    direction: '右回り', straightLength: '短い', straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['七夕賞開催コース', '小回り', 'コーナー4つ', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '七夕賞コース'
  },
  '新潟_芝_1400': {
    courseId: '新潟_芝_1400', racecourse: '新潟', distance: 1400, surface: '芝',
    direction: '左回り', trackSize: '内回り', straightLength: '標準', straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['内回りコース', '平坦', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '総合力が問われる'
  },
  '新潟_芝_1600': {
    courseId: '新潟_芝_1600', racecourse: '新潟', distance: 1600, surface: '芝',
    direction: '左回り', trackSize: '外回り', straightLength: '長い', straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '日本一長い直線（659m）', '差し馬天国', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '長い直線を活かせる差し馬有利'
  },
  '新潟_芝_1800': {
    courseId: '新潟_芝_1800', racecourse: '新潟', distance: 1800, surface: '芝',
    direction: '左回り', trackSize: '外回り', straightLength: '長い', straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '日本一長い直線（659m）', '差し馬天国', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '新潟外回りは差し馬天国'
  },
  '新潟_芝_2000_内': {
    courseId: '新潟_芝_2000_内', racecourse: '新潟', distance: 2000, surface: '芝',
    direction: '左回り', trackSize: '内回り', straightLength: '標準', straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 400, coursePattern: 'B',
    characteristics: ['内回りコース', 'コーナー4つ', '器用さが必要'],
    paceTendency: '標準的なペース配分', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '内回りは立ち回りの上手さが重要'
  },
  '新潟_芝_2000_外': {
    courseId: '新潟_芝_2000_外', racecourse: '新潟', distance: 2000, surface: '芝',
    direction: '左回り', trackSize: '外回り', straightLength: '長い', straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '日本一長い直線（659m）', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '外回りは差し馬有利'
  },
  '新潟_芝_2200': {
    courseId: '新潟_芝_2200', racecourse: '新潟', distance: 2200, surface: '芝',
    direction: '左回り', trackSize: '外回り', straightLength: '長い', straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '長い直線を活かせる差し馬有利'
  },
  '新潟_芝_2400': {
    courseId: '新潟_芝_2400', racecourse: '新潟', distance: 2400, surface: '芝',
    direction: '左回り', trackSize: '外回り', straightLength: '長い', straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い', 'スタミナ重視', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'スタミナと瞬発力が問われる'
  },
  '京都_芝_1400_内': {
    courseId: '京都_芝_1400_内', racecourse: '京都', distance: 1400, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 328,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['内回りコース', '下り坂からのスパート', '平坦な直線', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '内回りは器用さが必要'
  },
  '京都_芝_1400_外': {
    courseId: '京都_芝_1400_外', racecourse: '京都', distance: 1400, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い（404m）', '下り坂からのスパート', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '外回りは差し馬有利'
  },
  '京都_芝_1600_内': {
    courseId: '京都_芝_1600_内', racecourse: '京都', distance: 1600, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 328,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['内回りコース', '下り坂からのスパート', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '内回りは立ち回りの上手さが重要'
  },
  '京都_芝_1600_外': {
    courseId: '京都_芝_1600_外', racecourse: '京都', distance: 1600, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['マイルCS開催コース', '外回り', '直線が長い（404m）', '下り坂からのスパート', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'マイルCSコース。瞬発力勝負'
  },
  '京都_芝_1800': {
    courseId: '京都_芝_1800', racecourse: '京都', distance: 1800, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い（404m）', '下り坂からのスパート', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '京都外回りは差し馬天国'
  },
  '京都_芝_2400': {
    courseId: '京都_芝_2400', racecourse: '京都', distance: 2400, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 404,
    hasSlope: false, slopeDescription: '3コーナーに下り坂',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['天皇賞・春開催コース', '外回り', '直線が長い（404m）', 'スタミナと瞬発力が必要', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '天皇賞・春コース'
  },
  '阪神_芝_1800': {
    courseId: '阪神_芝_1800', racecourse: '阪神', distance: 1800, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 473,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い（473m）', '急坂', 'スタミナと瞬発力が必要', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '長い直線を活かした差し馬有利'
  },
  '阪神_芝_2200': {
    courseId: '阪神_芝_2200', racecourse: '阪神', distance: 2200, surface: '芝',
    direction: '右回り', trackSize: '内回り', straightLength: '標準', straightDistance: 356,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['宝塚記念開催コース', '内回り', 'コーナー4つ', 'スタミナと器用さが必要', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '宝塚記念コース'
  },
  '阪神_芝_2600': {
    courseId: '阪神_芝_2600', racecourse: '阪神', distance: 2600, surface: '芝',
    direction: '右回り', trackSize: '外回り', straightLength: '長い', straightDistance: 473,
    hasSlope: true, slopeDescription: '直線に急坂あり',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['外回りコース', '直線が長い', '急坂', 'スタミナ重視', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: 'スタミナと急坂克服力が問われる'
  },
  '中京_芝_1400': {
    courseId: '中京_芝_1400', racecourse: '中京', distance: 1400, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 412,
    hasSlope: true, slopeDescription: '直線に坂あり（高低差2.0m）',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['直線が長い（412m）', '急坂', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['先行', '差し'], notes: '総合力が問われる'
  },
  '中京_芝_2200': {
    courseId: '中京_芝_2200', racecourse: '中京', distance: 2200, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 412,
    hasSlope: true, slopeDescription: '直線に坂あり（高低差2.0m）',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['直線が長い（412m）', '急坂', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '長い直線を活かせる差し馬有利'
  },
  '東京_芝_1600': {
    courseId: '東京_芝_1600', racecourse: '東京', distance: 1600, surface: '芝',
    direction: '左回り', straightLength: '長い', straightDistance: 525,
    hasSlope: true, slopeDescription: '緩やかな坂（高低差2m）',
    distanceToFirstCorner: 550, coursePattern: 'C',
    characteristics: ['安田記念開催コース', '府中の名マイル', '直線が長い（525m）', 'スピードとスタミナの両立が必要', '枠順影響少ない'],
    paceTendency: '前半抑えて後半勝負のラップになりやすい', gateAdvantage: '枠順影響少ない',
    runningStyleAdvantage: ['差し', '追込'], notes: '長い直線を活かせる差し馬有利。瞬発力勝負'
  },
};












