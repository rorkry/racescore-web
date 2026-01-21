'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { getCourseData, COURSE_DATABASE } from '@/lib/course-data/index';
import { normalizeHorseName } from '@/utils/normalize-horse-name';
import { RaceLevelBadge, getLevelScore, getLevelColor, getLevelLabel } from './RaceLevelBadge';

interface RaceLevelInfo {
  level: string;        // "S", "A", "B", "C", "D", "LOW", "UNKNOWN"
  levelLabel: string;   // "S+++", "A+", "C", "UNKNOWN+" など
  totalHorsesRun: number;
  goodRunCount: number;
  winCount: number;
  aiComment?: string;
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  track_condition: string;
  place: string;
  popularity?: string;
  indices?: {
    makikaeshi?: number;
    potential?: number;
  } | null;
  raceLevel?: RaceLevelInfo;
}

interface Horse {
  umaban: string;
  umamei: string;
  kinryo: string;
  kishu: string;
  score: number | null;
  hasData: boolean;
  past: PastRace[];
  memo?: string;  // ユーザーが設定した馬のメモ
}

interface Props {
  horse: Horse | null;
  onClose: () => void;
  raceInfo?: {
    place: string;
    surface: string;
    distance: number;
  };
  timeEvaluation?: string;  // おれAIのタイム評価
  lapEvaluation?: string;   // おれAIのラップ評価
  isPremium?: boolean;      // プレミアム会員かどうか
}

// 競馬場と回り方向のマッピング
const RACECOURSE_DIRECTION: Record<string, '右回り' | '左回り'> = {
  '札幌': '右回り',
  '函館': '右回り',
  '福島': '右回り',
  '新潟': '左回り',
  '東京': '左回り',
  '中山': '右回り',
  '中京': '左回り',
  '京都': '右回り',
  '阪神': '右回り',
  '小倉': '右回り',
};

// 疾走する馬のSVGアイコン
const RunningHorseIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 100 60" className={className} fill="currentColor">
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="horseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4"/>
        <stop offset="100%" stopColor="#a855f7"/>
      </linearGradient>
    </defs>
    <g filter="url(#glow)" fill="url(#horseGradient)">
      <path d="M95 25c-3-2-7-3-10-2l-5-8c-1-2-3-3-5-3h-5l-3-7c-1-2-4-3-6-2l-8 4c-2 1-3 3-2 5l2 5h-8l-15 3c-3 1-5 3-6 6l-4 12c-1 3 0 6 2 8l8 8c2 2 5 3 8 2l12-3 18-2 10 2c3 1 6-1 7-4l3-10c1-3-1-6-3-8l-3-3 3-2c2-1 2-3 0-4zM25 48l-6-6 3-9 8-2 5 12-10 5zm35-3l-15 2-5-15 12-2h13l-5 15zm25-8l-2 6-8-2-2-10 8-3 4 9z"/>
    </g>
  </svg>
);

// 六角形アイコン
const HexagonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_8px_#06b6d4]">
    <path fill="currentColor" d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45v6.74L12 17.82l-6.9-3.45V7.63L12 4.18z"/>
  </svg>
);

// サイバーコーナーブラケット付きカード
const CyberCard = ({ children, className = "", glowColor = "cyan" }: { children: React.ReactNode; className?: string; glowColor?: "cyan" | "purple" | "orange" }) => {
  const colors = {
    cyan: { border: 'border-cyan-500/30', shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]', corner: '#06b6d4' },
    purple: { border: 'border-purple-500/30', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.2)]', corner: '#a855f7' },
    orange: { border: 'border-orange-500/30', shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.2)]', corner: '#f97316' }
  };
  const color = colors[glowColor];
  
  return (
    <div className={`relative bg-black/50 rounded-xl p-3 md:p-4 border ${color.border} ${color.shadow} ${className}`}>
      {/* コーナーブラケット */}
      <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none">
        <svg viewBox="0 0 16 16" className="w-full h-full">
          <path d="M0 0 L0 12 L2 12 L2 2 L12 2 L12 0 Z" fill={color.corner} opacity="0.8" style={{ filter: `drop-shadow(0 0 4px ${color.corner})` }}/>
        </svg>
      </div>
      <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none">
        <svg viewBox="0 0 16 16" className="w-full h-full">
          <path d="M16 0 L16 12 L14 12 L14 2 L4 2 L4 0 Z" fill={color.corner} opacity="0.8" style={{ filter: `drop-shadow(0 0 4px ${color.corner})` }}/>
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none">
        <svg viewBox="0 0 16 16" className="w-full h-full">
          <path d="M0 16 L0 4 L2 4 L2 14 L12 14 L12 16 Z" fill={color.corner} opacity="0.8" style={{ filter: `drop-shadow(0 0 4px ${color.corner})` }}/>
        </svg>
      </div>
      <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none">
        <svg viewBox="0 0 16 16" className="w-full h-full">
          <path d="M16 16 L16 4 L14 4 L14 14 L4 14 L4 16 Z" fill={color.corner} opacity="0.8" style={{ filter: `drop-shadow(0 0 4px ${color.corner})` }}/>
        </svg>
      </div>
      {children}
    </div>
  );
};

// 発光する見出し（左側用 - アイコン付き）
const GlowingTitle = ({ children, icon, color = "cyan" }: { children: React.ReactNode; icon?: React.ReactNode; color?: "cyan" | "purple" | "orange" }) => {
  const colors = {
    cyan: 'text-cyan-300',
    purple: 'text-purple-300',
    orange: 'text-orange-300'
  };
  const shadows = {
    cyan: '0 0 10px rgba(6,182,212,0.7), 0 0 20px rgba(6,182,212,0.3)',
    purple: '0 0 10px rgba(168,85,247,0.7), 0 0 20px rgba(168,85,247,0.3)',
    orange: '0 0 10px rgba(249,115,22,0.7), 0 0 20px rgba(249,115,22,0.3)'
  };
  
  return (
    <h3 
      className={`text-sm font-bold ${colors[color]} mb-2 flex items-center gap-2`}
      style={{ textShadow: shadows[color] }}
    >
      {icon || (
        <span className={`w-1 h-4 rounded-full bg-current drop-shadow-[0_0_6px_currentColor]`} />
      )}
      {children}
    </h3>
  );
};

// 発光する見出し（右側用 - アンダーライン版）
const GlowingTitleRight = ({ children, color = "cyan" }: { children: React.ReactNode; color?: "cyan" | "purple" | "orange" }) => {
  const colors = {
    cyan: 'text-cyan-300',
    purple: 'text-purple-300',
    orange: 'text-orange-300'
  };
  const shadows = {
    cyan: '0 0 10px rgba(6,182,212,0.7), 0 0 20px rgba(6,182,212,0.3)',
    purple: '0 0 10px rgba(168,85,247,0.7), 0 0 20px rgba(168,85,247,0.3)',
    orange: '0 0 10px rgba(249,115,22,0.7), 0 0 20px rgba(249,115,22,0.3)'
  };
  const borderColors = {
    cyan: 'border-cyan-500/50',
    purple: 'border-purple-500/50',
    orange: 'border-orange-500/50'
  };
  const boxShadows = {
    cyan: '0 2px 8px rgba(6,182,212,0.4)',
    purple: '0 2px 8px rgba(168,85,247,0.4)',
    orange: '0 2px 8px rgba(249,115,22,0.4)'
  };
  
  return (
    <h3 
      className={`text-sm font-bold ${colors[color]} mb-2 pb-1 border-b ${borderColors[color]}`}
      style={{ 
        textShadow: shadows[color],
        boxShadow: boxShadows[color]
      }}
    >
      {children}
    </h3>
  );
};

// カスタムツールチップ
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { subject: string; rawValue: number; unit: string } }> }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-black/95 border border-cyan-500/60 rounded-lg px-3 py-2 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
        <p className="text-cyan-300 text-xs font-bold" style={{ textShadow: '0 0 8px rgba(6,182,212,0.6)' }}>{data.subject}</p>
        <p className="text-white text-lg font-black">{data.rawValue.toFixed(1)}{data.unit}</p>
      </div>
    );
  }
  return null;
};


// アニメーション用のバリアント
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 30 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 300 }
  },
  exit: { opacity: 0, scale: 0.95, y: 30 }
};

export default function HorseDetailModal({ horse, onClose, raceInfo, timeEvaluation, lapEvaluation, isPremium = false }: Props) {
  // === ヘルパー関数（メモ化の外で定義） ===
  
  // 全角数字を半角に変換
  const toHalfWidth = (str: string) => {
    return str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  };
  
  const isGoodRun = (position: string) => {
    // 全角数字を半角に変換してからパース
    const normalized = toHalfWidth(String(position || ''));
    const pos = parseInt(normalized);
    return !isNaN(pos) && pos <= 3;
  };

  const getSurface = (distance: string) => {
    if (distance.includes('芝')) return '芝';
    if (distance.includes('ダ')) return 'ダ';
    return '';
  };

  const getDistance = (distance: string) => {
    // "芝1600", "ダ1800", "1600m" などから距離を抽出
    // まず数字部分を全て抽出し、最も長い連続数字を距離とみなす
    const match = distance.match(/(\d{3,4})/);  // 3-4桁の数字を探す
    return match ? parseInt(match[1]) : 0;
  };

  const getTimeDiff = (margin: string) => {
    const m = parseFloat(margin);
    return isNaN(m) ? 0 : m;
  };
  
  // 着度数型: [1着, 2着, 3着, 4着以下]
  type RecordType = [number, number, number, number];
  const emptyRecord = (): RecordType => [0, 0, 0, 0];
  
  // 着順を数値に変換
  const parsePosition = (pos: string | number | undefined): number => {
    if (!pos) return 99;
    const str = toHalfWidth(String(pos)).replace(/[^0-9]/g, '');
    const num = parseInt(str, 10);
    return isNaN(num) ? 99 : num;
  };
  
  // 着度数を更新
  const addToRecord = (record: RecordType, pos: number): RecordType => {
    if (pos === 1) return [record[0] + 1, record[1], record[2], record[3]];
    if (pos === 2) return [record[0], record[1] + 1, record[2], record[3]];
    if (pos === 3) return [record[0], record[1], record[2] + 1, record[3]];
    return [record[0], record[1], record[2], record[3] + 1];
  };
  
  // 着度数を文字列に変換
  const formatRecord = (record: RecordType): string => `${record[0]}.${record[1]}.${record[2]}.${record[3]}`;

  // === メモ化: 過去走の基本分析データ ===
  const analysisData = useMemo(() => {
    try {
    const pastRaces = horse?.past || [];
    
    // コース別成績: 着度数[1着,2着,3着,4着以下]も追加
    const courseMap = new Map<string, { wins: number; total: number; record: RecordType }>();
    const exactMap = new Map<string, { wins: number; total: number; courseName: string; record: RecordType }>();
    
    // 着度数で集計
    let flatRecord: RecordType = emptyRecord();
    let steepRecord: RecordType = emptyRecord();
    let rightTurnRecord: RecordType = emptyRecord();
    let leftTurnRecord: RecordType = emptyRecord();
    let freshRecord: RecordType = emptyRecord();
    let quickRecord: RecordType = emptyRecord();
    
    // 旧変数（互換性維持）
    let flatWins = 0, flatTotal = 0;
    let steepWins = 0, steepTotal = 0;
    let rightTurnWins = 0, rightTurnTotal = 0;
    let leftTurnWins = 0, leftTurnTotal = 0;
    let freshWins = 0, freshTotal = 0;
    let quickWins = 0, quickTotal = 0;
    
    const allComebackIndices: number[] = [];
    const allPotentialData: Array<{ date: string; potential: number }> = [];
    const highComebackRaces: Array<{ date: string; comeback: number }> = [];
    const highPotentialRaces: Array<{ date: string; potential: number }> = [];
    let maxPotential = 0;

    pastRaces.forEach((race, index) => {
      const good = isGoodRun(race.finish_position);
      const pos = parsePosition(race.finish_position);
      const surface = getSurface(race.distance);
      const distanceNum = getDistance(race.distance);

      // 競馬場別成績（着度数追加）
      if (race.place) {
        const cur = courseMap.get(race.place) || { wins: 0, total: 0, record: emptyRecord() };
        courseMap.set(race.place, { 
          wins: cur.wins + (good ? 1 : 0), 
          total: cur.total + 1,
          record: addToRecord(cur.record, pos)
        });
        
        // 回り方向を判定（着度数で集計）
        const direction = RACECOURSE_DIRECTION[race.place];
        if (direction === '右回り') {
          rightTurnTotal++;
          if (good) rightTurnWins++;
          rightTurnRecord = addToRecord(rightTurnRecord, pos);
        } else if (direction === '左回り') {
          leftTurnTotal++;
          if (good) leftTurnWins++;
          leftTurnRecord = addToRecord(leftTurnRecord, pos);
        }
      }

      // 完全一致コース成績（着度数追加）
      if (race.place && surface && distanceNum) {
        const key = `${race.place}_${surface}_${distanceNum}`;
        const cur = exactMap.get(key) || { wins: 0, total: 0, courseName: `${race.place}${surface}${distanceNum}m`, record: emptyRecord() };
        exactMap.set(key, { 
          wins: cur.wins + (good ? 1 : 0), 
          total: cur.total + 1, 
          courseName: cur.courseName,
          record: addToRecord(cur.record, pos)
        });
        
        // コースDBから平坦判定（内回り/外回りのフォールバック付き）
        const normalizedSurface = surface === '芝' ? '芝' : 'ダート';
        let courseData = getCourseData(race.place, normalizedSurface as '芝' | 'ダート', distanceNum);
        
        // コースが見つからない場合、内回り/外回りを試す（京都_芝_1600 → 京都_芝_1600_内 など）
        if (!courseData) {
          courseData = getCourseData(race.place, normalizedSurface as '芝' | 'ダート', distanceNum, '内');
        }
        if (!courseData) {
          courseData = getCourseData(race.place, normalizedSurface as '芝' | 'ダート', distanceNum, '外');
        }
        
        
        if (courseData && !courseData.hasSlope) {
          flatTotal++;
          if (good) flatWins++;
          flatRecord = addToRecord(flatRecord, pos);
        }
        
        // 急坂コース判定（中山・阪神は直線に急坂あり）
        if (race.place === '中山' || race.place === '阪神') {
          steepTotal++;
          if (good) steepWins++;
          steepRecord = addToRecord(steepRecord, pos);
        }
      }

      // 休み明け・叩き成績
      if (index < pastRaces.length - 1) {
        const daysDiff = (new Date(race.date).getTime() - new Date(pastRaces[index + 1].date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff >= 90) {
          freshTotal++;
          if (good) freshWins++;
          freshRecord = addToRecord(freshRecord, pos);
        }
        if (daysDiff <= 30) {
          quickTotal++;
          if (good) quickWins++;
          quickRecord = addToRecord(quickRecord, pos);
        }
      }

      // 指数データ
      if (race.indices?.makikaeshi) {
        allComebackIndices.push(race.indices.makikaeshi);
        if (race.indices.makikaeshi >= 6.0) {
          highComebackRaces.push({ date: race.date, comeback: race.indices.makikaeshi });
        }
      }

      if (race.indices?.potential) {
        allPotentialData.push({ 
          date: new Date(race.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }), 
          potential: race.indices.potential 
        });
        if (race.indices.potential > maxPotential) maxPotential = race.indices.potential;
        if (race.indices.potential >= 6.0) {
          highPotentialRaces.push({ date: race.date, potential: race.indices.potential });
        }
      }
    });

    // 回り適性判定
    const rightTurnRate = rightTurnTotal > 0 ? (rightTurnWins / rightTurnTotal) * 100 : 0;
    const leftTurnRate = leftTurnTotal > 0 ? (leftTurnWins / leftTurnTotal) * 100 : 0;
    
    // 片方を上回っており、かつ70%以上の場合に巧者判定
    const isRightTurnMaster = rightTurnRate >= 70 && rightTurnRate > leftTurnRate && rightTurnTotal >= 2;
    const isLeftTurnMaster = leftTurnRate >= 70 && leftTurnRate > rightTurnRate && leftTurnTotal >= 2;

    // 平坦巧者判定（50%以上）
    const flatRate = flatTotal > 0 ? (flatWins / flatTotal) * 100 : 0;
    const isFlatMaster = flatRate >= 50 && flatTotal >= 2;
    
    // 急坂巧者判定（50%以上、中山・阪神）
    const steepRate = steepTotal > 0 ? (steepWins / steepTotal) * 100 : 0;
    const isSteepMaster = steepRate >= 50 && steepTotal >= 2;

    return {
      pastRaces,
      courseMap,
      exactMap,
      flatWins,
      flatTotal,
      flatRate,
      isFlatMaster,
      flatRecordStr: formatRecord(flatRecord),
      steepWins,
      steepTotal,
      steepRate,
      isSteepMaster,
      steepRecordStr: formatRecord(steepRecord),
      rightTurnWins,
      rightTurnTotal,
      rightTurnRate,
      isRightTurnMaster,
      rightTurnRecordStr: formatRecord(rightTurnRecord),
      leftTurnWins,
      leftTurnTotal,
      leftTurnRate,
      isLeftTurnMaster,
      leftTurnRecordStr: formatRecord(leftTurnRecord),
      freshWins,
      freshTotal,
      freshRecordStr: formatRecord(freshRecord),
      quickWins,
      quickTotal,
      quickRecordStr: formatRecord(quickRecord),
      allComebackIndices,
      allPotentialData,
      highComebackRaces,
      highPotentialRaces,
      maxPotential
    };
    } catch (error) {
      console.error('HorseDetailModal analysisData error:', error);
      return {
        pastRaces: [],
        courseMap: new Map(),
        exactMap: new Map(),
        flatWins: 0, flatTotal: 0, flatRate: 0, isFlatMaster: false, flatRecordStr: '0.0.0.0',
        steepWins: 0, steepTotal: 0, steepRate: 0, isSteepMaster: false, steepRecordStr: '0.0.0.0',
        rightTurnWins: 0, rightTurnTotal: 0, rightTurnRate: 0, isRightTurnMaster: false, rightTurnRecordStr: '0.0.0.0',
        leftTurnWins: 0, leftTurnTotal: 0, leftTurnRate: 0, isLeftTurnMaster: false, leftTurnRecordStr: '0.0.0.0',
        freshWins: 0, freshTotal: 0, freshRecordStr: '0.0.0.0',
        quickWins: 0, quickTotal: 0, quickRecordStr: '0.0.0.0',
        allComebackIndices: [], allPotentialData: [], highComebackRaces: [], highPotentialRaces: [], maxPotential: 0
      };
    }
  }, [horse?.past]);

  // === メモ化: レーダーチャート用指標計算 ===
  const radarMetrics = useMemo(() => {
    try {
    const {
      pastRaces, courseMap, freshWins, freshTotal, quickWins, quickTotal,
      allComebackIndices, maxPotential,
      rightTurnRate, leftTurnRate, isRightTurnMaster, isLeftTurnMaster,
      rightTurnRecordStr, leftTurnRecordStr,
      flatRate, isFlatMaster, flatRecordStr,
      steepRate, isSteepMaster, steepRecordStr,
      freshRecordStr
    } = analysisData;

    // 1. コース適性（基本値）
    const courseStats = Array.from(courseMap.values());
    const bestCourse = [...courseStats].sort((a, b) => {
      const rateA = a.wins / a.total;
      const rateB = b.wins / b.total;
      return rateB - rateA;
    })[0];
    
    let courseRadarValue = 0;
    let courseRate = 0;
    if (bestCourse) {
      courseRate = (bestCourse.wins / bestCourse.total) * 100;
      const totalRaces = bestCourse.total;
      const wins = bestCourse.wins;
      
      // サンプルサイズと好走率の両方を考慮した段階的評価
      // 基本: 好走率をそのまま使用（0-100）
      let baseValue = courseRate;
      
      // サンプルサイズによる信頼性補正
      // - 1走: ×0.4（信頼性低い）
      // - 2走: ×0.6
      // - 3走: ×0.8
      // - 4走以上: ×1.0（フル評価）
      let sampleMultiplier = 0.4;
      if (totalRaces >= 4) sampleMultiplier = 1.0;
      else if (totalRaces >= 3) sampleMultiplier = 0.8;
      else if (totalRaces >= 2) sampleMultiplier = 0.6;
      
      // 好走回数による最低保証（経験値）
      // - 0回: 0pt
      // - 1回: 最低15pt
      // - 2回: 最低25pt
      // - 3回以上: 最低35pt
      let minValue = 0;
      if (wins >= 3) minValue = 35;
      else if (wins >= 2) minValue = 25;
      else if (wins >= 1) minValue = 15;
      
      // 最終値 = max(基本値×信頼性, 最低保証)
      courseRadarValue = Math.max(Math.round(baseValue * sampleMultiplier), minValue);
      
      // 上限100
      courseRadarValue = Math.min(courseRadarValue, 100);
    }

    // 今回のレース情報に基づいてボーナスを適用
    const currentPlace = raceInfo?.place || '';
    const currentDirection = RACECOURSE_DIRECTION[currentPlace];
    const isSteepCourse = currentPlace === '中山' || currentPlace === '阪神';
    
    // 今回のコースが平坦かどうかを判定
    let isCurrentCourseFlat = false;
    if (raceInfo?.place && raceInfo?.surface && raceInfo?.distance) {
      const normalizedSurface = raceInfo.surface === '芝' ? '芝' : 'ダート';
      let courseData = getCourseData(raceInfo.place, normalizedSurface as '芝' | 'ダート', raceInfo.distance);
      if (!courseData) {
        courseData = getCourseData(raceInfo.place, normalizedSurface as '芝' | 'ダート', raceInfo.distance, '内');
      }
      if (!courseData) {
        courseData = getCourseData(raceInfo.place, normalizedSurface as '芝' | 'ダート', raceInfo.distance, '外');
      }
      if (courseData && !courseData.hasSlope) {
        isCurrentCourseFlat = true;
      }
    }

    // 回り適性ボーナス（今回のレースの回り方向と一致する場合のみ適用）
    let turnBonus = 0;
    if (isRightTurnMaster && currentDirection === '右回り') {
      if (rightTurnRate >= 80) turnBonus = 15;
      else if (rightTurnRate >= 75) turnBonus = 10;
      else turnBonus = 5;
    } else if (isLeftTurnMaster && currentDirection === '左回り') {
      if (leftTurnRate >= 80) turnBonus = 15;
      else if (leftTurnRate >= 75) turnBonus = 10;
      else turnBonus = 5;
    }

    // 平坦適性ボーナス（今回のレースが平坦コースの場合のみ適用）
    let flatBonus = 0;
    if (isFlatMaster && isCurrentCourseFlat) {
      if (flatRate >= 80) flatBonus = 20;
      else if (flatRate >= 70) flatBonus = 15;
      else if (flatRate >= 60) flatBonus = 10;
      else flatBonus = 5;
    }

    // 急坂適性ボーナス（今回のレースが中山・阪神の場合のみ適用）
    let steepBonus = 0;
    if (isSteepMaster && isSteepCourse) {
      if (steepRate >= 80) steepBonus = 20;
      else if (steepRate >= 70) steepBonus = 15;
      else if (steepRate >= 60) steepBonus = 10;
      else steepBonus = 5;
    }

    // ボーナスを加算（上限100）
    courseRadarValue = Math.min(courseRadarValue + turnBonus + flatBonus + steepBonus, 100);

    // 2. 巻き返し指数
    const recent3Comeback = allComebackIndices.slice(0, 3);
    const avgComebackIndex = recent3Comeback.length > 0 
      ? recent3Comeback.reduce((sum, val) => sum + val, 0) / recent3Comeback.length 
      : 0;
    const comebackRadarValue = Math.min(avgComebackIndex * 10, 100);
    const isComebackExcellent = avgComebackIndex >= 7.0;

    // 3. ポテンシャル指数
    const potentialRadarValue = Math.min(maxPotential * 10, 100);
    const isPotentialExcellent = maxPotential >= 7.0;

    // 4. 競うスコア
    const scoreValue = horse?.score || 0;
    let scoreRadarValue = 25;
    if (scoreValue >= 70) scoreRadarValue = 100;
    else if (scoreValue >= 60) scoreRadarValue = 85;
    else if (scoreValue >= 50) scoreRadarValue = 65;
    else if (scoreValue >= 40) scoreRadarValue = 45;

    // 5. 近3走レースレベル平均
    const recent3Levels = pastRaces.slice(0, 3)
      .map(r => r.raceLevel?.levelLabel)  // levelLabelを使用（"S+++", "A+" など）
      .filter((l): l is string => !!l && l !== 'UNKNOWN');
    
    const avgLevelScore = recent3Levels.length > 0
      ? recent3Levels.reduce((sum, level) => sum + getLevelScore(level), 0) / recent3Levels.length
      : 40; // デフォルトはC（標準）
    
    const levelRadarValue = avgLevelScore;
    const isHighLevelRaces = avgLevelScore >= 70; // A以上

    return {
      courseRadarValue,
      courseRate,
      turnBonus,
      flatBonus,
      steepBonus,
      comebackRadarValue,
      avgComebackIndex,
      isComebackExcellent,
      potentialRadarValue,
      isPotentialExcellent,
      scoreRadarValue,
      scoreValue,
      levelRadarValue,
      avgLevelScore,
      isHighLevelRaces
    };
    } catch (error) {
      console.error('HorseDetailModal radarMetrics error:', error);
      return {
        courseRadarValue: 0, courseRate: 0, turnBonus: 0, flatBonus: 0, steepBonus: 0,
        comebackRadarValue: 0, avgComebackIndex: 0, isComebackExcellent: false,
        potentialRadarValue: 0, isPotentialExcellent: false,
        scoreRadarValue: 25, scoreValue: 0, levelRadarValue: 40, avgLevelScore: 40, isHighLevelRaces: false
      };
    }
  }, [analysisData, horse?.score, raceInfo]);

  // === メモ化: レーダーチャートデータ ===
  const radarData = useMemo(() => {
    try {
      const { courseRadarValue = 0, courseRate = 0, levelRadarValue = 40, avgLevelScore = 40, comebackRadarValue = 0, avgComebackIndex = 0, potentialRadarValue = 0 } = radarMetrics || {};
      const maxPotential = analysisData?.maxPotential || 0;
      
      return [
        { subject: 'コース適性', value: courseRadarValue, rawValue: courseRate, unit: '%' },
        { subject: 'レースレベル', value: levelRadarValue, rawValue: avgLevelScore, unit: '' },
        { subject: '巻き返し', value: comebackRadarValue, rawValue: avgComebackIndex, unit: '' },
        { subject: 'ポテンシャル', value: potentialRadarValue, rawValue: maxPotential, unit: '' },
      ];
    } catch (error) {
      console.error('HorseDetailModal radarData error:', error);
      return [
        { subject: 'コース適性', value: 0, rawValue: 0, unit: '%' },
        { subject: 'レースレベル', value: 40, rawValue: 40, unit: '' },
        { subject: '巻き返し', value: 0, rawValue: 0, unit: '' },
        { subject: 'ポテンシャル', value: 0, rawValue: 0, unit: '' },
      ];
    }
  }, [radarMetrics, analysisData]);

  // === メモ化: 特性バッジ用の分析結果 ===
  const characteristicData = useMemo(() => {
    try {
    const {
      pastRaces, courseMap, exactMap, 
      flatWins, flatTotal, flatRate, isFlatMaster, flatRecordStr,
      steepWins, steepTotal, steepRate, isSteepMaster, steepRecordStr,
      freshWins, freshTotal, freshRecordStr, 
      highComebackRaces, highPotentialRaces,
      rightTurnWins, rightTurnTotal, rightTurnRate, isRightTurnMaster, rightTurnRecordStr,
      leftTurnWins, leftTurnTotal, leftTurnRate, isLeftTurnMaster, leftTurnRecordStr
    } = analysisData;

    // 得意コース（着度数追加）
    const favoriteCourse = Array.from(courseMap.entries())
      .map(([name, { wins, total, record }]) => ({ 
        courseName: name, 
        wins, 
        total, 
        rate: (wins / total) * 100,
        recordStr: formatRecord(record)
      }))
      .filter(c => c.rate >= 50 && c.total >= 3)
      .sort((a, b) => b.rate - a.rate)[0];

    // 完全一致コース（競馬場＋芝/ダ＋距離）: 2回以上でOK（同条件は稀なので緩和）
    const exactCourse = Array.from(exactMap.values())
      .map(c => ({ 
        ...c, 
        rate: (c.wins / c.total) * 100,
        recordStr: formatRecord(c.record)
      }))
      .filter(c => c.rate >= 50 && c.total >= 2)
      .sort((a, b) => b.rate - a.rate)[0];

    const excellentCourse = favoriteCourse && favoriteCourse.rate >= 80 ? favoriteCourse : 
                            (exactCourse && exactCourse.rate >= 80 ? exactCourse : null);

    // 平坦巧者（DBベースの判定を使用）
    const flatMaster = isFlatMaster ? 
      { wins: flatWins, total: flatTotal, rate: flatRate, record: flatRecordStr } : null;

    // 急坂巧者（中山・阪神）
    const steepMaster = isSteepMaster ? 
      { wins: steepWins, total: steepTotal, rate: steepRate, record: steepRecordStr } : null;

    // 右回り・左回り巧者
    const rightTurnMaster = isRightTurnMaster ? 
      { wins: rightTurnWins, total: rightTurnTotal, rate: rightTurnRate, record: rightTurnRecordStr } : null;
    const leftTurnMaster = isLeftTurnMaster ? 
      { wins: leftTurnWins, total: leftTurnTotal, rate: leftTurnRate, record: leftTurnRecordStr } : null;

    // 休み明け
    const freshRateVal = freshTotal > 0 ? (freshWins / freshTotal) * 100 : 0;
    const restMaster = freshTotal >= 2 && freshRateVal >= 50 ? { wins: freshWins, total: freshTotal, rate: freshRateVal, record: freshRecordStr } : null;
    const restNegative = freshTotal >= 2 && freshRateVal < 20 ? { wins: freshWins, total: freshTotal, rate: freshRateVal, record: freshRecordStr } : null;

    // 現状厳しい
    const recent3 = pastRaces.slice(0, 3);
    const isCurrentlyDifficult = recent3.length === 3 && recent3.every(r => getTimeDiff(r.margin) >= 1.0);

    // メガ指数
    const hasMegaIndex = highComebackRaces.some(r => r.comeback >= 8.0) || highPotentialRaces.some(r => r.potential >= 8.0);
    const megaIndexValue = Math.max(
      ...highComebackRaces.map(r => r.comeback),
      ...highPotentialRaces.map(r => r.potential),
      0
    );

    return {
      favoriteCourse,
      exactCourse,
      excellentCourse,
      flatMaster,
      steepMaster,
      rightTurnMaster,
      leftTurnMaster,
      restMaster,
      restNegative,
      isCurrentlyDifficult,
      hasMegaIndex,
      megaIndexValue
    };
    } catch (error) {
      console.error('HorseDetailModal characteristicData error:', error);
      return {
        favoriteCourse: null, exactCourse: null, excellentCourse: null, 
        flatMaster: null, steepMaster: null,
        rightTurnMaster: null, leftTurnMaster: null, restMaster: null, restNegative: null,
        isCurrentlyDifficult: false, hasMegaIndex: false, megaIndexValue: 0
      };
    }
  }, [analysisData]);

  // 早期リターン（Hooks の後に配置）
  if (!horse) return null;

  // 描画用に変数を展開
  const { pastRaces } = analysisData;
  const { avgComebackIndex, isComebackExcellent, isHighLevelRaces } = radarMetrics;
  const { favoriteCourse, excellentCourse, flatMaster, steepMaster, rightTurnMaster, leftTurnMaster, restMaster, restNegative, isCurrentlyDifficult, hasMegaIndex, megaIndexValue } = characteristicData;
  const hasAnyData = pastRaces.length > 0;

  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
      >
        {/* 背景画像 + オーバーレイ */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/スクリーンショット 2026-01-15 020422.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15
          }}
        />
        <div className="absolute inset-0 bg-black/80" />
        
        <motion.div 
          className="relative w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl border border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.3),0_0_80px_rgba(168,85,247,0.15)]"
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, rgba(10, 15, 30, 0.98) 0%, rgba(20, 40, 70, 0.98) 50%, rgba(40, 30, 80, 0.98) 100%)',
          }}
        >
          {/* ヘッダー */}
          <div className="px-4 py-3 border-b border-cyan-500/30 flex items-center justify-between">
            <div>
              <h2 
                className="text-xl md:text-2xl font-black text-white"
                style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)' }}
              >
                {normalizeHorseName(horse.umamei)}
              </h2>
              <p className="text-cyan-300/70 text-xs font-mono">
                {horse.kishu} / {horse.kinryo}kg
              </p>
            </div>
            <motion.button 
              className="w-10 h-10 rounded-full bg-black/50 text-cyan-400 text-xl flex items-center justify-center border border-cyan-500/40 hover:bg-cyan-500/20 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90, boxShadow: '0 0 25px rgba(6,182,212,0.5)' }}
              whileTap={{ scale: 0.9 }}
            >
              ×
            </motion.button>
          </div>

          {/* メインコンテンツ */}
          <div className="p-3 md:p-4">
            {hasAnyData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                
                {/* 左カラム: レーダーチャート */}
                <CyberCard glowColor="cyan">
                  <GlowingTitle icon={<HexagonIcon />} color="cyan">
                    能力レーダー
                    {(isComebackExcellent || isHighLevelRaces) && (
                      <span className="text-xs px-2 py-0.5 bg-orange-500/20 border border-orange-500/40 rounded-full text-orange-300 ml-2 animate-pulse">
                        優秀
                      </span>
                    )}
                  </GlowingTitle>
                  
                  <div className="h-48 md:h-56">
                    <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={0}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(6, 182, 212, 0.25)" strokeWidth={1} />
                        <PolarAngleAxis 
                          dataKey="subject" 
                          tick={{ fill: '#06b6d4', fontSize: 10, fontWeight: 700 }}
                          style={{ filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.5))' }}
                        />
                        <PolarRadiusAxis 
                          angle={90} 
                          domain={[0, 100]} 
                          tick={{ fill: '#475569', fontSize: 8 }}
                          tickCount={5}
                        />
                        <Radar
                          name="能力値"
                          dataKey="value"
                          stroke={isComebackExcellent || isHighLevelRaces ? "#f97316" : "#06b6d4"}
                          fill="url(#radarGradient)"
                          fillOpacity={0.5}
                          strokeWidth={2}
                          style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.4))' }}
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <defs>
                          <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.7}/>
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.7}/>
                          </linearGradient>
                        </defs>
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* 巻き返し指数カード */}
                  {avgComebackIndex > 0 && (
                    <div className={`mt-3 p-2 rounded-lg border ${isComebackExcellent ? 'bg-orange-500/10 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold" style={{ color: isComebackExcellent ? '#fdba74' : '#67e8f9', textShadow: isComebackExcellent ? '0 0 8px rgba(249,115,22,0.6)' : '0 0 8px rgba(6,182,212,0.4)' }}>
                          {isComebackExcellent ? '🔥' : '🔄'} 巻き返し指数
                        </span>
                        <span className={`text-lg font-black ${isComebackExcellent ? 'text-orange-300' : 'text-white'}`} style={{ textShadow: isComebackExcellent ? '0 0 10px rgba(249,115,22,0.5)' : 'none' }}>
                          {avgComebackIndex.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* おれAI分析 */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-orange-300" style={{ textShadow: '0 0 8px rgba(249,115,22,0.6)' }}>
                        🤖 おれAI分析
                      </span>
                      {!isPremium && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-600/50 border border-slate-500/50 rounded text-slate-400">
                          🔒 プレミアム限定
                        </span>
                      )}
                    </div>
                    
                    {isPremium ? (
                      (timeEvaluation || lapEvaluation) ? (
                        <div className="space-y-2">
                          {timeEvaluation && (
                            <div className="p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/30">
                              <div className="flex items-start gap-2">
                                <span className="text-emerald-400 shrink-0">⏱️</span>
                                <span className="text-xs text-emerald-200 leading-relaxed">{timeEvaluation}</span>
                              </div>
                            </div>
                          )}
                          {lapEvaluation && (
                            <div className="p-2 rounded-lg border bg-purple-500/10 border-purple-500/30">
                              <div className="flex items-start gap-2">
                                <span className="text-purple-400 shrink-0">📊</span>
                                <span className="text-xs text-purple-200 leading-relaxed">{lapEvaluation}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg border bg-slate-700/30 border-slate-600/30">
                          <p className="text-xs text-slate-400 italic">分析データがありません</p>
                        </div>
                      )
                    ) : (
                      <div className="p-3 rounded-lg border bg-slate-800/50 border-slate-600/30 text-center">
                        <p className="text-xs text-slate-400 mb-2">タイム評価・ラップ評価はプレミアム機能です</p>
                        <p className="text-[10px] text-slate-500">マイページからプレミアムにアップグレードしてください</p>
                      </div>
                    )}
                  </div>
                </CyberCard>

                {/* 右カラム: 近5走レースレベル + 特性 */}
                <div className="space-y-3">
                  {/* 近5走レースレベル */}
                  <CyberCard glowColor="purple">
                    <GlowingTitleRight color="purple">
                      近5走レースレベル
                      {isHighLevelRaces && (
                        <span className="text-xs px-2 py-0.5 bg-amber-500/30 border border-amber-500/50 rounded-full ml-2 shadow-[0_0_10px_rgba(245,158,11,0.4)]">
                          高レベル戦続き
                        </span>
                      )}
                    </GlowingTitleRight>
                    
                    {pastRaces.length > 0 ? (
                      <div className="space-y-1.5">
                        {pastRaces.slice(0, 5).map((race, index) => {
                          const levelLabel = race.raceLevel?.levelLabel || 'UNKNOWN';
                          const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
                          // 日付をYYYY/MM/DD形式に変換
                          const dateStr = race.date 
                            ? race.date.replace(/\./g, '/').replace(/\s/g, '') 
                            : '';
                          const marginFloat = parseFloat(race.margin);
                          const marginText = !isNaN(marginFloat) 
                            ? marginFloat > 0 ? `+${marginFloat.toFixed(1)}` : `${marginFloat.toFixed(1)}`
                            : '';
                          const position = toHalfWidth(race.finish_position || '');
                          const popularity = race.popularity ? toHalfWidth(race.popularity) : '';
                          
                          return (
                            <div 
                              key={index}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-black/30 border border-slate-700/50"
                            >
                              {/* 走順ラベル */}
                              <span className="text-[10px] text-slate-500 w-8 shrink-0">{raceLabel}</span>
                              
                              {/* 日付 YYYY/MM/DD */}
                              <span className="text-[10px] text-slate-400 w-20 shrink-0 tabular-nums">{dateStr}</span>
                              
                              {/* レースレベルバッジ（固定幅で統一） */}
                              <div className="w-16 shrink-0">
                                <RaceLevelBadge level={levelLabel} size="sm" className="w-full justify-center" />
                              </div>
                              
                              {/* 人気 */}
                              <span className="text-[10px] text-slate-400 w-8 shrink-0 text-center tabular-nums">
                                {popularity ? `${popularity}人` : '-'}
                              </span>
                              
                              {/* 着順 */}
                              <span className={`text-[10px] w-8 shrink-0 text-center font-bold tabular-nums ${
                                parseInt(position) <= 3 ? 'text-amber-400' : 'text-slate-300'
                              }`}>
                                {position ? `${position}着` : '-'}
                              </span>
                              
                              {/* 着差 */}
                              <span className={`text-[10px] font-mono w-10 shrink-0 text-right tabular-nums ${
                                marginFloat <= 0.3 ? 'text-green-400' : marginFloat >= 1.0 ? 'text-red-400' : 'text-slate-400'
                              }`}>
                                {marginText}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-20 flex items-center justify-center text-purple-300/50 text-xs">
                        過去走データなし
                      </div>
                    )}
                  </CyberCard>

                  {/* 特性バッジ */}
                  <CyberCard glowColor="cyan">
                    <GlowingTitleRight color="cyan">
                      特性
                    </GlowingTitleRight>
                    <div className="flex flex-wrap gap-1.5">
                      {excellentCourse && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.3)]">
                          👑 {excellentCourse.courseName}パーフェクト ({excellentCourse.recordStr})
                        </span>
                      )}
                      {favoriteCourse && !excellentCourse && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300">
                          🎯 {favoriteCourse.courseName}巧者 ({favoriteCourse.recordStr})
                        </span>
                      )}
                      {flatMaster && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 border border-green-500/40 text-green-300">
                          🏃 平坦巧者 ({flatMaster.record})
                        </span>
                      )}
                      {steepMaster && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300">
                          ⛰️ 急坂巧者 ({steepMaster.record})
                        </span>
                      )}
                      {rightTurnMaster && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
                          ↻ 右回り巧者 ({rightTurnMaster.record})
                        </span>
                      )}
                      {leftTurnMaster && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                          ↺ 左回り巧者 ({leftTurnMaster.record})
                        </span>
                      )}
                      {restMaster && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300">
                          ⚡ 鉄砲巧者 ({restMaster.record})
                        </span>
                      )}
                      {restNegative && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 border border-red-500/40 text-red-300">
                          ⚠️ 休み明け注意 ({restNegative.record})
                        </span>
                      )}
                      {isCurrentlyDifficult && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-500/20 border border-slate-500/40 text-slate-400">
                          😓 現状厳しい
                        </span>
                      )}
                      {hasMegaIndex && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/30 border border-red-500/60 text-red-200 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                          🔥 異次元 {megaIndexValue.toFixed(1)}
                        </span>
                      )}
                      {!excellentCourse && !favoriteCourse && !flatMaster && !steepMaster && !rightTurnMaster && !leftTurnMaster && !restMaster && !restNegative && !isCurrentlyDifficult && !hasMegaIndex && (
                        <span className="px-2 py-1 text-xs text-slate-500">
                          特筆すべき特性なし
                        </span>
                      )}
                    </div>
                  </CyberCard>

                  {/* マイメモ */}
                  <CyberCard glowColor="cyan">
                    <GlowingTitleRight color="cyan">
                      📝 マイメモ
                    </GlowingTitleRight>
                    {horse.memo ? (
                      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {horse.memo}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        メモが設定されていません
                      </p>
                    )}
                  </CyberCard>
                </div>
              </div>
            ) : (
              /* データなし画面 */
              <div className="py-12 text-center">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 text-cyan-400"
                  animate={{ x: [-10, 10, -10] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ filter: 'drop-shadow(0 0 15px rgba(6,182,212,0.5))' }}
                >
                  <RunningHorseIcon className="w-full h-full" />
                </motion.div>
                <h3 
                  className="text-lg font-bold text-white mb-2" 
                  style={{ fontFamily: 'monospace', textShadow: '0 0 15px rgba(6,182,212,0.5)' }}
                >
                  十分な過去走データがありません
                </h3>
                <p className="text-cyan-300/60 text-sm">
                  <span className="animate-pulse">●</span> データ収集中...
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
