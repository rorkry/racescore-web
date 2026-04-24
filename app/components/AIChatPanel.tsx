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

  // 初回表示時のウェルカムメッセージ（raceContextが変わったら更新）
  useEffect(() => {
    console.log('[AIChatPanel] isOpen:', isOpen, 'raceContext:', raceContext);
    
    if (isOpen) {
      // ウェルカムメッセージのみの場合、またはメッセージがない場合は更新
      const shouldUpdate = messages.length === 0 || 
        (messages.length === 1 && messages[0].id === 'welcome');
      
      if (shouldUpdate) {
        const welcomeMessage: Message = {
          id: 'welcome',
          role: 'assistant',
          content: raceContext 
            ? `${raceContext.place} ${raceContext.raceNumber}Rの予想をお手伝いします。\n「予想」でAI予想。「展開」で展開予想。\nマイページの「格言・自分ルール」に書いた内容を踏まえて、「高速馬場でどう狙う？」などと聞くと、このレースの出走馬と照らして答えます。`
            : '競馬に関する質問にお答えします。\nレースカードを開いた状態で「予想」と入力すると、AI予想を生成します。\n格言はマイページ「格言・自分ルール」で編集できます。',
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      }
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
      
      // エラー応答はHTMLの場合があるので res.ok を先に判定
      if (!response.ok) {
        let errMsg = 'エラーが発生しました';
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch {
          errMsg = `${errMsg} (HTTP ${response.status})`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();

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
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 520px;
          max-height: calc(100vh - 120px);
          background: #0a0a0f;
          border-radius: 20px;
          box-shadow: 
            0 0 40px rgba(0, 200, 255, 0.15),
            0 0 80px rgba(255, 0, 128, 0.1),
            0 25px 50px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          z-index: 1001;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
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
          padding: 20px;
          position: relative;
          overflow: hidden;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: #0a0a12;
        }

        /* ネオングリッド背景 */
        .chat-header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            /* カラフルなネオンブロック */
            linear-gradient(90deg, 
              rgba(0, 230, 255, 0.4) 0%, 
              rgba(0, 230, 255, 0.1) 10%,
              rgba(255, 0, 200, 0.3) 25%,
              rgba(255, 0, 200, 0.1) 35%,
              rgba(255, 220, 0, 0.3) 50%,
              rgba(255, 220, 0, 0.1) 60%,
              rgba(0, 255, 150, 0.3) 75%,
              rgba(0, 255, 150, 0.1) 85%,
              rgba(0, 230, 255, 0.4) 100%
            ),
            /* グリッドライン */
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 8px,
              rgba(255, 255, 255, 0.03) 8px,
              rgba(255, 255, 255, 0.03) 9px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 8px,
              rgba(255, 255, 255, 0.03) 8px,
              rgba(255, 255, 255, 0.03) 9px
            );
        }

        .chat-header-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .chat-header-close-wrapper {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
        }

        .chat-header-center {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .chat-header-title {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          text-shadow: 
            0 0 2px #fff,
            0 0 8px #00e6ff,
            0 0 15px #00e6ff,
            0 0 25px rgba(0, 230, 255, 0.4);
          display: flex;
          align-items: center;
          gap: 12px;
          letter-spacing: 0.05em;
        }

        .chat-header-title .brain-icon {
          font-size: 26px;
          filter: 
            drop-shadow(0 0 3px #ff00c8)
            drop-shadow(0 0 6px #ff00c8);
        }

        .chat-header-subtitle {
          font-size: 13px;
          color: #00e6ff;
          margin-top: 6px;
          font-weight: 600;
          text-shadow: 
            0 0 5px #00e6ff,
            0 0 10px rgba(0, 230, 255, 0.5);
          letter-spacing: 0.1em;
        }

        .chat-close {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: all 0.2s;
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        }

        .chat-close:hover {
          background: rgba(255, 0, 200, 0.3);
          border-color: #ff00c8;
          box-shadow: 
            0 0 10px rgba(255, 0, 200, 0.5),
            inset 0 0 10px rgba(255, 0, 200, 0.2);
          transform: scale(1.05);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: linear-gradient(180deg, #0a0a0f 0%, #12121a 100%);
        }

        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }

        .message {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .message.user {
          align-self: flex-end;
          background: linear-gradient(135deg, #00c8ff 0%, #0080ff 100%);
          color: white;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 15px rgba(0, 200, 255, 0.3);
        }

        .message.assistant {
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.08);
          color: #e0e0e0;
          border-bottom-left-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .chat-input-container {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 10px;
          flex-shrink: 0;
          background: rgba(0, 0, 0, 0.3);
        }

        .chat-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-size: 16px;
          outline: none;
          transition: all 0.2s;
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }

        .chat-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .chat-input:focus {
          border-color: #00c8ff;
          box-shadow: 0 0 15px rgba(0, 200, 255, 0.3);
          background: rgba(255, 255, 255, 0.08);
        }

        .chat-input:disabled {
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.3);
        }

        .chat-send {
          padding: 12px 20px;
          background: linear-gradient(135deg, #00c8ff 0%, #0080ff 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 70px;
          box-shadow: 0 4px 15px rgba(0, 200, 255, 0.3);
        }

        .chat-send:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 200, 255, 0.4);
        }

        .chat-send:disabled {
          background: rgba(255, 255, 255, 0.1);
          box-shadow: none;
          cursor: not-allowed;
        }

        .loading-dots {
          display: flex;
          gap: 6px;
          padding: 8px 0;
        }

        .loading-dots span {
          width: 8px;
          height: 8px;
          background: #00c8ff;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
          box-shadow: 0 0 10px rgba(0, 200, 255, 0.5);
        }

        .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
        .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }

        .error-message {
          background: rgba(255, 50, 50, 0.2);
          color: #ff6b6b;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 12px;
          margin: 0 16px;
          border: 1px solid rgba(255, 50, 50, 0.3);
        }

        .premium-required {
          text-align: center;
          padding: 60px 20px;
          color: rgba(255, 255, 255, 0.6);
          background: linear-gradient(180deg, #0a0a0f 0%, #12121a 100%);
          flex: 1;
        }

        .premium-required h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #ffffff;
          text-shadow: 0 0 20px rgba(255, 200, 0, 0.5);
        }

        .quick-actions {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
          flex-wrap: wrap;
        }

        .quick-action {
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          color: rgba(255, 255, 255, 0.8);
        }

        .quick-action:hover {
          background: rgba(0, 200, 255, 0.15);
          border-color: rgba(0, 200, 255, 0.5);
          color: #00c8ff;
          box-shadow: 0 0 15px rgba(0, 200, 255, 0.2);
        }

        .feature-toggles {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .feature-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .feature-toggle.active {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.4);
        }

        .feature-toggle.inactive {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.5);
        }

        .feature-toggle.locked {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .feature-toggle:hover:not(.locked) {
          background: rgba(255, 255, 255, 0.1);
        }

        .toggle-switch {
          width: 32px;
          height: 18px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 9px;
          position: relative;
          transition: all 0.2s;
        }

        .toggle-switch.active {
          background: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }

        .toggle-switch::after {
          content: '';
          position: absolute;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: transform 0.2s;
        }

        .toggle-switch.active::after {
          transform: translateX(14px);
        }
      `}</style>

      <div ref={ref} className="chat-panel">
        <div className="chat-header">
          <div className="chat-header-content">
            <div className="chat-header-center">
              <div className="chat-header-title">
                <span className="brain-icon">🧠</span>
                <span>競馬の脳みそ</span>
              </div>
              {raceContext && (
                <div className="chat-header-subtitle">
                  {raceContext.place} {raceContext.raceNumber}R
                </div>
              )}
            </div>
            <div className="chat-header-close-wrapper">
              <button className="chat-close" onClick={onClose} aria-label="閉じる">
                ×
              </button>
            </div>
          </div>
        </div>

        {/* 機能トグル */}
        {isPremium && activeFeatures && onToggleFeature && (
          <div className="feature-toggles">
            <div 
              className={`feature-toggle ${activeFeatures.has('saga-ai') ? 'active' : 'inactive'}`}
              onClick={() => onToggleFeature('saga-ai', false)}
            >
              <span>おれAI</span>
              <div className={`toggle-switch ${activeFeatures.has('saga-ai') ? 'active' : ''}`} />
            </div>
            <div 
              className={`feature-toggle ${activeFeatures.has('race-pace') ? 'active' : 'inactive'}`}
              onClick={() => onToggleFeature('race-pace', false)}
            >
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

            {raceContext && (
              <div className="quick-actions">
                <button 
                  className="quick-action" 
                  onClick={() => setInput('予想')}
                >
                  🎯 予想
                </button>
                <button 
                  className="quick-action" 
                  onClick={() => setInput('展開予想')}
                >
                  🏃 展開予想
                </button>
                <button 
                  className="quick-action" 
                  onClick={() => setInput('このコースの特徴は？')}
                >
                  📊 コース
                </button>
              </div>
            )}

            <div className="chat-input-container">
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                placeholder="質問を入力..."
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
