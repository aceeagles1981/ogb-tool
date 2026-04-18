# OGB Tool — Part 21 Handover
**Written: End of Part 20 session, 18 Apr 2026**
**Current build: v20.0 · 18 Apr 2026**

---

## 1. What Changed in Part 20

### Phase 1 — hiFile Removal (the big structural unblock)

**HTML:** Replaced 66-line home Email Ingest card (drop zone, form fields, insured/enquiry selects, save/discard) with a 10-line redirect card that opens the ingest/workflow panel on click.

**JS (main.js):** Removed ~170 lines:
- `hiFile`, `hiSave`, `hiPopulateEnquiry`, `hiDrop`, `hiReset`, `_hiNoteData` — all deleted
- Stubs left that redirect to `tab('ingest')` for any residual callers
- `handleEmailFile` cleaned: now fetches insured list from PG (`fetchEntityList` with localStorage fallback), removed localStorage auto-save block (~50 lines), removed dead `autoComplianceScreen` call

### Phase 2 — Legacy Module Removal

- **compliance.js** (164 lines) — script tag removed from index.html. File remains in repo.
- **legalverify.js** (208 lines) — script tag removed from index.html. File remains in repo.
- `pbOpenCompliance` button in `_legacyEntOpenCard` guarded with `typeof` check — shows notice to use risk card instead.

### Phase 3 — Home Stats → PG

**Backend:** Added `entity_counts` (insured_count, producer_count) to `GET /mi/summary` response.

**Frontend:** `renderHomeTileStats()` rewritten as async:
- Fetches `/mi/summary` + `/mi/renewals` from PG
- Hero stats (YTD GWP, active risks, renewals, bound accounts) now from PG data
- Entity counts from PG `entity_counts`
- Removed localStorage entity counting, rough FX conversion, bookRow entity merging (~50 lines)
- Falls back gracefully if PG unavailable

`renderHomeTasks()` rewritten as async:
- Fetches open tasks from PG `/tasks` endpoint
- Each task card clicks through to its risk card via `openBackendRiskCard()`
- Removed localStorage entity scanning (~80 lines of renewal/compliance/stale checks)

### Phase 4 — Renewals Panel → PG

- `getRenewalList()` (localStorage) replaced with `getRenewalListPG()` — fetches from `/mi/renewals`
- `getPostBindList()` (localStorage, ~70 lines) replaced — now fetches `/risks?status=bound` and shows risks with incomplete `pb_*` fields
- `renderRenewals()` rewritten as async — uses PG data, rows click through to risk cards, post-bind pills use PG `togglePostBindField`
- `toggleChecklistItem()` stubbed (PG equivalent on risk card)
- `entTogglePostBind()` stubbed (PG equivalent on risk card)

### Phase 5 — Home Upload Tasks → PG

- `renderHomeUpload()` rewritten as async — fetches bound risks from PG, checks for incomplete post-bind fields, missing compliance screens, unassigned handlers
- `findDuplicateEntities()` stubbed (future: backend endpoint for PG entity similarity)
- Each alert card clicks through to its risk card via `openBackendRiskCard()`

### Phase 6 — P8: "Who Should I Call?"

**Backend (new endpoint):** `GET /market/recommend?product=STP&territory=Turkey`
- Combines scorecards + hard-rule exclusions into ranked recommendations
- Composite score (0-100) broken into:
  - Appetite (0-40): wrote_line rate, penalise declines
  - Efficiency (0-30): response speed + decisiveness
  - Relationship (0-30): favour balance + recency
- Excludes underwriters with active hard rules
- Returns human-readable reason per recommendation
- Returns excluded underwriters with explanations

**Frontend:**
- "Who to call" tab added to Intelligence panel
- Product + territory input form
- Ranked recommendation cards with:
  - Score breakdown bar (blue=appetite, amber=efficiency, green=relationship)
  - Contact names
  - Detail metrics (lines written, avg line %, response time, favours)
  - Human-readable reason
- Excluded underwriters warning box

### Phase 7 — Duty of Disclosure

Already modernised — workflow prompt uses "duty of fair presentation" language. No changes needed. Marked as done.

### Cleanup

- Version bump: v19.0 → v20.0
- Root `app.py` synced with `backend/app.py`
- `insuredOpts` dead code in `renderReviewItem` identified (generated but never used in DOM)

---

## 2. Current Architecture

### Frontend (Netlify: ogbcargotool.netlify.app)
```
frontend/
  index.html              (2,541 lines — v20.0)
  css/app.css
  js/
    main.js               (8,590 lines — core app, pipeline, accounts, entities, ingest, post-bind, MI, P7, P8 recommend)
    workflow.js            (978 lines — workflow UI, save, compliance, auto-tick)
    comparison.js          (255 lines — terms comparison UI)
    extensions.js          (444 lines — CW improvements, RTB)
    patches.js             (156 lines — AP/RP summary)
    dataexport.js          (120 lines — data export/import)
    seeds.js               (5 lines — seed data loader)
    projectcargo.js        (142 lines — project cargo checklist)
```
**Removed in Part 20 (script tags removed, files remain):**
- compliance.js (164 lines)
- legalverify.js (208 lines)
**Previously removed (Part 19):**
- autocompliance.js (79 lines)
- autotick.js (145 lines)

### Backend (Railway: og-backend-production.up.railway.app)
```
backend/
  app.py                  (3,540 lines — Flask, CORS, auth, all CRUD, compliance, auto-tick, cleanup, MI, P7, P8 recommend)
  doc_extract.py          (499 lines — AI extraction + classification prompts)
  workflow.py             (395 lines — workflow endpoint + output generation)
  comparison.py           (646 lines — terms comparison)
  requirements.txt
  Procfile
```

---

## 3. What Works

| Feature | Status | Notes |
|---------|--------|-------|
| All Part 19 features | ✅ | Unchanged |
| Home stats from PG | ✅ | Hero tiles, tasks, upload alerts all PG-backed |
| Renewals from PG | ✅ | Upcoming table + post-bind tracker from PG risks |
| "Who should I call?" | ✅ | Ranked recommendations with 3-axis scoring |
| hiFile removed | ✅ | Home redirects to ingest panel |
| compliance.js + legalverify.js removed | ✅ | Script tags removed, PG equivalents live |
| Duty of disclosure | ✅ | Already modernised |

---

## 4. localStorage Functions Eliminated in Part 20

| Function | Action |
|----------|--------|
| `hiFile`, `hiSave`, `hiPopulateEnquiry`, `hiDrop`, `hiReset` | Removed (stubs redirect to ingest panel) |
| `handleEmailFile` localStorage auto-save | Removed (workflow path is the only path) |
| `renderHomeTileStats` localStorage reads | Replaced with PG `/mi/summary` + `/mi/renewals` |
| `renderHomeTasks` localStorage reads | Replaced with PG `/tasks` |
| `renderHomeUpload` localStorage reads | Replaced with PG `/risks?status=bound` |
| `findDuplicateEntities` localStorage reads | Stubbed (future: backend) |
| `getRenewalList` | Replaced with `getRenewalListPG` (PG `/mi/renewals`) |
| `getPostBindList` | Replaced with PG `/risks?status=bound` |
| `renderRenewals` localStorage reads | Replaced with PG |
| `toggleChecklistItem` localStorage writes | Stubbed (PG `togglePostBindField` on risk card) |
| `entTogglePostBind` localStorage writes | Stubbed (PG `togglePostBindField` on risk card) |

**Total: ~22 functions eliminated or rewired to PG.**

---

## 5. Remaining localStorage Paths (~10 functions)

These are now the only functions still reading `entGetState()` / `entSave()`:

### Book view (medium priority)
- `renderBook()` / `fxGetFilteredRows()` — merges localStorage entities into book rows for the book/FX panel
- **Recommendation:** Book rows are still manually maintained in localStorage. These functions need the localStorage entity merge to show commission from bound enquiries. Low risk to leave — they augment PG data, don't conflict with it.

### Renewal pack generator (low priority)
- `populateRenewalRefs()` / `generateRenewalPack()` — reads localStorage bound enquiries to generate MRC/submission/client renewal documents
- **Recommendation:** Keep for now. These read localStorage to find bound enquiries with placement details. PG risks don't yet store the full placement structure needed for renewal pack generation.

### Legacy entity card (very low priority)
- `_legacyEntOpenCard()` — renders localStorage entity card. Only fires when PG has no match for a localStorage slug ID.
- `deleteInsured()` / `deleteNote()` — delete from localStorage. Only reachable via legacy card.
- `researchCompany()` — company research stored on localStorage entity.
- **Recommendation:** These are dead paths for the 151 migrated entities. They only fire for unmigrated localStorage entities that have no PG match — effectively zero. Can be removed when we're confident no localStorage-only entities remain.

### Data management (low priority)
- `openDataModal()` / `exportAllData()` / `exportEntitiesOnly()` — read localStorage for data export/import
- `buildMigrationPayload()` — reads localStorage for migration (already served its purpose)
- `runRecon()` — reads localStorage for book reconciliation
- **Recommendation:** Keep export functions — they're useful for backup. `buildMigrationPayload` can be removed (migration complete). `runRecon` can be rewired when book data moves to PG.

### Batch ingest (minor)
- `batchStart()` at line 6605 still calls `entGetState()` at line 6621 but only uses it for the legacy localStorage auto-save path (line 6659-6663). The PG entity match path at line 6657 is the primary path. The localStorage `ent` variable is passed to `batchAutoSave` but only used when `match.matched_id` (not `match.matched_entity_id`). Safe to leave.

---

## 6. New Endpoints Reference

### P8: Market Recommendation (Part 20)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/market/recommend` | Ranked underwriter recommendations for product+territory |

Query params: `product`, `territory` (at least one required)

Response:
```json
{
  "recommendations": [
    {
      "underwriter": "Aviva",
      "score": 72.5,
      "appetite_score": 35.0,
      "efficiency_score": 22.5,
      "relationship_score": 15.0,
      "wrote_line": 3,
      "declined": 0,
      "avg_line_pct": 17.5,
      "avg_response_hours": 4.2,
      "favour_balance": 1,
      "contacts": ["John Smith"],
      "last_interaction": "2026-03-15",
      "reason": "wrote 3 lines; never declined; fast responder; owes us 1 favour"
    }
  ],
  "excluded": [
    {"underwriter": "Canopius", "reason": "Cannot do stock only"}
  ],
  "product": "STP",
  "territory": "Turkey"
}
```

### Enhanced Existing Endpoint
| Method | Path | Change |
|--------|------|--------|
| GET | `/mi/summary` | Added `entity_counts` field (insured_count, producer_count) |

---

## 7. Files Changed in Part 20

**Modified:**
- `backend/app.py` — 3,376→3,540 lines (+164: recommend endpoint, entity counts in mi_summary)
- `frontend/js/main.js` — 8,970→8,590 lines (-380: hiFile removal, home/renewals PG rewrite, recommend UI)
- `frontend/index.html` — 2,580→2,541 lines (-39: hiFile card, compliance/legalverify script tags, recommend panel)
- `app.py` (root) — synced with backend/app.py

**Unloaded (script tags removed, files remain):**
- `frontend/js/compliance.js` — 164 lines
- `frontend/js/legalverify.js` — 208 lines

**Not modified:**
- workflow.js, comparison.js, extensions.js, patches.js, dataexport.js, seeds.js, projectcargo.js, css/app.css, doc_extract.py, comparison.py, autocompliance.js, autotick.js

---

## 8. Part 21 Priorities

| # | Priority | Status | Effort |
|---|----------|--------|--------|
| 1 | P8: Seed market_interactions from PPAQ/Ekol placement data | Ready | 1 session |
| 2 | P8: Auto-extraction of market feedback from emails | Ready | 1 session |
| 3 | Book view → PG risks (eliminate fxGetFilteredRows localStorage merge) | Ready | 1 session |
| 4 | Remove _legacyEntOpenCard + dependent functions | Ready | 30 min |
| 5 | Renewal pack generator → PG risks | Ready | 1 session |
| 6 | Backend duplicate entity detection endpoint | Ready | 30 min |

### Quick fixes (anytime)
- Remove `buildMigrationPayload` (migration complete)
- Remove dead `insuredOpts` variable in `renderReviewItem`
- Clean up `batchStart` localStorage fallback path

---

## 9. Opening Message for Part 21

```
Continuing OGB Tool development. Part 21.

Current state:
- GitHub: aceeagles1981/ogb-tool (public)
- Frontend: ogbcargotool.netlify.app
- Backend: og-backend-production.up.railway.app
- Part 20 shipped: hiFile removal, compliance/legalverify removal, home+renewals→PG, "Who should I call?" recommendation

What's live:
- Home page hero stats, tasks, and upload alerts all PG-backed
- Renewals panel reads from PG (/mi/renewals + /risks?status=bound)
- "Who should I call?" — ranked underwriter recommendations by appetite/efficiency/relationship
- 4 legacy JS modules removed (compliance, legalverify, autocompliance, autotick)
- ~22 localStorage entity functions eliminated or rewired to PG

Remaining localStorage: ~10 functions (book view, renewal pack, legacy entity card, data export)
Priorities: seed market_interactions, auto-extract market feedback, book→PG, remove legacy card

Bible and handover attached.
```
