// app/components/RaceCard.tsx
"use client";

import React from "react";

type RaceCardProps = {
  raceName: string;
  horses: {
    name: string;
    sex: string;
    age: number;
    weight: number;
    score: string; // A~E
  }[];
};

const levelColors: Record<string, string> = {
  A: "text-red-500",
  B: "text-orange-500",
  C: "text-gray-500",
  D: "text-blue-500",
  E: "text-teal-500",
};

export const RaceCard = ({ raceName, horses }: RaceCardProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-6">
      <h2 className="text-lg font-bold mb-3">{raceName}</h2>
      <div className="grid grid-cols-1 gap-2">
        {horses.map((horse, i) => (
          <div key={i} className="flex justify-between items-center border p-2 rounded">
            <div className="text-sm font-medium">
              {horse.name} <span className="text-xs text-gray-500">({horse.sex}{horse.age})</span>
            </div>
            <div className="text-sm">{horse.weight}kg</div>
            <div className={`text-sm font-bold ${levelColors[horse.score] || "text-gray-400"}`}>
              {"★".repeat("EDCBA".indexOf(horse.score) + 1).padEnd(5, "☆")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
