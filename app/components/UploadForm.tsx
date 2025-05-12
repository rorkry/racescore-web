'use client';
import React, { useState } from 'react';
import Papa from 'papaparse';
import { parseOdds } from '@/utils/parseOdds';
import type { OddsRow } from '@/types/odds';

export default function UploadForm() {
  const [entryData, setEntryData] = useState<any[]>([]);
  const [raceData, setRaceData] = useState<any[]>([]);
  const [oddsData, setOddsData] = useState<OddsRow[]>([]);

  const handleEntryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setEntryData(results.data);
        console.log('出走予定馬CSVデータ:', results.data);
      },
    });
  };

  const handleRaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setRaceData(results.data);
        console.log('出馬表CSVデータ:', results.data);
      },
    });
  };

  const handleOddsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await parseOdds(file);
      setOddsData(data);
      console.log('オッズCSVデータ:', data);
    } catch (err) {
      console.error('オッズCSV 解析エラー:', err);
    }
  };

  return (
    <div className="p-4 border rounded-md">
      <h2 className="text-lg font-semibold mb-2">出走予定馬CSV & 出馬表CSVをアップロード</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">出走予定馬CSV</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleEntryFileChange}
          className="block"
        />
        {entryData.length > 0 && (
          <div className="text-sm text-gray-700 mt-1">
            {entryData.length} 件の出走予定馬データを読み込みました。
          </div>
        )}
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">出馬表CSV</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleRaceFileChange}
          className="block"
        />
        {raceData.length > 0 && (
          <div className="text-sm text-gray-700 mt-1">
            {raceData.length} 件の出馬表データを読み込みました。
          </div>
        )}
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">オッズCSV</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleOddsFileChange}
          className="block"
        />
        {oddsData.length > 0 && (
          <div className="text-sm text-gray-700 mt-1">
            {oddsData.length} 件のオッズデータを読み込みました。
          </div>
        )}
      </div>
    </div>
  );
}