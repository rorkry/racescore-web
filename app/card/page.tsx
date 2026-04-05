'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import CourseStyleRacePace from '@/app/components/CourseStyleRacePace';
import SagaAICard, { type SagaAIResponse } from '@/app/components/SagaAICard';
import HorseDetailModal from '@/app/components/HorseDetailModal';
import HorseActionPopup from '@/app/components/HorseActionPopup';
import BabaMemoForm from '@/app/components/BabaMemoForm';
import RaceMemoForm from '@/app/components/RaceMemoForm';
import InlineMarkSelector, { type MarkType, getMarkColor } from '@/app/components/InlineMarkSelector';
import { useFeatureAccess } from '@/app/components/FloatingActionButton';
import PastRaceDetail from '@/app/components/PastRaceDetail';
import { useRacePredictions } from '@/hooks/useRacePredictions';
import { useSession } from '@/app/components/Providers';
import { 
  getFromIndexedDB, 
  setToIndexedDB, 
  clearExpiredCache, 
  isIndexedDBAvailable 
} from '@/lib/indexeddb-cache';
import { normalizeHorseName } from '@/utils/normalize-horse-name';

interface PastRaceIndices {
  L4F: number | null;
  T2F: number | null;
  potential: number | null;
  revouma: number | null;
  makikaeshi: number | null;
  cushion: number | null;
}

interface RaceLevelInfo {
  level: string;
  levelLabel: string;
  totalHorsesRun: number;
  firstRunGoodCount: number;
  winCount: number;
  aiComment: string;
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  race_name?: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  index_value: string;
  corner_1?: string;
  corner_2: string;
  corner_3: string;
  corner_4: string;
  pci: string;
  popularity: string;
  track_condition: string;
  place: string;
  race_number?: string;
  jockey?: string;
  lap_time?: string;
  indices?: PastRaceIndices | null;
  indexRaceId?: string;
  raceLevel?: RaceLevelInfo | null;
}

interface Race {
  date: string;
  place: string;
  race_number: string;
  class_name: string;
  track_type: string;
  distance: string;
  field_size: number;
}

interface Venue {
  place: string;
  races: Race[];
}

interface Indices {
  L4F: number | null;
  T2F: number | null;
  potential: number | null;
  revouma: number | null;
  makikaeshi: number | null;
  cushion: number | null;
}

interface Horse {
  umaban: string;
  waku: string;
  umamei: string;
  kishu: string;
  kinryo: string;
  score: number;
  hasData: boolean;
  past: PastRace[];
  indices: Indices | null;
  indexRaceId?: string;
}

interface RaceCard {
  raceInfo: {
    date: string;
    place: string;
    raceNumber: string;
    className: string;
    trackType: string;
    distance: string;
    fieldSize: number;
  };
  horses: Horse[];
}

function toHalfWidth(str: string): string {
  return str.replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

// normalizeHorseNameは@/utils/normalize-horse-nameからインポート

function formatDateForQuery(dateStr: string): string {
  const match = dateStr.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
  if (match) {
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${month}${day}`;
  }
  return dateStr;
}

function formatDateForDisplay(dateStr: string): string {
  if (dateStr.length === 4) {
    return `${dateStr.slice(0, 2)}/${dateStr.slice(2)}`;
  }
  return dateStr;
}

function getTodayDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}${day}`;
}

function getTodayYear(): number {
  return new Date().getFullYear();
}

function getAdjacentDate(currentDate: string, availableDates: string[], direction: 'prev' | 'next'): string | null {
  const currentIndex = availableDates.indexOf(currentDate);
  if (currentIndex === -1) return null;
  
  if (direction === 'prev') {
    return currentIndex < availableDates.length - 1 ? availableDates[currentIndex + 1] : null;
  } else {
    return currentIndex > 0 ? availableDates[currentIndex - 1] : null;
  }
}

export default function RaceCardPage() {
  // SSRハイドレーション対応: 初期値は固定値を使用
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [date, setDate] = useState('0119'); // 固定の初期値（すぐにuseEffectで更新される）
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>('');
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [raceCard, setRaceCard] = useState<RaceCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [expandedHorse, setExpandedHorse] = useState<string | null>(null);
  const [venuePdfGenerating, setVenuePdfGenerating] = useState<string | null>(null);
  const [timeHighlights, setTimeHighlights] = useState<Map<string, { count: number; timeDiff: number }>>(new Map());
  
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkGenerateResult, setBulkGenerateResult] = useState<{ success: number; error: number; time: number } | null>(null);

  const showRacePace = useFeatureAccess('race-pace');
  const showSagaAI = useFeatureAccess('saga-ai');

  // グローバルにレース情報を共有（AIチャット用）
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedVenue && selectedRace) {
      window.__currentRaceContext = {
        year: selectedYear,
        date,
        place: selectedVenue,
        raceNumber: parseInt(selectedRace, 10),
      };
      console.log('[RaceCard] Updated global raceContext:', window.__currentRaceContext);
    }
    
    // クリーンアップ: ページを離れる時にnullに
    return () => {
      if (typeof window !== 'undefined') {
        window.__currentRaceContext = null;
      }
    };
  }, [selectedYear, date, selectedVenue, selectedRace]);

  const [selectedHorseDetail, setSelectedHorseDetail] = useState<Horse | null>(null);
  const [horseActionTarget, setHorseActionTarget] = useState<{ name: string; number: string } | null>(null);
  const [showBabaMemo, setShowBabaMemo] = useState(false);
  const [showRaceMemo, setShowRaceMemo] = useState(false);
  const [raceMemos, setRaceMemos] = useState<Map<string, string>>(new Map()); // raceKey -> memo内容
  const [pastRaceMemoPopup, setPastRaceMemoPopup] = useState<{ raceKey: string; raceTitle: string; memo: string } | null>(null);

  // ========== 今走メモ ==========
  // キー: horse_name → 今走のメモ文字列
  const [horseRaceMemosForCard, setHorseRaceMemosForCard] = useState<Map<string, string>>(new Map());
  // 今走メモポップアップ: 開いている馬名 + 現在の入力テキスト
  const [horseRaceMemoPopup, setHorseRaceMemoPopup] = useState<{ horseName: string; draft: string } | null>(null);
  // 各馬の過去走メモ（キー: race_key → memo）: horseNameをキーに遅延ロード
  const [horseRaceMemosCache, setHorseRaceMemosCache] = useState<Map<string, Map<string, string>>>(new Map());

  // 今走メモを現在のレース全馬分ロード
  useEffect(() => {
    if (!selectedVenue || !selectedRace || !date) return;
    const raceKey = `${selectedYear}${date}-${selectedVenue}-${selectedRace}`;
    fetch(`/api/user/horse-race-memos?raceKey=${encodeURIComponent(raceKey)}`)
      .then(r => r.ok ? r.json() : { memos: [] })
      .then((data: { memos: Array<{ horse_name: string; memo: string }> }) => {
        const map = new Map<string, string>();
        for (const m of data.memos) map.set(m.horse_name, m.memo);
        setHorseRaceMemosForCard(map);
      })
      .catch(() => {});
  }, [selectedYear, date, selectedVenue, selectedRace]);

  // 馬の過去走メモを遅延ロード（過去走パネルを開いたとき）
  async function loadHorseRaceMemosFor(horseName: string) {
    if (horseRaceMemosCache.has(horseName)) return;
    try {
      const res = await fetch(`/api/user/horse-race-memos?horseName=${encodeURIComponent(horseName)}`);
      if (!res.ok) return;
      const data: { memos: Array<{ race_key: string; memo: string }> } = await res.json();
      const map = new Map<string, string>();
      for (const m of data.memos) map.set(m.race_key, m.memo);
      setHorseRaceMemosCache(prev => new Map(prev).set(horseName, map));
    } catch {}
  }

  // 今走メモ保存
  async function saveHorseRaceMemo(horseName: string, memo: string) {
    if (!selectedVenue || !selectedRace || !date) return;
    const raceKey = `${selectedYear}${date}-${selectedVenue}-${selectedRace}`;
    await fetch('/api/user/horse-race-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horseName, raceKey, memo }),
    });
    setHorseRaceMemosForCard(prev => {
      const next = new Map(prev);
      if (memo.trim()) next.set(horseName, memo.trim());
      else next.delete(horseName);
      return next;
    });
  }
  const [sortMode, setSortMode] = useState<'score' | 'umaban'>('umaban'); // 馬番順で高速表示
  const [favoriteHorses, setFavoriteHorses] = useState<string[]>([]); // お気に入り馬リスト
  const [favoriteHorseMemos, setFavoriteHorseMemos] = useState<Map<string, string>>(new Map()); // 馬名 -> メモ

  // セッション状態
  const { status: sessionStatus } = useSession();

  // お気に入り馬リストを取得（メモ含む）
  const fetchFavoriteHorses = async () => {
    if (sessionStatus !== 'authenticated') {
      setFavoriteHorses([]);
      setFavoriteHorseMemos(new Map());
      return;
    }
    try {
      const res = await fetch('/api/user/favorites');
      if (res.ok) {
        const data = await res.json();
        // favorite_horsesから馬名を抽出
        const names = (data.favorites || []).map((f: { horse_name: string }) => f.horse_name);
        setFavoriteHorses(names);
        
        // メモをMapに保存
        const memoMap = new Map<string, string>();
        (data.favorites || []).forEach((f: { horse_name: string; note?: string }) => {
          if (f.note) {
            memoMap.set(f.horse_name, f.note);
          }
        });
        setFavoriteHorseMemos(memoMap);
      }
    } catch (err) {
      console.warn('[FavoriteHorses] 取得エラー:', err);
    }
  };

  useEffect(() => {
    fetchFavoriteHorses();
  }, [sessionStatus]);

  // クライアント側で日付を初期化（SSRハイドレーション対応）
  useEffect(() => {
    setIsClient(true);
    const todayYear = getTodayYear();
    setSelectedYear(todayYear);
  }, []);

  // レースキーを生成
  const raceKey = raceCard 
    ? `${raceCard.raceInfo.date}_${raceCard.raceInfo.place}_${raceCard.raceInfo.raceNumber}` 
    : null;

  // 予想（印）管理フック
  const { predictions, setPrediction, isRaceFinished, loading: predictionsLoading } = useRacePredictions(
    raceKey,
    raceCard?.raceInfo.date
  );

  // 過去走のレースメモを取得
  useEffect(() => {
    if (!raceCard || sessionStatus !== 'authenticated') return;
    
    // 全馬の過去走からユニークなレースキーを収集
    const pastRaceKeys = new Set<string>();
    raceCard.horses.forEach(horse => {
      horse.past?.forEach(race => {
        if (race.date && race.place && race.race_number) {
          const key = `${race.date}_${race.place}_${race.race_number}`;
          pastRaceKeys.add(key);
        }
      });
    });
    
    if (pastRaceKeys.size === 0) return;
    
    // メモを一括取得
    const fetchMemos = async () => {
      try {
        const keysParam = Array.from(pastRaceKeys).join(',');
        const res = await fetch(`/api/user/race-memos?raceKeys=${encodeURIComponent(keysParam)}`);
        if (res.ok) {
          const data = await res.json();
          const memoMap = new Map<string, string>();
          data.memos?.forEach((m: { race_key: string; memo: string }) => {
            memoMap.set(m.race_key, m.memo);
          });
          setRaceMemos(memoMap);
        }
      } catch (error) {
        console.error('Failed to fetch race memos:', error);
      }
    };
    
    fetchMemos();
  }, [raceCard, sessionStatus]);

  const raceCardCache = useRef<Map<string, RaceCard>>(new Map());
  // SagaAI（おれAI）のキャッシュ
  const sagaAICache = useRef<Map<string, SagaAIResponse>>(new Map());
  const [currentSagaAIData, setCurrentSagaAIData] = useState<SagaAIResponse | null>(null);
  
  const [prefetchProgress, setPrefetchProgress] = useState<{ current: number; total: number } | null>(null);
  const prefetchAbortController = useRef<AbortController | null>(null);
  
  const isPriorityFetchInProgress = useRef<boolean>(false);
  const currentVenuesList = useRef<Venue[]>([]);
  
  const prevDate = getAdjacentDate(date, availableDates, 'prev');
  const nextDate = getAdjacentDate(date, availableDates, 'next');
  
  useEffect(() => {
    if (isIndexedDBAvailable()) {
      clearExpiredCache().then((cleared) => {
        if (cleared > 0) console.log(`[IndexedDB] ${cleared}件の期限切れキャッシュをクリア`);
      });
    }
  }, []);

  useEffect(() => {
    if (isClient) {
      fetchAvailableDates();
    }
  }, [selectedYear, isClient]);

  const fetchAvailableDates = async () => {
    try {
      const res = await fetch(`/api/races?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch dates');
      const data = await res.json();
      const dates = (data.dates || []).map((d: { date: string }) => d.date);
      setAvailableDates(dates);
      
      // 今日の日付が利用可能か確認して設定
      const today = getTodayDate();
      const currentYear = getTodayYear();
      
      if (selectedYear === currentYear && dates.includes(today)) {
        setDate(today);
      } else if (dates.length > 0 && !dates.includes(date)) {
        // 現在の日付が利用可能でない場合は最新日付を設定
        setDate(dates[0]);
      }
    } catch (err: any) {
      console.error('Failed to fetch available dates:', err);
    }
  };

  useEffect(() => {
    if (date && selectedYear) {
      if (prefetchAbortController.current) {
        prefetchAbortController.current.abort();
      }
      raceCardCache.current.clear();
      setPrefetchProgress(null);
      // 日付変更時にレースカードをリセット
      setSelectedRace('');
      setRaceCard(null);
      setSelectedVenue('');
      fetchVenues();
    }
    
    return () => {
      if (prefetchAbortController.current) {
        prefetchAbortController.current.abort();
      }
    };
  }, [date, selectedYear]);

  const bulkGenerateAnalysis = async () => {
    if (!date || !selectedYear || venues.length === 0) return;
    
    setBulkGenerating(true);
    setBulkGenerateResult(null);
    const startTime = Date.now();
    
    try {
      const totalRaces = venues.reduce((sum, v) => sum + v.races.length, 0);
      let currentRace = 0;
      let successCount = 0;
      let errorCount = 0;
      
      for (const venue of venues) {
        for (const race of venue.races) {
          currentRace++;
          setBulkGenerateProgress({ current: currentRace, total: totalRaces });
          
          try {
            const sagaRes = await fetch('/api/saga-ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                year: String(selectedYear),
                date,
                place: venue.place,
                raceNumber: race.race_number,
                useAI: false,
                trackCondition: '良',
                bias: 'none',
                forceRecalculate: true,
                saveToDB: true,
              }),
            });
            
            const paceRes = await fetch(
              `/api/race-pace?year=${selectedYear}&date=${date}&place=${encodeURIComponent(venue.place)}&raceNumber=${race.race_number}&forceRecalculate=true&saveToDB=true`
            );
            
            if (sagaRes.ok && paceRes.ok) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch {
            errorCount++;
          }
        }
      }
      
      const elapsedTime = Math.round((Date.now() - startTime) / 1000);
      setBulkGenerateResult({ success: successCount, error: errorCount, time: elapsedTime });
    } catch (err: any) {
      console.error('Bulk generate error:', err);
      setError(`一括生成エラー: ${err.message}`);
    } finally {
      setBulkGenerating(false);
      setBulkGenerateProgress(null);
    }
  };

  const fetchVenues = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/races?date=${date}&year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch venues');
      const data = await res.json();
      setVenues(data.venues || []);
      
      if (data.venues && data.venues.length > 0) {
        const firstVenue = data.venues[0].place;
        const firstRace = data.venues[0].races?.[0]?.race_number || '1';
        
        setSelectedVenue(firstVenue);
        setSelectedRace(firstRace);
        
        // 案1: 選択中のレースを即座に取得（最優先）
        await fetchRaceCardImmediate(firstVenue, firstRace);
        
        // ローディング解除後、残りを完全にバックグラウンドで取得（UIブロックなし）
        setLoading(false);
        
        // 案1: 他のレースを裏で取得（Promise.resolveで完全に非同期化）
        Promise.resolve().then(() => {
          prefetchAllRaceCards(data.venues);
        });
        return; // finallyのsetLoading(false)をスキップ
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // 案1: 即座にレースカードを取得（ローディング表示なし）
  const fetchRaceCardImmediate = async (place: string, raceNumber: string) => {
    const cacheKey = `${selectedYear}_${date}_${place}_${raceNumber}`;
    
    // メモリキャッシュチェック
    const memoryCachedData = raceCardCache.current.get(cacheKey);
    if (memoryCachedData) {
      setRaceCard(memoryCachedData);
      setExpandedHorse(null);
      return;
    }
    
    // IndexedDBキャッシュチェック
    if (isIndexedDBAvailable()) {
      try {
        const persistedData = await getFromIndexedDB<RaceCard>(cacheKey);
        if (persistedData) {
          raceCardCache.current.set(cacheKey, persistedData);
          setRaceCard(persistedData);
          setExpandedHorse(null);
          return;
        }
      } catch (err) {
        console.warn('[IndexedDB] 読み取りエラー:', err);
      }
    }
    
    // APIから取得
    try {
      const url = `/api/race-card-with-score?date=${date}&year=${selectedYear}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        raceCardCache.current.set(cacheKey, data);
        if (isIndexedDBAvailable()) {
          setToIndexedDB(cacheKey, data, date).catch(() => {});
        }
        setRaceCard(data);
        setExpandedHorse(null);
      }
    } catch (err: any) {
      console.error('[fetchRaceCardImmediate] Error:', err.message);
    }
  };

  const fetchRaceCard = async (place: string, raceNumber: string) => {
    const cacheKey = `${selectedYear}_${date}_${place}_${raceNumber}`;
    
    const memoryCachedData = raceCardCache.current.get(cacheKey);
    if (memoryCachedData) {
      setRaceCard(memoryCachedData);
      setExpandedHorse(null);
      prefetchPremiumData(place, raceNumber);
      return;
    }
    
    if (isIndexedDBAvailable()) {
      try {
        const persistedData = await getFromIndexedDB<RaceCard>(cacheKey);
        if (persistedData) {
          raceCardCache.current.set(cacheKey, persistedData);
          setRaceCard(persistedData);
          setExpandedHorse(null);
          prefetchPremiumData(place, raceNumber);
          return;
        }
      } catch (err) {
        console.warn('[IndexedDB] 読み取りエラー:', err);
      }
    }
    
    isPriorityFetchInProgress.current = true;
    
    try {
      setLoading(true);
      setError(null);
      const url = `/api/race-card-with-score?date=${date}&year=${selectedYear}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch race card: ${res.status}`);
      }
      const data = await res.json();
      
      raceCardCache.current.set(cacheKey, data);
      
      if (isIndexedDBAvailable()) {
        setToIndexedDB(cacheKey, data, date).catch(() => {});
      }
      
      setRaceCard(data);
      setExpandedHorse(null);
      prefetchPremiumData(place, raceNumber);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      isPriorityFetchInProgress.current = false;
    }
  };

  // SagaAIデータを取得してキャッシュに保存
  const fetchSagaAIData = async (place: string, raceNumber: string, isCurrentRace: boolean = false): Promise<SagaAIResponse | null> => {
    const cacheKey = `${selectedYear}_${date}_${place}_${raceNumber}`;
    
    // キャッシュチェック
    const cached = sagaAICache.current.get(cacheKey);
    if (cached) {
      if (isCurrentRace) {
        setCurrentSagaAIData(cached);
      }
      return cached;
    }
    
    try {
      const res = await fetch('/api/saga-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: String(selectedYear),
          date,
          place,
          raceNumber,
          useAI: false,
          trackCondition: '良',
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        const sagaData: SagaAIResponse = {
          analyses: data.analyses || [],
          summary: data.summary || '',
          aiEnabled: data.aiEnabled || false,
        };
        sagaAICache.current.set(cacheKey, sagaData);
        
        // 現在選択中のレースならstateに反映
        if (isCurrentRace) {
          setCurrentSagaAIData(sagaData);
        }
        return sagaData;
      }
    } catch (err) {
      console.warn('[SagaAI] プリフェッチエラー:', place, raceNumber);
    }
    return null;
  };

  const prefetchPremiumData = (place: string, raceNumber: string) => {
    // SagaAIデータを取得（現在のレース）
    fetchSagaAIData(place, raceNumber, true);

    // RacePaceも取得
    fetch(`/api/race-pace?year=${selectedYear}&date=${date}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`)
      .catch(() => {});
  };
  
  // 全レースのSagaAIをバックグラウンドでプリフェッチ（プロプランユーザー用）
  const prefetchAllSagaAI = async (venuesList: Venue[], currentPlace: string, currentRace: string) => {
    for (const venue of venuesList) {
      for (const race of venue.races) {
        // 現在表示中のレースはスキップ（既に取得済み）
        if (venue.place === currentPlace && race.race_number === currentRace) {
          continue;
        }
        
        const cacheKey = `${selectedYear}_${date}_${venue.place}_${race.race_number}`;
        if (!sagaAICache.current.has(cacheKey)) {
          // 少し間隔を空けてAPI負荷を軽減
          await new Promise(resolve => setTimeout(resolve, 200));
          await fetchSagaAIData(venue.place, race.race_number, false);
        }
      }
    }
    console.log('[SagaAI] 全レースのプリフェッチ完了');
  };

  const waitForPriorityFetch = async (signal: AbortSignal): Promise<boolean> => {
    while (isPriorityFetchInProgress.current) {
      if (signal.aborted) return false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return true;
  };

  const prefetchAllRaceCards = async (venuesList: Venue[]) => {
    if (prefetchAbortController.current) {
      prefetchAbortController.current.abort();
    }
    prefetchAbortController.current = new AbortController();
    const signal = prefetchAbortController.current.signal;
    currentVenuesList.current = venuesList;

    const allRaces: { place: string; raceNumber: string }[] = [];
    venuesList.forEach(venue => {
      venue.races.forEach(race => {
        allRaces.push({ place: venue.place, raceNumber: race.race_number });
      });
    });

    if (allRaces.length === 0) return;

    setPrefetchProgress({ current: 0, total: allRaces.length });

    let completed = 0;
    const CONCURRENCY = 5;
    
    for (let i = 0; i < allRaces.length; i += CONCURRENCY) {
      if (signal.aborted) break;

      const canContinue = await waitForPriorityFetch(signal);
      if (!canContinue) break;

      const batch = allRaces.slice(i, i + CONCURRENCY);
      
      await Promise.all(batch.map(async ({ place, raceNumber }) => {
        const cacheKey = `${selectedYear}_${date}_${place}_${raceNumber}`;
        
        if (raceCardCache.current.has(cacheKey)) {
          completed++;
          setPrefetchProgress({ current: completed, total: allRaces.length });
          return;
        }
        
        if (isIndexedDBAvailable()) {
          try {
            const persistedData = await getFromIndexedDB<RaceCard>(cacheKey);
            if (persistedData) {
              raceCardCache.current.set(cacheKey, persistedData);
              completed++;
              setPrefetchProgress({ current: completed, total: allRaces.length });
              return;
            }
          } catch (err) {}
        }

        if (isPriorityFetchInProgress.current || signal.aborted) return;

        try {
          const url = `/api/race-card-with-score?date=${date}&year=${selectedYear}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
          const res = await fetch(url, { signal });
          
          if (res.ok) {
            const data = await res.json();
            raceCardCache.current.set(cacheKey, data);
            
            if (isIndexedDBAvailable()) {
              setToIndexedDB(cacheKey, data, date).catch(() => {});
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error(`[Prefetch] ${place} ${raceNumber}R 失敗:`, err.message);
          }
        }
        
        completed++;
        setPrefetchProgress({ current: completed, total: allRaces.length });
      }));
    }

    if (!signal.aborted) {
      setTimeout(() => setPrefetchProgress(null), 2000);
    }
  };

  const currentRaces = venues.find(v => v.place === selectedVenue)?.races || [];

  // レース切り替え時のデータ取得
  useEffect(() => {
    if (!selectedVenue || !selectedRace) return;
    
    const loadRaceCard = async () => {
      const cacheKey = `${selectedYear}_${date}_${selectedVenue}_${selectedRace}`;
      
      // SagaAIキャッシュをチェックしてstateに反映
      const sagaCacheKey = `${selectedYear}_${date}_${selectedVenue}_${selectedRace}`;
      const cachedSagaData = sagaAICache.current.get(sagaCacheKey);
      if (cachedSagaData) {
        console.log('[SagaAI] キャッシュヒット:', sagaCacheKey);
        setCurrentSagaAIData(cachedSagaData);
      } else {
        // キャッシュがない場合はnullにしておく（SagaAICardが自分で取得）
        setCurrentSagaAIData(null);
      }
      
      // メモリキャッシュチェック
      const memoryCachedData = raceCardCache.current.get(cacheKey);
      if (memoryCachedData) {
        console.log('[useEffect] Memory cache hit:', cacheKey);
        setRaceCard(memoryCachedData);
        setExpandedHorse(null);
        // SagaAI等のプレミアムデータも取得（キャッシュになければ）
        if (!cachedSagaData) {
          prefetchPremiumData(selectedVenue, selectedRace);
        }
        return;
      }
      
      // IndexedDBキャッシュチェック
      if (isIndexedDBAvailable()) {
        try {
          const persistedData = await getFromIndexedDB<RaceCard>(cacheKey);
          if (persistedData) {
            console.log('[useEffect] IndexedDB cache hit:', cacheKey);
            raceCardCache.current.set(cacheKey, persistedData);
            setRaceCard(persistedData);
            setExpandedHorse(null);
            // SagaAI等のプレミアムデータも取得（キャッシュになければ）
            if (!cachedSagaData) {
              prefetchPremiumData(selectedVenue, selectedRace);
            }
            return;
          }
        } catch (err) {
          console.warn('[useEffect] IndexedDB error:', err);
        }
      }
      
      // キャッシュにない場合はAPIから取得
      console.log('[useEffect] Fetching from API:', cacheKey);
      fetchRaceCard(selectedVenue, selectedRace);
    };
    
    loadRaceCard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenue, selectedRace, date, selectedYear]);

  useEffect(() => {
    const fetchTimeHighlights = async () => {
      if (!date || !selectedVenue) return;
      
      try {
        const res = await fetch(`/api/time-check?date=${date}&place=${encodeURIComponent(selectedVenue)}&year=${selectedYear}`);
        
        if (res.ok) {
          const data = await res.json();
          const newHighlights = new Map<string, { count: number; timeDiff: number }>();
          
          for (const result of data.results || []) {
            if (result.hasExcellentTime || result.hasGoodTime) {
              const key = `${selectedVenue}_${result.raceNumber}`;
              newHighlights.set(key, {
                count: result.hasExcellentTime ? 2 : 1,
                timeDiff: result.bestTimeDiff ?? 1.0,
              });
            }
          }
          
          setTimeHighlights(newHighlights);
        }
      } catch (err) {
        console.error('[TimeCheck] エラー:', err);
      }
    };
    
    fetchTimeHighlights();
  }, [date, selectedYear, selectedVenue]);

  // SagaAI（おれAI）のバックグラウンドプリフェッチ（プロプランユーザー用）
  useEffect(() => {
    // プロプランでSagaAIが有効な場合のみ
    if (!showSagaAI) return;
    if (!date || !selectedVenue || !selectedRace || venues.length === 0) return;
    
    const startPrefetch = async () => {
      // 現在のレースを最優先で取得
      const currentCacheKey = `${selectedYear}_${date}_${selectedVenue}_${selectedRace}`;
      if (!sagaAICache.current.has(currentCacheKey)) {
        console.log('[SagaAI] 現在のレースを取得:', selectedVenue, selectedRace);
        await fetchSagaAIData(selectedVenue, selectedRace, true);
      }
      
      // 少し遅延してから他のレースをバックグラウンドでプリフェッチ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 全会場・全レースをプリフェッチ
      prefetchAllSagaAI(venues, selectedVenue, selectedRace);
    };
    
    const timer = setTimeout(startPrefetch, 200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSagaAI, date, selectedYear, selectedVenue, selectedRace, venues]);

  const getScoreTextColor = (score: number, hasData: boolean) => {
    if (!hasData) return 'text-slate-400';
    if (score >= 50) return 'text-amber-600 font-bold';
    if (score >= 40) return 'text-emerald-600 font-bold';
    if (score >= 30) return 'text-emerald-700 font-bold';
    if (score >= 20) return 'text-slate-700';
    return 'text-slate-500';
  };

  const getWakuColor = (waku: string) => {
    const wakuNum = parseInt(waku);
    const colors: Record<number, string> = {
      1: 'bg-white text-gray-900',
      2: 'bg-black text-white',
      3: 'bg-red-500 text-white',
      4: 'bg-blue-500 text-white',
      5: 'bg-yellow-400 text-gray-900',
      6: 'bg-green-500 text-white',
      7: 'bg-orange-500 text-white',
      8: 'bg-pink-400 text-white',
    };
    return colors[wakuNum] || 'bg-gray-500';
  };

  const getFinishColor = (finish: string) => {
    const finishNum = parseInt(toHalfWidth(finish));
    if (finishNum === 1) return 'text-red-500 font-bold';
    if (finishNum === 2) return 'text-blue-500 font-bold';
    if (finishNum === 3) return 'text-green-500 font-bold';
    return 'text-slate-700';
  };

  const toggleHorseExpand = (umaban: string) => {
    setExpandedHorse(expandedHorse === umaban ? null : umaban);
  };

  const navigateToDate = (pastDate: string) => {
    const queryDate = formatDateForQuery(pastDate);
    if (availableDates.includes(queryDate)) {
      setDate(queryDate);
      setSelectedRace('');
      setRaceCard(null);
    } else {
      alert(`${pastDate}のレースカードデータはありません`);
    }
  };

  const isDateClickable = (pastDate: string): boolean => {
    const queryDate = formatDateForQuery(pastDate);
    return availableDates.includes(queryDate);
  };

  const generateVenuePDF = async (venue: Venue) => {
    setVenuePdfGenerating(venue.place);
    try {
      const doc = new jsPDF({ compress: true });
      let isFirstPage = true;

      for (const race of venue.races) {
        const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}&year=${selectedYear}`);
        if (!res.ok) continue;
        const data = await res.json();

        if (!isFirstPage) doc.addPage();
        isFirstPage = false;
        
        let yOffset = 10;

        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:absolute;left:-9999px;width:800px;background:white;padding:20px;';

        const raceTitle = `${venue.place}${race.race_number}R ${race.class_name || ''} ${race.track_type}${race.distance}m`;

        const sortedHorses = [...data.horses].sort((a: Horse, b: Horse) => {
          if (a.hasData && !b.hasData) return -1;
          if (!a.hasData && b.hasData) return 1;
          if (a.hasData && b.hasData) return b.score - a.score;
          return parseInt(a.umaban) - parseInt(b.umaban);
        });

        const getFrameColorForPDF = (waku: string) => {
          const wakuNum = parseInt(waku);
          const colors: Record<number, { bg: string; text: string }> = {
            1: { bg: '#ffffff', text: '#000000' },
            2: { bg: '#000000', text: '#ffffff' },
            3: { bg: '#ff0000', text: '#ffffff' },
            4: { bg: '#0000ff', text: '#ffffff' },
            5: { bg: '#ffff00', text: '#000000' },
            6: { bg: '#00ff00', text: '#000000' },
            7: { bg: '#ff8c00', text: '#ffffff' },
            8: { bg: '#ff69b4', text: '#ffffff' },
          };
          return colors[wakuNum] || { bg: '#cccccc', text: '#000000' };
        };

        // 【PDF出力UI - 白背景＋淡い青色ヘッダー版（固定）】
        const getScoreColorForPDF = (rank: number, totalHorses: number) => {
          if (rank === 0) return '#FF6B6B'; // 1位：赤
          if (rank === 1) return '#FF8844'; // 2位：オレンジ
          if (rank === 2) return '#FFD93D'; // 3位：黄色
          if (rank < totalHorses / 2) return '#90EE90'; // 上位半分：緑
          return '#DDDDDD'; // それ以下：グレー
        };

        const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
          const frameColor = getFrameColorForPDF(horse.waku);
          const scoreColor = getScoreColorForPDF(rank, data.horses.length);
          const horseName = normalizeHorseName(horse.umamei);
          const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

          // 馬番の背景色を枠番の色に設定
          return `<tr>
            <td style="border:2px solid #333;padding:10px;text-align:center;background:${frameColor.bg};color:${frameColor.text};font-size:18px;font-weight:bold;width:50px;">${horse.umaban}</td>
            <td style="border:2px solid #333;padding:10px;text-align:left;font-size:18px;font-weight:bold;background:#ffffff;color:#000000;">${horseName}</td>
            <td style="border:2px solid #333;padding:10px;text-align:center;font-size:14px;width:100px;background:#ffffff;color:#333333;">${horse.kishu.trim()}</td>
            <td style="border:2px solid #333;padding:10px;text-align:center;font-size:14px;width:60px;background:#ffffff;color:#333333;">${horse.kinryo.trim()}</td>
            <td style="border:2px solid #333;padding:10px;text-align:center;background:${scoreColor};font-size:18px;font-weight:bold;width:80px;color:#000000;">${scoreDisplay}</td>
          </tr>`;
        }).join('');

        // ヘッダー色を薄め紺色(#B8C9E0)に設定、枠カラムを削除
        tempDiv.innerHTML = `<div style="font-family:'Noto Sans JP',sans-serif;background:#ffffff;padding:20px;">
          <h2 style="font-size:24px;font-weight:bold;margin-bottom:15px;color:#1a365d;">${raceTitle}</h2>
          <table style="width:100%;border-collapse:collapse;border:2px solid #333;">
            <thead><tr style="background:#B8C9E0;color:#1a365d;">
              <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:50px;">馬番</th>
              <th style="border:2px solid #333;padding:10px;text-align:left;font-size:16px;font-weight:bold;">馬名</th>
              <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:100px;">騎手</th>
              <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:60px;">斤量</th>
              <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:80px;">競う<br/>スコア</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;

        document.body.appendChild(tempDiv);
        const canvas = await html2canvas(tempDiv, { scale: 1, useCORS: true, logging: false });
        document.body.removeChild(tempDiv);

        const imgData = canvas.toDataURL('image/jpeg', 0.7);
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (yOffset + imgHeight > 280) {
          doc.addPage();
          yOffset = 10;
        }
        
        doc.addImage(imgData, 'JPEG', 10, yOffset, imgWidth, imgHeight);
      }

      doc.save(`${date}_${venue.place}.pdf`);
    } catch (err: any) {
      setError(`PDF生成エラー: ${err.message}`);
    } finally {
      setVenuePdfGenerating(null);
    }
  };

  const generateAllRacesPDF = async () => {
    setPdfGenerating(true);
    try {
      const doc = new jsPDF({ compress: true });
      let isFirstPage = true;

      for (const venue of venues) {
        for (const race of venue.races) {
          const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}&year=${selectedYear}`);
          if (!res.ok) continue;
          const data = await res.json();

          if (!isFirstPage) doc.addPage();
          isFirstPage = false;
          
          let yOffset = 10;

          const tempDiv = document.createElement('div');
          tempDiv.style.cssText = 'position:absolute;left:-9999px;width:800px;background:white;padding:20px;';

          const raceTitle = `${venue.place}${race.race_number}R ${race.class_name || ''} ${race.track_type}${race.distance}m`;

          const sortedHorses = [...data.horses].sort((a: Horse, b: Horse) => {
            if (a.hasData && !b.hasData) return -1;
            if (!a.hasData && b.hasData) return 1;
            if (a.hasData && b.hasData) return b.score - a.score;
            return parseInt(a.umaban) - parseInt(b.umaban);
          });

          const getFrameColorForPDF = (waku: string) => {
            const wakuNum = parseInt(waku);
            const colors: Record<number, { bg: string; text: string }> = {
              1: { bg: '#ffffff', text: '#000000' },
              2: { bg: '#000000', text: '#ffffff' },
              3: { bg: '#ff0000', text: '#ffffff' },
              4: { bg: '#0000ff', text: '#ffffff' },
              5: { bg: '#ffff00', text: '#000000' },
              6: { bg: '#00ff00', text: '#000000' },
              7: { bg: '#ff8c00', text: '#ffffff' },
              8: { bg: '#ff69b4', text: '#ffffff' },
            };
            return colors[wakuNum] || { bg: '#cccccc', text: '#000000' };
          };

          // 【PDF出力UI - 白背景＋淡い青色ヘッダー版（固定）】
          const getScoreColorForPDF = (rank: number, totalHorses: number) => {
            if (rank === 0) return '#FF6B6B'; // 1位：赤
            if (rank === 1) return '#FF8844'; // 2位：オレンジ
            if (rank === 2) return '#FFD93D'; // 3位：黄色
            if (rank < totalHorses / 2) return '#90EE90'; // 上位半分：緑
            return '#DDDDDD'; // それ以下：グレー
          };

          const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
            const frameColor = getFrameColorForPDF(horse.waku);
            const scoreColor = getScoreColorForPDF(rank, data.horses.length);
            const horseName = normalizeHorseName(horse.umamei);
            const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

            // 馬番の背景色を枠番の色に設定
            return `<tr>
              <td style="border:2px solid #333;padding:10px;text-align:center;background:${frameColor.bg};color:${frameColor.text};font-size:18px;font-weight:bold;width:50px;">${horse.umaban}</td>
              <td style="border:2px solid #333;padding:10px;text-align:left;font-size:18px;font-weight:bold;background:#ffffff;color:#000000;">${horseName}</td>
              <td style="border:2px solid #333;padding:10px;text-align:center;font-size:14px;width:100px;background:#ffffff;color:#333333;">${horse.kishu.trim()}</td>
              <td style="border:2px solid #333;padding:10px;text-align:center;font-size:14px;width:60px;background:#ffffff;color:#333333;">${horse.kinryo.trim()}</td>
              <td style="border:2px solid #333;padding:10px;text-align:center;background:${scoreColor};font-size:18px;font-weight:bold;width:80px;color:#000000;">${scoreDisplay}</td>
            </tr>`;
          }).join('');

          // ヘッダー色を薄め紺色(#B8C9E0)に設定、枠カラムを削除
          tempDiv.innerHTML = `<div style="font-family:'Noto Sans JP',sans-serif;background:#ffffff;padding:20px;">
            <h2 style="font-size:24px;font-weight:bold;margin-bottom:15px;color:#1a365d;">${raceTitle}</h2>
            <table style="width:100%;border-collapse:collapse;border:2px solid #333;">
              <thead><tr style="background:#B8C9E0;color:#1a365d;">
                <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:50px;">馬番</th>
                <th style="border:2px solid #333;padding:10px;text-align:left;font-size:16px;font-weight:bold;">馬名</th>
                <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:100px;">騎手</th>
                <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:60px;">斤量</th>
                <th style="border:2px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:80px;">競う<br/>スコア</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>`;

          document.body.appendChild(tempDiv);
          const canvas = await html2canvas(tempDiv, { scale: 1, useCORS: true, logging: false });
          document.body.removeChild(tempDiv);

          const imgData = canvas.toDataURL('image/jpeg', 0.7);
          const imgWidth = 190;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          if (yOffset + imgHeight > 280) {
            doc.addPage();
            yOffset = 10;
          }
          
          doc.addImage(imgData, 'JPEG', 10, yOffset, imgWidth, imgHeight);
        }
      }

      doc.save(`${date}_全レース.pdf`);
    } catch (err: any) {
      setError(`PDF生成エラー: ${err.message}`);
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div className="racecard-page overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">

        {/* 日付ナビゲーション */}
        <div className="mb-6">
          <div className="bg-white border-2 border-slate-300 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <button
              onClick={() => prevDate && setDate(prevDate)}
              disabled={!prevDate}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                prevDate 
                  ? 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700' 
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium hidden sm:inline">
                {prevDate ? formatDateForDisplay(prevDate) : ''}
              </span>
            </button>

            <div className="flex items-center gap-3">
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setSelectedRace('');
                  setRaceCard(null);
                }}
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-slate-800">
                  {formatDateForDisplay(date)}
                </div>
                <div className="text-xs text-slate-500">
                  {availableDates.length > 0 ? `${availableDates.length}日分のデータ` : ''}
                </div>
              </div>
            </div>

            <button
              onClick={() => nextDate && setDate(nextDate)}
              disabled={!nextDate}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                nextDate 
                  ? 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700' 
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span className="text-sm font-medium hidden sm:inline">
                {nextDate ? formatDateForDisplay(nextDate) : ''}
              </span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {venues.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">競馬場</label>
            <div className="flex gap-2 flex-wrap">
              {venues.map((venue) => (
                <div key={venue.place} className="flex items-center">
                  <button
                    onClick={() => {
                      setSelectedVenue(venue.place);
                      setSelectedRace('');
                      setRaceCard(null);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-l min-h-[44px] text-sm sm:text-base transition font-medium ${
                      selectedVenue === venue.place
                        ? 'bg-emerald-700 text-white border border-emerald-600'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-emerald-50 hover:border-emerald-300'
                    }`}
                  >
                    {venue.place}
                  </button>
                  <button
                    onClick={() => generateVenuePDF(venue)}
                    disabled={venuePdfGenerating === venue.place}
                    className={`px-2 py-2 rounded-r min-h-[44px] min-w-[44px] flex items-center justify-center transition ${
                      selectedVenue === venue.place
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-600'
                        : 'bg-white text-slate-500 border border-slate-300 border-l-0 hover:bg-emerald-50 hover:text-emerald-600'
                    } disabled:opacity-50`}
                    title={`${venue.place}のPDFをダウンロード`}
                  >
                    {venuePdfGenerating === venue.place ? (
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentRaces.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              レース
              {showSagaAI && <span className="ml-2 text-xs text-emerald-700 font-medium">(⏱️ = 時計優秀な馬あり)</span>}
              {prefetchProgress && (
                <span className="ml-2 text-xs text-amber-700 font-medium">
                  📥 レースデータ読み込み中 {prefetchProgress.current}/{prefetchProgress.total}
                </span>
              )}
              {!prefetchProgress && raceCardCache.current.size > 0 && (
                <span className="ml-2 text-xs text-emerald-700 font-medium">✓ {raceCardCache.current.size}件キャッシュ済</span>
              )}
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {currentRaces.map((race) => {
                const highlightKey = `${selectedVenue}_${race.race_number}`;
                const highlight = showSagaAI ? timeHighlights.get(highlightKey) : null;
                
                return (
                  <motion.button
                    key={race.race_number}
                    onClick={() => setSelectedRace(race.race_number)}
                    className={`px-2 sm:px-3 py-2 rounded text-xs sm:text-sm relative min-h-[56px] sm:min-h-[60px] shadow-sm ${
                      selectedRace === race.race_number
                        ? 'bg-emerald-700 text-white border-2 border-emerald-600 shadow-md'
                        : highlight
                          ? 'bg-white border-2 border-amber-400 text-slate-800'
                          : 'bg-white text-slate-800 border border-slate-300'
                    }`}
                    title={highlight ? `時計優秀: ${highlight.count >= 2 ? '上位超え' : '0.5秒以内'}` : ''}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <span className="font-semibold">{race.race_number}R</span>
                        {highlight && <span className={`text-xs ${highlight.count >= 2 ? 'text-amber-500' : 'text-amber-400'}`}>⏱️</span>}
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-slate-600 truncate max-w-full font-medium">{race.class_name || '未分類'}</span>
                      <span className="text-[10px] sm:text-xs text-slate-700 font-medium">{race.track_type}{race.distance}m</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {/* スケルトンUI */}
        {loading && (
          <div className="space-y-4">
            {/* レースヘッダースケルトン */}
            <div className="racecard-card rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-7 w-48 bg-slate-200 rounded animate-pulse"></div>
                <div className="h-6 w-24 bg-slate-200 rounded animate-pulse"></div>
              </div>
              <div className="h-5 w-64 bg-slate-100 rounded animate-pulse"></div>
            </div>
            
            {/* 馬リストスケルトン */}
            <div className="racecard-card rounded-2xl p-4 sm:p-6">
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-32 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-4 w-48 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                    <div className="h-8 w-16 bg-slate-200 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {raceCard && !loading && (
          <AnimatePresence mode="wait">
            <motion.div 
              key={`${selectedVenue}_${selectedRace}`}
              className="space-y-6"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
            {selectedRace && showRacePace && (
              <div id="race-pace-card">
                <CourseStyleRacePace
                  year={String(selectedYear)}
                  date={date}
                  place={selectedVenue}
                  raceNumber={selectedRace}
                  kisouScores={
                    raceCard.horses?.reduce((acc, horse) => {
                      acc[parseInt(horse.umaban, 10)] = horse.score || 0;
                      return acc;
                    }, {} as Record<number, number>)
                  }
                />
              </div>
            )}

            {selectedRace && showSagaAI && (
              <div id="saga-ai-card">
                <SagaAICard
                  year={String(selectedYear)}
                  date={date}
                  place={selectedVenue}
                  raceNumber={selectedRace}
                  cachedData={currentSagaAIData}
                  onHorseClick={(horseNumber) => {
                    // raceCardから馬番に対応する馬を見つける
                    const horse = raceCard?.horses.find(h => h.umaban === String(horseNumber));
                    if (horse) {
                      setSelectedHorseDetail(horse);
                    }
                  }}
                  onHorseAction={(horseName, horseNumber) => {
                    setHorseActionTarget({ name: horseName, number: horseNumber });
                  }}
                  favoriteHorses={favoriteHorses}
                />
              </div>
            )}

            <div className="racecard-card rounded-xl p-3 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-2 sm:mb-4">
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-800 text-balance">
                    {raceCard.raceInfo.place} {raceCard.raceInfo.raceNumber}R {raceCard.raceInfo.className}
                  </h2>
                  <p className="text-slate-600 text-sm sm:text-base font-medium">
                    {raceCard.raceInfo.trackType}{raceCard.raceInfo.distance}m / {raceCard.raceInfo.fieldSize}頭立
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowRaceMemo(true)}
                    className="bg-slate-600 hover:bg-slate-700 text-white text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-md"
                  >
                    📝 レースメモ
                  </button>
                  <button
                    onClick={() => setShowBabaMemo(true)}
                    className="bg-slate-600 hover:bg-slate-700 text-white text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-md"
                  >
                    🌿 馬場メモ
                  </button>
                </div>
              </div>
              {/* 並び替えトグル */}
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <span className="text-xs text-slate-600 font-medium">並び順:</span>
                <div className="flex bg-slate-200 rounded-lg p-0.5 shadow-inner border border-slate-300">
                  <button
                    onClick={() => setSortMode('score')}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                      sortMode === 'score'
                        ? 'bg-slate-600 text-white font-bold shadow-md'
                        : 'text-slate-700 hover:text-slate-900 font-medium'
                    }`}
                  >
                    🔥 スコア順
                  </button>
                  <button
                    onClick={() => setSortMode('umaban')}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                      sortMode === 'umaban'
                        ? 'bg-slate-600 text-white font-bold shadow-md'
                        : 'text-slate-700 hover:text-slate-900 font-medium'
                    }`}
                  >
                    📋 馬番順
                  </button>
                </div>
                {sessionStatus === 'authenticated' && !isRaceFinished && (
                  <span className="text-xs text-emerald-700 font-medium ml-auto">印をタップで予想登録</span>
                )}
                {isRaceFinished && (
                  <span className="text-xs bg-slate-100 text-slate-700 font-semibold ml-auto px-2 py-1 rounded border border-slate-300">🔒 確定済み</span>
                )}
              </div>

              <div className="table-scroll-container -mx-3 sm:mx-0 px-3 sm:px-0">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-emerald-700 text-white text-xs sm:text-base">
                      <th className="border-2 border-emerald-800 px-1 sm:px-2 py-2 sm:py-3 w-8 sm:w-10 font-semibold">馬番</th>
                      <th className="border-2 border-emerald-800 px-1 sm:px-3 py-2 sm:py-3 whitespace-nowrap w-10 sm:w-14 font-semibold">競う<br className="sm:hidden"/>スコア</th>
                      <th className="border-2 border-emerald-800 px-1 sm:px-2 py-2 sm:py-3 w-8 sm:w-10 font-semibold">印</th>
                      <th className="border-2 border-emerald-800 px-1 py-2 sm:py-3 w-6 sm:w-10 font-semibold" title="お気に入り">★</th>
                      <th className="border-2 border-emerald-800 px-1 sm:px-4 py-2 sm:py-3 font-semibold">馬名</th>
                      <th className="border-2 border-emerald-800 px-1 sm:px-3 py-2 sm:py-3 font-semibold whitespace-nowrap">騎手<span className="hidden sm:inline">(斤量)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...raceCard.horses].sort((a, b) => {
                      if (sortMode === 'umaban') {
                        // 馬番順：全馬を馬番順で表示
                        return parseInt(a.umaban) - parseInt(b.umaban);
                      }
                      // スコア順：データがある馬を上に
                      if (a.hasData && !b.hasData) return -1;
                      if (!a.hasData && b.hasData) return 1;
                      if (a.hasData && b.hasData) return b.score - a.score;
                      return parseInt(a.umaban) - parseInt(b.umaban);
                    }).map((horse, index) => {
                      const currentMark = predictions.get(horse.umaban) || null;
                      return (
                        <React.Fragment key={horse.umaban}>
                          <tr className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-100'} text-xs sm:text-base hover:bg-emerald-50 transition-colors`}>
                            {/* 馬番（枠色付き） */}
                            <td className={`border border-slate-300 px-1 sm:px-2 py-2 text-center font-bold ${getWakuColor(horse.waku)}`}>
                              {horse.umaban}
                            </td>
                            {/* 競うスコア - データがない場合は「-」表示 */}
                            <td className={`border border-slate-300 px-2 sm:px-3 py-2 text-center text-sm sm:text-lg font-bold tabular-nums ${getScoreTextColor(horse.score, horse.hasData)}`}>
                              {horse.hasData && horse.score != null ? Math.round(horse.score) : '-'}
                            </td>
                            {/* 印 */}
                            <td className="border border-slate-300 px-1 py-1 text-center">
                              {sessionStatus === 'authenticated' ? (
                                <InlineMarkSelector
                                  currentMark={currentMark}
                                  onMarkChange={(mark) => setPrediction(horse.umaban, mark)}
                                  disabled={isRaceFinished}
                                  compact
                                />
                              ) : (
                                <span className="text-slate-400 text-lg">-</span>
                              )}
                            </td>
                            {/* ★ お気に入り */}
                            <td className="border border-slate-300 px-1 py-1 text-center">
                              {(() => {
                                const horseName = normalizeHorseName(horse.umamei);
                                const isFavorite = favoriteHorses.includes(horseName);
                                return (
                                  <motion.button
                                    onClick={() => setHorseActionTarget({ 
                                      name: horseName, 
                                      number: horse.umaban 
                                    })}
                                    className={`text-lg ${
                                      isFavorite 
                                        ? 'text-amber-500' 
                                        : 'text-slate-300 hover:text-amber-400'
                                    }`}
                                    title="お気に入り・メモ"
                                    // アニメーション: ホバー時に拡大、クリック時に縮小
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.9 }}
                                    // お気に入り登録時に星が回転＆拡大
                                    animate={isFavorite ? {
                                      rotate: [0, -15, 15, 0],
                                      scale: [1, 1.3, 1],
                                    } : {}}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                  >
                                    {isFavorite ? '★' : '☆'}
                                  </motion.button>
                                );
                              })()}
                            </td>
                            {/* 馬名 */}
                            {(() => {
                              const horseName = normalizeHorseName(horse.umamei);
                              const isFavorite = favoriteHorses.includes(horseName);
                              const hasHorseRaceMemo = horseRaceMemosForCard.has(horseName);
                              return (
                                <td className={`border border-slate-300 px-1 sm:px-4 py-2 font-semibold ${isFavorite ? 'text-amber-600' : 'text-slate-900'}`}>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className={`
                                        flex-shrink-0 size-5 sm:size-6 rounded flex items-center justify-center
                                        text-[10px] sm:text-xs transition-all active:scale-95
                                        ${expandedHorse === horse.umaban 
                                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                                          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'
                                        }
                                      `}
                                      onClick={() => {
                                        toggleHorseExpand(horse.umaban);
                                        loadHorseRaceMemosFor(horseName);
                                      }}
                                      title="過去走を表示"
                                    >
                                      {expandedHorse === horse.umaban ? '▲' : '▼'}
                                    </button>
                                    <span 
                                      className={`truncate max-w-[60px] sm:max-w-none cursor-pointer hover:underline transition-colors ${isFavorite ? 'hover:text-amber-700' : 'hover:text-emerald-600'}`}
                                      onClick={() => setSelectedHorseDetail(horse)}
                                      title="馬の詳細情報を表示"
                                    >
                                      {horseName}
                                    </span>
                                    {/* 今走メモボタン */}
                                    <button
                                      className={`flex-shrink-0 text-[11px] sm:text-xs px-1 py-0.5 rounded transition-colors ${
                                        hasHorseRaceMemo
                                          ? 'bg-amber-100 text-amber-600 border border-amber-300'
                                          : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-amber-50 hover:text-amber-500'
                                      }`}
                                      onClick={() => setHorseRaceMemoPopup({
                                        horseName,
                                        draft: horseRaceMemosForCard.get(horseName) || '',
                                      })}
                                      title="今走メモを書く"
                                    >
                                      📓
                                    </button>
                                  </div>
                                </td>
                              );
                            })()}
                            {/* 騎手(斤量) */}
                            <td className="border border-slate-300 px-1 sm:px-3 py-2 text-slate-700 whitespace-nowrap text-[10px] sm:text-sm">
                              <span className="sm:hidden">{horse.kishu.trim().slice(0, 3)}</span>
                              <span className="hidden sm:inline">{horse.kishu.trim()}</span>
                              <span className="text-slate-500">({horse.kinryo.trim()})</span>
                            </td>
                          </tr>
                          {expandedHorse === horse.umaban && (
                            <tr key={`${horse.umaban}-detail`}>
                              <td colSpan={6} className="border border-slate-300 p-2 sm:p-4 bg-slate-50 overflow-hidden max-w-0">
                                <div className="text-xs sm:text-sm font-bold mb-3 text-emerald-700">
                                  {normalizeHorseName(horse.umamei)} の過去走詳細
                                </div>
                                <PastRaceDetail 
                                  pastRaces={horse.past}
                                  isPremium={showSagaAI}
                                  onDateClick={navigateToDate}
                                  isDateClickable={isDateClickable}
                                  raceMemos={raceMemos}
                                  horseRaceMemos={horseRaceMemosCache.get(normalizeHorseName(horse.umamei))}
                                  onMemoClick={(raceKey, raceTitle, memo) => 
                                    setPastRaceMemoPopup({ raceKey, raceTitle, memo })
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </motion.div>
          </AnimatePresence>
        )}
        
        {selectedHorseDetail && (() => {
          // SagaAI分析結果からタイム評価・ラップ評価を取得
          const sagaAnalysis = currentSagaAIData?.analyses?.find(
            a => a.horseNumber === parseInt(selectedHorseDetail.umaban)
          );
          // お気に入り馬のメモを取得
          const horseName = selectedHorseDetail.umamei?.replace(/^[\$\*＄＊\s　]+/, '').trim() || '';
          const horseMemo = favoriteHorseMemos.get(horseName);
          // メモをhorseオブジェクトに追加
          const horseWithMemo = horseMemo ? { ...selectedHorseDetail, memo: horseMemo } : selectedHorseDetail;
          
          return (
            <HorseDetailModal
              horse={horseWithMemo}
              onClose={() => setSelectedHorseDetail(null)}
              raceInfo={raceCard ? {
                place: raceCard.raceInfo.place,
                surface: raceCard.raceInfo.trackType.includes('芝') ? '芝' : 'ダ',
                distance: parseInt(raceCard.raceInfo.distance) || 0
              } : undefined}
              timeEvaluation={sagaAnalysis?.timeEvaluation}
              lapEvaluation={sagaAnalysis?.lapEvaluation}
              isPremium={showSagaAI}
            />
          );
        })()}

        {/* お気に入り・メモポップアップ */}
        {horseActionTarget && raceCard && (
          <HorseActionPopup
            horseName={horseActionTarget.name}
            horseNumber={horseActionTarget.number}
            raceKey={`${raceCard.raceInfo.date}_${raceCard.raceInfo.place}_${raceCard.raceInfo.raceNumber}`}
            isOpen={true}
            onClose={() => setHorseActionTarget(null)}
            onFavoriteChange={fetchFavoriteHorses}
          />
        )}

        {/* 馬場メモフォーム */}
        {showBabaMemo && raceCard && (() => {
          const isShiba = raceCard.raceInfo.trackType.includes('芝');
          const trackType = isShiba ? '芝' : 'ダート';
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/60" onClick={() => setShowBabaMemo(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                <div className={`px-5 py-4 flex items-center justify-between ${isShiba ? 'bg-green-800' : 'bg-amber-700'}`}>
                  <h2 className="text-lg font-bold text-white">
                    {isShiba ? '🌿' : '🏜️'} 馬場メモ（{trackType}）
                  </h2>
                  <button
                    onClick={() => setShowBabaMemo(false)}
                    className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    aria-label="閉じる"
                  >
                    <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  <BabaMemoForm
                    trackType={trackType}
                    place={raceCard.raceInfo.place}
                    date={raceCard.raceInfo.date}
                    onSaved={() => setShowBabaMemo(false)}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* レースメモフォーム */}
        {showRaceMemo && raceCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60" onClick={() => setShowRaceMemo(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between bg-slate-700">
                <h2 className="text-lg font-bold text-white">
                  📝 レースメモ
                </h2>
                <button
                  onClick={() => setShowRaceMemo(false)}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="閉じる"
                >
                  <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <RaceMemoForm
                  raceKey={`${raceCard.raceInfo.date}_${raceCard.raceInfo.place}_${raceCard.raceInfo.raceNumber}`}
                  raceTitle={`${raceCard.raceInfo.place} ${raceCard.raceInfo.raceNumber}R ${raceCard.raceInfo.className}`}
                  onSaved={() => setShowRaceMemo(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* 過去走レースメモ表示ポップアップ */}
        {pastRaceMemoPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60" onClick={() => setPastRaceMemoPopup(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between bg-amber-500">
                <h2 className="text-lg font-bold text-white">
                  📝 {pastRaceMemoPopup.raceTitle}
                </h2>
                <button
                  onClick={() => setPastRaceMemoPopup(null)}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="閉じる"
                >
                  <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-slate-800 whitespace-pre-wrap">{pastRaceMemoPopup.memo}</p>
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                  このレースで記録したメモです
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 今走メモ編集ポップアップ */}
        {horseRaceMemoPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60" onClick={() => setHorseRaceMemoPopup(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between bg-amber-500">
                <h2 className="text-base font-bold text-white">
                  📓 今走メモ — {horseRaceMemoPopup.horseName}
                </h2>
                <button
                  onClick={() => setHorseRaceMemoPopup(null)}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="閉じる"
                >
                  <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  rows={5}
                  placeholder="この馬の今走についてメモを書く&#10;（例: 外枠不利、斤量増、輸送明け...）"
                  value={horseRaceMemoPopup.draft}
                  onChange={e => setHorseRaceMemoPopup(prev => prev ? { ...prev, draft: e.target.value } : null)}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
                    onClick={async () => {
                      await saveHorseRaceMemo(horseRaceMemoPopup.horseName, horseRaceMemoPopup.draft);
                      setHorseRaceMemoPopup(null);
                    }}
                  >
                    保存
                  </button>
                  {horseRaceMemosForCard.has(horseRaceMemoPopup.horseName) && (
                    <button
                      className="px-4 py-2 rounded-lg bg-red-100 text-red-600 text-sm hover:bg-red-200 transition-colors"
                      onClick={async () => {
                        await saveHorseRaceMemo(horseRaceMemoPopup.horseName, '');
                        setHorseRaceMemoPopup(null);
                      }}
                    >
                      削除
                    </button>
                  )}
                  <button
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 transition-colors"
                    onClick={() => setHorseRaceMemoPopup(null)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
