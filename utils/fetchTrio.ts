// utils/fetchTrio.ts
export type TrioApiResponse = {
    raceKey: string;
    o6: Record<string, number>;  // ex. { "010203": 1234.5, ... }
    updated: string;
  }
  
  export async function fetchTrio(raceKey: string): Promise<TrioApiResponse> {
    // Next.js の動的 API ルートを呼ぶ場合 (/api/trio/[raceKey])
    const res = await fetch(`/api/trio/${raceKey}`);
    if (!res.ok) throw new Error(`fetchTrio error ${res.status}`);
    return res.json();
  }