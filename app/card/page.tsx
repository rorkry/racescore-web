'use client';

import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import CourseStyleRacePace from '@/app/components/CourseStyleRacePace';
import SagaAICard from '@/app/components/SagaAICard';
import HorseDetailModal from '@/app/components/HorseDetailModal';
import { useFeatureAccess } from '@/app/components/FloatingActionButton';
import { 
  getFromIndexedDB, 
  setToIndexedDB, 
  clearExpiredCache, 
  isIndexedDBAvailable 
} from '@/lib/indexeddb-cache';

interface PastRaceIndices {
  L4F: number | null;
  T2F: number | null;
  potential: number | null;
  revouma: number | null;
  makikaeshi: number | null;
  cushion: number | null;
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  index_value: string;
  corner_2: string;
  corner_3: string;
  corner_4: string;
  pci: string;
  popularity: string;
  track_condition: string;
  place: string;
  indices?: PastRaceIndices | null;
  indexRaceId?: string;
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

function normalizeHorseName(name: string): string {
  return name.trim().replace(/^[\$\*\s]+/, '').trim();
}

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
  const [selectedYear, setSelectedYear] = useState<number>(getTodayYear());
  const [date, setDate] = useState(getTodayDate());
  const [availableDates, setAvailableDates] = useState<string[]>([]);
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

  const [selectedHorseDetail, setSelectedHorseDetail] = useState<Horse | null>(null);

  const raceCardCache = useRef<Map<string, RaceCard>>(new Map());
  
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
    fetchAvailableDates();
  }, [selectedYear]);

  const fetchAvailableDates = async () => {
    try {
      const res = await fetch(`/api/races?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch dates');
      const data = await res.json();
      const dates = (data.dates || []).map((d: { date: string }) => d.date);
      setAvailableDates(dates);
      
      const today = getTodayDate();
      const currentYear = getTodayYear();
      
      if (selectedYear === currentYear && dates.includes(today)) {
        setDate(today);
      } else if (dates.length > 0) {
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
        setSelectedVenue(data.venues[0].place);
        if (data.venues[0].races && data.venues[0].races.length > 0) {
          setSelectedRace(data.venues[0].races[0].race_number);
        }
        prefetchAllRaceCards(data.venues);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const prefetchPremiumData = (place: string, raceNumber: string) => {
    fetch('/api/saga-ai', {
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
    }).catch(() => {});

    fetch(`/api/race-pace?year=${selectedYear}&date=${date}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`)
      .catch(() => {});
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

  useEffect(() => {
    if (selectedVenue && selectedRace) {
      fetchRaceCard(selectedVenue, selectedRace);
    }
  }, [selectedVenue, selectedRace]);

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

  useEffect(() => {
    const prefetchSagaAI = async () => {
      if (!date || !selectedVenue || currentRaces.length === 0) return;
      
      const racesToPrefetch = currentRaces.slice(0, 3);
      
      for (const race of racesToPrefetch) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          fetch('/api/saga-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year: String(selectedYear),
              date,
              place: selectedVenue,
              raceNumber: race.race_number,
              useAI: false,
              trackCondition: '良',
            }),
          }).catch(() => {});
        } catch {}
      }
    };
    
    const timer = setTimeout(prefetchSagaAI, 500);
    return () => clearTimeout(timer);
  }, [date, selectedYear, selectedVenue, currentRaces]);

  const getScoreTextColor = (score: number, hasData: boolean) => {
    if (!hasData) return 'text-green-600/50';
    if (score >= 50) return 'text-yellow-400 font-bold';
    if (score >= 40) return 'text-yellow-500 font-bold';
    if (score >= 30) return 'text-green-400 font-bold';
    if (score >= 20) return 'text-green-300';
    return 'text-green-400/70';
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
    if (finishNum === 1) return 'text-yellow-400 font-bold';
    if (finishNum === 2) return 'text-gray-300 font-bold';
    if (finishNum === 3) return 'text-amber-600 font-bold';
    return 'text-green-200';
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

        const getScoreColorForPDF = (rank: number, totalHorses: number) => {
          if (rank === 0) return '#d4af37';
          if (rank === 1) return '#c0c0c0';
          if (rank === 2) return '#cd7f32';
          if (rank < totalHorses / 2) return '#166534';
          return '#1a1a1a';
        };

        const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
          const frameColor = getFrameColorForPDF(horse.waku);
          const scoreColor = getScoreColorForPDF(rank, data.horses.length);
          const horseName = normalizeHorseName(horse.umamei);
          const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

          return `<tr>
            <td style="border:1px solid #333;padding:10px;text-align:center;background:${frameColor.bg};width:25px;"></td>
            <td style="border:1px solid #333;padding:10px;text-align:center;background:#0a1f13;color:#fff;font-size:18px;font-weight:bold;width:50px;">${horse.umaban}</td>
            <td style="border:1px solid #333;padding:10px;text-align:left;font-size:18px;font-weight:bold;background:#0f1a14;color:#f0fdf4;">${horseName}</td>
            <td style="border:1px solid #333;padding:10px;text-align:center;font-size:14px;width:100px;background:#0f1a14;color:#86efac;">${horse.kishu.trim()}</td>
            <td style="border:1px solid #333;padding:10px;text-align:center;font-size:14px;width:60px;background:#0f1a14;color:#86efac;">${horse.kinryo.trim()}</td>
            <td style="border:1px solid #333;padding:10px;text-align:center;background:${scoreColor};font-size:18px;font-weight:bold;width:80px;color:#fff;">${scoreDisplay}</td>
          </tr>`;
        }).join('');

        tempDiv.innerHTML = `<div style="font-family:'Noto Sans JP',sans-serif;background:#0a1f13;padding:20px;">
          <h2 style="font-size:24px;font-weight:bold;margin-bottom:15px;color:#d4af37;">${raceTitle}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#166534;color:white;">
              <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:25px;">枠</th>
              <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:50px;">馬番</th>
              <th style="border:1px solid #333;padding:10px;text-align:left;font-size:16px;font-weight:bold;">馬名</th>
              <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:100px;">騎手</th>
              <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:60px;">斤量</th>
              <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:80px;">競う<br/>スコア</th>
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

          const getScoreColorForPDF = (rank: number, totalHorses: number) => {
            if (rank === 0) return '#d4af37';
            if (rank === 1) return '#c0c0c0';
            if (rank === 2) return '#cd7f32';
            if (rank < totalHorses / 2) return '#166534';
            return '#1a1a1a';
          };

          const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
            const frameColor = getFrameColorForPDF(horse.waku);
            const scoreColor = getScoreColorForPDF(rank, data.horses.length);
            const horseName = normalizeHorseName(horse.umamei);
            const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

            return `<tr>
              <td style="border:1px solid #333;padding:10px;text-align:center;background:${frameColor.bg};width:25px;"></td>
              <td style="border:1px solid #333;padding:10px;text-align:center;background:#0a1f13;color:#fff;font-size:18px;font-weight:bold;width:50px;">${horse.umaban}</td>
              <td style="border:1px solid #333;padding:10px;text-align:left;font-size:18px;font-weight:bold;background:#0f1a14;color:#f0fdf4;">${horseName}</td>
              <td style="border:1px solid #333;padding:10px;text-align:center;font-size:14px;width:100px;background:#0f1a14;color:#86efac;">${horse.kishu.trim()}</td>
              <td style="border:1px solid #333;padding:10px;text-align:center;font-size:14px;width:60px;background:#0f1a14;color:#86efac;">${horse.kinryo.trim()}</td>
              <td style="border:1px solid #333;padding:10px;text-align:center;background:${scoreColor};font-size:18px;font-weight:bold;width:80px;color:#fff;">${scoreDisplay}</td>
            </tr>`;
          }).join('');

          tempDiv.innerHTML = `<div style="font-family:'Noto Sans JP',sans-serif;background:#0a1f13;padding:20px;">
            <h2 style="font-size:24px;font-weight:bold;margin-bottom:15px;color:#d4af37;">${raceTitle}</h2>
            <table style="width:100%;border-collapse:collapse;">
              <thead><tr style="background:#166534;color:white;">
                <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:25px;">枠</th>
                <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:50px;">馬番</th>
                <th style="border:1px solid #333;padding:10px;text-align:left;font-size:16px;font-weight:bold;">馬名</th>
                <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:100px;">騎手</th>
                <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:60px;">斤量</th>
                <th style="border:1px solid #333;padding:10px;text-align:center;font-size:16px;font-weight:bold;width:80px;">競う<br/>スコア</th>
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

  const PastRaceDetail = ({ pastRaces }: { pastRaces: PastRace[] }) => {
    if (!pastRaces || pastRaces.length === 0) {
      return <div className="text-green-400/50 text-xs sm:text-sm p-2 sm:p-4">過去走データなし</div>;
    }

    return (
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-max text-[10px] sm:text-sm border-collapse">
          <thead>
            <tr className="bg-green-900/50">
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">日付</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">場所</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">クラス</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">距離</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">人気</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">着順</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">着差</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-300 whitespace-nowrap">通過</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">巻返し</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">L4F</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">T2F</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">ポテ</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">レボ</th>
              <th className="border border-green-800 px-1 sm:px-2 py-1 text-center text-yellow-400 bg-yellow-900/20 whitespace-nowrap">クッション</th>
            </tr>
          </thead>
          <tbody>
            {pastRaces.map((race, idx) => {
              const passing = [race.corner_2, race.corner_3, race.corner_4]
                .filter(c => c && c !== '')
                .join('-');
              const clickable = isDateClickable(race.date);
              
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-green-950/30' : 'bg-green-900/20'}>
                  <td 
                    className={`border border-green-800 px-1 sm:px-2 py-1 text-center whitespace-nowrap ${
                      clickable ? 'text-yellow-400 underline cursor-pointer hover:bg-green-800/50' : 'text-green-200'
                    }`}
                    onClick={() => clickable && navigateToDate(race.date)}
                  >
                    {race.date || '-'}
                  </td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200 whitespace-nowrap">{race.place || '-'}</td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200 whitespace-nowrap">{race.class_name || '-'}</td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200 whitespace-nowrap">{race.distance || '-'}</td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200">{race.popularity || '-'}</td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center ${getFinishColor(race.finish_position || '')}`}>{toHalfWidth(race.finish_position || '-')}</td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200">{race.margin || '-'}</td>
                  <td className="border border-green-800 px-1 sm:px-2 py-1 text-center text-green-200 whitespace-nowrap">{passing || '-'}</td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.makikaeshi != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.makikaeshi != null ? Number(race.indices.makikaeshi).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.L4F != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.L4F != null ? Number(race.indices.L4F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.T2F != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.T2F != null ? Number(race.indices.T2F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.potential != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.potential != null ? Number(race.indices.potential).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.revouma != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.revouma != null ? Number(race.indices.revouma).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-green-800 px-1 sm:px-2 py-1 text-center bg-yellow-900/10 ${race.indices?.cushion != null ? 'text-yellow-400 font-medium' : 'text-green-600'}`}>
                    {race.indices?.cushion != null ? Number(race.indices.cushion).toFixed(1) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[10px] sm:text-xs text-green-500/50 mt-2">※ 横スクロールで指数データを確認できます</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">

        {/* 日付ナビゲーション */}
        <div className="mb-6">
          <div className="glass-card rounded-xl p-4 flex items-center justify-between">
            <button
              onClick={() => prevDate && setDate(prevDate)}
              disabled={!prevDate}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                prevDate 
                  ? 'text-green-300 hover:bg-green-800/30 hover:text-yellow-400' 
                  : 'text-green-700 cursor-not-allowed'
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
                className="bg-green-900/50 border border-green-700 rounded-lg px-3 py-2 text-green-100 text-sm focus:outline-none focus:border-yellow-500"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gold-text">
                  {formatDateForDisplay(date)}
                </div>
                <div className="text-xs text-green-400/70">
                  {availableDates.length > 0 ? `${availableDates.length}日分のデータ` : ''}
                </div>
              </div>
            </div>

            <button
              onClick={() => nextDate && setDate(nextDate)}
              disabled={!nextDate}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                nextDate 
                  ? 'text-green-300 hover:bg-green-800/30 hover:text-yellow-400' 
                  : 'text-green-700 cursor-not-allowed'
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
          <div className="mb-4 flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={bulkGenerateAnalysis}
              disabled={bulkGenerating || pdfGenerating}
              className="px-4 sm:px-6 py-3 btn-gold rounded-lg text-sm sm:text-base min-h-[44px] disabled:opacity-50"
            >
              {bulkGenerating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {bulkGenerateProgress ? `${bulkGenerateProgress.current}/${bulkGenerateProgress.total}` : '生成中...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">🧠 一括生成</span>
              )}
            </button>
            
            {bulkGenerateResult && (
              <span className="flex items-center px-3 py-2 bg-green-800/50 text-green-300 rounded-lg text-sm border border-green-700">
                ✅ {bulkGenerateResult.success}レース生成完了 ({bulkGenerateResult.time}秒)
                {bulkGenerateResult.error > 0 && (
                  <span className="ml-2 text-red-400">({bulkGenerateResult.error}件エラー)</span>
                )}
              </span>
            )}
            
            <button
              onClick={generateAllRacesPDF}
              disabled={pdfGenerating || bulkGenerating}
              className="px-4 sm:px-6 py-3 btn-turf rounded-lg text-sm sm:text-base min-h-[44px] disabled:opacity-50"
            >
              {pdfGenerating ? 'PDF生成中...' : '📄 全レースPDF'}
            </button>
          </div>
        )}

        {venues.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-medium text-green-300 mb-2">競馬場</label>
            <div className="flex gap-2 flex-wrap">
              {venues.map((venue) => (
                <div key={venue.place} className="flex items-center">
                  <button
                    onClick={() => {
                      setSelectedVenue(venue.place);
                      setSelectedRace('');
                      setRaceCard(null);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-l min-h-[44px] text-sm sm:text-base transition ${
                      selectedVenue === venue.place
                        ? 'bg-green-700 text-white border border-green-600'
                        : 'glass-card text-green-200 hover:bg-green-800/50'
                    }`}
                  >
                    {venue.place}
                  </button>
                  <button
                    onClick={() => generateVenuePDF(venue)}
                    disabled={venuePdfGenerating === venue.place}
                    className={`px-2 py-2 rounded-r min-h-[44px] min-w-[44px] flex items-center justify-center transition ${
                      selectedVenue === venue.place
                        ? 'bg-green-600 text-white hover:bg-green-500'
                        : 'glass-card text-green-400 hover:bg-green-800/50'
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
            <label className="block text-xs sm:text-sm font-medium text-green-300 mb-2">
              レース
              {showSagaAI && <span className="ml-2 text-xs text-green-500">(⏱️ = 時計優秀な馬あり)</span>}
              {prefetchProgress && (
                <span className="ml-2 text-xs text-yellow-400 animate-pulse">
                  📥 レースデータ読み込み中 {prefetchProgress.current}/{prefetchProgress.total}
                </span>
              )}
              {!prefetchProgress && raceCardCache.current.size > 0 && (
                <span className="ml-2 text-xs text-green-500">✓ {raceCardCache.current.size}件キャッシュ済</span>
              )}
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {currentRaces.map((race) => {
                const highlightKey = `${selectedVenue}_${race.race_number}`;
                const highlight = showSagaAI ? timeHighlights.get(highlightKey) : null;
                
                return (
                  <button
                    key={race.race_number}
                    onClick={() => setSelectedRace(race.race_number)}
                    className={`px-2 sm:px-3 py-2 rounded text-xs sm:text-sm relative min-h-[56px] sm:min-h-[60px] transition ${
                      selectedRace === race.race_number
                        ? 'bg-green-700 text-white border border-green-500'
                        : highlight
                          ? 'glass-card border-2 border-yellow-500/50 text-green-200 hover:bg-green-800/50'
                          : 'glass-card text-green-200 hover:bg-green-800/50'
                    }`}
                    title={highlight ? `時計優秀: ${highlight.count >= 2 ? '上位超え' : '0.5秒以内'}` : ''}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <span className="font-medium">{race.race_number}R</span>
                        {highlight && <span className={`text-xs ${highlight.count >= 2 ? 'text-yellow-400' : 'text-yellow-500'}`}>⏱️</span>}
                      </div>
                      <span className="text-[9px] sm:text-[10px] opacity-70 truncate max-w-full">{race.class_name || '未分類'}</span>
                      <span className="text-[10px] sm:text-xs opacity-80">{race.track_type}{race.distance}m</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-12 h-12 border-4 border-green-700 border-t-yellow-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-green-400/70">読み込み中...</p>
          </div>
        )}

        {raceCard && !loading && (
          <div className="space-y-6">
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
                />
              </div>
            )}

            <div className="gold-border-card rounded-xl p-3 sm:p-6">
              <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-4 gold-text">
                {raceCard.raceInfo.place} {raceCard.raceInfo.raceNumber}R {raceCard.raceInfo.className}
              </h2>
              <p className="text-green-400/70 mb-2 sm:mb-4 text-sm sm:text-base">
                {raceCard.raceInfo.trackType}{raceCard.raceInfo.distance}m / {raceCard.raceInfo.fieldSize}頭立
              </p>
              <p className="text-xs sm:text-sm text-green-500/50 mb-3 sm:mb-4">
                ※馬名をクリックすると馬の詳細情報が表示されます　|　▼をクリックすると過去走が展開されます
              </p>

              <div className="table-scroll-container -mx-3 sm:mx-0 px-3 sm:px-0">
                <table className="w-full border-collapse min-w-[500px] sm:min-w-0">
                  <thead>
                    <tr className="bg-green-800 text-white text-xs sm:text-base">
                      <th className="border border-green-700 px-1 sm:px-2 py-2 sm:py-3">枠</th>
                      <th className="border border-green-700 px-1 sm:px-2 py-2 sm:py-3">馬番</th>
                      <th className="border border-green-700 px-2 sm:px-4 py-2 sm:py-3">馬名</th>
                      <th className="border border-green-700 px-2 sm:px-4 py-2 sm:py-3">騎手</th>
                      <th className="border border-green-700 px-1 sm:px-2 py-2 sm:py-3">斤量</th>
                      <th className="border border-green-700 px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">競う<br className="sm:hidden"/>スコア</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...raceCard.horses].sort((a, b) => {
                      if (a.hasData && !b.hasData) return -1;
                      if (!a.hasData && b.hasData) return 1;
                      if (a.hasData && b.hasData) return b.score - a.score;
                      return parseInt(a.umaban) - parseInt(b.umaban);
                    }).map((horse, index) => (
                      <React.Fragment key={horse.umaban}>
                        <tr className={`${index % 2 === 0 ? 'bg-green-950/50' : 'bg-green-900/30'} text-xs sm:text-base`}>
                          <td className={`border border-green-800 px-1 sm:px-2 py-2 text-center ${getWakuColor(horse.waku)}`}>
                            {horse.waku}
                          </td>
                          <td className="border border-green-800 px-1 sm:px-2 py-2 text-center font-bold text-green-100">
                            {horse.umaban}
                          </td>
                          <td className="border border-green-800 px-2 sm:px-4 py-2 font-medium text-green-100">
                            <div className="flex items-center justify-between gap-2">
                              <span 
                                className="truncate max-w-[100px] sm:max-w-none cursor-pointer hover:text-yellow-400 hover:underline transition-colors"
                                onClick={() => setSelectedHorseDetail(horse)}
                                title="馬の詳細情報を表示"
                              >
                                {normalizeHorseName(horse.umamei)}
                              </span>
                              <button
                                className="text-green-500 hover:text-yellow-400 text-xs sm:text-sm px-1 flex-shrink-0"
                                onClick={() => toggleHorseExpand(horse.umaban)}
                                title="過去走を表示"
                              >
                                {expandedHorse === horse.umaban ? '▲' : '▼'}
                              </button>
                            </div>
                          </td>
                          <td className="border border-green-800 px-2 sm:px-4 py-2 text-green-300 whitespace-nowrap">
                            {horse.kishu.trim()}
                          </td>
                          <td className="border border-green-800 px-1 sm:px-2 py-2 text-center text-green-300">
                            {horse.kinryo.trim()}
                          </td>
                          <td className={`border border-green-800 px-2 sm:px-4 py-2 text-center text-sm sm:text-lg font-bold ${getScoreTextColor(horse.score, horse.hasData)}`}>
                            {horse.hasData && horse.score != null ? Math.round(horse.score) : 'N/A'}
                          </td>
                        </tr>
                        {expandedHorse === horse.umaban && (
                          <tr key={`${horse.umaban}-detail`}>
                            <td colSpan={6} className="border border-green-800 p-2 sm:p-4 bg-green-950/50">
                              <div className="text-xs sm:text-sm font-bold mb-2 gold-text">
                                {normalizeHorseName(horse.umamei)} の過去走詳細
                              </div>
                              <PastRaceDetail pastRaces={horse.past} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        
        {selectedHorseDetail && (
          <HorseDetailModal
            horse={selectedHorseDetail}
            onClose={() => setSelectedHorseDetail(null)}
            raceInfo={raceCard ? {
              place: raceCard.raceInfo.place,
              surface: raceCard.raceInfo.trackType.includes('芝') ? '芝' : 'ダ',
              distance: parseInt(raceCard.raceInfo.distance) || 0
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}
