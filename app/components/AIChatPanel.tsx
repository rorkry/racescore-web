'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface RaceContext {
  year: number;
  date: string;
  place: string;
  raceNumber: number;
  baba?: string;
  pace?: string;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  raceContext?: RaceContext | null;
  isPremium: boolean;
  activeFeatures?: Set<string>;
  onToggleFeature?: (featureId: string, isLocked: boolean) => void;
}

const AIChatPanel = forwardRef<HTMLDivElement, AIChatPanelProps>(function AIChatPanel(
  { isOpen, onClose, raceContext, isPremium, activeFeatures, onToggleFeature },
  ref
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初回表示時のウェルカムメッセージ
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: raceContext 
          ? `${raceContext.place} ${raceContext.raceNumber}Rの予想をお手伝いします。\n「予想」と入力するとAI予想を生成します。`
          : '競馬に関する質問にお答えします。\nレースカードを開いた状態で「予想」と入力すると、AI予想を生成します。',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, raceContext]);

  // メッセージ追加時に自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // パネルが開いたときにinputにフォーカス
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // メッセージ送信
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          raceContext,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'エラーが発生しました');
      }
      
      // AI応答を追加
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.prediction || data.answer || '応答を生成できませんでした。',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // 分析結果があれば追加
      if (data.analysis) {
        const { overvalued, undervalued } = data.analysis;
        if (overvalued?.length > 0 || undervalued?.length > 0) {
          const analysisMessage: Message = {
            id: `analysis-${Date.now()}`,
            role: 'assistant',
            content: `【分析】\n${overvalued?.length > 0 ? `過大評価: ${overvalued.join(', ')}\n` : ''}${undervalued?.length > 0 ? `過小評価: ${undervalued.join(', ')}` : ''}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, analysisMessage]);
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, raceContext]);

  // Enterキーで送信
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style jsx>{`
        .chat-panel {
          position: fixed;
          bottom: 90px;
          right: 24px;
          width: 380px;
          max-width: calc(100vw - 48px);
          height: 500px;
          max-height: calc(100vh - 120px);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          z-index: 1001;
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }

        @media (max-width: 640px) {
          .chat-panel {
            bottom: 80px;
            right: 16px;
            left: 16px;
            width: auto;
            height: 60vh;
          }
        }

        .chat-header {
          padding: 16px;
          background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .chat-header-title {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chat-header-subtitle {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 2px;
        }

        .chat-close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: background 0.2s;
        }

        .chat-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .message.user {
          align-self: flex-end;
          background: #1e3a5f;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.assistant {
          align-self: flex-start;
          background: #f3f4f6;
          color: #1f2937;
          border-bottom-left-radius: 4px;
        }

        .chat-input-container {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          background: #fafafa;
        }

        .chat-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
          color: #000000;
          background: #ffffff;
        }

        .chat-input::placeholder {
          color: #9ca3af;
        }

        .chat-input:focus {
          border-color: #1e3a5f;
        }

        .chat-input:disabled {
          background: #f3f4f6;
          color: #6b7280;
        }

        .chat-send {
          padding: 10px 16px;
          background: #1e3a5f;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 60px;
        }

        .chat-send:hover:not(:disabled) {
          background: #2d5a87;
        }

        .chat-send:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .loading-dots {
          display: flex;
          gap: 4px;
          padding: 8px 0;
        }

        .loading-dots span {
          width: 8px;
          height: 8px;
          background: #9ca3af;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
        .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .error-message {
          background: #fef2f2;
          color: #991b1b;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          margin: 0 16px;
        }

        .premium-required {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }

        .premium-required h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #1f2937;
        }

        .quick-actions {
          display: flex;
          gap: 8px;
          padding: 8px 16px;
          border-top: 1px solid #e5e7eb;
          background: #fafafa;
          flex-wrap: wrap;
        }

        .quick-action {
          padding: 6px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          color: #374151;
        }

        .quick-action:hover {
          background: #f3f4f6;
          border-color: #1e3a5f;
          color: #1e3a5f;
        }

        .feature-toggles {
          display: flex;
          gap: 8px;
          padding: 8px 12px;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          flex-wrap: wrap;
        }

        .feature-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .feature-toggle.active {
          background: #ecfdf5;
          color: #065f46;
          border-color: #10b981;
        }

        .feature-toggle.inactive {
          background: #f3f4f6;
          color: #6b7280;
        }

        .feature-toggle.locked {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .feature-toggle:hover:not(.locked) {
          border-color: #d1d5db;
        }

        .toggle-switch {
          width: 28px;
          height: 16px;
          background: #d1d5db;
          border-radius: 8px;
          position: relative;
          transition: background 0.2s;
        }

        .toggle-switch.active {
          background: #10b981;
        }

        .toggle-switch::after {
          content: '';
          position: absolute;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: transform 0.2s;
        }

        .toggle-switch.active::after {
          transform: translateX(12px);
        }
      `}</style>

      <div ref={ref} className="chat-panel">
        <div className="chat-header">
          <div>
            <div className="chat-header-title">
              <span>🧠</span>
              <span>AI予想アシスタント</span>
            </div>
            {raceContext && (
              <div className="chat-header-subtitle">
                {raceContext.place} {raceContext.raceNumber}R
              </div>
            )}
          </div>
          <button className="chat-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {/* 機能トグル */}
        {isPremium && activeFeatures && onToggleFeature && (
          <div className="feature-toggles">
            <div 
              className={`feature-toggle ${activeFeatures.has('saga-ai') ? 'active' : 'inactive'}`}
              onClick={() => onToggleFeature('saga-ai', false)}
            >
              <span>🧠</span>
              <span>おれAI</span>
              <div className={`toggle-switch ${activeFeatures.has('saga-ai') ? 'active' : ''}`} />
            </div>
            <div 
              className={`feature-toggle ${activeFeatures.has('race-pace') ? 'active' : 'inactive'}`}
              onClick={() => onToggleFeature('race-pace', false)}
            >
              <span>🏇</span>
              <span>展開予想</span>
              <div className={`toggle-switch ${activeFeatures.has('race-pace') ? 'active' : ''}`} />
            </div>
          </div>
        )}

        {!isPremium ? (
          <div className="premium-required">
            <h3>🔒 プレミアム限定機能</h3>
            <p>AI予想機能はプレミアム会員専用です。</p>
          </div>
        ) : (
          <>
            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  {msg.content}
                </div>
              ))}
              
              {isLoading && (
                <div className="message assistant">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            {raceContext && messages.length <= 1 && (
              <div className="quick-actions">
                <button 
                  className="quick-action" 
                  onClick={() => setInput('予想')}
                >
                  🎯 予想を生成
                </button>
                <button 
                  className="quick-action" 
                  onClick={() => setInput('このコースの特徴は？')}
                >
                  📊 コース特徴
                </button>
              </div>
            )}

            <div className="chat-input-container">
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                placeholder="「予想」と入力してAI予想を生成..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button 
                className="chat-send" 
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? '...' : '送信'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
});

export default AIChatPanel;
