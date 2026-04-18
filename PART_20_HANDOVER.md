# OGB Tool — Part 20 Handover
**Written: End of Part 19 session, 18 Apr 2026**
**Current build: v19.0 · 18 Apr 2026**

---

## 1. What Changed in Part 19

### Phase 1 — Cleanup
- **Version bump:** v17.0 → v19.0 in index.html header
- **Dead code removal:** First `entGetState()` definition (lines 4186-4223, 38 lines) deleted — was shadowed by second definition at line 4224. `ENTITIES_SEED_VERSION_NEW` var removed with it (only referenced inside dead function).
- **Done tasks visual styling:** Risk card task list now renders done tasks with opacity 0.5, strikethrough title, green ✓ instead of Done button. Pipeline and home task lists already filter out done tasks server-side.
- **Rate limit debounce:** `completeRiskTask` now uses per-task guard (`_completingTask` map) — prevents rapid-click 429s from Railway.

### Phase 2 — Legacy Module Removal
- **autocompliance.js** (79 lines) — script tag removed from index.html. PG equivalent lives in `POST /risks/:id/compliance-screen`. Callers in workflow.js already guarded with `typeof autoComplianceScreen === 'function'`. Callers in main.js (hiFile path) will silently skip.
- **autotick.js** (145 lines) — script tag removed from index.html. PG equivalent lives in `POST /risks/:id/auto-tick`. Single call site in main.js hiSave guarded with `typeof autoTickPostBind === 'function'`.
- **compliance.js + legalverify.js** — audited and **kept**. Still reachable via `entOpenCard` → `pbOpenCompliance` and legalverify close callback. Connected legacy set: `entOpenCard` ↔ `compliance.js` ↔ `legalverify.js`. Now partially mitigated by entOpenCard PG redirect (see structural debt below).

### P9 — MI Dashboards
**Backend (3 endpoints):**
- `GET /mi/summary` — status breakdown, conversion rate, pipeline velocity (avg days per status), handler breakdown, yearly commission, open task summary
- `GET /mi/renewals` — 30/60/90 day buckets, upcoming renewal list with days-to-expiry, retention rate (last 12m), revenue at risk
- `GET /mi/producer-performance` — per-producer submission count, conversion %, commission, insured count. Joins entity hierarchy. Includes unlinked risks count.

**Frontend:**
- Reporting panel rebuilt with live MI dashboard
- Summary metrics tiles (total risks, bound, pipeline, conversion %, commission, open tasks)
- Pipeline funnel (horizontal bars per status, with commission)
- Velocity bars (avg days per status)
- Yearly commission table
- Renewals table with urgency colouring (red for ≤14 days), retention metrics
- Producer performance table (clickable → entity card)
- Handler breakdown table
- Links to SOV/Book/Lessons at bottom

### P7 — Term Correction Learning
**Backend (2 endpoints):**
- `GET /risks/:id/corrections` — diffs `ai_extracted` fields against live risk columns. Returns corrections with ai_value, current_value, correction_type (changed/added). Field mapping: assured_name, display_name, producer, product, region, handler, currency, estimated_premium→gross_premium, status.
- `GET /mi/corrections` — aggregate across all workflow-created risks. Accuracy % per field, correction rate, recent corrections list.

**Frontend:**
- Risk card: "AI corrections" badge appears below compliance badge for workflow-created risks with corrections. Shows field-by-field diff (AI value struck through → human value in green).
- MI dashboard: "AI extraction accuracy" panel with summary tiles, accuracy-by-field table (colour-coded), recent corrections log.

**Design principle:** Zero friction. Corrections happen naturally through existing risk card edits. The system reads the diff between `ai_extracted` and live columns — no new writes, no new tables, no new workflow.

### P8 — Market Intelligence
**Schema (2 new tables):**
```sql
market_interactions — id, risk_id, entity_id, underwriter, contact_name, syndicate,
    interaction_type, product, territory, line_pct, premium_indication, rate_indication,
    conditions (JSONB), decline_reason, decline_type, appetite_signals (JSONB),
    response_speed_hours, decisiveness, favour_tag, source, source_email_id,
    interaction_date, notes, created_at, updated_at

market_rules — id, underwriter, syndicate, rule_type, product, territory, exclusion,
    source_interaction_id, notes, active, created_at
```

**Backend (6 endpoints):**
- `GET /market/interactions` — list with filters (underwriter, risk_id, product, territory, type)
- `POST /market/interactions` — create interaction. Auto-creates market_rule if decline_type='hard_rule'.
- `GET /market/rules` — list active hard rules
- `POST /market/rules` — create rule manually
- `GET /market/check-rules` — given product + territory, return underwriters with matching hard declines
- `GET /market/scorecards` — aggregate per-underwriter: conversion %, avg line, avg response time, efficiency score (decisive/total), favour balance, products, territories

**Frontend:**
- Intelligence panel rebuilt with 5 sub-tabs: Scorecards, Market Rules, Interactions log, Log Interaction form, Add Rule form
- Scorecard table: conversion (colour-coded), avg line %, avg response hours, efficiency %, favour balance (green=they owe, amber=we owe)
- Interaction form: 23 fields covering underwriter, contact, outcome, product, territory, line %, decline type (hard rule / soft pass / no response), decisiveness (decisive / slow but clear / non-committal / ghosted), favour tag, response speed, notes
- Hard rules auto-created from hard_decline interactions

**Three scoring axes:**
1. **Appetite** — interaction types + hard rules (will they write it?)
2. **Efficiency** — response_speed_hours + decisiveness (are they efficient to work with?)
3. **Relationship** — favour_tag + balance (who owes whom?)

### Structural Debt — entOpenCard PG Redirect
- `entOpenCard(insId)` rewritten as PG-first redirect:
  - Integer ID → direct to `openEntityCard(id)`
  - localStorage slug → lookup by name in PG → redirect to `openEntityCard` if found → fall back to `_legacyEntOpenCard` if not
- This means `compliance.js` and `legalverify.js` callbacks now route through PG automatically for any entity that was migrated
- `hiFile` insured dropdown now populates from PG entities via `fetchEntityList`, with localStorage fallback

---

## 2. Current Architecture

### Frontend (Netlify: ogbcargotool.netlify.app)
```
frontend/
  index.html              (2,580 lines — v19.0)
  css/app.css
  js/
    main.js               (8,970 lines — core app, pipeline, accounts, entities, ingest, post-bind, MI, P7, P8)
    workflow.js            (978 lines — workflow UI, save, compliance, auto-tick)
    comparison.js          (255 lines — terms comparison UI)
    compliance.js          (164 lines — pre-bind compliance — localStorage, kept for legacy paths)
    legalverify.js         (208 lines — legal name verification — localStorage, kept for legacy paths)
    extensions.js          (444 lines — CW improvements, RTB)
    patches.js             (156 lines — AP/RP summary)
    dataexport.js          (120 lines — data export/import)
    seeds.js               (5 lines — seed data loader)
    projectcargo.js        (142 lines — project cargo checklist)
```
**Removed:** autocompliance.js (79 lines), autotick.js (145 lines) — script tags commented out, files remain in repo.

### Backend (Railway: og-backend-production.up.railway.app)
```
backend/
  app.py                  (3,376 lines — Flask, CORS, auth, all CRUD, compliance, auto-tick, cleanup, MI, P7, P8)
  doc_extract.py          (499 lines — AI extraction + classification prompts)
  workflow.py             (395 lines — workflow endpoint + output generation)
  comparison.py           (646 lines — terms comparison)
  requirements.txt
  Procfile
```

### Database (PostgreSQL on Railway)
All tables from Part 18 plus:
- `market_interactions` — underwriter interaction log with scoring fields
- `market_rules` — hard appetite rules (things markets won't write)
- Indexes: idx_mi_underwriter, idx_mi_risk, idx_mi_type, idx_mr_underwriter, idx_mr_active

---

## 3. What Works

| Feature | Status | Notes |
|---------|--------|-------|
| All Part 18 features | ✅ | Unchanged |
| Done tasks visual styling | ✅ | Opacity + strikethrough + ✓ on risk card |
| Rate limit debounce | ✅ | Per-task guard on completeRiskTask |
| MI dashboard (reporting panel) | ✅ | Summary, funnel, velocity, yearly, renewals, producers, handlers |
| AI correction tracking (P7) | ✅ | Risk card badge + MI accuracy panel |
| Market intelligence (P8) | ✅ | Scorecards, rules, interactions, forms |
| entOpenCard PG redirect | ✅ | Routes through PG for migrated entities |
| hiFile PG dropdown | ✅ | Fetches from PG with localStorage fallback |

---

## 4. Remaining localStorage Paths (Part 20 Target)

These functions still read from `entGetState()` / `entSave()`. They form the remaining two-worlds problem.

### Batch review insured dropdown (medium priority)
- `renderReviewItem()` at line 6744 — builds insured select from `entGetState().insureds`
- Should use `fetchEntityList` like `hiFile` now does

### hiFile save path (low priority — redundant with workflow)
- `hiSave()` — saves notes to localStorage entities
- `hiPopulateEnquiry()` — populates enquiry select from localStorage
- `handleEmailFile()` — similar to hiFile
- These are the old home-page ingest path. Redundant with the workflow panel which goes through PG.
- **Recommendation:** Consider removing hiFile entirely rather than rewiring — the workflow path is superior.

### Post-bind / checklist (localStorage version)
- `entTogglePostBind()` — toggles post-bind fields on localStorage entities
- `toggleChecklistItem()` — similar
- PG equivalents exist (`togglePostBindField` on risk card, `buildPostBindChecklistHtml`)
- These only fire from the old `_legacyEntOpenCard` path

### Data views that read localStorage entities
- `renderHomeTileStats()` — counts from localStorage for home page tiles
- `getRenewalList()` / `getPostBindList()` — read localStorage for renewal/post-bind panels
- `renderBook()` / `fxGetFilteredRows()` — merges localStorage entities into book rows
- `findDuplicateEntities()` — scans localStorage for duplicates
- `renderRenewals()` — reads localStorage for churn risk calculation

### Data management
- `deleteInsured()` / `deleteNote()` — delete from localStorage
- `researchCompany()` — company background stored on localStorage entity
- `openDataModal()` / `exportAllData()` / `exportEntitiesOnly()` — read localStorage for export
- `buildMigrationPayload()` — reads localStorage for migration (already served its purpose)
- `populateRenewalRefs()` / `generateRenewalPack()` — read localStorage
- `runRecon()` — reads localStorage for reconciliation
- `batchStart()` — reads localStorage entities for batch

### Total: ~30 functions with localStorage entity dependencies
- ~12 are in the hiFile/save/checklist flow (candidates for removal)
- ~10 are data views (can be rewired to PG queries)
- ~8 are data management (some already served purpose, some need PG equivalents)

---

## 5. Part 20 Priorities

| # | Priority | Status | Effort |
|---|----------|--------|--------|
| 1 | Batch review dropdown → PG | Ready | 15 min |
| 2 | hiFile removal or rewire decision | Ready | 30 min |
| 3 | Renewal/post-bind views → PG queries | Ready | 1 session |
| 4 | P8: Auto-extraction of market feedback from emails | Ready | 1 session |
| 5 | P8: "Who should I call?" recommendation query | Ready | 30 min |
| 6 | P8: Seed market_interactions from PPAQ/Ekol placement data | Ready | 1 session |
| 7 | Remove compliance.js + legalverify.js (after hiFile removed) | Blocked on #2 | 15 min |
| 8 | Duty of disclosure notice modernisation | Ready | 15 min |

### Quick wins (anytime)
- Batch review dropdown → PG (same pattern as hiFile fix)
- Duty of disclosure notice
- Seed market_interactions from existing placement data in localStorage

---

## 6. Files Changed in Part 19

**Modified:**
- `backend/app.py` — 2,617→3,376 lines (+759: MI endpoints, P7 corrections, P8 market intel, schema migration)
- `frontend/js/main.js` — 8,491→8,970 lines (+479: cleanup, MI dashboard, P7 badge, P8 UI, entOpenCard redirect, hiFile PG dropdown)
- `frontend/index.html` — 2,429→2,580 lines (+151: reporting panel rebuild, intelligence panel rebuild, script tag removals, entity creation, version bump)
- `app.py` (root) — kept in sync with backend/app.py

**Unloaded (script tags removed, files remain):**
- `frontend/js/autocompliance.js` — 79 lines
- `frontend/js/autotick.js` — 145 lines

**Not modified:**
- workflow.js, comparison.js, compliance.js, legalverify.js, extensions.js, patches.js, dataexport.js, seeds.js, projectcargo.js, css/app.css, doc_extract.py, comparison.py

---

## 7. New Endpoints Reference

### P9: MI Dashboards
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/mi/summary` | Pipeline summary, conversion, velocity, handlers, yearly |
| GET | `/mi/renewals` | 30/60/90 day renewals, retention, revenue at risk |
| GET | `/mi/producer-performance` | Per-producer metrics from entity hierarchy |

### P7: Corrections
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/risks/:id/corrections` | Single risk AI vs human diff |
| GET | `/mi/corrections` | Aggregate accuracy stats |

### P8: Market Intelligence
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/market/interactions` | List with filters |
| POST | `/market/interactions` | Create (auto-creates rule if hard_decline) |
| GET | `/market/rules` | List active hard rules |
| POST | `/market/rules` | Create rule manually |
| GET | `/market/check-rules` | Check product+territory against rules |
| GET | `/market/scorecards` | Aggregate underwriter profiles |

---

## 8. Opening Message for Part 20

```
Continuing OGB Tool development. Part 20.

Current state:
- GitHub: aceeagles1981/ogb-tool (public)
- Frontend: ogbcargotool.netlify.app
- Backend: og-backend-production.up.railway.app
- Part 19 shipped: P7 (corrections), P8 (market intel), P9 (MI dashboards), cleanup, structural debt

What's live:
- MI dashboard with pipeline funnel, velocity, renewals, producer performance
- AI correction tracking (zero-friction — reads diff between ai_extracted and risk columns)
- Market intelligence: interactions, scorecards, hard rules, favour tracking
- entOpenCard routes through PG for migrated entities
- autocompliance.js and autotick.js removed (PG equivalents live)

Remaining localStorage paths: ~30 functions mapped in handover (§4)
Priorities: batch dropdown fix, hiFile decision, renewal views → PG, P8 email auto-extraction

Bible and handover attached.
```
