import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs/promises'
import path from 'path'

/* Windows 共有 V:\ を Mac が /Volumes/V としてマウントしている前提 */
const O1_DIR =
  process.platform === 'darwin'
    ? '/Volumes/V/o1'   // Mac 側
    : 'V:\\o1';         // Windows 開発時

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { raceKey } = req.query
  if (!raceKey || Array.isArray(raceKey)) {
    return res.status(400).json({ error: 'raceKey required' })
  }

  try {
    const file = path.join(O1_DIR, `${raceKey}.json`)
    const json = await fs.readFile(file, 'utf8')
    res.setHeader('Content-Type', 'application/json')
    return res.status(200).send(json)
  } catch {
    return res.status(404).json({ error: 'not found' })
  }
}
