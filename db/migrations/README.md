# umadata.keiro migration

## File

`db/migrations/20260724_add_umadata_keiro.sql`

## What it does

```sql
ALTER TABLE umadata ADD COLUMN IF NOT EXISTS keiro TEXT;
```

Stores Japanese coat-color names from umadata CSV (Excel column BL / header `毛色`).

## Status

**NOT applied to production by the app.** Review and run manually.

```powershell
# example (do not run until approved)
psql $env:DATABASE_URL -f db/migrations/20260724_add_umadata_keiro.sql
```

## After apply

1. Re-upload the full `umadata*.csv` (Shift_JIS) via admin upload.
2. Existing rows stay `NULL` until re-import — there is no upload history / raw JSON for BL backfill.
3. Confirm: `SELECT horse_name, keiro FROM umadata WHERE keiro IS NOT NULL LIMIT 20;`

## Upload handler

Runtime `ALTER TABLE ... keiro` inside `importUmadata` has been **removed**.
Upload will fail inserting `keiro` until this migration is applied.
