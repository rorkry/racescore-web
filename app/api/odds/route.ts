// app/api/odds/[raceKey]/route.ts
import { NextResponse } from 'next/server';

/** 動的ルート版: /api/odds/202505040511 */
export async function GET(
  _req: Request,
  { params }: { params: { raceKey: string } },
) {
  const { raceKey } = params;

  // --- 1) バリデーション ------------------------------
  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12‑digit YYYYMMDDJJRR' },
      { status: 400 },
    );
  }

  // --- 2) ブリッジ URL -------------------------------
  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001';

  // --- 3) ブリッジへ転送 ------------------------------
  const res = await fetch(`${BRIDGE}/api/odds?key=${raceKey}`);

  // 「CSV 未配信」はそのまま転送
  if (res.status === 404) {
    return NextResponse.json({ error: 'CSV not found' }, { status: 404 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Bridge error' }, { status: res.status });
  }

  // --- 4) 正常結果を返却 ------------------------------
  const data = await res.json();
  return NextResponse.json(data);
}

// app/api/trio/[raceKey]/route.ts
import { NextResponse } from 'next/server';

/** 動的ルート版: /api/trio/202505040511 */
export async function GET(
  _req: Request,
  { params }: { params: { raceKey: string } },
) {
  const { raceKey } = params;

  // --- 1) バリデーション ------------------------------
  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    );
  }

  // --- 2) ブリッジ URL -------------------------------
  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001';

  // --- 3) ブリッジへ転送 ------------------------------
  const res = await fetch(`${BRIDGE}/api/trio?key=${raceKey}`);

  // 「CSV 未配信」はそのまま転送
  if (res.status === 404) {
    return NextResponse.json({ error: 'CSV not found' }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'Bridge error' }, { status: res.status });
  }

  // --- 4) 正常結果を返却 ------------------------------
  const data = await res.json();
  return NextResponse.json(data);
}