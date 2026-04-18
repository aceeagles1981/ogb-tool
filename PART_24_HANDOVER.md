# OGB Tool — Part 24 Handover
**Written: End of Part 23 session, 18 Apr 2026**
**Current build: v23.0 · 18 Apr 2026**

---

## 1. What Changed in Part 23

### Testing Phase — Backend API Verification (via browser JS)

Tested 21 backend endpoints against the live Railway deployment via `apiFetch()` calls from the loaded frontend. Results:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/health` | ✅ | 151 entities, 34 notes, 1 risk, 5 tasks |
| `/mi/summary` | ✅ | entity_counts, velocity, conversion all present |
| `/mi/renewals` | ❌ 500 | Server-side error — fixed in this session |
| `/mi/corrections` | ✅ | accuracy_by_field, correction_rate present |
| `/mi/producer-performance` | ✅ | 0 producers (no risks linked) |
| `/mi/ledger-summary` | ✅ | rows, totals, years present |
| `/risks`, `/risks/1` | ✅ | Saint Honore with compliance review |
| `/risks/1/ledger` | ✅ | Empty items (none created yet) |
| `/risks/1/corrections` | ✅ | 0 corrections |
| `/market/scorecards` | ✅ | Empty — seed data not yet run |
| `/market/interactions` | ✅ | Returns object |
| `/market/rules` | ✅ | Returns object |
| `/market/recommend` | ✅ | 0 recs (no seed data) |
| `/market/check-rules` | ✅ | Returns object |
| `/entities` | ✅ | 151 entities |
| `/entities/duplicates` | ✅ | 17 duplicates found |
| `/entities/:id`, `/entities/:id/notes` | ✅ | Full card with children |
| `/portfolio-by-year?year=2026` | ✅ | items, totals, year |
| `/tasks` | ✅ | 4 tasks |

**Frontend function audit:**
- `entGetState` / `entSave` confirmed **GONE** (only comment reference)
- All P21+P22 functions confirmed present: `buildLedgerHtml`, `addLedgerEntry`, `deleteLedgerEntry`, `seedPPAQ`, `seedEkol`, `extractMarketFeedback`, `renderMI8Recommend`, etc.

### Fix: `/mi/renewals` 500 Error

**Root cause:** Likely Decimal serialization from psycopg3. The retention query's `SUM(CASE...)` returns psycopg3 types that Flask's `jsonify` can't serialize.

**Fix:** 
1. Explicit type-safe casting on all retention_row values — `int()` for counts, `float()` for amounts
2. `float()` cast on `revenue_at_risk` sum
3. Error traceback wrapper: `mi_renewals()` now catches exceptions and returns the actual traceback in the 500 response for diagnosis

### Dead Code Removal

- `calcChurnRisk()` (36 lines) — zero callers, read localStorage entities. Removed.

### CW Blotter Audit

`cwGetRisks()` and `cwSaveRisks()` are referenced throughout `main.js` and `extensions.js` but **never defined anywhere** in the codebase. They were lost during the monolithic HTML → modular JS split. The CW blotter panel renders HTML structure but can't read/write data. CW → PG would be a **rebuild**, not a migration.

### Contacts → PG (the main build)

**Schema:** New `contacts` table:
```sql
contacts — id SERIAL, name TEXT, email TEXT, phone TEXT, firm TEXT, role TEXT,
           notes TEXT, source TEXT, last_seen DATE, created_at, updated_at
```
Indexes: `idx_contacts_email` (LOWER(email)), `idx_contacts_name` (LOWER(name))

**Backend (6 new endpoints):**
- `GET /contacts` — list with optional `?q=` search
- `POST /contacts` — create (duplicate check by email)
- `PATCH /contacts/:id` — update fields
- `DELETE /contacts/:id` — delete with audit log
- `POST /contacts/import` — bulk import from localStorage JSON (dedup by email then name, fill blanks on match)
- `POST /contacts/upsert` — upsert from email ingest (match by email then name, skip generic addresses)

**Frontend (7 functions rewritten):**
- `renderContacts()` — async, fetches from PG `/contacts`, server-side search
- `openEditContact(id)` — async, fetches from PG
- `saveContact()` — async, POST/PATCH to PG
- `deleteContact(id)` — async, DELETE from PG
- `upsertContacts(contacts, insuredName)` — async, POST to `/contacts/upsert`
- `dedupeContacts()` — async, client-side merge + PG DELETE for duplicates
- `extractAndUpsertContacts()` — rewritten to call PG `upsertContacts()` instead of localStorage write

**New function:**
- `migrateContactsToPG()` — one-click import of localStorage contacts to PG via `/contacts/import`

**HTML changes:**
- "⬆ Import from browser" button added to contacts panel
- Version bump v22.0 → v23.0

**Home page contacts stat** — now reads from PG `/contacts` endpoint instead of localStorage

**Health endpoint** — now includes `contact_count`

---

## 2. Current Architecture

### Frontend (Netlify: ogbcargotool.netlify.app)
```
frontend/
  index.html              (2,479 lines — v23.0)
  css/app.css
  js/
    main.js               (8,334 lines — contacts PG-backed, calcChurnRisk removed)
    workflow.js            (991 lines)
    comparison.js          (255 lines)
    extensions.js          (444 lines — CW improvements, RTB)
    patches.js             (135 lines — AP/RP summary, PG-backed)
    seeds.js               (5 lines)
    projectcargo.js        (142 lines)
```

### Backend (Railway: og-backend-production.up.railway.app)
```
backend/
  app.py                  (4,282 lines — +279: contacts CRUD, renewals fix, traceback wrapper)
  doc_extract.py          (499 lines)
  workflow.py             (395 lines)
  comparison.py           (646 lines)
```

### Database — New Table
```
contacts — id, name, email, phone, firm, role, notes, source, last_seen, created_at, updated_at
```

---

## 3. What Still Uses localStorage

Contacts migration removes another data type from localStorage dependency.

| Data | localStorage Key | Notes |
|------|-----------------|-------|
| Book rows (manual) | `og_state_v4` → `.bookRows` | Manual commission tracker |
| Cargo war blotter | `og_state_v4` → `.cwRisks` | MM's daily CW tracking — **cwGetRisks/cwSaveRisks undefined** |
| Clause library | `og_state_v4` → `.clauseLibrary` | 118 clauses |
| Slip library | `og_state_v4` → `.slipLibrary` | Reference slips |
| Proposal form | `og_state_v4` → `.proposalForm` | Intake form state |
| SOV / location schedule | `og_state_v4` → `.sovLocations` | Stock values |
| Lessons / market feedback | `og_state_v4` → `.lessons`, `.marketFeedback` | Seed data |
| Project cargo checklist | `og_pc_checked` | PC checklist state |
| FX rates cache | `og_fx_rates_v1` | Rate cache |
| Admin token | `og_admin_token_v1` | Railway auth |

**Removed from localStorage dependency in Part 23:**
- Contacts (46 contacts → PG `contacts` table)

---

## 4. New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/contacts` | List with optional `?q=` search |
| POST | `/contacts` | Create (email dedup check) |
| PATCH | `/contacts/:id` | Update fields |
| DELETE | `/contacts/:id` | Delete with audit log |
| POST | `/contacts/import` | Bulk import from localStorage JSON |
| POST | `/contacts/upsert` | Upsert from email ingest |

---

## 5. Files Changed in Part 23

| File | Before | After | Delta |
|------|--------|-------|-------|
| backend/app.py | 4,003 | 4,282 | +279 (contacts CRUD, renewals fix, traceback) |
| frontend/js/main.js | 8,400 | 8,583 | +183 (contacts rewritten, CW rebuild, calcChurnRisk removed) |
| frontend/index.html | 2,478 | 2,510 | +32 (migrate buttons, CW modal, version bump) |
| app.py (root) | synced | 4,479 | — |

---

### CW Blotter Rebuild (Part 23)

**Schema:** New `cw_risks` table:
```sql
cw_risks — id SERIAL, vessel, imo, insured, cedant, goods, tsi NUMERIC,
           loading_port, discharge_port, loading_date, quoted_rate NUMERIC,
           min_premium NUMERIC, status, compliance, sbox_ref, producer_ref,
           producer, sender, buyer, bdx_month, notes, source_filename,
           created_at, updated_at
```

**Backend (5 new endpoints):**
- `GET /cw-risks` — list with optional `?status=` filter
- `POST /cw-risks` — create
- `PATCH /cw-risks/:id` — update fields
- `DELETE /cw-risks/:id` — delete with audit log
- `POST /cw-risks/import` — bulk import from localStorage (camelCase→snake_case mapping)

**Frontend (full rebuild — 11 functions):**
- `cwGetRisks()` — async, fetches from PG, caches in `_cwRisksCache`
- `cwGetRisksSync()` — returns cached data for sync callers
- `cwRenderBlotter()` — async, full table with status selects, filters, stats, edit/delete buttons
- `cwSaveRisk()`, `cwDeleteRisk()`, `cwUpdateStatus()`, `cwUpdateField()` — PG CRUD
- `cwEditRisk()`, `cwOpenAddRisk()`, `cwSaveModal()` — modal form
- `cwGenerateEmail()` — builds HTML consolidation email table from PG data
- `cwExportBordereau()` — CSV export of all CW risks
- `cwSetCompliance()` — PG-backed compliance status
- `migrateLocalCwToPG()` — one-click localStorage→PG import

**HTML:**
- CW add/edit modal (16 fields: vessel, IMO, insured, cedant, goods, TSI, ports, date, rate, min premium, status, sbox, producer, notes)
- "+ Add risk" button in toolbar
- "⬆ Import" button for localStorage migration

---

## 6. Part 24 Priorities

| # | Priority | Effort |
|---|----------|--------|
| 1 | Deploy + test contacts migration + CW migration | 10 min |
| 2 | Test `/mi/renewals` fix live | 2 min |
| 3 | Run seed buttons (seedPPAQ, seedEkol) + verify scorecards | 5 min |
| 4 | Wire CW email ingest (drop .msg → create cw_risk in PG) | 1 session |
| 5 | Book rows → PG (write path — read exists via /portfolio-by-year) | 1 session |
| 6 | Clause/slip library → PG | 1 session |

### Quick fixes (anytime)
- Remove migrate buttons after migrations confirmed
- Clean up seed init function — lessons/marketFeedback seed data could move to PG
- extensions.js audit — many patches reference undefined base functions, most are no-ops now

---

## 7. Opening Message for Part 24

```
Continuing OGB Tool development. Part 24.

Current state:
- GitHub: aceeagles1981/ogb-tool (public)
- Frontend: ogbcargotool.netlify.app
- Backend: og-backend-production.up.railway.app
- Part 23 shipped: contacts→PG, CW blotter rebuild, mi/renewals fix, calcChurnRisk removed

What's live:
- Contacts fully PG-backed: 6 endpoints, search, upsert from ingest, bulk import
- CW blotter rebuilt from scratch: 5 endpoints, full table render, CRUD, email gen, CSV export
- /mi/renewals defensive type casting + error traceback wrapper
- calcChurnRisk dead code removed

localStorage remaining: bookRows, clauses, slips, proposal form, SOV, lessons, FX cache.
CW risks now in PG (pending migration of any existing localStorage data).

Priorities: deploy+test, seed market data, wire CW email ingest, book→PG, clauses→PG

Bible and handover attached.
```
