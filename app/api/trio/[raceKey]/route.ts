import { promises as fs } from 'fs'
import path               from 'path'
import { NextResponse }   from 'next/server'

export async function GET(
  _req: Request,
  context: { params: Promise<{ raceKey: string }> }
) {
  const { raceKey } = await context.params

  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    )
  }

  /* --- public/o6/<raceKey>.json を読み込む --- */
  try {
    const filePath = path.join(process.cwd(), 'public', 'o6', `${raceKey}.json`)
    const raw      = await fs.readFile(filePath, 'utf8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    // ファイルが見つからない場合は404を返す
    return NextResponse.json(
      { error: 'CSV not found' },
      { status: 404 }
    )
  }
}
