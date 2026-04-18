# OGB Tool — Part 22 Handover
**Written: End of Part 21 session, 18 Apr 2026**
**Current build: v21.0 · 18 Apr 2026**

---

## 1. What Changed in Part 21

### Critical Fix — backend/app.py sync
- `backend/app.py` was at 3,376 lines (Part 19) while root `app.py` was 3,540 (Part 20)
- `/market/recommend` endpoint and `entity_counts` in `/mi/summary` were missing from Railway
- Both files now at 3,919 lines (Part 21)

### P8: Bulk Seed Endpoint + Data
**Backend:** `POST /market/seed`
- Bulk-insert interactions + rules. Idempotent — deduplicates by underwriter+type+date+risk_id.

**Frontend seed functions:**
- `seedPPAQ()` — 16 interactions: 7 wrote_line primary, 7 wrote_line XS, 1 Canopius decline (hard rule), 1 Beazley ghosted. 1 market rule auto-created.
- `seedEkol()` — 8 interactions: STP Turkey panel (Aviva, Brit, AXIS, Fidelis, Everest, CNA Hardy, Antares, Talbot).

### P8: Market Feedback Auto-Extraction
**Backend:** `POST /market/extract-feedback`
- Haiku extracts structured market interactions from email body
- Auto-creates market_interactions + market_rules for hard declines
- Source tagged auto_extracted

**Frontend:**
- `extractMarketFeedback()` — manual paste form in Intelligence > Seed data tab
- `autoExtractMarketFeedback()` — called from wfSaveAll when email classified as feedback

### Backend: Duplicate Entity Detection
`GET /entities/duplicates?threshold=0.4&type=insured&limit=50`
- PostgreSQL pg_trgm trigram similarity, fallback to prefix matching
- `findDuplicateEntities()` rewritten as async PG-backed function

### Backend: Company Research for PG Entities
`POST /entities/:id/research`
- Haiku company research saves as entity note
- `researchCompany(entityId)` rebuilt for PG, Research button on PG entity card

### Legacy Code Removal (~585 lines)
- `_legacyEntOpenCard` (287), `entCardTab` + `renderEntityTimeline` (100) — removed
- `deleteInsured`, `deleteNote`, old `researchCompany` (87) — stubs
- `buildMigrationPayload`, `previewMigration`, `migrateEntitiesToPG` (82) — stubs
- HTML migration panel replaced with completion banner
- `insuredOpts` dead variable removed
- `entOpenCard` fallback shows notice instead of legacy card

### Book View to PG
- `renderBook()` market column: removed entGetState localStorage lookup
- `fxGetFilteredRows()` rewritten as async — fetches /portfolio-by-year from PG
- `renderFxPanel()` updated to await fxGetFilteredRows

### Renewal Pack to PG
- `populateRenewalRefs()` rewritten as async — fetches bound risks from PG
- `generateRenewalPack()` rewritten — PG risk ID as primary path, localStorage fallback

---

## 2. Current Architecture

### Frontend (Netlify: ogbcargotool.netlify.app)
```
frontend/
  index.html              (2,565 lines — v21.0)
  css/app.css
  js/
    main.js               (8,277 lines)
    workflow.js            (991 lines)
    comparison.js          (255 lines)
    extensions.js          (444 lines)
    patches.js             (156 lines)
    dataexport.js          (120 lines)
    seeds.js               (5 lines)
    projectcargo.js        (142 lines)
```

### Backend (Railway: og-backend-production.up.railway.app)
```
backend/
  app.py                  (3,919 lines)
  doc_extract.py          (499 lines)
  workflow.py             (395 lines)
  comparison.py           (646 lines)
```

---

## 3. Remaining localStorage Callers (~12)

All backup/export or graceful fallbacks behind PG-first paths:

| Function | Purpose | Risk |
|----------|---------|------|
| entOpenCard | Slug ID lookup fallback | Zero |
| batchStart / batchAutoSave | Insured list fallback | Zero |
| reviewPopEnquiry | Enquiry selector in batch review | Low |
| populateRenewalRefs | Fallback if PG fetch fails | Zero |
| generateRenewalPack | Fallback for localStorage refs | Zero |
| export/import functions | Backup | Keep |
| runRecon | Book reconciliation | Low |

**No localStorage entity reads remain in any primary user flow.**

---

## 4. New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /market/seed | Bulk-insert interactions + rules with dedup |
| POST | /market/extract-feedback | AI-extract market feedback from email |
| GET | /entities/duplicates | Trigram similarity duplicate detection |
| POST | /entities/:id/research | AI company research saves as note |

---

## 5. Files Changed

| File | Before | After | Delta |
|------|--------|-------|-------|
| backend/app.py | 3,540 | 3,919 | +379 |
| frontend/js/main.js | 8,590 | 8,277 | -313 |
| frontend/js/workflow.js | 978 | 991 | +13 |
| frontend/index.html | 2,541 | 2,565 | +24 |
| app.py (root) | synced | 3,919 | — |

---

## 6. Part 22 Priorities

| # | Priority | Effort |
|---|----------|--------|
| 1 | Test seed buttons, scorecards, Who to call | 15 min |
| 2 | Test manual extract feedback with real email | 15 min |
| 3 | Test company research on PG entity card | 5 min |
| 4 | Test renewal pack with PG dropdown | 10 min |
| 5 | Review Ekol seed accuracy vs actual placement | 15 min |
| 6 | Remove runRecon localStorage or rewrite | 30 min |
| 7 | Consider removing entGetState/entSave entirely | 1 session |

---

## 7. Opening Message for Part 22

```
Continuing OGB Tool development. Part 22.

Current state:
- GitHub: aceeagles1981/ogb-tool (public)
- Frontend: ogbcargotool.netlify.app
- Backend: og-backend-production.up.railway.app
- Part 21 shipped: P8 seed/extract, duplicate detection, company research, book+renewal+FX all PG-backed, ~585 lines legacy removed

What's live:
- POST /market/seed + seedPPAQ (16) + seedEkol (8)
- POST /market/extract-feedback + workflow auto-extraction
- GET /entities/duplicates (trigram similarity)
- POST /entities/:id/research (AI company research)
- Book view + FX panel + renewal pack all PG-first
- No localStorage entity reads in any primary user flow
- ~585 lines legacy code removed

Remaining localStorage: ~12 calls in backup/export and graceful fallbacks.

Bible and handover attached.
```
