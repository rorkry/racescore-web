// scripts/insertTrifecta.js
import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'

if (process.argv.length < 3) {
  console.error('使い方: node scripts/insertTrifecta.js <jsonFile>')
  process.exit(1)
}

const jsonPath = process.argv[2]
const absPath  = path.resolve(jsonPath)
const data     = JSON.parse(await fs.readFile(absPath, 'utf8'))

/* 期待する JSON 形
{
  "raceKey": "202505120811",
  "o6": { "010203": 125.4, ... },
  "updated": "2025-05-12T09:15:03"
}
*/

const prisma = new PrismaClient()
const { raceKey, o6 } = data

try {
  await prisma.$transaction(async tx => {
    // Race が無ければダミーで作成（日付・コースは後で更新してもOK）
    await tx.race.upsert({
      where: { id: raceKey },
      update: {},
      create: { id: raceKey, date: new Date(), course: '00' }
    })

    // Trifecta を upsert
    const records = Object.entries(o6).map(([comb, odds]) => ({
      id: `${raceKey}_${comb}`,
      raceId: raceKey,
      comb,
      odds: Number(odds)
    }))

    // chunk 500 件ずつで INSERT (SQLite の max パラメータ回避)
    const chunk = 500
    for (let i = 0; i < records.length; i += chunk) {
      const slice = records.slice(i, i + chunk)
      await tx.trifecta.createMany({
        data: slice,
        skipDuplicates: true
      })
    }
  })

  console.log('✅ inserted', Object.keys(o6).length, 'rows for', raceKey)
} catch (e) {
  console.error('❌ insert failed:', e)
} finally {
  await prisma.$disconnect()
}
