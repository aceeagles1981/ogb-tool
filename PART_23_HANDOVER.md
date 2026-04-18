# OGB Tool — Part 23 Handover
**Written: End of Part 22 session, 18 Apr 2026**
**Current build: v22.0 · 18 Apr 2026**

---

## 1. What Changed in Part 22

### The Big One: `entGetState`/`entSave` Eliminated

The two-worlds problem is solved. Zero localStorage entity reads remain in any code path — primary, fallback, or export. All entity data now flows exclusively through PostgreSQL.

**Functions deleted (zero callers):**
- `entGetState()`, `entSave(ent)`, `entStatusBadge(st)`, `entLatestEnquiry(ins)`
- `handleMissingLocalInsured(insId, operation)`
- `reviewPopEnquiry()`
- `deleteInsured()`, `deleteNote()` (stubs)
- `buildMigrationPayload()`, `previewMigration()`, `migrateEntitiesToPG()` (stubs)

**Functions rewritten (localStorage → PG-only):**

| Function | Change |
|----------|--------|
| `entOpenCard(insId)` | PG numeric ID or name-search only |
| `handleEmailFile()` | PG-only, removed localStorage fallback |
| `batchStart()` | PG-only, removed localStorage fallback |
| `populateRenewalRefs()` | PG-only, error on failure |
| `generateRenewalPack()` | PG risk ID only, removed `insId::enqId` path |
| `openDataModal()` | Async, fetches entity counts from PG |
| `exportAllData()` | Async, fetches entities from PG API |
| `exportEntitiesOnly()` | Async, fetches from PG API |
| `downloadDataJson()` | Async, fetches from PG API |
| `importData()` | Skips entity import with notice |
| `clearAllData()` | Messaging clarifies PG data preserved |

### dataexport.js Removal

- Script tag removed from index.html
- Duplicate `data-modal` div removed (83 lines)
- Header button rewired from `dataModalOpen()` to `openDataModal()`
- `dataexport.js` called `entGetState()` which no longer exists — would have crashed

### AP/RP Ledger CRUD

**Backend:** `DELETE /risks/:id/ledger/:entry_id` — deletes entry with audit log.

**Frontend (new functions appended to main.js):**
- `fetchRiskLedger(riskId)` — wrapper for GET /risks/:id/ledger
- `buildLedgerHtml(riskId, entries)` — full ledger card with:
  - Summary tiles (Invoiced, AP, RP, PC, Adj, Net) colour-coded
  - Entry table with type, date, currency, original amount, GBP, description
  - Delete button per row (with confirm)
  - Inline add form (type, date, CCY, original, GBP, description)
- `toggleLedgerForm(riskId)` — show/hide add form
- `addLedgerEntry(riskId)` — POST to backend, refreshes risk card
- `deleteLedgerEntry(riskId, entryId)` — DELETE from backend, refreshes risk card

**Risk card updated:** Old inline ledger table replaced with `buildLedgerHtml()` output.

### AP/RP Summary Panel → PG

**Backend:** `GET /mi/ledger-summary` — returns all risks with ledger entries, type totals per risk (original/ap/rp/pc/adj/net), grand totals, distinct years for filter. Optional `?year=` filter.

**Frontend:** `patches.js` fully rewritten (156→135 lines):
- `renderAprt()` now async — fetches from `/mi/ledger-summary` instead of reading localStorage `bookRows`
- Year filter passes to backend query parameter
- "Open" button on each row calls `openBackendRiskCard()` (was `toggleLedger()` on localStorage bookRows)
- Loading state shown while fetching
- No localStorage reads remain in patches.js

---

## 2. Current Architecture

### Frontend (Netlify: ogbcargotool.netlify.app)
```
frontend/
  index.html              (2,482 lines — v22.0)
  css/app.css
  js/
    main.js               (8,352 lines — zero entGetState callers, ledger CRUD)
    workflow.js            (991 lines)
    comparison.js          (255 lines)
    extensions.js          (444 lines)
    patches.js             (135 lines — AP/RP summary, PG-backed via /mi/ledger-summary)
    seeds.js               (5 lines)
    projectcargo.js        (142 lines)
```
**Removed in Part 22 (script tags removed, files remain):**
- dataexport.js (120 lines) — PG-backed equivalents in main.js

### Backend (Railway: og-backend-production.up.railway.app)
```
backend/
  app.py                  (3,939 lines — +20: DELETE ledger endpoint)
  doc_extract.py          (499 lines)
  workflow.py             (395 lines)
  comparison.py           (646 lines)
```

---

## 3. What Still Uses localStorage

Only non-entity data. No entity dependency remains anywhere.

| Data | localStorage Key | Notes |
|------|-----------------|-------|
| Book rows (manual) | `og_state_v4` → `.bookRows` | Manual commission tracker |
| Cargo war blotter | `og_state_v4` → `.cwRisks` | MM's daily CW tracking |
| Contacts / address book | `og_state_v4` → `.contacts` | Market contacts |
| Clause library | `og_state_v4` → `.clauseLibrary` | 118 clauses |
| Slip library | `og_state_v4` → `.slipLibrary` | Reference slips |
| Proposal form | `og_state_v4` → `.proposalForm` | Intake form state |
| SOV / location schedule | `og_state_v4` → `.sovLocations` | Stock values |
| Project cargo checklist | `og_pc_checked` | PC checklist state |
| FX rates cache | `og_fx_rates_v1` | Rate cache |
| Admin token | `og_admin_token_v1` | Railway auth |

---

## 4. New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| DELETE | `/risks/:id/ledger/:entry_id` | Delete ledger entry with audit log |
| GET | `/mi/ledger-summary` | AP/RP summary across all risks with ledger entries, optional `?year=` filter |

---

## 5. Files Changed in Part 22

| File | Before | After | Delta |
|------|--------|-------|-------|
| frontend/js/main.js | 8,268 | 8,352 | +84 (−75 dead code, +159 ledger CRUD) |
| frontend/js/patches.js | 156 | 135 | −21 (fully rewritten: localStorage → PG) |
| frontend/index.html | 2,565 | 2,482 | −83 (version bump, dataexport modal removed) |
| backend/app.py | 3,919 | 4,003 | +84 (DELETE ledger, GET /mi/ledger-summary) |
| app.py (root) | synced | 4,003 | — |

**Removed (script tag removed, file remains):**
- frontend/js/dataexport.js (120 lines)

---

## 6. Part 23 Priorities

| # | Priority | Effort |
|---|----------|--------|
| 1 | Test all Part 21+22 features against live deployment | 1 hour |
| 2 | Test ledger CRUD + AP/RP Summary panel | 15 min |
| 3 | Review Ekol seed data against actual placement | 15 min |
| 4 | CW blotter → PG (if warranted) | 1-2 sessions |
| 5 | Book rows → PG | 1 session |
| 6 | Contacts → PG | 1 session |

---

## 7. Opening Message for Part 23

```
Continuing OGB Tool development. Part 23.

Current state:
- GitHub: aceeagles1981/ogb-tool (public)
- Frontend: ogbcargotool.netlify.app
- Backend: og-backend-production.up.railway.app
- Part 22 shipped: entGetState/entSave eliminated, dataexport.js removed, AP/RP ledger CRUD, AP/RP Summary→PG

What's live:
- ZERO localStorage entity reads in any code path
- Ledger CRUD on risk card: summary tiles, add form, delete per row
- AP/RP Summary panel reads from PG /mi/ledger-summary (was localStorage)
- dataexport.js removed (was broken — called deleted entGetState)
- DELETE /risks/:id/ledger/:entry_id + GET /mi/ledger-summary endpoints
- patches.js fully rewritten (localStorage → PG)
- 11 dead functions deleted, duplicate data-modal removed

localStorage now only holds: bookRows, CW blotter, contacts, clause/slip library, proposal form, SOV, FX cache, PC checklist.

Priorities: test Part 21+22, Ekol seed review, CW→PG, book→PG, contacts→PG

Bible and handover attached.
```
