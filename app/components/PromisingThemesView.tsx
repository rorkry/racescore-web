'use client';

import { useState, useEffect } from 'react';

interface ThemeSummary {
  theme_type: string;
  count: number;
  avg_expected_value: number;
  avg_score: number;
}

export default function PromisingThemesView() {
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/research-lab/memory?is_promising=true&limit=100');
      const data = await response.json();
      
      if (data.success && data.history) {
        // テーマごとに集計
        const themeMap = new Map<string, { total: number; totalExpectedValue: number; totalScore: number }>();
        
        data.history.forEach((entry: any) => {
          const theme = entry.theme_type || 'other';
          const existing = themeMap.get(theme) || { total: 0, totalExpectedValue: 0, totalScore: 0 };
          
          themeMap.set(theme, {
            total: existing.total + 1,
            totalExpectedValue: existing.totalExpectedValue + (entry.expected_value_diff || 0),
            totalScore: existing.totalScore + (entry.promising_score || 0)
          });
        });
        
        // 配列に変換してソート
        const themesArray: ThemeSummary[] = Array.from(themeMap.entries()).map(([theme, stats]) => ({
          theme_type: theme,
          count: stats.total,
          avg_expected_value: stats.totalExpectedValue / stats.total,
          avg_score: stats.totalScore / stats.total
        }));
        
        themesArray.sort((a, b) => b.avg_expected_value - a.avg_expected_value);
        setThemes(themesArray);
      }
    } catch (error) {
      console.error('Failed to load themes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getThemeIcon = (theme: string) => {
    const icons: Record<string, string> = {
      makikaeshi: '🔄',
      potential: '⚡',
      l4f: '🏃',
      t2f: '⏱️',
      pedigree: '🧬',
      jockey: '🏇',
      course: '🏟️',
      waku: '📍',
      weight: '⚖️',
      popularity: '⭐',
      other: '📊'
    };
    return icons[theme] || '📊';
  };

  const getThemeName = (theme: string) => {
    const names: Record<string, string> = {
      makikaeshi: '巻き返し指数',
      potential: 'ポテンシャル指数',
      l4f: 'L4F(上がり)',
      t2f: 'T2F(序盤)',
      pedigree: '血統',
      jockey: '騎手',
      course: 'コース',
      waku: '枠順',
      weight: '斤量',
      popularity: '人気',
      other: 'その他'
    };
    return names[theme] || theme;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (themes.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">まだ有望テーマがありません</p>
        <p className="text-sm text-gray-400 mt-2">研究を実行すると、有望なテーマがここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {themes.map((theme) => (
        <div
          key={theme.theme_type}
          className="border border-green-200 bg-green-50 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{getThemeIcon(theme.theme_type)}</span>
            <span className="font-bold text-gray-900">{getThemeName(theme.theme_type)}</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">有望条件数:</span>
              <span className="font-medium text-gray-900">{theme.count}件</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均期待値:</span>
              <span className="font-bold text-green-600">
                +{theme.avg_expected_value.toFixed(0)}円
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均スコア:</span>
              <span className="font-medium text-blue-600">
                {theme.avg_score.toFixed(0)}/100
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
