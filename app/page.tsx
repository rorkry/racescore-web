// app/race/page.tsx
"use client";

import React, { useState } from "react";
import Papa from "papaparse";

export default function RacePage() {
  const [data, setData] = useState<any[]>([]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (result) => {
        setData(result.data);
      },
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">🏇 出馬表アップロード</h1>
      <input type="file" accept=".csv" onChange={handleUpload} />
      {data.length > 0 && (
        <table className="mt-6 border w-full text-sm">
          <thead>
            <tr>
              {Object.keys(data[0]).map((key) => (
                <th key={key} className="border p-2 bg-gray-100">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((cell, j) => (
                  <td key={j} className="border p-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
