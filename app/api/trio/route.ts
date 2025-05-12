// app/api/trio/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  // バリデーション
  if (!key || !/^\d{12}$/.test(key)) {
    return NextResponse.json(
      { error: 'query "key" must be 12-digit raceKey' },
      { status: 400 }
    );
  }

  // ブリッジ URL（必要なら .env で上書き）
  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001';

  // ブリッジに投げる
  const res = await fetch(`${BRIDGE}/api/trio?key=${key}`);
  if (!res.ok) {
    return NextResponse.json(
      { error: 'Bridge error' },
      { status: res.status }
    );
  }

  const data = await res.json();
  // そのまま返却
  return NextResponse.json(data);
}