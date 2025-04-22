import React from "react";
import Papa from "papaparse";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black p-4">
      <h1 className="text-xl font-bold">Racescore Web</h1>
      <p className="mt-2">ここに出馬表アップロードUIなどを追加していきます。</p>
    </main>
  );
}


// app/page.tsx
import { RaceCard } from "./components/RaceCard";

export default function Home() {
  const dummyData = [
    {
      raceName: "東京11R 青葉賞",
      horses: [
        { name: "アスクビクターモア", sex: "牡", age: 3, weight: 56, score: "A" },
        { name: "プラダリア", sex: "牡", age: 3, weight: 56, score: "B" },
        { name: "ロードレゼル", sex: "牡", age: 3, weight: 56, score: "C" },
      ],
    },
  ];

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-6">🏇 出馬表</h1>
      {dummyData.map((race, i) => (
        <RaceCard key={i} raceName={race.raceName} horses={race.horses} />
      ))}
    </main>
  );
}
