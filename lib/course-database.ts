/**
 * コース特性データベース
 * 
 * 全競馬場のコース特性データを管理
 * 展開予想AI、俺AI、コース分析機能で参照
 */

import type { CourseCharacteristics, CourseDatabase, TrackSurface } from '@/types/course-characteristics';

// ========================================
// コースデータベース
// ========================================

export const COURSE_DATABASE: CourseDatabase = {
  // ========================================
  // 中山競馬場（芝）
  // ========================================
  
  "中山_芝_1200": {
    courseId: "中山_芝_1200",
    racecourse: "中山",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり（高低差2.2m）",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "スプリンターズS開催コース",
      "直線が短い（310m）",
      "直線に急坂がある",
      "先行有利の傾向",
      "内枠有利"
    ],
    paceTendency: "前傾ラップになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "短距離戦は前有利。急坂で差し馬は届きにくい"
  },
  
  "中山_芝_1600": {
    courseId: "中山_芝_1600",
    racecourse: "中山",
    distance: 1600,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり（高低差2.2m）",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "小回りコース",
      "直線が短い（310m）",
      "直線に急坂がある",
      "器用さが必要",
      "内枠有利の傾向"
    ],
    paceTendency: "前傾ラップになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "逃げ"],
    notes: "小回りで持続力勝負。差し馬は厳しい展開が多い"
  },
  
  "中山_芝_1800": {
    courseId: "中山_芝_1800",
    racecourse: "中山",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "内回りコース",
      "コーナー4つ",
      "器用さが必要",
      "先行有利"
    ],
    paceTendency: "ペースが落ち着きやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "内回りでコーナー4つ。立ち回りの上手さが重要"
  },
  
  "中山_芝_2000": {
    courseId: "中山_芝_2000",
    racecourse: "中山",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "皐月賞開催コース",
      "内回りコース",
      "コーナー4つ",
      "急坂を2回上る",
      "スタミナと器用さが必要"
    ],
    paceTendency: "中盤でペースが緩む傾向",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "皐月賞コース。持続力と急坂克服力が問われる"
  },
  
  "中山_芝_2200": {
    courseId: "中山_芝_2200",
    racecourse: "中山",
    distance: 2200,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "外回りコース",
      "急坂を2回上る",
      "スタミナ重視"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナと急坂克服力が重要"
  },
  
  "中山_芝_2500": {
    courseId: "中山_芝_2500",
    racecourse: "中山",
    distance: 2500,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "短い",
    straightDistance: 310,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "有馬記念開催コース",
      "内回りコース",
      "コーナー6つ",
      "急坂を2回上る",
      "スタミナと器用さが最重要"
    ],
    paceTendency: "スローからのロングスパートになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "有馬記念コース。コーナー6回の立ち回りが重要"
  },
  
  // ========================================
  // 中山競馬場（ダート）
  // ========================================
  
  "中山_ダート_1200": {
    courseId: "中山_ダート_1200",
    racecourse: "中山",
    distance: 1200,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "最初のコーナーまで距離がある",
      "直線に急坂",
      "スピードと持続力が必要"
    ],
    paceTendency: "前傾ラップになりやすい",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離戦はスピード勝負"
  },
  
  "中山_ダート_1800": {
    courseId: "中山_ダート_1800",
    racecourse: "中山",
    distance: 1800,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "外枠有利の傾向",
      "直線に急坂",
      "パワーが必要"
    ],
    paceTendency: "淀みないペースになりやすい",
    gateAdvantage: "外枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "パワーと持続力が問われるコース"
  },
  
  // ========================================
  // 東京競馬場（芝）
  // ========================================
  
  "東京_芝_1400": {
    courseId: "東京_芝_1400",
    racecourse: "東京",
    distance: 1400,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 525,
    hasSlope: false,
    slopeDescription: "緩やかな坂（高低差2m）",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "直線が長い（525m）",
      "緩やかな坂",
      "差しが届きやすい"
    ],
    paceTendency: "前半やや速め",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "長い直線を活かせる差し馬にチャンス"
  },
  
  "東京_芝_1600": {
    courseId: "東京_芝_1600",
    racecourse: "東京",
    distance: 1600,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 525,
    hasSlope: false,
    slopeDescription: "緩やかな坂（高低差2m）",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "安田記念開催コース",
      "府中の名マイル",
      "直線が長い（525m）",
      "スピードとスタミナの両立が必要",
      "枠順による有利不利が少ない"
    ],
    paceTendency: "前半抑えて後半加速のラップが理想",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "長い直線を活かせる差し馬有利。瞬発力勝負"
  },
  
  "東京_芝_1800": {
    courseId: "東京_芝_1800",
    racecourse: "東京",
    distance: 1800,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 525,
    hasSlope: false,
    slopeDescription: "緩やかな坂",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "毎日王冠・府中牝馬S開催コース",
      "直線が長い（525m）",
      "スタート直後にコーナー"
    ],
    paceTendency: "スローになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "最初のコーナーまで近いため内枠有利"
  },
  
  "東京_芝_2000": {
    courseId: "東京_芝_2000",
    racecourse: "東京",
    distance: 2000,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 525,
    hasSlope: false,
    slopeDescription: "緩やかな坂",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "フローラS・青葉賞開催コース",
      "直線が長い（525m）",
      "スタート直後にコーナー"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "長い直線を活かした末脚勝負になりやすい"
  },
  
  "東京_芝_2400": {
    courseId: "東京_芝_2400",
    racecourse: "東京",
    distance: 2400,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 525,
    hasSlope: false,
    slopeDescription: "緩やかな坂",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "日本ダービー・オークス開催コース",
      "直線が長い（525m）",
      "スタミナと瞬発力の両立が必要",
      "府中2400mは競馬の頂点"
    ],
    paceTendency: "前半抑えて後半勝負",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "ダービーコース。スタミナと瞬発力の両方が問われる"
  },
  
  // ========================================
  // 東京競馬場（ダート）
  // ========================================
  
  "東京_ダート_1300": {
    courseId: "東京_ダート_1300",
    racecourse: "東京",
    distance: 1300,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "直線が長い",
      "芝スタート",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "芝スタートで外枠有利"
  },
  
  "東京_ダート_1400": {
    courseId: "東京_ダート_1400",
    racecourse: "東京",
    distance: 1400,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "直線が長い",
      "差しが届きやすい"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "ダート1400mは差しも届く"
  },
  
  "東京_ダート_1600": {
    courseId: "東京_ダート_1600",
    racecourse: "東京",
    distance: 1600,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "フェブラリーS開催コース",
      "直線が長い",
      "スタミナとスピードが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "GIフェブラリーSコース。総合力が問われる"
  },
  
  "東京_ダート_2100": {
    courseId: "東京_ダート_2100",
    racecourse: "東京",
    distance: 2100,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "ダート中距離",
      "スタミナ重視"
    ],
    paceTendency: "スローになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "ダート中距離はスタミナ勝負"
  },
  
  // ========================================
  // 阪神競馬場（芝）
  // ========================================
  
  "阪神_芝_1200": {
    courseId: "阪神_芝_1200",
    racecourse: "阪神",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 356,
    hasSlope: true,
    slopeDescription: "直線に急坂あり（高低差1.8m）",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "内回りコース",
      "直線に急坂",
      "器用さが必要"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "短距離戦は前有利"
  },
  
  "阪神_芝_1400": {
    courseId: "阪神_芝_1400",
    racecourse: "阪神",
    distance: 1400,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 356,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "内回りコース",
      "直線に急坂",
      "パワーが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "急坂克服力が問われる"
  },
  
  "阪神_芝_1600": {
    courseId: "阪神_芝_1600",
    racecourse: "阪神",
    distance: 1600,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 473,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "阪神JF・桜花賞開催コース",
      "外回りコース",
      "直線が長い（473m）",
      "直線に急坂"
    ],
    paceTendency: "前半抑えて後半勝負",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "外回り長い直線で差し馬有利"
  },
  
  "阪神_芝_1800": {
    courseId: "阪神_芝_1800",
    racecourse: "阪神",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 473,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "直線が長い（473m）",
      "スタミナと瞬発力が必要"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "長い直線を活かした差し馬有利"
  },
  
  "阪神_芝_2000": {
    courseId: "阪神_芝_2000",
    racecourse: "阪神",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 356,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "大阪杯開催コース",
      "内回りコース",
      "コーナー4つ",
      "器用さが必要"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "内回りで立ち回りの上手さが重要"
  },
  
  "阪神_芝_2200": {
    courseId: "阪神_芝_2200",
    racecourse: "阪神",
    distance: 2200,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 356,
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "宝塚記念開催コース",
      "内回りコース",
      "コーナー4つ",
      "スタミナと器用さが必要"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "宝塚記念コース。総合力が問われる"
  },
  
  // ========================================
  // 阪神競馬場（ダート）
  // ========================================
  
  "阪神_ダート_1200": {
    courseId: "阪神_ダート_1200",
    racecourse: "阪神",
    distance: 1200,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "直線に急坂",
      "パワーが必要"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離はスピード勝負"
  },
  
  "阪神_ダート_1400": {
    courseId: "阪神_ダート_1400",
    racecourse: "阪神",
    distance: 1400,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "直線に急坂",
      "パワーとスピードが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "総合力が問われるコース"
  },
  
  "阪神_ダート_1800": {
    courseId: "阪神_ダート_1800",
    racecourse: "阪神",
    distance: 1800,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: true,
    slopeDescription: "直線に急坂あり",
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "直線に急坂",
      "スタミナとパワーが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "ダート中距離の基準コース"
  },
  
  // ========================================
  // 京都競馬場（芝）
  // ========================================
  
  "京都_芝_1200": {
    courseId: "京都_芝_1200",
    racecourse: "京都",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 328,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "下り坂からのスパート",
      "平坦な直線",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "下り坂を利用したスピード勝負"
  },
  
  "京都_芝_1400_内": {
    courseId: "京都_芝_1400_内",
    racecourse: "京都",
    distance: 1400,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 328,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "内回りコース",
      "下り坂からのスパート",
      "平坦な直線"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "内回りは器用さが必要"
  },
  
  "京都_芝_1400_外": {
    courseId: "京都_芝_1400_外",
    racecourse: "京都",
    distance: 1400,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "直線が長い（404m）",
      "下り坂からのスパート"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "外回りは差し馬有利"
  },
  
  "京都_芝_1600_内": {
    courseId: "京都_芝_1600_内",
    racecourse: "京都",
    distance: 1600,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 328,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "内回りコース",
      "下り坂からのスパート"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "内回りは立ち回りの上手さが重要"
  },
  
  "京都_芝_1600_外": {
    courseId: "京都_芝_1600_外",
    racecourse: "京都",
    distance: 1600,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "マイルCS開催コース",
      "外回りコース",
      "直線が長い（404m）",
      "下り坂からのスパート"
    ],
    paceTendency: "前半抑えて後半勝負",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "マイルCSコース。瞬発力勝負"
  },
  
  "京都_芝_1800": {
    courseId: "京都_芝_1800",
    racecourse: "京都",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "直線が長い（404m）",
      "下り坂からのスパート"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "京都外回りは差し馬天国"
  },
  
  "京都_芝_2000": {
    courseId: "京都_芝_2000",
    racecourse: "京都",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 328,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "秋華賞開催コース",
      "内回りコース",
      "コーナー4つ",
      "器用さが必要"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "秋華賞コース。内回りで立ち回り重要"
  },
  
  "京都_芝_2200": {
    courseId: "京都_芝_2200",
    racecourse: "京都",
    distance: 2200,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "エリザベス女王杯開催コース",
      "外回りコース",
      "直線が長い（404m）"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "エリザベス女王杯コース"
  },
  
  "京都_芝_2400": {
    courseId: "京都_芝_2400",
    racecourse: "京都",
    distance: 2400,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "天皇賞・秋開催コース",
      "外回りコース",
      "直線が長い（404m）",
      "スタミナと瞬発力が必要"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "天皇賞・春コース。スタミナと瞬発力の両方が問われる"
  },
  
  "京都_芝_3000": {
    courseId: "京都_芝_3000",
    racecourse: "京都",
    distance: 3000,
    surface: "芝",
    direction: "右回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 404,
    hasSlope: false,
    slopeDescription: "3コーナーに下り坂",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "菊花賞開催コース",
      "外回りコース",
      "スタミナが最重要"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "菊花賞コース。スタミナが問われる"
  },
  
  // ========================================
  // 京都競馬場（ダート）
  // ========================================
  
  "京都_ダート_1200": {
    courseId: "京都_ダート_1200",
    racecourse: "京都",
    distance: 1200,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "平坦コース",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離はスピード勝負"
  },
  
  "京都_ダート_1400": {
    courseId: "京都_ダート_1400",
    racecourse: "京都",
    distance: 1400,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "平坦コース",
      "差しも届きやすい"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "総合力が問われる"
  },
  
  "京都_ダート_1800": {
    courseId: "京都_ダート_1800",
    racecourse: "京都",
    distance: 1800,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "平坦コース",
      "スタミナが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "ダート中距離の基準コース"
  },
  
  "京都_ダート_1900": {
    courseId: "京都_ダート_1900",
    racecourse: "京都",
    distance: 1900,
    surface: "ダート",
    direction: "右回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "平坦コース",
      "スタミナが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナ勝負"
  },
  
  // ========================================
  // 新潟競馬場（芝）
  // ========================================
  
  "新潟_芝_1000": {
    courseId: "新潟_芝_1000",
    racecourse: "新潟",
    distance: 1000,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 1000,
    coursePattern: "C",
    characteristics: [
      "直線競馬",
      "日本一長い直線（659m）",
      "コーナーなし",
      "純粋なスピード勝負"
    ],
    paceTendency: "超ハイペース",
    gateAdvantage: "外枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "唯一の直線競馬。外枠有利"
  },
  
  "新潟_芝_1200": {
    courseId: "新潟_芝_1200",
    racecourse: "新潟",
    distance: 1200,
    surface: "芝",
    direction: "左回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "内回りコース",
      "平坦コース"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "平坦短距離はスピード勝負"
  },
  
  "新潟_芝_1400": {
    courseId: "新潟_芝_1400",
    racecourse: "新潟",
    distance: 1400,
    surface: "芝",
    direction: "左回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "内回りコース",
      "平坦コース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "総合力が問われる"
  },
  
  "新潟_芝_1600": {
    courseId: "新潟_芝_1600",
    racecourse: "新潟",
    distance: 1600,
    surface: "芝",
    direction: "左回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "日本一長い直線（659m）",
      "差し馬天国"
    ],
    paceTendency: "前半抑えて後半勝負",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "長い直線を活かせる差し馬有利"
  },
  
  "新潟_芝_1800": {
    courseId: "新潟_芝_1800",
    racecourse: "新潟",
    distance: 1800,
    surface: "芝",
    direction: "左回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "日本一長い直線（659m）",
      "差し馬天国"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "新潟外回りは差し馬天国"
  },
  
  "新潟_芝_2000_内": {
    courseId: "新潟_芝_2000_内",
    racecourse: "新潟",
    distance: 2000,
    surface: "芝",
    direction: "左回り",
    trackSize: "内回り",
    straightLength: "標準",
    straightDistance: 359,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "内回りコース",
      "コーナー4つ",
      "器用さが必要"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "内回りは立ち回りの上手さが重要"
  },
  
  "新潟_芝_2000_外": {
    courseId: "新潟_芝_2000_外",
    racecourse: "新潟",
    distance: 2000,
    surface: "芝",
    direction: "左回り",
    trackSize: "外回り",
    straightLength: "長い",
    straightDistance: 659,
    hasSlope: false,
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "外回りコース",
      "日本一長い直線（659m）"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "外回りは差し馬有利"
  },
  
  // ========================================
  // 新潟競馬場（ダート）
  // ========================================
  
  "新潟_ダート_1200": {
    courseId: "新潟_ダート_1200",
    racecourse: "新潟",
    distance: 1200,
    surface: "ダート",
    direction: "左回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "平坦コース",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離はスピード勝負"
  },
  
  "新潟_ダート_1800": {
    courseId: "新潟_ダート_1800",
    racecourse: "新潟",
    distance: 1800,
    surface: "ダート",
    direction: "左回り",
    straightLength: "標準",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "平坦コース",
      "スタミナが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナ勝負"
  },
  
  // ========================================
  // 小倉競馬場（芝）
  // ========================================
  
  "小倉_芝_1200": {
    courseId: "小倉_芝_1200",
    racecourse: "小倉",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "小回りコース",
      "直線が短い（293m）",
      "平坦コース",
      "先行有利"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "小回り平坦は前有利"
  },
  
  "小倉_芝_1700": {
    courseId: "小倉_芝_1700",
    racecourse: "小倉",
    distance: 1700,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "小回りコース",
      "直線が短い（293m）",
      "平坦コース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "小回りで立ち回り重要"
  },
  
  "小倉_芝_1800": {
    courseId: "小倉_芝_1800",
    racecourse: "小倉",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "小回りコース",
      "直線が短い（293m）",
      "平坦コース",
      "コーナー4つ"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "小回りで器用さが必要"
  },
  
  "小倉_芝_2000": {
    courseId: "小倉_芝_2000",
    racecourse: "小倉",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 293,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "小倉記念開催コース",
      "小回りコース",
      "コーナー4つ"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "小倉記念コース"
  },
  
  // ========================================
  // 小倉競馬場（ダート）
  // ========================================
  
  "小倉_ダート_1000": {
    courseId: "小倉_ダート_1000",
    racecourse: "小倉",
    distance: 1000,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "超短距離戦",
      "スピード勝負"
    ],
    paceTendency: "超ハイペース",
    gateAdvantage: "外枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート超短距離はスピード勝負"
  },
  
  "小倉_ダート_1700": {
    courseId: "小倉_ダート_1700",
    racecourse: "小倉",
    distance: 1700,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "小回りコース",
      "平坦コース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナとスピードのバランス"
  },
  
  // ========================================
  // 福島競馬場（芝）
  // ========================================
  
  "福島_芝_1200": {
    courseId: "福島_芝_1200",
    racecourse: "福島",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "小回りコース",
      "直線が短い（292m）",
      "平坦コース"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "小回り平坦は前有利"
  },
  
  "福島_芝_1800": {
    courseId: "福島_芝_1800",
    racecourse: "福島",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "小回りコース",
      "直線が短い（292m）",
      "平坦コース"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "小回りで器用さが必要"
  },
  
  "福島_芝_2000": {
    courseId: "福島_芝_2000",
    racecourse: "福島",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 292,
    hasSlope: false,
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "七夕賞開催コース",
      "小回りコース",
      "コーナー4つ"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "七夕賞コース"
  },
  
  // ========================================
  // 福島競馬場（ダート）
  // ========================================
  
  "福島_ダート_1150": {
    courseId: "福島_ダート_1150",
    racecourse: "福島",
    distance: 1150,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "平坦コース",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離はスピード勝負"
  },
  
  "福島_ダート_1700": {
    courseId: "福島_ダート_1700",
    racecourse: "福島",
    distance: 1700,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "小回りコース",
      "平坦コース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナとスピードのバランス"
  },
  
  // ========================================
  // 札幌競馬場（芝）
  // ========================================
  
  "札幌_芝_1200": {
    courseId: "札幌_芝_1200",
    racecourse: "札幌",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "洋芝コース",
      "直線が短い（266m）",
      "平坦コース",
      "時計がかかる"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "洋芝で時計がかかる"
  },
  
  "札幌_芝_1500": {
    courseId: "札幌_芝_1500",
    racecourse: "札幌",
    distance: 1500,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "洋芝コース",
      "平坦コース",
      "時計がかかる"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "洋芝で持続力が問われる"
  },
  
  "札幌_芝_1800": {
    courseId: "札幌_芝_1800",
    racecourse: "札幌",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "洋芝コース",
      "平坦コース",
      "コーナー4つ"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "洋芝で器用さが必要"
  },
  
  "札幌_芝_2000": {
    courseId: "札幌_芝_2000",
    racecourse: "札幌",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 266,
    hasSlope: false,
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "札幌記念開催コース",
      "洋芝コース",
      "平坦コース"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "札幌記念コース"
  },
  
  // ========================================
  // 札幌競馬場（ダート）
  // ========================================
  
  "札幌_ダート_1000": {
    courseId: "札幌_ダート_1000",
    racecourse: "札幌",
    distance: 1000,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "超短距離戦",
      "平坦コース"
    ],
    paceTendency: "超ハイペース",
    gateAdvantage: "外枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート超短距離はスピード勝負"
  },
  
  "札幌_ダート_1700": {
    courseId: "札幌_ダート_1700",
    racecourse: "札幌",
    distance: 1700,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: false,
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "平坦コース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナとスピードのバランス"
  },
  
  // ========================================
  // 函館競馬場（芝）
  // ========================================
  
  "函館_芝_1000": {
    courseId: "函館_芝_1000",
    racecourse: "函館",
    distance: 1000,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 262,
    hasSlope: true,
    slopeDescription: "緩やかな起伏",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "洋芝コース",
      "超短距離戦",
      "時計がかかる"
    ],
    paceTendency: "超ハイペース",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "洋芝の超短距離戦"
  },
  
  "函館_芝_1200": {
    courseId: "函館_芝_1200",
    racecourse: "函館",
    distance: 1200,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 262,
    hasSlope: true,
    slopeDescription: "緩やかな起伏",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "函館スプリントS開催コース",
      "洋芝コース",
      "時計がかかる"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "函館スプリントSコース"
  },
  
  "函館_芝_1800": {
    courseId: "函館_芝_1800",
    racecourse: "函館",
    distance: 1800,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 262,
    hasSlope: true,
    slopeDescription: "緩やかな起伏",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "洋芝コース",
      "小回りコース",
      "コーナー4つ"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "洋芝で器用さが必要"
  },
  
  "函館_芝_2000": {
    courseId: "函館_芝_2000",
    racecourse: "函館",
    distance: 2000,
    surface: "芝",
    direction: "右回り",
    straightLength: "短い",
    straightDistance: 262,
    hasSlope: true,
    slopeDescription: "緩やかな起伏",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "函館記念開催コース",
      "洋芝コース",
      "小回りコース"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "函館記念コース"
  },
  
  // ========================================
  // 函館競馬場（ダート）
  // ========================================
  
  "函館_ダート_1000": {
    courseId: "函館_ダート_1000",
    racecourse: "函館",
    distance: 1000,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: true,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "超短距離戦"
    ],
    paceTendency: "超ハイペース",
    gateAdvantage: "外枠有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート超短距離はスピード勝負"
  },
  
  "函館_ダート_1700": {
    courseId: "函館_ダート_1700",
    racecourse: "函館",
    distance: 1700,
    surface: "ダート",
    direction: "右回り",
    straightLength: "短い",
    hasSlope: true,
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "小回りコース"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナとスピードのバランス"
  },
  
  // ========================================
  // 中京競馬場（芝）
  // ========================================
  
  "中京_芝_1200": {
    courseId: "中京_芝_1200",
    racecourse: "中京",
    distance: 1200,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 412,
    hasSlope: true,
    slopeDescription: "直線に坂あり（高低差2.0m）",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "高松宮記念開催コース",
      "直線が長い（412m）",
      "直線に坂あり"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "高松宮記念コース"
  },
  
  "中京_芝_1400": {
    courseId: "中京_芝_1400",
    racecourse: "中京",
    distance: 1400,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 412,
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "直線が長い（412m）",
      "直線に坂あり"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "総合力が問われる"
  },
  
  "中京_芝_1600": {
    courseId: "中京_芝_1600",
    racecourse: "中京",
    distance: 1600,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 412,
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 250,
    coursePattern: "A",
    characteristics: [
      "直線が長い（412m）",
      "直線に坂あり",
      "スタート直後にコーナー"
    ],
    paceTendency: "スローになりやすい",
    gateAdvantage: "内枠有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "最初のコーナーまで近い"
  },
  
  "中京_芝_2000": {
    courseId: "中京_芝_2000",
    racecourse: "中京",
    distance: 2000,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 412,
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 400,
    coursePattern: "B",
    characteristics: [
      "金鯱賞開催コース",
      "直線が長い（412m）",
      "直線に坂あり"
    ],
    paceTendency: "中盤でペースが緩む",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "金鯱賞コース"
  },
  
  "中京_芝_2200": {
    courseId: "中京_芝_2200",
    racecourse: "中京",
    distance: 2200,
    surface: "芝",
    direction: "左回り",
    straightLength: "長い",
    straightDistance: 412,
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 550,
    coursePattern: "C",
    characteristics: [
      "直線が長い（412m）",
      "直線に坂あり"
    ],
    paceTendency: "スローからのロングスパート",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["差し", "追込"],
    notes: "長い直線を活かせる差し馬有利"
  },
  
  // ========================================
  // 中京競馬場（ダート）
  // ========================================
  
  "中京_ダート_1200": {
    courseId: "中京_ダート_1200",
    racecourse: "中京",
    distance: 1200,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "直線に坂あり",
      "スピード勝負"
    ],
    paceTendency: "前傾ラップ",
    gateAdvantage: "外枠やや有利",
    runningStyleAdvantage: ["逃げ", "先行"],
    notes: "ダート短距離はスピード勝負"
  },
  
  "中京_ダート_1400": {
    courseId: "中京_ダート_1400",
    racecourse: "中京",
    distance: 1400,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 450,
    coursePattern: "F",
    characteristics: [
      "直線に坂あり",
      "差しも届きやすい"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "総合力が問われる"
  },
  
  "中京_ダート_1800": {
    courseId: "中京_ダート_1800",
    racecourse: "中京",
    distance: 1800,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 250,
    coursePattern: "D",
    characteristics: [
      "チャンピオンズC開催コース",
      "直線に坂あり"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "内枠やや有利",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "チャンピオンズCコース"
  },
  
  "中京_ダート_1900": {
    courseId: "中京_ダート_1900",
    racecourse: "中京",
    distance: 1900,
    surface: "ダート",
    direction: "左回り",
    straightLength: "長い",
    hasSlope: true,
    slopeDescription: "直線に坂あり",
    distanceToFirstCorner: 350,
    coursePattern: "E",
    characteristics: [
      "直線に坂あり",
      "スタミナが必要"
    ],
    paceTendency: "淀みないペース",
    gateAdvantage: "枠順影響少ない",
    runningStyleAdvantage: ["先行", "差し"],
    notes: "スタミナ勝負"
  },
};

// ========================================
// ユーティリティ関数
// ========================================

/**
 * コース特性を取得
 */
export function getCourseCharacteristics(
  racecourse: string,
  surface: TrackSurface | string,
  distance: number,
  trackSize?: string
): CourseCharacteristics | null {
  // 馬場名を正規化
  const normalizedSurface = surface === '芝' ? '芝' : 'ダート';
  
  // コースIDを生成
  let courseId = `${racecourse}_${normalizedSurface}_${distance}`;
  
  // 内回り/外回りがある場合
  if (trackSize === '内回り') {
    const innerCourse = COURSE_DATABASE[`${courseId}_内`];
    if (innerCourse) return innerCourse;
  } else if (trackSize === '外回り') {
    const outerCourse = COURSE_DATABASE[`${courseId}_外`];
    if (outerCourse) return outerCourse;
  }
  
  return COURSE_DATABASE[courseId] || null;
}

/**
 * ペースパターンを予測
 */
export function predictPacePattern(courseData: CourseCharacteristics): string {
  if (courseData.distanceToFirstCorner < 300) {
    return "前傾ラップ（ハイペース）になりやすい";
  } else if (courseData.distanceToFirstCorner > 500) {
    return "前半抑えて後半勝負のラップになりやすい";
  }
  return "標準的なペース配分";
}

/**
 * 全コースのリストを取得
 */
export function getAllCourses(): CourseCharacteristics[] {
  return Object.values(COURSE_DATABASE);
}

/**
 * 競馬場のコースリストを取得
 */
export function getCoursesByRacecourse(racecourse: string): CourseCharacteristics[] {
  return getAllCourses().filter(c => c.racecourse === racecourse);
}

/**
 * 馬場別のコースリストを取得
 */
export function getCoursesBySurface(surface: TrackSurface): CourseCharacteristics[] {
  return getAllCourses().filter(c => c.surface === surface);
}













