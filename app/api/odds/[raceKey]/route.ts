import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  context: { params: Promise<{ raceKey: string }> }   // ← ★ Promise 型で受ける
) {
  /* ---------------- params は Promise なので await ---------------- */
  const { raceKey } = await context.params            // ← ★ ここを await

  /* --- 1) raceKey バリデーション ------------------------------ */
  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    )
  }

  /* --- 2) Bridge へ転送 -------------------------------------- */
  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001'
  const res    = await fetch(`${BRIDGE}/api/odds?key=${raceKey}`)

  if (res.status === 404)
    return NextResponse.json({ error: 'CSV not found' }, { status: 404 })

  if (!res.ok)
    return NextResponse.json({ error: 'Bridge error' }, { status: res.status })

  /* --- 3) 正常レスポンス ------------------------------------ */
  return NextResponse.json(await res.json())
}
