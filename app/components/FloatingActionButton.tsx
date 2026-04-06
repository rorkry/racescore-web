'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import AIChatPanel from './AIChatPanel';
import TodayAlertsPanel from './TodayAlertsPanel';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  description?: string;
  isActive?: boolean;
  locked?: boolean;  // プレミアム限定でロック中
}

// グローバル状態管理用のカスタムイベント
export const FEATURE_TOGGLE_EVENT = 'featureToggle';

export interface FeatureToggleEvent {
  featureId: string;
  isActive: boolean;
}

// グローバルなアクティブ機能の状態を保持（window経由で共有）
declare global {
  interface Window {
    __activeFeatures?: Set<string>;
    __currentRaceContext?: {
      year: number;
      date: string;
      place: string;
      raceNumber: number;
    } | null;
  }
}

// 機能の表示状態を取得するヘルパー
export function useFeatureAccess(featureId: string): boolean {
  // 初期値はグローバル状態またはlocalStorageから取得
  const [isActive, setIsActive] = useState(() => {
    if (typeof window !== 'undefined') {
      // まずグローバル変数をチェック
      if (window.__activeFeatures) {
        return window.__activeFeatures.has(featureId);
      }
      // グローバル変数がなければlocalStorageから復元
      const saved = loadSavedFeatures();
      if (saved.size > 0) {
        window.__activeFeatures = saved;
        return saved.has(featureId);
      }
    }
    return false;
  });

  useEffect(() => {
    // マウント時にグローバル状態またはlocalStorageを確認
    if (typeof window !== 'undefined') {
      if (window.__activeFeatures) {
        setIsActive(window.__activeFeatures.has(featureId));
      } else {
        const saved = loadSavedFeatures();
        if (saved.size > 0) {
          window.__activeFeatures = saved;
          setIsActive(saved.has(featureId));
        }
      }
    }

    const handleToggle = (event: CustomEvent<FeatureToggleEvent>) => {
      if (event.detail.featureId === featureId) {
        setIsActive(event.detail.isActive);
      }
    };

    window.addEventListener(FEATURE_TOGGLE_EVENT, handleToggle as EventListener);
    return () => window.removeEventListener(FEATURE_TOGGLE_EVENT, handleToggle as EventListener);
  }, [featureId]);

  return isActive;
}

interface RaceContext {
  year: number;
  date: string;
  place: string;
  raceNumber: number;
  baba?: string;
  pace?: string;
}

interface FloatingActionButtonProps {
  menuItems?: MenuItem[];
  raceContext?: RaceContext | null;
}

const STORAGE_KEY = 'stride_active_features';

// localStorageから保存済みの状態を復元
function loadSavedFeatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {
    // localStorageエラーは無視
  }
  return new Set();
}

// localStorageに状態を保存
function saveFeatures(features: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...features]));
  } catch {
    // localStorageエラーは無視
  }
}

export default function FloatingActionButton({ menuItems = [], raceContext: propRaceContext }: FloatingActionButtonProps) {
  const pathname = usePathname();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false); // チャットパネルの開閉状態を分離
  const [isAlertsOpen, setIsAlertsOpen] = useState(false); // 今日の注目馬パネル
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [activeFeatures, setActiveFeatures] = useState<Set<string>>(() => {
    // 初期状態をlocalStorageとグローバル変数から取得
    if (typeof window !== 'undefined') {
      const saved = loadSavedFeatures();
      window.__activeFeatures = saved;
      return saved;
    }
    return new Set();
  });
  const [isPremium, setIsPremium] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // プレミアム状態を取得（グローバル設定 + 個人のプレミアム状態）
  useEffect(() => {
    const checkPremium = async () => {
      try {
        // 1. グローバル設定を確認（全員プレミアム開放中か）
        const globalRes = await fetch('/api/settings/global');
        console.log('[FAB] Global settings response status:', globalRes.status);
        if (globalRes.ok) {
          const globalData = await globalRes.json();
          console.log('[FAB] Global settings data:', globalData);
          if (globalData.premiumForAll) {
            console.log('[FAB] Premium for all is ON, setting isPremium=true');
            setIsPremium(true);
            return; // 全員開放中なら個人確認不要
          }
        }
        
        // 2. 個人のプレミアム状態を確認
        const res = await fetch('/api/user/favorites');
        console.log('[FAB] User favorites response status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('[FAB] User premium status:', data.isPremium);
          setIsPremium(!!data.isPremium);
        }
        // 401（未ログイン）やその他エラーはisPremium=falseのまま
      } catch (e) {
        console.error('[FAB] Error checking premium:', e);
        // ネットワークエラー時もプレミアムでないとみなす
      }
    };
    checkPremium();
  }, []);

  // 機能のトグル
  const toggleFeature = useCallback((featureId: string, isLocked: boolean) => {
    // ロック中（プレミアム限定）の場合はトグルしない
    if (isLocked) {
      // ロック中のアイテムをクリックした場合、メニューは閉じない
      return;
    }

    // 現在の状態を取得して、次の状態を計算
    const willBeActive = !activeFeatures.has(featureId);
    
    // 状態を更新（グローバル変数も同期 + localStorage保存）
    setActiveFeatures(prev => {
      const newSet = new Set(prev);
      if (willBeActive) {
        newSet.add(featureId);
      } else {
        newSet.delete(featureId);
      }
      // グローバル変数を更新してuseFeatureAccessと共有
      if (typeof window !== 'undefined') {
        window.__activeFeatures = newSet;
      }
      // localStorageに保存（ログアウトまで維持）
      saveFeatures(newSet);
      return newSet;
    });
    
    // イベント発行を次のティックに遅延（レンダリング中のsetState回避）
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent<FeatureToggleEvent>(FEATURE_TOGGLE_EVENT, {
        detail: { featureId, isActive: willBeActive }
      }));
      
      // 有効にした場合、スクロール
      if (willBeActive) {
        const element = document.getElementById(`${featureId}-card`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 0);
    
    setIsOpen(false);
  }, [activeFeatures]);

  // URLパラメータからraceContextを取得（/cardページの場合）
  const [raceContext, setRaceContext] = useState<RaceContext | null>(propRaceContext || null);
  
  // raceContextを取得する関数（グローバル変数 or URLパラメータ）
  const updateRaceContext = useCallback(() => {
    if (propRaceContext) {
      console.log('[FAB] Using propRaceContext:', propRaceContext);
      setRaceContext(propRaceContext);
      return;
    }
    
    if (typeof window !== 'undefined') {
      // 1. まずグローバル変数をチェック（レースカードページが設定）
      if (window.__currentRaceContext) {
        console.log('[FAB] Using global raceContext:', window.__currentRaceContext);
        setRaceContext(window.__currentRaceContext);
        return;
      }
      
      // 2. URLパラメータをチェック（フォールバック）
      const params = new URLSearchParams(window.location.search);
      const year = params.get('year');
      const date = params.get('date');
      const place = params.get('place');
      const raceNo = params.get('race');
      
      if (year && date && place && raceNo) {
        const ctx = {
          year: parseInt(year, 10),
          date,
          place,
          raceNumber: parseInt(raceNo, 10),
        };
        console.log('[FAB] Using URL params:', ctx);
        setRaceContext(ctx);
        return;
      }
      
      console.log('[FAB] No raceContext available');
      setRaceContext(null);
    }
  }, [propRaceContext]);
  
  // URLパラメータを定期的にチェック（SPAでのルーティング対応）
  useEffect(() => {
    // 初回実行
    updateRaceContext();
    
    // URLが変わった場合にも更新（pushStateイベントを監視）
    const handlePopState = () => updateRaceContext();
    window.addEventListener('popstate', handlePopState);
    
    return () => window.removeEventListener('popstate', handlePopState);
  }, [updateRaceContext]);

  // デフォルトメニュー項目（トグルのみ、AIチャットは常時表示）
  const defaultMenuItems: MenuItem[] = [
    {
      id: 'race-pace',
      label: '展開予想カード',
      icon: '',
      description: isPremium ? 'レース展開を予想' : 'プレミアム限定',
      isActive: activeFeatures.has('race-pace'),
      locked: !isPremium,
    },
    {
      id: 'saga-ai',
      label: 'おれAI',
      icon: '',
      description: isPremium ? 'AI分析を表示' : 'プレミアム限定',
      isActive: activeFeatures.has('saga-ai'),
      locked: !isPremium,
    },
    ...menuItems.map(item => ({
      ...item,
      isActive: activeFeatures.has(item.id),
    })),
  ];

  // 5秒ごとに控えめなアニメーション
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 600);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // メニュー外クリックで閉じる（チャットパネル内のクリックは除外）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // FABボタン、メニュー、チャットパネル内のクリックは無視
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (chatRef.current?.contains(target)) return;
      
      // それ以外の場所をクリックしたら閉じる
      setIsOpen(false);
      setIsChatOpen(false);
    };

    if (isOpen || isChatOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, isChatOpen]);

  return (
    <>
      <style jsx>{`
        .fab-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
        }

        @media (max-width: 640px) {
          .fab-container {
            bottom: 16px;
            right: 16px;
          }
        }

        .fab-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid rgba(229, 231, 235, 0.8);
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.08), 
            0 2px 4px rgba(0, 0, 0, 0.04),
            0 0 0 1px rgba(0, 0, 0, 0.02);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .fab-button:hover {
          transform: scale(1.05);
          box-shadow: 
            0 6px 16px rgba(0, 0, 0, 0.12), 
            0 3px 6px rgba(0, 0, 0, 0.08),
            0 0 0 1px rgba(0, 0, 0, 0.04);
          border-color: rgba(209, 213, 219, 0.9);
        }

        .fab-button:active {
          transform: scale(0.95);
        }

        .fab-button.open {
          transform: rotate(45deg);
        }

        .fab-icon {
          width: 32px;
          height: 32px;
          object-fit: contain;
          transition: transform 0.3s ease;
        }

        .fab-icon.animating {
          animation: gentleWiggle 0.6s ease-in-out;
        }

        @keyframes gentleWiggle {
          0%, 100% {
            transform: translateX(0) rotate(0deg);
          }
          25% {
            transform: translateX(-2px) rotate(-2deg);
          }
          75% {
            transform: translateX(2px) rotate(2deg);
          }
        }

        .fab-menu {
          position: absolute;
          bottom: 72px;
          right: 0;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1);
          min-width: 240px;
          padding: 8px;
          opacity: 0;
          transform: translateY(10px) scale(0.95);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
          border: 1px solid #e5e7eb;
        }

        .fab-menu.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .fab-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
        }

        .fab-menu-item:hover {
          background-color: #f3f4f6;
        }

        .fab-menu-item.active {
          background-color: #ecfdf5;
          border-left: 3px solid #10b981;
        }

        .fab-menu-item.locked {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .fab-menu-item.locked:hover {
          background-color: transparent;
        }

        .fab-menu-item-icon {
          font-size: 20px;
          width: 24px;
          text-align: center;
        }

        .fab-menu-item-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .fab-menu-item-label {
          font-weight: 600;
        }

        .fab-menu-item-description {
          font-size: 11px;
          color: #6b7280;
        }

        .fab-menu-item-status {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }

        .fab-menu-item-status.active {
          background-color: #d1fae5;
          color: #065f46;
        }

        .fab-menu-item-status.inactive {
          background-color: #f3f4f6;
          color: #6b7280;
        }

        .fab-menu-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 4px;
        }

        .fab-menu-title {
          font-size: 12px;
          font-weight: 700;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="fab-container">
        {/* メニューリスト */}
        <div ref={menuRef} className={`fab-menu ${isOpen ? 'open' : ''}`}>
          {/* 今日の注目馬ボタン */}
          <div
            className="fab-menu-item"
            style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}
            onClick={() => { setIsAlertsOpen(true); setIsOpen(false); setIsChatOpen(false); }}
          >
            <span className="fab-menu-item-icon">🔔</span>
            <div className="fab-menu-item-content">
              <span className="fab-menu-item-label">今日の注目馬</span>
              <span className="fab-menu-item-description">お気に入り・メモ馬の出走確認</span>
            </div>
            <span className="fab-menu-item-status inactive">▶</span>
          </div>

          <div className="fab-menu-header">
            <span className="fab-menu-title">🔒 プレミアム機能</span>
          </div>
          {defaultMenuItems.map((item) => (
            <div
              key={item.id}
              className={`fab-menu-item ${item.isActive ? 'active' : ''} ${item.locked ? 'locked' : ''}`}
              onClick={() => toggleFeature(item.id, !!item.locked)}
            >
              {item.locked && <span className="fab-menu-item-icon">🔒</span>}
              <div className="fab-menu-item-content">
                <span className="fab-menu-item-label">{item.label}</span>
                {item.description && (
                  <span className="fab-menu-item-description">{item.description}</span>
                )}
              </div>
              <span className={`fab-menu-item-status ${item.isActive ? 'active' : 'inactive'}`}>
                {item.locked ? '🔒' : (item.isActive ? 'ON' : 'OFF')}
              </span>
            </div>
          ))}
        </div>

        {/* FABボタン */}
        <button
          ref={buttonRef}
          className={`fab-button ${isOpen ? 'open' : ''}`}
          onClick={() => {
            const newOpen = !isOpen;
            // 開く時にraceContextを更新
            if (newOpen) {
              updateRaceContext();
            }
            setIsOpen(newOpen);
            setIsChatOpen(newOpen);
          }}
          aria-label="メニューを開く"
        >
          {/* ロゴ画像（存在する場合）またはプレースホルダー */}
          {!imageError ? (
            <img
              src="/KRMロゴ1.jpg"
              alt="KRM"
              className={`fab-icon ${isAnimating ? 'animating' : ''}`}
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className={`fab-icon ${isAnimating ? 'animating' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#374151',
              }}
            >
              🦁
            </div>
          )}
        </button>
      </div>

      {/* AIチャットパネル */}
      <AIChatPanel
        ref={chatRef}
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          setIsOpen(false);
        }}
        raceContext={raceContext}
        isPremium={isPremium}
        activeFeatures={activeFeatures}
        onToggleFeature={toggleFeature}
      />

      {/* 今日の注目馬パネル */}
      <TodayAlertsPanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />
    </>
  );
}

