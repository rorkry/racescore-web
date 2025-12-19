'use client';

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

export default function RaceCardPage() {
  const [date, setDate] = useState('1220');
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

  // 利用可能な日付一覧を取得
  useEffect(() => {
    fetchAvailableDates();
  }, []);

  const fetchAvailableDates = async () => {
    try {
      const res = await fetch('/api/races');
      if (!res.ok) throw new Error('Failed to fetch dates');
      const data = await res.json();
      const dates = (data.dates || []).map((d: { date: string }) => d.date);
      setAvailableDates(dates);
    } catch (err: any) {
      console.error('Failed to fetch available dates:', err);
    }
  };

  useEffect(() => {
    if (date) {
      fetchVenues();
    }
  }, [date]);

  const fetchVenues = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/races?date=${date}`);
      if (!res.ok) throw new Error('Failed to fetch venues');
      const data = await res.json();
      setVenues(data.venues || []);
      
      if (data.venues && data.venues.length > 0) {
        setSelectedVenue(data.venues[0].place);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRaceCard = async (place: string, raceNumber: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/race-card-with-score?date=${date}&place=${place}&raceNumber=${raceNumber}`);
      if (!res.ok) throw new Error('Failed to fetch race card');
      const data = await res.json();
      setRaceCard(data);
      setExpandedHorse(null);
    } catch (err: any) {
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

  // 巻き返し指数の色を取得（文字色のみ）
  const getIndexColor = (indexValue: string) => {
    const value = parseFloat(indexValue);
    if (value >= 9) return 'text-red-600 font-bold';
    if (value >= 5) return 'text-orange-500 font-bold';
    if (value >= 1) return 'text-blue-600';
    return 'text-slate-800';
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
  const getScoreColorHex = (rank: number, total: number) => {
    const percentage = (rank / total) * 100;
    if (percentage <= 10) return '#dc2626'; // red-600
    if (percentage <= 25) return '#f97316'; // orange-500
    if (percentage <= 40) return '#ca8a04'; // yellow-600
    if (percentage <= 60) return '#16a34a'; // green-600
    return '#64748b'; // slate-500
  };

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
        const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}`);
        if (!res.ok) continue;
        const data = await res.json();

        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

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
        doc.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
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
          const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}`);
          if (!res.ok) continue;
          const data = await res.json();

          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

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
          doc.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
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
    if (!pastRaces || pastRaces.length === 0) {
      return <div className="text-slate-500 text-sm p-4">過去走データなし</div>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-max text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">日付</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">場所</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">クラス</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">距離</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">人気</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">着順</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">着差</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">通過</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-slate-700 whitespace-nowrap">巻き返し指数</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">L4F指数</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">T2F指数</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">ポテンシャル</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">レボウマ</th>
              <th className="border border-slate-300 px-2 py-1 text-center text-blue-700 bg-blue-50 whitespace-nowrap">クッション値</th>
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
                    className={`border border-slate-300 px-2 py-1 text-center text-xs whitespace-nowrap ${
                      clickable 
                        ? 'text-blue-600 underline cursor-pointer hover:bg-blue-50' 
                        : 'text-slate-800'
                    }`}
                    onClick={() => clickable && navigateToDate(race.date)}
                    title={clickable ? 'クリックしてこの日のレースカードを表示' : ''}
                  >
                    {race.date || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {race.place || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs text-slate-800 whitespace-nowrap">
                    {race.class_name || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {race.distance || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-slate-800">
                    {race.popularity || '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center ${getFinishColor(race.finish_position || '')}`}>
                    {toHalfWidth(race.finish_position || '-')}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-slate-800">
                    {race.margin || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs text-slate-800 whitespace-nowrap">
                    {passing || '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center ${getIndexColor(race.index_value || '0')}`}>
                    {parseFloat(race.index_value || '0').toFixed(1)}
                  </td>
                  {/* 指数データ */}
                  <td className={`border border-slate-300 px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.L4F != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.L4F != null ? Number(race.indices.L4F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.T2F != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.T2F != null ? Number(race.indices.T2F).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.potential != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.potential != null ? Number(race.indices.potential).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.revouma != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.revouma != null ? Number(race.indices.revouma).toFixed(1) : '-'}
                  </td>
                  <td className={`border border-slate-300 px-2 py-1 text-center bg-blue-50/50 ${race.indices && race.indices.cushion != null ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                    {race.indices && race.indices.cushion != null ? Number(race.indices.cushion).toFixed(1) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-2">※ 横スクロールで全てのカラムを確認できます。指数データが「-」の場合は、該当レースの指数が未アップロードです。</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">緑の組織</h1>
          <a
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 rounded transition-colors"
            title="管理者画面"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">管理</span>
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-800 mb-2">日付</label>
          <div className="flex gap-2 items-center">
            {availableDates.length > 0 ? (
              <select
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedRace('');
                  setRaceCard(null);
                }}
                className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800"
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
                className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800"
                placeholder="例: 1220"
              />
            )}
            <span className="text-sm text-slate-500">
              {availableDates.length > 0 ? `${availableDates.length}日分のデータ` : ''}
            </span>
          </div>
        </div>

        {venues.length > 0 && (
          <div className="mb-4">
            <button
              onClick={generateAllRacesPDF}
              disabled={pdfGenerating}
              className="px-6 py-3 bg-green-700 text-white rounded hover:bg-green-600 disabled:bg-slate-400 font-bold"
            >
              {pdfGenerating ? 'PDF生成中...' : '全レースをPDFでダウンロード'}
            </button>
          </div>
        )}

        {venues.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-800 mb-2">競馬場</label>
            <div className="flex gap-2 flex-wrap">
              {venues.map((venue) => (
                <div key={venue.place} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setSelectedVenue(venue.place);
                      setSelectedRace('');
                      setRaceCard(null);
                    }}
                    className={`px-4 py-2 rounded-l ${
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
                    className={`px-2 py-2 rounded-r ${
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
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-800 mb-2">レース</label>
            <div className="grid grid-cols-6 gap-2">
              {currentRaces.map((race) => (
                <button
                  key={race.race_number}
                  onClick={() => setSelectedRace(race.race_number)}
                  className={`px-3 py-2 rounded text-sm ${
                    selectedRace === race.race_number
                      ? 'bg-green-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {race.race_number}R<br />
                  <span className="text-xs">{race.track_type}{race.distance}m</span>
                </button>
              ))}
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
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-slate-800">
              {raceCard.raceInfo.place} {raceCard.raceInfo.raceNumber}R {raceCard.raceInfo.className}
            </h2>
            <p className="text-slate-500 mb-4">
              {raceCard.raceInfo.trackType}{raceCard.raceInfo.distance}m / {raceCard.raceInfo.fieldSize}頭立
            </p>
            <p className="text-sm text-slate-500 mb-4">
              ※馬名をクリックすると過去走詳細が表示されます
            </p>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-green-800 text-white">
                  <th className="border border-slate-800 px-2 py-3">枠</th>
                  <th className="border border-slate-800 px-2 py-3">馬番</th>
                  <th className="border border-slate-800 px-4 py-3">馬名</th>
                  <th className="border border-slate-800 px-4 py-3">騎手</th>
                  <th className="border border-slate-800 px-2 py-3">斤量</th>
                  <th className="border border-slate-800 px-4 py-3">競うスコア</th>
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
                    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className={`border border-slate-800 px-2 py-2 text-center ${getWakuColor(horse.waku)}`}>
                        {horse.waku}
                      </td>
                      <td className="border border-slate-800 px-2 py-2 text-center font-bold text-slate-800">
                        {horse.umaban}
                      </td>
                      <td 
                        className="border border-slate-800 px-4 py-2 font-medium cursor-pointer hover:bg-green-50 text-slate-800"
                        onClick={() => toggleHorseExpand(horse.umaban)}
                      >
                        <div className="flex items-center justify-between">
                          <span>{normalizeHorseName(horse.umamei)}</span>
                          <span className="text-green-600 text-sm">
                            {expandedHorse === horse.umaban ? '▲' : '▼'}
                          </span>
                        </div>
                      </td>
                      <td className="border border-slate-800 px-4 py-2 text-slate-800">
                        {horse.kishu.trim()}
                      </td>
                      <td className="border border-slate-800 px-2 py-2 text-center text-slate-800">
                        {horse.kinryo.trim()}
                      </td>
                      <td className={`border border-slate-800 px-4 py-2 text-center text-lg ${getScoreTextColor(horse.score, horse.hasData)}`}>
                        {horse.hasData && horse.score != null ? Number(horse.score).toFixed(1) : 'データなし'}
                      </td>
                    </tr>
                    {expandedHorse === horse.umaban && (
                      <tr key={`${horse.umaban}-detail`}>
                        <td colSpan={6} className="border border-slate-800 p-4 bg-slate-50">
                          <div className="text-sm font-bold mb-2 text-green-800">
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
        )}
      </div>
    </div>
  );
}
