'use client';

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

interface Horse {
  umaban: string;
  waku: string;
  umamei: string;
  kishu: string;
  kinryo: string;
  score: number;
  hasData: boolean;
  past: PastRace[];
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

export default function RaceCardPage() {
  const [date, setDate] = useState('1220');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>('');
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [raceCard, setRaceCard] = useState<RaceCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [expandedHorse, setExpandedHorse] = useState<string | null>(null);
  const [venuePdfGenerating, setVenuePdfGenerating] = useState<string | null>(null);

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
      5: 'bg-yellow-400 text-slate-800',
      6: 'bg-green-500 text-white',
      7: 'bg-orange-500 text-white',
      8: 'bg-pink-400 text-white',
    };
    return colors[wakuNum] || 'bg-slate-300';
  };

  // 巻き返し指数の文字色を取得
  const getIndexColor = (indexValue: string) => {
    const idx = parseFloat(indexValue) || 0;
    if (idx >= 9) return 'text-red-600 font-bold';
    if (idx >= 5) return 'text-orange-500 font-bold';
    if (idx >= 1) return 'text-blue-600';
    return 'text-slate-400';
  };

  // 着順の文字色を取得
  const getFinishColor = (finish: string) => {
    const pos = parseInt(toHalfWidth(finish)) || 99;
    if (pos === 1) return 'text-red-600 font-bold';
    if (pos === 2) return 'text-blue-600 font-bold';
    if (pos === 3) return 'text-green-600 font-bold';
    if (pos <= 5) return 'text-slate-700';
    return 'text-slate-400';
  };

  const toggleHorseExpand = (umaban: string) => {
    setExpandedHorse(expandedHorse === umaban ? null : umaban);
  };

  // 競馬場毎のPDF生成
  const generateVenuePDF = async (venueName: string) => {
    try {
      setVenuePdfGenerating(venueName);
      const doc = new jsPDF({ compress: true });
      let isFirstPage = true;

      const venue = venues.find(v => v.place === venueName);
      if (!venue) return;

      for (const race of venue.races) {
        const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venueName}&raceNumber=${race.race_number}`);
        if (!res.ok) continue;
        const data: RaceCard = await res.json();

        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '800px';
        tempDiv.style.backgroundColor = 'white';
        tempDiv.style.padding = '20px';

        const raceTitle = `${data.raceInfo.place}${data.raceInfo.raceNumber}R ${data.raceInfo.className} ${data.raceInfo.trackType}${data.raceInfo.distance}m`;

        const getFrameColorHex = (waku: string) => {
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

        const getScoreColorHex = (rank: number, totalHorses: number) => {
          if (rank === 0) return '#ff4444';
          if (rank === 1) return '#ff8844';
          if (rank === 2) return '#ffcc44';
          if (rank < totalHorses / 2) return '#88dd88';
          return '#dddddd';
        };

        const tableRows = data.horses.map((horse, rank) => {
          const frameColor = getFrameColorHex(horse.waku);
          const scoreColor = getScoreColorHex(rank, data.horses.length);
          const horseName = horse.umamei.trim();
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

      doc.save(`${date}_${venueName}.pdf`);
    } catch (err: any) {
      setError(`PDF生成エラー: ${err.message}`);
    } finally {
      setVenuePdfGenerating(null);
    }
  };

  const generateAllRacesPDF = async () => {
    try {
      setPdfGenerating(true);
      const doc = new jsPDF({ compress: true });
      let isFirstPage = true;

      for (const venue of venues) {
        for (const race of venue.races) {
          const res = await fetch(`/api/race-card-with-score?date=${date}&place=${venue.place}&raceNumber=${race.race_number}`);
          if (!res.ok) continue;
          const data: RaceCard = await res.json();

          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          tempDiv.style.width = '800px';
          tempDiv.style.backgroundColor = 'white';
          tempDiv.style.padding = '20px';

          const raceTitle = `${data.raceInfo.place}${data.raceInfo.raceNumber}R ${data.raceInfo.className} ${data.raceInfo.trackType}${data.raceInfo.distance}m`;

          const getFrameColorHex = (waku: string) => {
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

          const getScoreColorHex = (rank: number, totalHorses: number) => {
            if (rank === 0) return '#ff4444';
            if (rank === 1) return '#ff8844';
            if (rank === 2) return '#ffcc44';
            if (rank < totalHorses / 2) return '#88dd88';
            return '#dddddd';
          };

          const tableRows = data.horses.map((horse, rank) => {
            const frameColor = getFrameColorHex(horse.waku);
            const scoreColor = getScoreColorHex(rank, data.horses.length);
            const horseName = horse.umamei.trim();
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
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">日付</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">場所</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">クラス</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">距離</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">人気</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">着順</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">着差</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">通過</th>
              <th className="border border-slate-800 px-2 py-1 text-center text-slate-800">巻き返し</th>
            </tr>
          </thead>
          <tbody>
            {pastRaces.map((race, idx) => {
              const passing = [race.corner_2, race.corner_3, race.corner_4]
                .filter(c => c && c !== '')
                .join('-');
              
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-800 px-2 py-1 text-center text-xs text-slate-800">
                    {race.date || '-'}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-slate-800">
                    {race.place || '-'}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-xs text-slate-800">
                    {race.class_name || '-'}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-slate-800">
                    {race.distance || '-'}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-slate-800">
                    {race.popularity || '-'}
                  </td>
                  <td className={`border border-slate-800 px-2 py-1 text-center ${getFinishColor(race.finish_position || '')}`}>
                    {toHalfWidth(race.finish_position || '-')}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-slate-800">
                    {race.margin || '-'}
                  </td>
                  <td className="border border-slate-800 px-2 py-1 text-center text-xs text-slate-800">
                    {passing || '-'}
                  </td>
                  <td className={`border border-slate-800 px-2 py-1 text-center ${getIndexColor(race.index_value || '0')}`}>
                    {parseFloat(race.index_value || '0').toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          <input
            type="text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-200 rounded px-3 py-2 bg-white text-slate-800"
            placeholder="例: 1220"
          />
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
                    onClick={() => generateVenuePDF(venue.place)}
                    disabled={venuePdfGenerating === venue.place}
                    className={`px-2 py-2 rounded-r border-l-0 ${
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
                {raceCard.horses.map((horse, index) => (
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
                          <span>{horse.umamei.trim()}</span>
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
                        {horse.hasData ? horse.score : 'データなし'}
                      </td>
                    </tr>
                    {expandedHorse === horse.umaban && (
                      <tr key={`${horse.umaban}-detail`}>
                        <td colSpan={6} className="border border-slate-800 p-4 bg-slate-50">
                          <div className="text-sm font-bold mb-2 text-green-800">
                            {horse.umamei.trim()} の過去走詳細
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
