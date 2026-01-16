'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PastRace {
  date?: string;
  place?: string;
  raceNo?: string;
  finish?: string;
  competitiveScore?: number;
}

interface ScoreChartProps {
  horseName: string;
  pastRaces: PastRace[];
  currentScore?: number;
}

export default function ScoreChart({ horseName, pastRaces, currentScore }: ScoreChartProps) {
  // 過去5走のデータを整形（古い順）
  const chartData = pastRaces
    .slice(0, 5)
    .reverse()
    .map((race, idx) => ({
      name: race.place ? `${race.place}${race.raceNo || ''}R` : `${idx + 1}走前`,
      スコア: race.competitiveScore || 0,
      着順: race.finish ? parseInt(race.finish) : null,
    }));

  // 現在のレースを追加
  if (currentScore !== undefined) {
    chartData.push({
      name: '今回',
      スコア: currentScore,
      着順: null,
    });
  }

  if (chartData.length < 2) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        グラフ表示には2レース以上のデータが必要です
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-4">
      <h4 className="text-sm font-bold text-white mb-3">
        {horseName} - スコア推移
      </h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#9CA3AF', fontSize: 11 }} 
              axisLine={{ stroke: '#4B5563' }}
            />
            <YAxis 
              tick={{ fill: '#9CA3AF', fontSize: 11 }} 
              axisLine={{ stroke: '#4B5563' }}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1F2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'スコア') return [`${value.toFixed(1)}点`, 'スコア'];
                if (name === '着順' && value) return [`${value}着`, '着順'];
                return [value, name];
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="スコア" 
              stroke="#F59E0B" 
              strokeWidth={2}
              dot={{ fill: '#F59E0B', r: 4 }}
              activeDot={{ r: 6, fill: '#FBBF24' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* 傾向分析 */}
      {chartData.length >= 3 && (
        <div className="mt-3 text-xs text-gray-400">
          {(() => {
            const scores = chartData.map(d => d.スコア).filter(s => s > 0);
            if (scores.length < 2) return null;
            
            const recent = scores.slice(-2);
            const older = scores.slice(0, -2);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
            
            const diff = recentAvg - olderAvg;
            
            if (diff > 5) return <span className="text-green-400">📈 上昇傾向 (+{diff.toFixed(1)})</span>;
            if (diff < -5) return <span className="text-red-400">📉 下降傾向 ({diff.toFixed(1)})</span>;
            return <span>➡️ 安定傾向</span>;
          })()}
        </div>
      )}
    </div>
  );
}
