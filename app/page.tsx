'use client';

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import CourseStyleRacePace from '@/app/components/CourseStyleRacePace';
import SagaAICard from '@/app/components/SagaAICard';
import { useFeatureAccess } from '@/app/components/FloatingActionButton';
import { getCourseInfo } from '@/lib/course-characteristics';

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
  index_value: string;  // 4コーナーを回った位置（0=最内, 4=大外）
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

// 全角→半角変換
function toHalfWidth(str: string): string {
  return str.replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

// 馬名から$マーク・*マークを除去
function normalizeHorseName(name: string): string {
  return name.trim().replace(/^[\$\*\s]+/, '').trim();
}

// 日付フォーマット変換（"2025.12. 6" → "1206"）
function formatDateForQuery(dateStr: string): string {
  // "2025.12. 6" or "2025. 1. 5" のような形式を "1206" or "0105" に変換
  const match = dateStr.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
  if (match) {
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${month}${day}`;
  }
  return dateStr;
}

// 日付表示用フォーマット（"1220" → "12/20"）
function formatDateForDisplay(dateStr: string): string {
  if (dateStr.length === 4) {
    return `${dateStr.slice(0, 2)}/${dateStr.slice(2)}`;
  }
  return dateStr;
}

// 今日の日付をMMDD形式で取得（例: 12/27 → "1227"）
function getTodayDate(): string {
  // ブラウザのローカルタイムゾーンを使用（日本で使用する場合はJST）
  const now = new Date();
  
  // 日本時間（JST）で取得するため、UTC+9のオフセットを適用
  // または、ブラウザのローカルタイムを使用（日本で使用する場合は自動的にJST）
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}${day}`;
}

// 今日の年を取得
function getTodayYear(): number {
  return new Date().getFullYear();
}

export default function RaceCardPage() {
  // 今日の日付と年を初期値として使用
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
  
  // おれAI & 展開予想 一括生成
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkGenerateResult, setBulkGenerateResult] = useState<{ success: number; error: number; time: number } | null>(null);

  // プレミアム機能のアクセス制御（FABから切り替え）
  const showRacePace = useFeatureAccess('race-pace');
  const showSagaAI = useFeatureAccess('saga-ai');

  // 利用可能な日付一覧を取得（年が変わったら再取得）
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
      
      // 利用可能な日付が取得できたら、今日の日付があれば自動選択
      const today = getTodayDate();
      const currentYear = getTodayYear();
      console.log('今日の日付:', today, '今日の年:', currentYear, '選択中の年:', selectedYear, '利用可能な日付:', dates);
      
      // 選択中の年が今年で、今日の日付がある場合は自動選択
      if (selectedYear === currentYear && dates.includes(today)) {
        console.log('今日の日付が見つかりました。自動選択します。');
        setDate(today);
      } else if (dates.length > 0) {
        // それ以外の場合は、最新の日付を選択
        console.log('最新の日付を選択します:', dates[0]);
        setDate(dates[0]);
      }
    } catch (err: any) {
      console.error('Failed to fetch available dates:', err);
    }
  };

  useEffect(() => {
    if (date && selectedYear) {
      fetchVenues();
    }
  }, [date, selectedYear]);

  // おれAI & 展開予想 一括生成
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
      
      // 各競馬場の全レースを処理
      for (const venue of venues) {
        for (const race of venue.races) {
          currentRace++;
          setBulkGenerateProgress({ 
            current: currentRace, 
            total: totalRaces,
          });
          
          try {
            // おれAI生成
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
            
            // 展開予想生成（並行して実行）
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
      console.log(`[bulk-generate] 完了: ${successCount}/${totalRaces}レース成功 (${elapsedTime}秒)`);
      
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
      console.log('fetchVenues response:', data);
      setVenues(data.venues || []);
      
      if (data.venues && data.venues.length > 0) {
        setSelectedVenue(data.venues[0].place);
        // 最初のレースを自動選択
        if (data.venues[0].races && data.venues[0].races.length > 0) {
          setSelectedRace(data.venues[0].races[0].race_number);
        }
      }
    } catch (err: any) {
      setError(err.message);
      console.error('fetchVenues error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRaceCard = async (place: string, raceNumber: string) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/race-card-with-score?date=${date}&year=${selectedYear}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
      console.log('fetchRaceCard URL:', url);
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch race card: ${res.status}`);
      }
      const data = await res.json();
      console.log('fetchRaceCard response:', data);
      // デバッグ: 過去走件数を確認
      if (data.horses && data.horses.length > 0) {
        data.horses.forEach((horse: any, idx: number) => {
          console.log(`馬${idx + 1} (${horse.umamei}): past件数=${horse.past?.length || 0}, past_races件数=${horse.past_races?.length || 0}`);
        });
      }
      setRaceCard(data);
      setExpandedHorse(null);
    } catch (err: any) {
      console.error('fetchRaceCard error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentRaces = venues.find(v => v.place === selectedVenue)?.races || [];

  useEffect(() => {
    if (selectedVenue && selectedRace) {
      fetchRaceCard(selectedVenue, selectedRace);
    }
  }, [selectedVenue, selectedRace]);

  // 時計ハイライトを取得（軽量API使用）
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
          console.log('[TimeCheck] ハイライト更新:', newHighlights.size, '件');
        }
      } catch (err) {
        console.error('[TimeCheck] エラー:', err);
      }
    };
    
    fetchTimeHighlights();
  }, [date, selectedYear, selectedVenue]);

  // 俺AIプリフェッチ（会場選択時に裏で先読み）
  useEffect(() => {
    const prefetchSagaAI = async () => {
      if (!date || !selectedVenue || currentRaces.length === 0) return;
      
      // 最初の3レースだけ先読み（負荷軽減）
      const racesToPrefetch = currentRaces.slice(0, 3);
      
      for (const race of racesToPrefetch) {
        // 100ms間隔で順次リクエスト（サーバー負荷軽減）
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          // fetchはキャッシュされるので、バックグラウンドで先読み
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
          }).catch(() => {}); // エラーは無視（プリフェッチなので）
        } catch {
          // プリフェッチのエラーは無視
        }
      }
      
      console.log(`[Prefetch] ${selectedVenue}の最初の${racesToPrefetch.length}レースを先読み中`);
    };
    
    // 少し遅延してから先読み開始（メインUIの描画を優先）
    const timer = setTimeout(prefetchSagaAI, 500);
    return () => clearTimeout(timer);
  }, [date, selectedYear, selectedVenue, currentRaces]);

  // スコアの文字色を取得（背景色ではなく文字色のみ）
  const getScoreTextColor = (score: number, hasData: boolean) => {
    if (!hasData) return 'text-slate-400';
    if (score >= 50) return 'text-red-600 font-bold';
    if (score >= 40) return 'text-orange-500 font-bold';
    if (score >= 30) return 'text-yellow-600 font-bold';
    if (score >= 20) return 'text-green-600';
    return 'text-slate-500';
  };

  const getWakuColor = (waku: string) => {
    const wakuNum = parseInt(waku);
    const colors: Record<number, string> = {
      1: 'bg-white border-2 border-slate-800',
      2: 'bg-black text-white',
      3: 'bg-red-500 text-white',
      4: 'bg-blue-500 text-white',
      5: 'bg-yellow-400 text-black',
      6: 'bg-green-500 text-white',
      7: 'bg-orange-500 text-white',
      8: 'bg-pink-400 text-white',
    };
    return colors[wakuNum] || 'bg-slate-200';
  };

  // 着順の色を取得（文字色のみ）
  const getFinishColor = (finish: string) => {
    const finishNum = parseInt(toHalfWidth(finish));
    if (finishNum === 1) return 'text-red-600 font-bold';
    if (finishNum === 2) return 'text-blue-600 font-bold';
    if (finishNum === 3) return 'text-green-600 font-bold';
    return 'text-slate-800';
  };

  // 4コーナー位置の色を取得（0=最内, 4=大外）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getCorner4PositionColor = (position: string) => {
    const value = parseInt(position);
    if (value === 0) return 'text-green-600 font-bold';  // 最内
    if (value === 1) return 'text-green-500';            // 内
    if (value === 2) return 'text-slate-800';            // 中
    if (value === 3) return 'text-orange-500';           // 外
    if (value === 4) return 'text-red-600 font-bold';    // 大外
    return 'text-slate-400';  // データなし
  };

  const toggleHorseExpand = (umaban: string) => {
    setExpandedHorse(expandedHorse === umaban ? null : umaban);
  };

  // 日付クリックで過去レースカードに遷移
  const navigateToDate = (pastDate: string) => {
    const queryDate = formatDateForQuery(pastDate);
    // 利用可能な日付に含まれているか確認
    if (availableDates.includes(queryDate)) {
      setDate(queryDate);
      setSelectedRace('');
      setRaceCard(null);
    } else {
      // 利用可能でない場合はアラート表示
      alert(`${pastDate}のレースカードデータはありません`);
    }
  };

  // 日付がクリック可能かどうかを判定
  const isDateClickable = (pastDate: string): boolean => {
    const queryDate = formatDateForQuery(pastDate);
    return availableDates.includes(queryDate);
  };

  // PDF生成のためのスコア色取得（HEX形式）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getScoreColorHex = (rank: number, total: number) => {
    const percentage = (rank / total) * 100;
    if (percentage <= 10) return '#dc2626'; // red-600
    if (percentage <= 25) return '#f97316'; // orange-500
    if (percentage <= 40) return '#ca8a04'; // yellow-600
    if (percentage <= 60) return '#16a34a'; // green-600
    return '#64748b'; // slate-500
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getFrameColorHex = (waku: string) => {
    const wakuNum = parseInt(waku);
    const colors: Record<number, string> = {
      1: '#ffffff',
      2: '#000000',
      3: '#ef4444',
      4: '#3b82f6',
      5: '#facc15',
      6: '#22c55e',
      7: '#f97316',
      8: '#f472b6',
    };
    return colors[wakuNum] || '#e2e8f0';
  };

  // 競馬場毎のPDF生成（html2canvas方式で日本語対応）
  const generateVenuePDF = async (venue: Venue) => {
    setVenuePdfGenerating(venue.place);
    try {
      const doc = new jsPDF({ compress: true });
      let isFirstPage = true;

      for (const race of venue.races) {
        const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}&year=${selectedYear}`);
        if (!res.ok) continue;
        const data = await res.json();

        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;
        
        let yOffset = 10;

        // HTMLテーブルを作成
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '800px';
        tempDiv.style.backgroundColor = 'white';
        tempDiv.style.padding = '20px';

        const raceTitle = `${venue.place}${race.race_number}R ${race.class_name || ''} ${race.track_type}${race.distance}m`;

        // ソート済み馬リスト
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
          if (rank === 0) return '#ff4444';
          if (rank === 1) return '#ff8844';
          if (rank === 2) return '#ffcc44';
          if (rank < totalHorses / 2) return '#88dd88';
          return '#dddddd';
        };

        const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
          const frameColor = getFrameColorForPDF(horse.waku);
          const scoreColor = getScoreColorForPDF(rank, data.horses.length);
          const horseName = normalizeHorseName(horse.umamei);
          const jockey = horse.kishu.trim();
          const weight = horse.kinryo.trim();
          const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

          return `
            <tr>
              <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: ${frameColor.bg}; width: 25px;"></td>
              <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: #ffffff; color: #000000; font-size: 18px; font-weight: bold; width: 50px;">${horse.umaban}</td>
              <td style="border: 1px solid #333; padding: 10px; text-align: left; font-size: 18px; font-weight: bold;">${horseName}</td>
              <td style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 14px; width: 100px;">${jockey}</td>
              <td style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 14px; width: 60px;">${weight}</td>
              <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: ${scoreColor}; font-size: 18px; font-weight: bold; width: 80px;">${scoreDisplay}</td>
            </tr>
          `;
        }).join('');

        tempDiv.innerHTML = `
          <div style="font-family: 'Noto Sans JP', sans-serif;">
            <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #166534;">${raceTitle}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #166534; color: white;">
                  <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 25px;">枠</th>
                  <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 50px;">馬番</th>
                  <th style="border: 1px solid #333; padding: 10px; text-align: left; font-size: 16px; font-weight: bold;">馬名</th>
                  <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 100px;">騎手</th>
                  <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 60px;">斤量</th>
                  <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 80px;">競う<br/>スコア</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        `;

        document.body.appendChild(tempDiv);

        const canvas = await html2canvas(tempDiv, {
          scale: 1,
          useCORS: true,
          logging: false
        });

        document.body.removeChild(tempDiv);

        const imgData = canvas.toDataURL('image/jpeg', 0.7);
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // yOffsetが大きい場合は改ページ
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

  // 全レースPDF生成（html2canvas方式で日本語対応）
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

          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;
          
          let yOffset = 10;

          // HTMLテーブルを作成
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          tempDiv.style.width = '800px';
          tempDiv.style.backgroundColor = 'white';
          tempDiv.style.padding = '20px';

          const raceTitle = `${venue.place}${race.race_number}R ${race.class_name || ''} ${race.track_type}${race.distance}m`;

          // ソート済み馬リスト
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
            if (rank === 0) return '#ff4444';
            if (rank === 1) return '#ff8844';
            if (rank === 2) return '#ffcc44';
            if (rank < totalHorses / 2) return '#88dd88';
            return '#dddddd';
          };

          const tableRows = sortedHorses.map((horse: Horse, rank: number) => {
            const frameColor = getFrameColorForPDF(horse.waku);
            const scoreColor = getScoreColorForPDF(rank, data.horses.length);
            const horseName = normalizeHorseName(horse.umamei);
            const jockey = horse.kishu.trim();
            const weight = horse.kinryo.trim();
            const scoreDisplay = horse.hasData ? Math.round(horse.score) : '-';

            return `
              <tr>
                <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: ${frameColor.bg}; width: 25px;"></td>
                <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: #ffffff; color: #000000; font-size: 18px; font-weight: bold; width: 50px;">${horse.umaban}</td>
                <td style="border: 1px solid #333; padding: 10px; text-align: left; font-size: 18px; font-weight: bold;">${horseName}</td>
                <td style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 14px; width: 100px;">${jockey}</td>
                <td style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 14px; width: 60px;">${weight}</td>
                <td style="border: 1px solid #333; padding: 10px; text-align: center; background-color: ${scoreColor}; font-size: 18px; font-weight: bold; width: 80px;">${scoreDisplay}</td>
              </tr>
            `;
          }).join('');

          tempDiv.innerHTML = `
            <div style="font-family: 'Noto Sans JP', sans-serif;">
              <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #166534;">${raceTitle}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #166534; color: white;">
                    <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 25px;">枠</th>
                    <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 50px;">馬番</th>
                    <th style="border: 1px solid #333; padding: 10px; text-align: left; font-size: 16px; font-weight: bold;">馬名</th>
                    <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 100px;">騎手</th>
                    <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 60px;">斤量</th>
                    <th style="border: 1px solid #333; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; width: 80px;">競う<br/>スコア</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          `;

          document.body.appendChild(tempDiv);

          const canvas = await html2canvas(tempDiv, {
            scale: 1,
            useCORS: true,
            logging: false
          });

          document.body.removeChild(tempDiv);

          const imgData = canvas.toDataURL('image/jpeg', 0.7);
          const imgWidth = 190;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          // yOffsetが大きい場合は改ページ
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

  // 過去走詳細を表示するコンポーネント
  const PastRaceDetail = ({ pastRaces }: { pastRaces: PastRace[] }) => {
    // デバッグログ
    console.log('PastRaceDetail - pastRaces件数:', pastRaces?.length || 0);
    console.log('PastRaceDetail - pastRaces:', pastRaces);
    
    if (!pastRaces || pastRaces.length === 0) {
      return <div className="text-slate-500 text-xs sm:text-sm p-2 sm:p-4">過去走データなし</div>;
    }

    return (
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-max text-[10px] sm:text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">日付</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">場所</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">クラス</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">距離</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">人気</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">着順</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">着差</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-700 whitespace-nowrap">通過</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">巻返し</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">L4F</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">T2F</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">ポテ</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">レボ</th>
              <th className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">クッション</th>
            </tr>
          </thead>
          <tbody>
            {pastRaces.map((race, idx) => {
              const passing = [race.corner_2, race.corner_3, race.corner_4]
                .filter(c => c && c !== '')
                .join('-');
              const clickable = isDateClickable(race.date);
              
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td 
                    className={`border border-slate-300 px-1 sm:px-2 py-1 text-center whitespace-nowrap ${
                      clickable 
                        ? 'text-blue-600 underline cursor-pointer hover:bg-blue-50' 
                        : 'text-slate-800'
                    }`}
                    onClick={() => clickable && navigateToDate(race.date)}
                    title={clickable ? 'クリックしてこの日のレースカードを表示' : ''}
                  >
                    {race.date || '-'}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {race.place || '-'}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {race.class_name || '-'}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {race.distance || '-'}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800">
                    {race.popularity || '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center ${getFinishColor(race.finish_position || '')}`}>
                    {toHalfWidth(race.finish_position || '-')}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800">
                    {race.margin || '-'}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {passing || '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.makikaeshi != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.makikaeshi != null ? Number(race.indices.makikaeshi).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.L4F != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.L4F != null ? Number(race.indices.L4F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.T2F != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.T2F != null ? Number(race.indices.T2F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.potential != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.potential != null ? Number(race.indices.potential).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.revouma != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.revouma != null ? Number(race.indices.revouma).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-1 sm:px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.cushion != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.cushion != null ? Number(race.indices.cushion).toFixed(1) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-2">※ 横スクロールで指数データを確認できます</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* ヘッダー */}
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl font-bold">緑の組織</h1>
          <a
            href="/admin"
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-green-700 hover:bg-green-600 rounded transition-colors min-h-[44px]"
            title="管理者画面"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span className="text-xs sm:text-sm">管理</span>
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">

        <div className="mb-4">
          <label className="block text-xs sm:text-sm font-medium text-slate-800 mb-2">年・日付</label>
          <div className="flex flex-wrap gap-2 items-center">
            {/* 年選択 */}
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setSelectedRace('');
                setRaceCard(null);
              }}
              className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800 min-h-[44px] text-sm sm:text-base"
            >
              <option value={2025}>2025年</option>
              <option value={2026}>2026年</option>
              <option value={2027}>2027年</option>
            </select>
            
            {/* 日付選択 */}
            {availableDates.length > 0 ? (
              <select
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedRace('');
                  setRaceCard(null);
                }}
                className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800 min-h-[44px] text-sm sm:text-base"
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateForDisplay(d)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800 min-h-[44px] text-sm sm:text-base"
                placeholder="例: 1220"
              />
            )}
            <span className="text-xs sm:text-sm text-slate-500">
              {availableDates.length > 0 ? `${availableDates.length}日分のデータ` : ''}
            </span>
          </div>
        </div>

        {venues.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 sm:gap-3">
            {/* おれAI一括生成ボタン */}
            <button
              onClick={bulkGenerateAnalysis}
              disabled={bulkGenerating || pdfGenerating}
              className="px-4 sm:px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 font-bold text-sm sm:text-base min-h-[44px] shadow-lg shadow-purple-500/20 transition-all"
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
                <span className="flex items-center gap-2">
                  🧠 一括生成
                </span>
              )}
            </button>
            
            {/* 一括生成結果 */}
            {bulkGenerateResult && (
              <span className="flex items-center px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm">
                ✅ {bulkGenerateResult.success}レース生成完了 ({bulkGenerateResult.time}秒)
                {bulkGenerateResult.error > 0 && (
                  <span className="ml-2 text-red-600">({bulkGenerateResult.error}件エラー)</span>
                )}
              </span>
            )}
            
            {/* PDF生成ボタン */}
            <button
              onClick={generateAllRacesPDF}
              disabled={pdfGenerating || bulkGenerating}
              className="px-4 sm:px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:bg-slate-400 font-bold text-sm sm:text-base min-h-[44px]"
            >
              {pdfGenerating ? 'PDF生成中...' : '📄 全レースPDF'}
            </button>
          </div>
        )}

        {venues.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-medium text-slate-800 mb-2">競馬場</label>
            <div className="flex gap-2 flex-wrap">
              {venues.map((venue) => (
                <div key={venue.place} className="flex items-center">
                  <button
                    onClick={() => {
                      setSelectedVenue(venue.place);
                      setSelectedRace('');
                      setRaceCard(null);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-l min-h-[44px] text-sm sm:text-base ${
                      selectedVenue === venue.place
                        ? 'bg-green-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {venue.place}
                  </button>
                  <button
                    onClick={() => generateVenuePDF(venue)}
                    disabled={venuePdfGenerating === venue.place}
                    className={`px-2 py-2 rounded-r min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      selectedVenue === venue.place
                        ? 'bg-green-600 text-white hover:bg-green-500'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    } disabled:opacity-50`}
                    title={`${venue.place}のPDFをダウンロード`}
                  >
                    {venuePdfGenerating === venue.place ? (
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
            <label className="block text-xs sm:text-sm font-medium text-slate-800 mb-2">
              レース
              <span className="ml-2 text-xs text-slate-500">
                (⏱️ = 時計優秀な馬あり)
              </span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {currentRaces.map((race) => {
                // 時計ハイライトをチェック
                const highlightKey = `${selectedVenue}_${race.race_number}`;
                const highlight = timeHighlights.get(highlightKey);
                
                return (
                  <button
                    key={race.race_number}
                    onClick={() => setSelectedRace(race.race_number)}
                    className={`px-2 sm:px-3 py-2 sm:py-2 rounded text-xs sm:text-sm relative min-h-[56px] sm:min-h-[60px] ${
                      selectedRace === race.race_number
                        ? 'bg-green-700 text-white'
                        : highlight
                          ? 'bg-white border-2 border-orange-400 text-slate-800 hover:bg-orange-50'
                          : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                    title={
                      highlight 
                        ? `時計優秀: ${highlight.count >= 2 ? '上位超え' : '0.5秒以内'} (${highlight.timeDiff <= 0 ? '上位超え' : highlight.timeDiff.toFixed(1) + '秒差'})` 
                        : ''
                    }
                  >
                    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                      <span className="font-medium">{race.race_number}R</span>
                      {highlight && (
                        <span className={`text-xs ${
                          highlight.count >= 2 ? 'text-red-500' : 'text-orange-500'
                        }`}>
                          ⏱️
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] sm:text-xs opacity-80">{race.track_type}{race.distance}m</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-700"></div>
            <p className="mt-2 text-slate-500">読み込み中...</p>
          </div>
        )}

        {raceCard && !loading && (
          <div className="space-y-6">
            {/* ★ AI展開予想（FABから有効化） */}
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

            {/* ★ 俺AI分析（FABから有効化） */}
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

            {/* 既存のレースカード表示 */}
            <div className="bg-white rounded-lg shadow-lg p-3 sm:p-6">
            <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-4 text-slate-800">
              {raceCard.raceInfo.place} {raceCard.raceInfo.raceNumber}R {raceCard.raceInfo.className}
            </h2>
            <p className="text-slate-500 mb-2 sm:mb-4 text-sm sm:text-base">
              {raceCard.raceInfo.trackType}{raceCard.raceInfo.distance}m / {raceCard.raceInfo.fieldSize}頭立
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mb-3 sm:mb-4">
              ※馬名をクリックすると過去走詳細が表示されます
            </p>

            <div className="table-scroll-container -mx-3 sm:mx-0 px-3 sm:px-0">
            <table className="w-full border-collapse min-w-[500px] sm:min-w-0">
              <thead>
                <tr className="bg-green-800 text-white text-xs sm:text-base">
                  <th className="border border-slate-800 px-1 sm:px-2 py-2 sm:py-3">枠</th>
                  <th className="border border-slate-800 px-1 sm:px-2 py-2 sm:py-3">馬番</th>
                  <th className="border border-slate-800 px-2 sm:px-4 py-2 sm:py-3">馬名</th>
                  <th className="border border-slate-800 px-2 sm:px-4 py-2 sm:py-3">騎手</th>
                  <th className="border border-slate-800 px-1 sm:px-2 py-2 sm:py-3">斤量</th>
                  <th className="border border-slate-800 px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">競う<br className="sm:hidden"/>スコア</th>
                </tr>
              </thead>
              <tbody>
                {[...raceCard.horses].sort((a, b) => {
                  // データなしの馬を一番下に配置
                  if (a.hasData && !b.hasData) return -1;
                  if (!a.hasData && b.hasData) return 1;
                  // 両方データありの場合はスコア降順
                  if (a.hasData && b.hasData) return b.score - a.score;
                  // 両方データなしの場合は馬番順
                  return parseInt(a.umaban) - parseInt(b.umaban);
                }).map((horse, index) => (
                  <React.Fragment key={horse.umaban}>
                    <tr className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} text-xs sm:text-base`}>
                      <td className={`border border-slate-800 px-1 sm:px-2 py-2 text-center ${getWakuColor(horse.waku)}`}>
                        {horse.waku}
                      </td>
                      <td className="border border-slate-800 px-1 sm:px-2 py-2 text-center font-bold text-slate-800">
                        {horse.umaban}
                      </td>
                      <td 
                        className="border border-slate-800 px-2 sm:px-4 py-2 font-medium cursor-pointer hover:bg-green-50 text-slate-800"
                        onClick={() => toggleHorseExpand(horse.umaban)}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate max-w-[100px] sm:max-w-none">{normalizeHorseName(horse.umamei)}</span>
                          <span className="text-green-600 text-xs sm:text-sm flex-shrink-0">
                            {expandedHorse === horse.umaban ? '▲' : '▼'}
                          </span>
                        </div>
                      </td>
                      <td className="border border-slate-800 px-2 sm:px-4 py-2 text-slate-800 whitespace-nowrap">
                        {horse.kishu.trim()}
                      </td>
                      <td className="border border-slate-800 px-1 sm:px-2 py-2 text-center text-slate-800">
                        {horse.kinryo.trim()}
                      </td>
                      <td className={`border border-slate-800 px-2 sm:px-4 py-2 text-center text-sm sm:text-lg font-bold ${getScoreTextColor(horse.score, horse.hasData)}`}>
                        {horse.hasData && horse.score != null ? Math.round(horse.score) : 'N/A'}
                      </td>
                    </tr>
                    {expandedHorse === horse.umaban && (
                      <tr key={`${horse.umaban}-detail`}>
                        <td colSpan={6} className="border border-slate-800 p-2 sm:p-4 bg-slate-50">
                          <div className="text-xs sm:text-sm font-bold mb-2 text-green-800">
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
      </div>
    </div>
  );
}
