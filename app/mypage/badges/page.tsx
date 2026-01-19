'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface Badge {
  badge_type: string;
  badge_level: string;
  earned_at: string;
}

interface BadgeDefinition {
  name: string;
  levels: {
    level: string;
    label: string;
    requirement: number;
    description: string;
  }[];
}

// レベル別カラースキーム
const LEVEL_COLORS: Record<string, {
  bg: string;
  border: string;
  shadow: string;
  text: string;
  glow: string;
  icon: string;
}> = {
  bronze: {
    bg: 'from-amber-700 via-amber-600 to-amber-800',
    border: 'border-amber-500',
    shadow: 'shadow-amber-500/40',
    text: 'text-amber-100',
    glow: 'shadow-amber-400/50',
    icon: '🥉',
  },
  silver: {
    bg: 'from-slate-300 via-slate-200 to-slate-400',
    border: 'border-slate-300',
    shadow: 'shadow-slate-400/40',
    text: 'text-slate-700',
    glow: 'shadow-slate-300/60',
    icon: '🥈',
  },
  gold: {
    bg: 'from-yellow-400 via-amber-300 to-yellow-500',
    border: 'border-yellow-400',
    shadow: 'shadow-yellow-400/50',
    text: 'text-amber-900',
    glow: 'shadow-yellow-300/70',
    icon: '🥇',
  },
  diamond: {
    bg: 'from-cyan-300 via-sky-200 to-cyan-400',
    border: 'border-cyan-300',
    shadow: 'shadow-cyan-400/60',
    text: 'text-cyan-900',
    glow: 'shadow-cyan-300/80',
    icon: '💎',
  },
};

// プログレスリングSVG
function ProgressRing({ progress, size = 96, strokeWidth = 4, earned }: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  earned: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      {/* 背景リング */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={earned ? 'transparent' : 'rgba(0,0,0,0.1)'}
        strokeWidth={strokeWidth}
      />
      {/* プログレスリング */}
      {!earned && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      )}
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// メダルバッジコンポーネント
function MedalBadge({ 
  level, 
  earned, 
  progress, 
  requirement,
  description,
  index 
}: {
  level: string;
  earned: boolean;
  progress: number;
  requirement: number;
  description: string;
  index: number;
}) {
  const colors = LEVEL_COLORS[level] || LEVEL_COLORS.bronze;
  const progressPercent = Math.min(100, (progress / requirement) * 100);
  const levelName = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
    >
      <motion.div
        className="relative"
        whileHover={earned ? { scale: 1.08, rotate: 3 } : { scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {/* プログレスリング（未獲得時） */}
        <ProgressRing progress={progressPercent} earned={earned} />

        {/* メダル本体 */}
        <div 
          className={`
            relative size-24 rounded-full flex items-center justify-center
            ${earned 
              ? `bg-gradient-to-br ${colors.bg} ${colors.border} border-2 shadow-lg ${colors.shadow}` 
              : 'bg-slate-100 border-2 border-slate-200'
            }
          `}
        >
          {/* 光沢エフェクト（獲得済み） */}
          {earned && (
            <>
              {/* 上部ハイライト */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-transparent to-transparent" />
              {/* シャインアニメーション */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div 
                  className="absolute -inset-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
                  style={{
                    animation: 'shine 3s ease-in-out infinite',
                  }}
                />
              </div>
              {/* 内側の影 */}
              <div className="absolute inset-2 rounded-full shadow-inner" style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.15)' }} />
            </>
          )}

          {/* アイコン */}
          <span 
            className={`text-4xl relative z-10 drop-shadow-md ${!earned && 'grayscale opacity-30'}`}
          >
            {colors.icon}
          </span>

          {/* ロックアイコン（未獲得） */}
          {!earned && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute size-8 bg-slate-300 rounded-full flex items-center justify-center shadow-sm">
                <svg className="size-4 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* 獲得チェックマーク */}
        {earned && (
          <motion.div 
            className={`absolute -top-1 -right-1 size-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ${colors.glow}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2, type: 'spring', stiffness: 500 }}
          >
            <svg className="size-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </motion.div>

      {/* リボン/ラベル */}
      <div className={`
        mt-3 px-4 py-1.5 rounded-full text-xs font-bold
        ${earned 
          ? `bg-gradient-to-r ${colors.bg} ${colors.text} shadow-md` 
          : 'bg-slate-200 text-slate-500'
        }
      `}>
        {levelName}
      </div>

      {/* 説明 */}
      <p className="text-xs text-slate-500 mt-2 text-center max-w-[100px]">
        {description}
      </p>

      {/* 進捗（未獲得時） */}
      {!earned && (
        <div className="mt-1 text-[10px] text-slate-400 tabular-nums font-medium">
          {progress}/{requirement}
        </div>
      )}
    </motion.div>
  );
}

export default function BadgesPage() {
  const { status } = useSession();
  const [earnedBadges, setEarnedBadges] = useState<Badge[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [definitions, setDefinitions] = useState<Record<string, BadgeDefinition>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchBadges();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  const fetchBadges = async () => {
    try {
      const res = await fetch('/api/user/badges');
      if (res.ok) {
        const data = await res.json();
        setEarnedBadges(data.earnedBadges || []);
        setProgress(data.progress || {});
        setDefinitions(data.definitions || {});
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasBadge = (type: string, level: string) => {
    return earnedBadges.some(b => b.badge_type === type && b.badge_level === level);
  };

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <motion.div 
          className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md text-center border border-slate-700"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-white mb-4">ログインが必要です</h1>
          <Link href="/" className="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition-colors">
            トップページへ戻る
          </Link>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="relative">
          <div className="size-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <div className="absolute inset-0 size-16 border-4 border-transparent border-b-emerald-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
      </div>
    );
  }

  const totalEarned = earnedBadges.length;
  const totalBadges = Object.values(definitions).reduce((sum, def) => sum + def.levels.length, 0);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* シャインアニメーション用CSS */}
      <style jsx global>{`
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(-12deg); }
          50%, 100% { transform: translateX(200%) skewX(-12deg); }
        }
      `}</style>

      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <motion.div 
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              🏆 バッジコレクション
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              獲得済み: <span className="text-amber-400 font-bold tabular-nums">{totalEarned}</span> / {totalBadges}
            </p>
          </div>
          <Link 
            href="/mypage" 
            className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-1 transition-colors"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            マイページ
          </Link>
        </motion.div>

        {/* 全体プログレス */}
        <motion.div 
          className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-slate-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-300 font-medium">コレクション進捗</span>
            <span className="text-amber-400 font-bold tabular-nums">
              {Math.round((totalEarned / totalBadges) * 100)}%
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(totalEarned / totalBadges) * 100}%` }}
              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

        {/* バッジカテゴリ */}
        <div className="space-y-8">
          {Object.entries(definitions).map(([type, def], categoryIndex) => (
            <motion.div 
              key={type} 
              className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + categoryIndex * 0.1 }}
            >
              {/* カテゴリヘッダー */}
              <div className="flex items-center gap-3 mb-6">
                <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <span className="text-xl">🎯</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{def.name}</h2>
                  <p className="text-xs text-slate-400">
                    進捗: <span className="text-emerald-400 font-medium tabular-nums">{progress[type] || 0}</span>
                  </p>
                </div>
              </div>

              {/* バッジグリッド */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 justify-items-center">
                {def.levels.map((level, index) => (
                  <MedalBadge
                    key={level.level}
                    level={level.level}
                    earned={hasBadge(type, level.level)}
                    progress={progress[type] || 0}
                    requirement={level.requirement}
                    description={level.description}
                    index={index}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* 空の場合 */}
        {Object.keys(definitions).length === 0 && (
          <motion.div 
            className="bg-slate-800/50 rounded-2xl p-12 text-center border border-slate-700"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="text-5xl">🎖️</span>
            <p className="text-slate-400 mt-4">バッジ情報を読み込み中...</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
