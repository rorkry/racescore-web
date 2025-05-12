// app/api/trio/[raceKey]/route.ts
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: { raceKey: string } },
) {
  const { raceKey } = params;

  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    );
  }

  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001';
  const res = await fetch(`${BRIDGE}/api/trio?key=${raceKey}`);

  if (res.status === 404)
    return NextResponse.json({ error: 'CSV not found' }, { status: 404 });

  if (!res.ok)
    return NextResponse.json({ error: 'Bridge error' }, { status: res.status });

  const data = await res.json();
  return NextResponse.json(data);
}