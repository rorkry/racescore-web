import { promises as fs } from 'fs'
import path               from 'path'
import { NextResponse }   from 'next/server'

export async function GET(
  _req: Request,
  context: { params: Promise<{ raceKey: string }> }   // ★
) {
  const { raceKey } = await context.params            // ★ await

  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    )
  }

  /* --- 1) public/o6/<raceKey>.json --------------------------- */
  try {
    const filePath = path.join(process.cwd(), 'public', 'o6', `${raceKey}.json`)
    const raw      = await fs.readFile(filePath, 'utf8')
    return NextResponse.json(JSON.parse(raw))
  } catch { /* not found */ }

  /* --- 2) Bridge fallback ----------------------------------- */
  const BRIDGE = process.env.BRIDGE ?? 'http://localhost:3001'
  const res    = await fetch(`${BRIDGE}/api/trio?key=${raceKey}`)

  if (res.status === 404)
    return NextResponse.json({ error: 'CSV not found' }, { status: 404 })

  if (!res.ok)
    return NextResponse.json({ error: 'Bridge error' }, { status: res.status })

  return NextResponse.json(await res.json())
}
