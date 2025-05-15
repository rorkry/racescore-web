/**
 * dataSource.ts – 旧 localStorage 実装と新 DB 実装の“橋渡し”レイヤ
 * ===============================================================
 * ▼ 使い方（React / Next.js から）
 *   import { ds } from '@/lib/dataSource'
 *   const race = await ds.getRace("202505040501")
 *
 * ▼ モード切替
 *   .env.local に   NEXT_PUBLIC_DATA_MODE=db   を書けば DB ルート
 *   何も書かなければ従来通り localStorage を参照
 *
 * ▼ 実装メモ
 *   - DB 側の実装が出来るまで "TODO: DB impl" のままにしておく
 *   - 旧コードで使っているシグネチャは出来るだけ変えない
 */

// 型: 最小限（後で Prisma 型 or Zod 型に置き換え）
export type RaceRow     = Record<string, any>
export type HorseRow    = Record<string, any>
export type OddsRow     = { horseNo: number; win: number }
export type TrifectaRow = { comb: string; odds: number }

// -------------------------
// localStorage 実装
// -------------------------

// ---- WinPlace CSV fetch (static file) ---------------------------------
const fetchWinPlaceCsv = async (raceKey: string): Promise<OddsRow[]> => {
  try {
    const url = `/${raceKey}-WinPlace.csv`
    const txt = await fetch(url).then(r => (r.ok ? r.text() : ''))
    if (!txt) return []

    // simple CSV: first line is header
    return txt
      .trim()
      .split('\n')
      .slice(1)
      .map(line => {
        const [horseNo, win] = line.split(',')
        return { horseNo: Number(horseNo), win: Number(win) }
      })
  } catch {
    return []
  }
}
const getRaceLS = async (raceKey: string): Promise<RaceRow | null> => {
  try {
    const all = localStorage.getItem('nestedData')
    if (!all) return null
    const nested = JSON.parse(all) as Record<string, any>
    // nestedData[date][place][raceNo] → raceKey 生成して比較
    for (const dateCode in nested) {
      for (const place in nested[dateCode]) {
        for (const raceNo in nested[dateCode][place]) {
          const key = `${dateCode.padStart(4,'0')}${place}${raceNo.padStart(2,'0')}`
          if (raceKey.endsWith(key)) return nested[dateCode][place][raceNo]
        }
      }
    }
    return null
  } catch (e) {
    console.warn('[dataSource] getRaceLS error', e)
    return null
  }
}

const getOddsLS = async (raceKey: string): Promise<OddsRow[]> => {
  {
    // ① try static CSV first
    const fromCsv = await fetchWinPlaceCsv(raceKey)
    if (fromCsv.length) return fromCsv

    // ② fallback: legacy localStorage (for older snapshots)
    try {
      const saved = localStorage.getItem('oddsData')
      if (!saved) return []
      const rows: OddsRow[] = JSON.parse(saved)
      return rows.filter(r => (r as any).raceKey === raceKey)
    } catch {
      return []
    }
  }
}

const getTrifectaLS = async (raceKey: string): Promise<TrifectaRow[]> => {
  try {
    const o6Dir = `/o6/${raceKey}.json`
    const res = await fetch(o6Dir)
    if (!res.ok) return []
    const json = await res.json()
    return Object.entries(json.o6 || {}).map(([comb, odds]) => ({ comb, odds: Number(odds) }))
  } catch {
    return []
  }
}

// -------------------------
// DB 実装  (後で Prisma で書き換え)
// -------------------------
const getRaceDB = async (raceKey: string): Promise<RaceRow | null> => {
  const res = await fetch(`/api/race/${raceKey}`)
  if (!res.ok) return null
  return res.json()
}

const getOddsDB = async (raceKey: string): Promise<OddsRow[]> => {
  const res = await fetch(`/api/odds/${raceKey}`)
  if (!res.ok) return []
  return res.json()
}

const getTrifectaDB = async (raceKey: string): Promise<TrifectaRow[]> => {
  const res = await fetch(`/api/trifecta/${raceKey}`)
  if (!res.ok) return []
  return res.json()
}

// -------------------------
// エクスポート: モードで振り分け
// -------------------------
export const ds = {
  mode: (process.env.NEXT_PUBLIC_DATA_MODE || 'local') as 'local' | 'db',

  async getRace(key: string) {
    return this.mode === 'local' ? getRaceLS(key) : getRaceDB(key)
  },

  async getOdds(key: string) {
    return this.mode === 'local' ? getOddsLS(key) : getOddsDB(key)
  },

  async getTrifecta(key: string) {
    return this.mode === 'local' ? getTrifectaLS(key) : getTrifectaDB(key)
  },
}
