// app/page.tsx
import React from "react";

const dummyHorses = [
  {
    name: "ソダシ",
    age: 4,
    sex: "牝",
    weight: 55,
    past: [
      { rank: 1, time: "1:58.2", agari: "33.4", level: "A" },
      { rank: 3, time: "1:59.0", agari: "34.1", level: "B" },
      { rank: 2, time: "2:00.0", agari: "33.9", level: "C" },
    ],
  },
  {
    name: "イクイノックス",
    age: 5,
    sex: "牡",
    weight: 57,
    past: [
      { rank: 1, time: "1:56.5", agari: "33.2", level: "A" },
      { rank: 1, time: "1:58.1", agari: "32.9", level: "A" },
    ],
  },
];

const levelToStars = (level: string) => {
  const stars = {
    A: "★★★★★",
    B: "★★★★☆",
    C: "★★★☆☆",
    D: "★★☆☆☆",
    E: "★☆☆☆☆",
  };
  const colors = {
    A: "text-red-500",
    B: "text-orange-500",
    C: "text-gray-500",
    D: "text-blue-500",
    E: "text-teal-500",
  };
  return <span className={`font-bold ${colors[level]}`}>{stars[level] || "☆☆☆☆☆"}</span>;
};

export default function Home() {
  return (
    <main className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">出馬表表示テスト</h1>
      <div className="grid gap-6">
        {dummyHorses.map((horse, idx) => (
          <div key={idx} className="border p-4 rounded shadow bg-white">
            <div className="flex justify-between items-center mb-2">
              <div className="text-lg font-semibold">{horse.name}</div>
              <div className="text-sm text-gray-600">
                {horse.sex}{horse.age}・{horse.weight}kg
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-sm">
              {horse.past.map((race, i) => (
                <div key={i} className="p-2 border rounded bg-gray-50">
                  <div className="text-base font-bold">{race.rank}着</div>
                  <div className="text-xs">{race.time} / {race.agari}</div>
                  <div>{levelToStars(race.level)}</div>
                </div>
              ))}
              {[...Array(5 - horse.past.length)].map((_, i) => (
                <div key={`empty-${i}`} className="p-2 border rounded bg-gray-100 text-gray-400">ー</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
