'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

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
  }
}

// 機能の表示状態を取得するヘルパー
export function useFeatureAccess(featureId: string): boolean {
  // 初期値はグローバル状態から取得（存在すれば）
  const [isActive, setIsActive] = useState(() => {
    if (typeof window !== 'undefined' && window.__activeFeatures) {
      return window.__activeFeatures.has(featureId);
    }
    return false;
  });

  useEffect(() => {
    // マウント時にもグローバル状態を確認
    if (typeof window !== 'undefined' && window.__activeFeatures) {
      setIsActive(window.__activeFeatures.has(featureId));
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

interface FloatingActionButtonProps {
  menuItems?: MenuItem[];
}

export default function FloatingActionButton({ menuItems = [] }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [activeFeatures, setActiveFeatures] = useState<Set<string>>(() => {
    // 初期状態をグローバル変数からも取得（ページ遷移時の状態保持）
    if (typeof window !== 'undefined') {
      if (!window.__activeFeatures) {
        window.__activeFeatures = new Set();
      }
      return window.__activeFeatures;
    }
    return new Set();
  });
  const [isPremium, setIsPremium] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // プレミアム状態を取得
  useEffect(() => {
    const checkPremium = async () => {
      try {
        const res = await fetch('/api/user/favorites');
        if (res.ok) {
          const data = await res.json();
          setIsPremium(!!data.isPremium);
        }
        // 401（未ログイン）やその他エラーはisPremium=falseのまま
      } catch {
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
    
    // 状態を更新（グローバル変数も同期）
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

  // デフォルトメニュー項目
  const defaultMenuItems: MenuItem[] = [
    {
      id: 'race-pace',
      label: '展開予想カード',
      icon: '🏇',
      description: isPremium ? 'レース展開を予想' : 'プレミアム限定',
      isActive: activeFeatures.has('race-pace'),
      locked: !isPremium,
    },
    {
      id: 'saga-ai',
      label: 'おれAI',
      icon: '🧠',
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

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

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
          <div className="fab-menu-header">
            <span className="fab-menu-title">🔒 プレミアム機能</span>
          </div>
          {defaultMenuItems.map((item) => (
            <div
              key={item.id}
              className={`fab-menu-item ${item.isActive ? 'active' : ''} ${item.locked ? 'locked' : ''}`}
              onClick={() => toggleFeature(item.id, !!item.locked)}
            >
              <span className="fab-menu-item-icon">{item.locked ? '🔒' : item.icon}</span>
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
          onClick={() => setIsOpen(!isOpen)}
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
    </>
  );
}

