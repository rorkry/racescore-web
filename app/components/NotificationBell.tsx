'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from './Providers';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: number;
  created_at: string;
}

export default function NotificationBell() {
  const { status } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  const fetchNotifications = async () => {
    if (status !== 'authenticated') return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/user/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // 30秒ごとに更新
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [status]);

  const markAsRead = async (id?: string) => {
    try {
      await fetch('/api/user/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { markAllRead: true })
      });
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bonus': return '🎁';
      case 'badge': return '🏆';
      case 'race': return '🏇';
      default: return '📬';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return date.toLocaleDateString('ja-JP');
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative size-10 flex items-center justify-center rounded-lg hover:bg-green-900/30 transition-colors"
        aria-label="通知"
      >
        <svg className="size-5 text-green-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
          <div 
            ref={menuRef}
            className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">通知</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAsRead()}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  すべて既読
                </button>
              )}
            </div>

            {/* 通知リスト */}
            <div className="max-h-80 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="size-6 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin mx-auto"></div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <span className="text-3xl">🔔</span>
                  <p className="mt-2 text-sm">通知はありません</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.is_read) markAsRead(notif.id);
                    }}
                    className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notif.is_read ? 'bg-green-50/50' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <span className="text-xl flex-shrink-0">{getTypeIcon(notif.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${!notif.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notif.title}
                          </p>
                          {!notif.is_read && (
                            <span className="size-2 bg-green-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                        {notif.message && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{formatTime(notif.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
      )}
    </div>
  );
}
