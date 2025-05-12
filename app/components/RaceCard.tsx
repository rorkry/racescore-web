"use client";

import React from "react";

type Props = {
  horseName: string;
  sex: string;
  age: number;
  weight: number;
  pastRaces: {
    date: string;
    distance: string;
    time: string;
    level: string;
    finish: string;
  }[];
};

export default function RaceCard({
  horseName,
  sex,
  age,
  weight,
  pastRaces,
}: Props) {
  return (
    <div className="rounded-xl border p-4 shadow-sm mb-2 bg-white text-black">
      <div className="font-bold text-lg">{horseName}</div>
      <div className="text-sm text-gray-600 mb-2">
        {sex}{age}・{weight}kg
      </div>
      <div className="grid grid-cols-5 gap-2">
        {pastRaces.map((race, i) => (
          <div
            key={i}
            className="border rounded p-1 text-xs text-center bg-gray-50"
          >
            <div className="font-bold">{race.finish}</div>
            <div>{race.date}</div>
            <div>{race.distance}m</div>
            <div>{race.time}</div>
            <div>{race.level}</div>
          </div>
        ))}
      </div>
    </div>
  );
}