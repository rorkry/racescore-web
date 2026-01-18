'use client';

import { useState, useEffect } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface SireStats {
  sire: string;
  totalRuns: number;
  wins: number;
  seconds: number;
  thirds: number;
  winRate: number;
  placeRate: number;
  showRate: number;
  winReturn: number;
  placeReturn: number;
  avgOdds?: number;
}

interface FilterState {
  place: string;
  surface: '芝' | 'ダ' | 'all';
  distanceMin: string;
  distanceMax: string;
  minRuns: string;
}

// 競馬場リスト
const PLACES = [
  { value: '', label: '全場' },
  { value: '中山', label: '中山' },
  { value: '東京', label: '東京' },
  { value: '阪神', label: '阪神' },
  { value: '京都', label: '京都' },
  { value: '中京', label: '中京' },
  { value: '新潟', label: '新潟' },
  { value: '福島', label: '福島' },
  { value: '札幌', label: '札幌' },
  { value: '函館', label: '函館' },
  { value: '小倉', label: '小倉' },
];

// 距離プリセット
const DISTANCE_PRESETS = [
  { label: '全距離', min: '', max: '' },
  { label: '短距離 (~1400m)', min: '', max: '1400' },
  { label: 'マイル (1400-1800m)', min: '1400', max: '1800' },
  { label: '中距離 (1800-2200m)', min: '1800', max: '2200' },
  { label: '長距離 (2200m~)', min: '2200', max: '' },
];

export default function AnalysisPage() {
  const { data: session, status } = useSession();
  const [sireData, setSireData] = useState<SireStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  
  const [filter, setFilter] = useState<FilterState>({
    place: '',
    surface: 'all',
    distanceMin: '',
    distanceMax: '',
    minRuns: '20',
  });

  const [sortBy, setSortBy] = useState<'totalRuns' | 'winRate' | 'showRate' | 'winReturn' | 'placeReturn'>('totalRuns');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 未ログイン
  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-gray-800 mb-4 text-balance">ログインが必要です</h1>
          <p className="text-gray-600 mb-6 text-pretty">
            分析機能を使用するにはログインしてください。
          </p>
          <Link href="/" className="inline-block px-6 py-3 btn-gold rounded-lg font-bold">
            トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const fetchSireData = async () => {
    setLoading(true);
    setError('');
    setHasSearched(true);
    
    try {
      const params = new URLSearchParams();
      if (filter.place) params.append('place', filter.place);
      if (filter.surface !== 'all') params.append('surface', filter.surface);
      if (filter.distanceMin) params.append('distanceMin', filter.distanceMin);
      if (filter.distanceMax) params.append('distanceMax', filter.distanceMax);
      if (filter.minRuns) params.append('minRuns', filter.minRuns);
      params.append('limit', '100');

      const res = await fetch(`/api/sire-analysis?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error('データの取得に失敗しました');
      }
      
      const data = await res.json();
      setSireData(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDistancePreset = (preset: { min: string; max: string }) => {
    setFilter(prev => ({
      ...prev,
      distanceMin: preset.min,
      distanceMax: preset.max,
    }));
  };

  // ソート処理
  const sortedData = [...sireData].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (sortOrder === 'asc') {
      return (aVal ?? 0) - (bVal ?? 0);
    }
    return (bVal ?? 0) - (aVal ?? 0);
  });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const SortHeader = ({ column, label }: { column: typeof sortBy; label: string }) => (
    <th 
      className="px-3 py-2 text-right cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
      onClick={() => handleSort(column)}
    >
      {label}
      {sortBy === column && (
        <span className="ml-1">{sortOrder === 'desc' ? '▼' : '▲'}</span>
      )}
    </th>
  );

  // ローディング
  if (status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="inline-block size-12 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Link 
          href="/mypage" 
          className="text-green-700 hover:text-green-800 flex items-center gap-1"
        >
          ← マイページ
        </Link>
      </div>
      
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-balance">
        📊 データ分析
      </h1>
      <p className="text-gray-600 mb-8 text-pretty">
        種牡馬の成績をコース条件で絞り込んで分析できます
      </p>

      {/* フィルターパネル */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          🔍 種牡馬成績検索
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* 競馬場 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">競馬場</label>
            <select
              value={filter.place}
              onChange={(e) => setFilter(prev => ({ ...prev, place: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 bg-white"
            >
              {PLACES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* 芝/ダート */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">芝/ダート</label>
            <div className="flex gap-2">
              {[
                { value: 'all', label: '全て' },
                { value: '芝', label: '芝' },
                { value: 'ダ', label: 'ダート' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(prev => ({ ...prev, surface: opt.value as FilterState['surface'] }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter.surface === opt.value
                      ? 'bg-green-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 距離（下限） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">距離（下限）</label>
            <input
              type="number"
              value={filter.distanceMin}
              onChange={(e) => setFilter(prev => ({ ...prev, distanceMin: e.target.value }))}
              placeholder="例: 1600"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
            />
          </div>

          {/* 距離（上限） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">距離（上限）</label>
            <input
              type="number"
              value={filter.distanceMax}
              onChange={(e) => setFilter(prev => ({ ...prev, distanceMax: e.target.value }))}
              placeholder="例: 2000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
            />
          </div>
        </div>

        {/* 距離プリセット */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">距離プリセット</label>
          <div className="flex flex-wrap gap-2">
            {DISTANCE_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => handleDistancePreset(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  filter.distanceMin === preset.min && filter.distanceMax === preset.max
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 最低出走回数 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            最低出走回数（少ないデータを除外）
          </label>
          <select
            value={filter.minRuns}
            onChange={(e) => setFilter(prev => ({ ...prev, minRuns: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 bg-white"
          >
            <option value="5">5回以上</option>
            <option value="10">10回以上</option>
            <option value="20">20回以上</option>
            <option value="30">30回以上</option>
            <option value="50">50回以上</option>
          </select>
        </div>

        {/* 検索ボタン */}
        <button
          onClick={fetchSireData}
          disabled={loading}
          className="w-full md:w-auto px-8 py-3 bg-green-700 text-white rounded-lg font-bold hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          {loading ? '検索中...' : '🔍 検索'}
        </button>
      </div>

      {/* 結果 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {hasSearched && !loading && sireData.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-gray-600 text-pretty">
            条件に合うデータが見つかりませんでした。<br />
            条件を変更してお試しください。
          </p>
        </div>
      )}

      {sireData.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800">
              検索結果: {sireData.length}件
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 z-10">種牡馬</th>
                  <SortHeader column="totalRuns" label="出走数" />
                  <th className="px-3 py-2 text-right whitespace-nowrap">成績</th>
                  <SortHeader column="winRate" label="勝率" />
                  <th className="px-3 py-2 text-right whitespace-nowrap">連対率</th>
                  <SortHeader column="showRate" label="複勝率" />
                  <SortHeader column="winReturn" label="単回収" />
                  <SortHeader column="placeReturn" label="複回収" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedData.map((sire, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white z-10 whitespace-nowrap">
                      {sire.sire}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {sire.totalRuns}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {sire.wins}-{sire.seconds}-{sire.thirds}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                      sire.winRate >= 15 ? 'text-red-600' : 
                      sire.winRate >= 10 ? 'text-orange-600' : 'text-gray-700'
                    }`}>
                      {sire.winRate.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      sire.placeRate >= 30 ? 'text-red-600' : 
                      sire.placeRate >= 20 ? 'text-orange-600' : 'text-gray-700'
                    }`}>
                      {sire.placeRate.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                      sire.showRate >= 40 ? 'text-red-600' : 
                      sire.showRate >= 30 ? 'text-orange-600' : 'text-gray-700'
                    }`}>
                      {sire.showRate.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      sire.winReturn >= 100 ? 'text-red-600 font-bold' : 
                      sire.winReturn >= 80 ? 'text-orange-600' : 'text-gray-500'
                    }`}>
                      {sire.winReturn.toFixed(0)}%
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      sire.placeReturn >= 100 ? 'text-red-600 font-bold' : 
                      sire.placeReturn >= 80 ? 'text-orange-600' : 'text-gray-500'
                    }`}>
                      {sire.placeReturn.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
            ※ 回収率は概算値です（実際の配当データに基づいていません）
          </div>
        </div>
      )}
    </div>
  );
}
