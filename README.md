This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# racescore‑web

> **Status: WIP / Private sandbox** – a Next.js 14 (app router, TypeScript) web‑app I’m building on my Mac to analyse Japanese horse‑racing data and generate an “俺の出馬表 (my race‑card)” with past‑run summaries, form figures and synthetic odds.

---

## 1. What this app does (current state)

| Area                          | Implemented                                                                                                                                                                                      | Notes                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **CSV ingest**                | ✅ 4 independent uploaders<br>‐ 出走予定馬 (entries)<br>‐ 出馬表 (races)<br>‐ 枠順確定 (frames)<br>‐ オッズ (win odds)                                                                                           | Papaparse + Shift‑JIS handling. Data persisted to `localStorage` for rapid refreshes. |
| **Race‑card table**           | ✅ `EntryTable.tsx` renders every race with:<br>‐ Horse rows, 5‑run history, cluster time diff, badges<br>‐ Dynamic label colouring (くるでしょ / …)<br>‐ Real‑time single‑win odds polled every 5 min | Tailwind CSS, Headless‑UI Tabs, mobile responsive.                                    |
| **Synthetic win odds**        | ✅ Hook `useSyntheticWinOdds` + lib `calcSyntheticWinOdds.ts` convert 三連単 O6 odds → per‑horse odds                                                                                                | Current safety filters: require ≥3 combos & odds ≤200.                                |
| **Odds API routes**           | ✅ `/api/odds/[raceKey]` (単勝), `/api/trio/[raceKey]` (O6)                                                                                                                                         | SSR fetches → JSON served to the hook.                                                |
| **Global score distribution** | ✅ Bar chart (Chart.js) with percentile overlay                                                                                                                                                   | Used for dynamic label thresholds.                                                    |
| **Snapshot automation**       | ✅ Bash `update_gist.sh` to rsync selected dirs into a *public* repo (`racescore-web`) for ChatGPT context                                                                                        | Re‑runs and pushes with one command.                                                  |

---

## 2. What we did in this ChatGPT session

1. **Fixed synthetic odds logic**

   * Added combo‑count & max‑odds cut‑off in `calcSyntheticWinOdds.ts`.
   * Ensured only valid horse numbers (1‑18) are stored.
2. **EntryTable refactor**

   * `mergedPredicted` memo to merge prop vs. hook odds.
   * Column visibility flags (`hasWinOdds`, `hasPred`).
3. **Created live API routes** under `app/api` (Next.js 14 route handlers).
4. **Set up Git & GitHub**

   * Installed `gh` CLI, authenticated.
   * Created public repo **racescore‑web** and pushed local snapshot.
5. **Put in place a snapshot script** (`update_gist.sh`) for selective rsync & commit.

---

## 3. Road‑map / TODO

* [ ] **Data source parity with Target/TFJV**
  Implement extractor (or CSV importer) that matches Target’s *想定単勝オッズ* exactly.
* [ ] **Prisma schema** (currently stubbed) → persist crawled odds in SQLite.
* [ ] **UI polish**

  * colour‑blind palette, sticky header, mobile swipe.
* [ ] **Testing**
  Vitest + React Testing‑Library for calc & hook units.
* [ ] **Deployment**
  Private Vercel project with `GITHUB_TOKEN` secrets for scheduled fetch.

---

## 4. Dev setup (Mac)

```bash
# 1. clone private repo (maintained via ChatGPT)
$ git clone git@github.com:rorkry/racescore-web.git
$ cd racescore-web

# 2. install deps (Node 20, pnpm preferred)
$ pnpm i    # or npm i / yarn

# 3. local dev
$ pnpm dev  # http://localhost:3000

# 4. snapshot for ChatGPT context (pushes to GitHub)
$ ./update_gist.sh && git push
```

> **CSV encodings**: source files are Shift‑JIS; `parseOdds` etc. handle conversion.

---

## 5. Folder guide (excerpt)

```
app/              Next.js app‑router pages & API handlers
├── api/
│   ├── odds/[raceKey]/route.ts   # fetch JRA 単勝 odds (proxy)
│   └── trio/[raceKey]/route.ts   # fetch 三連単 O6 odds (proxy)
├── components/                   # UI widgets (EntryTable, RaceCard …)
└── page.tsx                      # top‑level tabs UI

hooks/            React hooks (useSyntheticWinOdds)
lib/              pure utilities shared both server/client
scripts/          node/deno helpers (data import, summarise)
utils/            front‑end only helpers (score calc, odds parsing)
prisma/           dev.db + future schema
```

---

## 6. License

Private/unlicensed for now – will decide once data‑source licensing is cleared.
