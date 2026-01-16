'use client';

import { useState, useEffect } from 'react';
import { useSession } from './Providers';

interface BonusResult {
  success?: boolean;
  alreadyClaimed?: boolean;
  streakCount: number;
  bonusPoints?: number;
  bonusDescription?: string;
  message?: string;
}

export default function LoginBonusPopup() {
  const { status } = useSession();
  const [showPopup, setShowPopup] = useState(false);
  const [bonusResult, setBonusResult] = useState<BonusResult | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      checkAndClaimBonus();
    }
  }, [status]);

  const checkAndClaimBonus = async () => {
    try {
      // まず状態をチェック
      const statusRes = await fetch('/api/user/login-bonus');
      if (!statusRes.ok) return;
      
      const statusData = await statusRes.json();
      
      // 今日まだ受け取っていない場合
      if (!statusData.todayClaimed) {
        setClaiming(true);
        const claimRes = await fetch('/api/user/login-bonus', { method: 'POST' });
        if (claimRes.ok) {
          const result = await claimRes.json();
          setBonusResult(result);
          setShowPopup(true);
        }
        setClaiming(false);
      }
    } catch (error) {
      console.error('Login bonus error:', error);
    }
  };

  if (!showPopup || !bonusResult) return null;

  const streakMilestones = [
    { day: 1, label: '1日' },
    { day: 3, label: '3日' },
    { day: 7, label: '7日' },
    { day: 14, label: '14日' },
    { day: 30, label: '30日' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={() => setShowPopup(false)} />
      
      <div className="relative bg-gradient-to-br from-yellow-400 via-amber-400 to-orange-500 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* キラキラエフェクト */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 left-4 size-2 bg-white rounded-full animate-ping"></div>
          <div className="absolute top-12 right-8 size-1.5 bg-white rounded-full animate-ping" style={{ animationDelay: '0.3s' }}></div>
          <div className="absolute bottom-16 left-12 size-1 bg-white rounded-full animate-ping" style={{ animationDelay: '0.6s' }}></div>
        </div>

        <div className="relative p-6 text-center">
          {/* タイトル */}
          <div className="text-5xl mb-2">🎁</div>
          <h2 className="text-2xl font-bold text-white drop-shadow-lg mb-1">
            ログインボーナス！
          </h2>
          <p className="text-yellow-100 text-sm mb-4">
            {bonusResult.streakCount}日連続ログイン達成！
          </p>

          {/* ポイント表示 */}
          <div className="bg-white/20 backdrop-blur rounded-xl p-4 mb-4">
            <div className="text-5xl font-bold text-white drop-shadow-lg tabular-nums">
              +{bonusResult.bonusPoints}
              <span className="text-2xl ml-1">pt</span>
            </div>
            <p className="text-yellow-100 text-sm mt-1">
              {bonusResult.bonusDescription}
            </p>
          </div>

          {/* 連続ログイン進捗 */}
          <div className="bg-white/10 rounded-lg p-3 mb-4">
            <p className="text-yellow-100 text-xs mb-2">連続ログイン</p>
            <div className="flex justify-between items-center">
              {streakMilestones.map((milestone, idx) => (
                <div key={milestone.day} className="flex flex-col items-center">
                  <div className={`size-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    bonusResult.streakCount >= milestone.day 
                      ? 'bg-white text-amber-500' 
                      : 'bg-white/30 text-white/70'
                  }`}>
                    {bonusResult.streakCount >= milestone.day ? '✓' : milestone.day}
                  </div>
                  <span className="text-[10px] text-yellow-100 mt-1">{milestone.label}</span>
                  {idx < streakMilestones.length - 1 && (
                    <div className="absolute hidden" /> // 線は省略
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 閉じるボタン */}
          <button
            onClick={() => setShowPopup(false)}
            className="w-full py-3 bg-white text-amber-600 rounded-xl font-bold text-lg hover:bg-yellow-50 transition-colors shadow-lg"
          >
            OK！
          </button>
        </div>
      </div>
    </div>
  );
}
