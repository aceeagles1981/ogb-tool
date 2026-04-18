# OG Broking Placement Tool — Project Bible
**Last updated: Part 22, 18 Apr 2026 · Build v22.0**

---

## 1. What This Tool Is

A web application for OG Broking, a Lloyd's wholesale broker specialising in Marine Cargo, Stock Throughput (STP), Warehouse Legal Liability (WHLL), Freight Forwarder Liability (FFL), Project Cargo, and Cargo War products. 

Frontend is plain HTML/CSS/JS (no framework) deployed on Netlify. Backend is Python/Flask with PostgreSQL deployed on Railway. AI-powered email ingest, document extraction, workflow generation, compliance screening, post-bind auto-tick, market feedback extraction, and company research use the Anthropic API (Haiku for classification/extraction/compliance/research, Sonnet for workflow outputs).

**Live URL:** https://ogbcargotool.netlify.app
**Backend:** https://og-backend-production.up.railway.app
**GitHub:** https://github.com/aceeagles1981/ogb-tool (public)
**Current build:** v22.0 · 18 Apr 2026

---

## 2. Team & Context

- **KE** = Kether Eaglestone (senior broker, team lead, Turkey/RI, keaglestone@ogbroking.com)
- **EW** = Edward Wilcox (broker, LatAm, Dubai, project cargo)
- **MM** = Maisie Moss (cargo war blotter, bordereau, daily email to market)
- **JK** = Jonathan Kaye (US business via RT Specialty)

### Key Producers
- **Integra** — primary, ~76% of 2026 book, Turkey
- **Latam Re** — LatAm (Agustin Herrera), Panama submissions
- **Momentum** — Panama (Luis Zambrano)
- **RT Specialty** — US wholesale
- **AIB** — Malta
- **ARC** — South Africa

### Territory Routing
- Panama → Fiducia first
- Turkey → Integra panel (Aviva lead, usual suspects)
- General cargo → Aviva as typical lead

### Products
- STP = Stock Throughput Policy (combined cargo + stock) — NOT Straight-Through Processing
- MC = Marine Cargo
- WHLL = Warehouse Keepers and Logistics Liability
- FFL = Freight Forwarder Liability
- PC = Project Cargo
- CW = Cargo War

### Portfolio
- 2024: £916k (Integra 93%)
- 2025: £804k (Integra 89%)
- 2026 YTD Apr: £215k (Integra 76%)
- Non-Integra accelerating: Prudent, Ink Consulting, Latam Re
- Ekol Lojistik £405k renews December (largest single risk)
- CEVA Lojistik = Gefco (renamed), major renewal

---

## 3. Architecture

### Frontend (Netlify)
```
frontend/
  index.html              (2,482 lines — v22.0)
  css/app.css
  js/
    main.js               (8,352 lines — core app, pipeline, accounts, entities, ingest, post-bind, MI, P7, P8, ledger CRUD. Zero entGetState callers.)
    workflow.js            (991 lines — workflow UI, tabbed card, save, apply, auto-compliance, auto-tick, auto-market-extract)
    comparison.js          (255 lines — terms comparison UI)
    extensions.js          (444 lines — CW improvements, RTB)
    patches.js             (135 lines — AP/RP summary, PG-backed via /mi/ledger-summary)
    seeds.js               (5 lines — seed data loader)
    projectcargo.js        (142 lines — project cargo checklist)
```
**Removed (script tags removed, files remain in repo):**
- dataexport.js (120 lines) — removed Part 22, PG-backed equivalents in main.js
- compliance.js (164 lines) — removed Part 20, PG compliance-screen replaces
- legalverify.js (208 lines) — removed Part 20, PG entity card replaces
- autocompliance.js (79 lines) — removed Part 19, PG equivalent in backend
- autotick.js (145 lines) — removed Part 19, PG equivalent in backend

All scripts load via `<script src>` tags in index.html. All share `window` scope. Load order matters.

### Backend (Railway)
```
backend/
  app.py                  (3,939 lines — Flask, CORS, auth, risk/task/ledger CRUD+delete, entity CRUD, compliance, auto-tick, cleanup, MI, P7, P8, company research, duplicate detection)
  doc_extract.py          (499 lines — AI extraction + classification prompts)
  workflow.py             (395 lines — workflow endpoint + output generation)
  comparison.py           (646 lines — terms comparison across market quotes)
  requirements.txt
  Procfile
```

### Database (PostgreSQL on Railway)
```
entities           — id, name, entity_type ('insured'|'producer'), parent_id (FK→entities),
                     region, handler, metadata (JSONB), created_at, updated_at

entity_notes       — id, entity_id (FK→entities), risk_id (FK→risks, optional),
                     note_date, handler, parties, summary, actions (JSONB),
                     status_change, doc_type, terms (JSONB), source, created_at

risks              — id, assured_name, display_name, producer, handler, product, status, region,
                     currency, gross_premium, order_pct, brokerage_pct, retained_pct,
                     estimated_gbp_commission, locked_gbp_commission, accounting_year,
                     inception_date, expiry_date, layer, adjustable, profit_commission_expected,
                     notes, ai_extracted (JSONB), needs_review, review_reason,
                     merged_into_risk_id, source_event_id,
                     entity_id (FK→entities),
                     pb_evidence_of_cover (BOOL), pb_subjectivities_cleared (BOOL),
                     pb_invoice_sent (BOOL), pb_closings_sent (BOOL),
                     pb_firm_order_date (DATE), pb_formal_offer_date (DATE),
                     direct_accounting (BOOL),
                     created_at, updated_at

risk_tasks         — id, risk_id, title, description, priority, owner, due_date, status, source

risk_ledger_entries — id, risk_id, entry_type, entry_date, accounting_year, currency,
                      original_amount, gbp_amount, description, source

activity_events    — id, entity_type, entity_id, event_type, payload (JSONB), user_id, created_at

ingested_emails    — id, source_filename, sender, subject, email_date, raw_body,
                     cleaned_body, ai_note (JSONB), saved_event_id, created_at

risk_documents     — id, risk_id, ingested_email_id, filename, file_type, doc_type,
                     doc_stage, source_party, raw_text, extracted_by,
                     extraction_confidence, extraction_error, received_date, created_by, created_at

risk_terms         — id, risk_document_id, risk_id, doc_stage, source_party, terms_json,
                     effective_date, superseded_by

risk_survey_findings — id, risk_document_id, risk_id, findings_json, overall_rating,
                       recommendations

market_interactions — id, risk_id, entity_id, underwriter, contact_name, syndicate,
                      interaction_type, product, territory, line_pct, premium_indication,
                      rate_indication, conditions (JSONB), decline_reason, decline_type,
                      appetite_signals (JSONB), response_speed_hours, decisiveness,
                      favour_tag, source, source_email_id, interaction_date, notes,
                      created_at, updated_at

market_rules       — id, underwriter, syndicate, rule_type, product, territory, exclusion,
                     source_interaction_id, notes, active, created_at

accounts           — id, canonical_name, producer, region, handler, status, notes, created_at, updated_at
matters            — id, account_id, title, matter_type, status, created_at, updated_at
events             — id, account_id, matter_id, source_type, event_at, subject, sender,
                     summary_factual, ai_output (JSONB), needs_review, created_at
users              — id, name, username, email, role, is_active, created_at
```

### Environment Variables (Railway)
- `DATABASE_URL` — PostgreSQL connection string
- `ANTHROPIC_API_KEY` — for Haiku/Sonnet AI calls
- `ADMIN_TOKEN` — shared secret for frontend-backend auth
- `FRONTEND_ORIGIN` — `https://ogbcargotool.netlify.app` (CORS)

### localStorage Keys (non-entity data only — entities fully in PG since Part 22)
| Key | Contents |
|-----|----------|
| `og_state_v4` | Book rows, CW risks, contacts, clause/slip library, proposal form, SOV. **Entities key exists but is never read.** |
| `og_admin_token_v1` | Railway admin token |
| `og_fx_rates_v1` | FX rates cache |
| `og_pc_checked` | Project cargo checklist state |

---

## 4. Data Architecture (Post Part 22)

### Entity Hierarchy
```
Producer (entity_type='producer')
  └── Insured (entity_type='insured', parent_id → producer)
        └── Risk(s) (entity_id → insured)
              └── Tasks, Ledger entries, Documents, Terms
        └── Entity Notes (correspondence, research, linked optionally to a risk)
        └── Market Interactions (linked optionally to a risk)
```

### What Lives Where
| Data | Location | Status |
|------|----------|--------|
| Entities (producers + insureds) | PostgreSQL `entities` | ✅ Primary |
| Entity notes/correspondence | PostgreSQL `entity_notes` | ✅ Primary |
| Company research | PostgreSQL `entity_notes` (source: company-research) | ✅ Primary (Part 21) |
| Risks, tasks, ledger, activity | PostgreSQL | ✅ Primary |
| Document extractions, terms, surveys | PostgreSQL | ✅ Primary |
| Market interactions & scorecards | PostgreSQL `market_interactions` | ✅ Primary |
| Market rules (hard declines) | PostgreSQL `market_rules` | ✅ Primary |
| Home stats, tasks, upload alerts | PostgreSQL (mi/summary, tasks, risks) | ✅ Primary |
| Renewals view | PostgreSQL (mi/renewals, risks) | ✅ Primary |
| Book view + FX panel | PostgreSQL (/portfolio-by-year) | ✅ Primary (Part 21) |
| Renewal pack generator | PostgreSQL (/risks) | ✅ Primary (Part 21) |
| Data export (entities) | PostgreSQL (fetchEntityList API) | ✅ Primary (Part 22) |
| Cargo war blotter | localStorage | Legacy |
| Contacts / address book | localStorage | Legacy |
| Clause library, slip library | localStorage | Legacy |
| Book rows (manual) | localStorage | Legacy |
| Proposal form, SOV | localStorage | Legacy |
| FX rates cache | localStorage | Cache |

### Migration Status
- 151 entities migrated from localStorage → PG (34 producers, 117 insureds)
- 34 notes migrated, 56 risks auto-linked
- Migration code removed (Part 21) — completion banner in Data Export panel
- **`entGetState()`/`entSave()` fully eliminated (Part 22)** — zero localStorage entity reads in any code path
- Legacy entity card (`_legacyEntOpenCard`) removed entirely (Part 21)
- Export/import rewritten to fetch entities from PG API (Part 22)

---

## 5. Key Endpoints Reference

### Entity Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/entities` | List with search, type filter, parent filter |
| POST | `/entities` | Create producer or insured |
| GET | `/entities/:id` | Full card: children, risks, notes |
| PATCH | `/entities/:id` | Update name, region, handler, parent |
| DELETE | `/entities/:id` | Safe delete (blocks if risks linked) |
| GET | `/entities/:id/notes` | List notes for entity |
| POST | `/entities/:id/notes` | Create note on entity |
| POST | `/entities/:id/research` | **P21:** AI company research → saves as entity note |
| POST | `/entities/import` | Bulk import from localStorage JSON |
| GET | `/entities/duplicates` | **P21:** Trigram similarity duplicate detection |

### Compliance & Auto-tick
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/risks/:id/compliance-screen` | Territory + AI entity screen, stores in ai_extracted, creates task if flagged |
| POST | `/risks/:id/auto-tick` | Auto-tick post-bind fields from email classification type |

### P7: Corrections
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/risks/:id/corrections` | Single risk AI vs human diff |
| GET | `/mi/corrections` | Aggregate accuracy stats across all workflow risks |

### P8: Market Intelligence
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/market/interactions` | List with filters (underwriter, risk_id, product, territory, type) |
| POST | `/market/interactions` | Create interaction. Auto-creates rule if decline_type='hard_rule' |
| GET | `/market/rules` | List active hard rules |
| POST | `/market/rules` | Create rule manually |
| GET | `/market/check-rules` | Given product + territory, return underwriters with matching hard declines |
| GET | `/market/scorecards` | Aggregate per-underwriter profiles with scoring |
| GET | `/market/recommend` | Ranked underwriter recommendations for product+territory |
| POST | `/market/seed` | **P21:** Bulk-insert interactions + rules with deduplication |
| POST | `/market/extract-feedback` | **P21:** AI-extract market feedback from email body, auto-create interactions |

### P9: MI Dashboards
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/mi/summary` | Status breakdown, conversion, velocity, handlers, yearly commission, entity_counts |
| GET | `/mi/renewals` | 30/60/90 day renewals, retention, revenue at risk |
| GET | `/mi/producer-performance` | Per-producer metrics from entity hierarchy |
| GET | `/mi/ledger-summary` | **P22:** AP/RP summary across all risks with ledger entries, optional year filter |

### Risk Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/risks` | Accepts `entity_id`, `direct_accounting` |
| PATCH | `/risks/:id` | Accepts all `pb_*` fields, `entity_id`, `direct_accounting` |
| GET | `/risks/:id` | Joins entity name + producer entity name |
| GET | `/risks` | Joins entity names |
| POST | `/risks/cleanup` | Bulk delete junk risks by criteria |
| GET | `/risks/:id/ledger` | List ledger entries for risk |
| POST | `/risks/:id/ledger` | Create ledger entry (original/ap/rp/pc/adj) |
| DELETE | `/risks/:id/ledger/:entry_id` | **P22:** Delete ledger entry with audit log |

### Ingest
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ingest-email` | Matches against PG entities, returns `entity_match` + `existing_risks` |

---

## 6. Key Functions Reference

### Entity CRUD (main.js)
| Function | Purpose |
|----------|---------|
| `fetchEntityList(params)` | GET /entities |
| `createEntityPrompt(type)` | Prompt-based entity creation |
| `openEntityCard(entityId)` | Full PG entity card modal with Research button |
| `editEntityPrompt(entityId)` | Edit entity fields |
| `addEntityNote(entityId)` | Add note to entity |
| `linkRiskToEntity(riskId)` | Link unlinked risk to insured |
| `renderEntities()` | Accounts view — reads from PG entities, grouped by producer |
| `entOpenCard(insId)` | PG-first redirect — looks up entity by name, shows notice if not found |
| `researchCompany(entityId)` | **P21:** AI company research via backend, saves as entity note |
| `findDuplicateEntities()` | **P21:** PG trigram similarity search |

### Post-bind & Compliance (main.js)
| Function | Purpose |
|----------|---------|
| `buildPostBindChecklistHtml(risk)` | E&O checklist with progress bar, only for bound+ |
| `togglePostBindField(riskId, field, value)` | PATCH toggle booleans/dates |
| `buildComplianceBadgeHtml(risk)` | Compliance badge (CLEAR/REVIEW/DECLINE) |
| `runComplianceScreen(riskId)` | Manual compliance re-screen |

### Ledger CRUD (main.js — P22)
| Function | Purpose |
|----------|---------|
| `fetchRiskLedger(riskId)` | GET /risks/:id/ledger → returns entries array |
| `buildLedgerHtml(riskId, entries)` | Full ledger card: summary tiles, table, add form, delete buttons |
| `toggleLedgerForm(riskId)` | Show/hide inline add form |
| `addLedgerEntry(riskId)` | POST new entry from form fields, refreshes risk card |
| `deleteLedgerEntry(riskId, entryId)` | DELETE entry with confirm, refreshes risk card |

### P7: Corrections (main.js)
| Function | Purpose |
|----------|---------|
| `loadCorrectionsBadge(riskId)` | Async load corrections diff onto risk card |

### P8: Market Intelligence (main.js)
| Function | Purpose |
|----------|---------|
| `mi8Mode(m)` | Switch intelligence sub-tabs (includes 'recommend', 'seed') |
| `renderMI8Scorecards()` | Fetch and render underwriter scorecards |
| `renderMI8Rules()` | Fetch and render market rules |
| `renderMI8Interactions()` | Fetch and render interaction log |
| `renderMI8Recommend()` | Fetch and render ranked underwriter recommendations |
| `saveMI8Interaction()` | Save new interaction from form |
| `saveMI8Rule()` | Save new market rule from form |
| `seedPPAQ()` | **P21:** Seed 16 PPAQ placement interactions + 1 rule |
| `seedEkol()` | **P21:** Seed 8 Ekol placement interactions |
| `extractMarketFeedback()` | **P21:** Manual paste → AI extract → create interactions |
| `autoExtractMarketFeedback()` | **P21:** Called from workflow for feedback emails |

### P9: MI Dashboard (main.js)
| Function | Purpose |
|----------|---------|
| `renderMIDashboard()` | Full MI reporting panel — fetches 4 endpoints, renders all sections |

### Home Page (main.js — PG-backed)
| Function | Purpose |
|----------|---------|
| `renderHomeTileStats()` | Async. Fetches /mi/summary + /mi/renewals, populates hero stats |
| `renderHomeTasks(summary)` | Async. Fetches open tasks from PG /tasks |
| `renderHomeUpload()` | Async. Fetches bound risks from PG, shows compliance/post-bind gaps |

### Renewals (main.js — PG-backed)
| Function | Purpose |
|----------|---------|
| `getRenewalListPG()` | Fetches /mi/renewals |
| `renderRenewals()` | Async. PG-backed upcoming table + post-bind tracker |

### Book View (main.js — PG-backed, Part 21)
| Function | Purpose |
|----------|---------|
| `renderBook()` | Async. Fetches /portfolio-by-year |
| `fxGetFilteredRows()` | **P21:** Async. Fetches /portfolio-by-year (was localStorage merge) |
| `renderFxPanel()` | Async. FX conversion panel using PG portfolio data |
| `runRecon()` | **P21:** Async. Reconciles pasted Integra data against PG bound risks |

### Renewal Pack (main.js — PG-backed, Part 21)
| Function | Purpose |
|----------|---------|
| `populateRenewalRefs()` | **P21:** Async. Fetches bound risks from PG (was localStorage) |
| `generateRenewalPack()` | **P21:** Fetches /risks/:id for context (was localStorage) |

### Workflow (workflow.js)
| Function | Change |
|----------|--------|
| `wfSaveAll()` | Auto-links entity, runs P5 compliance, runs P6 auto-tick, **P21: runs market feedback extraction** |

### Data Access
| Function | File | Purpose |
|----------|------|---------|
| `apiFetch(path, options)` | main.js | Authenticated fetch to Railway backend |
| `fetchRiskList(params)` | main.js | GET /risks with filters |
| `fetchTaskList(params)` | main.js | GET /tasks with filters |
| `fetchEntityList(params)` | main.js | GET /entities with filters |
| `gs()` / `ss(s)` | main.js | Get/save localStorage state (bookRows, CW, contacts, clauses only) |

**Part 22: `entGetState()`/`entSave()` deleted.** Zero localStorage entity reads remain.

### Status Handling
**Canonical statuses:** `submission`, `in_market`, `quoted`, `firm_order`, `bound`, `renewal_pending`, `expired_review`, `closed_ntu`

**Aliases:** `dead` → `closed_ntu`, `on risk` / `on-risk` → `bound`, `ntu` → `closed_ntu`

---

## 7. Workflow Pipeline

### Single Email Flow
```
User drops .msg email in ingest panel
  → Backend parses email, extracts attachments (docx, pdf, doc, xlsx)
  → Haiku classifies each attachment + extracts terms/survey findings
  → Sonnet generates workflow outputs (risk draft, market email, tasks, info gaps)
  → Frontend renders tabbed workflow card
  → "Save Risk + Tasks" creates risk in PostgreSQL with ai_extracted JSONB
  → Auto-links to matching entity by assured_name
  → P5: Compliance screen runs (territory + AI entity check)
  → P6: Auto-tick checks email classification → updates post-bind fields if bound
  → P7: Corrections tracked automatically (diff ai_extracted vs live columns on edit)
  → P21: If classified as feedback → auto-extract market interactions via Haiku
```

### Market Intelligence Data Flow
```
Broker logs market interaction (manual form OR auto-extracted from email)
  → Stored in market_interactions with scoring fields
  → If decline_type = 'hard_rule' → auto-creates market_rule
  → Scorecards aggregate: conversion %, avg line, response speed, efficiency, favour balance
  → check-rules endpoint warns before approaching markets with known hard declines
  → /market/recommend ranks underwriters by composite appetite/efficiency/relationship score
  → Seed data (PPAQ: 16, Ekol: 8) provides baseline for recommendations
```

### P8 Scoring Axes (used by /market/recommend)
1. **Appetite (0-40)** — wrote_line rate, penalise declines
2. **Efficiency (0-30)** — response_speed_hours + decisiveness
3. **Relationship (0-30)** — favour_tag + favour balance + recency

### Post-bind Auto-tick Mapping
| Classification | Field |
|---------------|-------|
| `binding_confirmation` / `evidence_of_cover` | `pb_evidence_of_cover = true` |
| `firm_order` | `pb_firm_order_date = email_date` |
| `formal_offer` | `pb_formal_offer_date = email_date` |
| `invoice` | `pb_invoice_sent = true` |
| `closing` | `pb_closings_sent = true` |
| `subjectivity_clearance` | `pb_subjectivities_cleared = true` |

### Compliance Screening
- **Territory check:** Hard decline (Iran, Syria, North Korea, Cuba, Myanmar, Sudan, South Sudan, Somalia). Review (Russia, Belarus, Venezuela, Nicaragua, Zimbabwe, Mali, CAR, Libya, Yemen, Haiti).
- **AI entity screen:** Haiku checks insured/cedant/producer against OFAC/HMT/UN/EU sanctions, adverse news, PEP indicators.
- **Result stored:** `ai_extracted.compliance` on the risk.
- **Auto-task:** REVIEW/DECLINE creates a high/urgent priority compliance task.

---

## 8. Build Rules — Tiered Framework

### Tier 1 — Universal Code Hygiene (always applies)
1. **Read your own code before theorising.**
2. **`node --check` on every modified JS file.**
3. **Verify the fix is present in the output.**
4. **Never use `textContent` on elements with children.**
5. **No bare DOM operations at module top level.**
6. **Files must end correctly.** HTML: `</body>\n</html>`. JS: syntax-clean.

### Tier 2 — Modular Frontend Rules
7. **Fix the real bug, don't wrap it.** Exception: >5 sites + time-constrained.
8. **Use `var` and `typeof` guards** for cross-module declarations.
9. **Document what each module overrides.**
10. **Keep main.js lean.** New features in new modules.
11. **Script load order** defined by index.html. Choose positions deliberately.

### Tier 3 — Session Pragmatic
12. **Triage patches OK under time pressure.** Name them, comment them, delete when fixed.
13. **Delete patches when real fix ships.**
14. **Confirm base works before building on it.**

### Tier 4 — Deployment
15. **Split schema migrations into separate transactions.** Tables → columns → indexes. Prevents cascade rollback.
16. **CORS preflight:** `@app.before_request` intercepts OPTIONS → 204 with headers. Required for all new endpoints.
17. **Push all files in one commit** via GitHub Desktop. Saves Netlify/Railway build credits.

### Pre-Present Checklist
1. `node --check` on every modified JS file
2. `python3 -c "import py_compile; py_compile.compile('backend/app.py                  (4,003 lines — +64: DELETE ledger, GET /mi/ledger-summary)
3. Grep for the fix — confirm present in output
4. HTML ends with `</body>\n</html>`
5. Check `var`/`const` collisions for top-level declarations
6. Verify files in `frontend/` not repo root (and root `app.py` matches `backend/app.py                  (4,003 lines — +64: DELETE ledger, GET /mi/ledger-summary)

---

## 9. What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Single email ingest → workflow | ✅ | Drop .msg → extract → workflow card |
| Workflow Save Risk + Tasks | ✅ | Saves to PG with ai_extracted, auto-links entity |
| P5: Auto-compliance on workflow | ✅ | Territory + AI screen runs on save, creates task if flagged |
| P6: Auto-tick post-bind | ✅ | Email classification → auto-ticks pb_* fields on bound risks |
| P7: Term correction tracking | ✅ | Zero-friction — diffs ai_extracted vs live columns, risk card badge + MI panel |
| P8: Market intelligence | ✅ | Interactions, scorecards, hard rules, favour tracking, check-rules |
| P8: "Who should I call?" | ✅ | Ranked recommendations by appetite/efficiency/relationship |
| P8: Seed PPAQ/Ekol data | ✅ | **P21:** One-click idempotent seeding (16 + 8 interactions) |
| P8: Market feedback extraction | ✅ | **P21:** Manual paste + auto-extraction from workflow |
| P9: MI dashboards | ✅ | Pipeline funnel, velocity, conversion, renewals, producers, handlers, AI accuracy |
| P10: Batch grouping | ✅ | Matches entities, saves as notes not duplicate risks |
| Pipeline view (WIP table) | ✅ | Received, N/R, Quote Leader, Notes, Excel export |
| Risk card modal | ✅ | Post-bind checklist, compliance badge, corrections badge, entity link |
| Entity cards (PG) | ✅ | Producer→insured hierarchy, risks, notes, edit, **P21: Research button** |
| Accounts view | ✅ | Reads from PG entities, 117 insureds, 34 producers |
| Home page (stats, tasks, alerts) | ✅ | All PG-backed |
| Renewals view | ✅ | PG-backed via /mi/renewals + /risks |
| Book view + FX panel | ✅ | **P21:** PG-backed via /portfolio-by-year |
| Renewal pack generator | ✅ | **P21:** PG-backed via /risks |
| Company research | ✅ | **P21:** AI research → PG entity note |
| Duplicate entity detection | ✅ | **P21:** Trigram similarity via PG |
| Entity migration | ✅ | Complete. 151 entities. Migration code removed. |
| entGetState/entSave eliminated | ✅ | **P22:** Zero localStorage entity reads in any code path |
| Data export from PG | ✅ | **P22:** All entity exports fetch from PG API |
| Ledger CRUD on risk card | ✅ | **P22:** Summary tiles, add form, delete, running totals |
| dataexport.js removed | ✅ | **P22:** Was broken (called deleted entGetState), duplicate modal removed |
| AP/RP Summary panel PG-backed | ✅ | **P22:** patches.js rewritten to use /mi/ledger-summary |
| Junk risk cleanup | ✅ | Preview + delete by criteria |
| Done tasks visual styling | ✅ | Opacity, strikethrough, ✓ replaces Done button |
| Rate limit debounce | ✅ | Per-task guard prevents rapid-click 429s |
| FX panel | ✅ | ensureFxRates + FX_CACHE_KEY |
| Cargo war blotter | ✅ | Unmodified (localStorage) |
| Task completion | ✅ | Marks done, refreshes card |
| Excel export from Pipeline | ✅ | CSV with all WIP columns |

---

## 10. Known Issues

1. **N/R and Quote Leader blank for batch risks** — only populated via workflow path.
2. **Ekol seed data approximate** — line sizes estimated from general knowledge, not verified against actual placement records. Review and adjust.
3. **`calcChurnRisk` reads localStorage** — churn risk calculation uses localStorage entity notes. Not called from any active view since home page was rewritten.
5. **CW blotter, contacts, clause/slip library, SOV still in localStorage** — these are independent modules that don't interact with the entity/risk PG system.

---

## 11. Remaining Priorities

### All done
| # | Priority | Status |
|---|----------|--------|
| P1 | Data consolidation (entities → PG) | ✅ Done |
| P5 | Auto-compliance on workflow | ✅ Done |
| P6 | Auto-tick post-bind from emails | ✅ Done |
| P7 | Term correction learning | ✅ Done |
| P8 | Market intelligence (core + recommend + seed + extract) | ✅ Done |
| P9 | MI / reporting dashboards | ✅ Done |
| P10 | Batch grouping by insured/thread | ✅ Done |
| — | hiFile removal | ✅ Done (Part 20) |
| — | Home/renewals/book/FX/renewal pack → PG | ✅ Done (Parts 20-21) |
| — | Legacy module removal (6 modules) | ✅ Done (Parts 19-21) |
| — | Legacy entity card removal | ✅ Done (Part 21) |
| — | Migration code removal | ✅ Done (Part 21) |
| — | Company research for PG entities | ✅ Done (Part 21) |
| — | Duplicate entity detection | ✅ Done (Part 21) |
| — | Book reconciliation → PG | ✅ Done (Part 21) |
| — | `entGetState`/`entSave` eliminated | ✅ Done (Part 22) |
| — | Export/import rewritten for PG | ✅ Done (Part 22) |
| — | Dead code cleanup (11 functions) | ✅ Done (Part 22) |
| — | dataexport.js removed | ✅ Done (Part 22) |
| — | AP/RP ledger CRUD on risk card | ✅ Done (Part 22) |
| — | AP/RP Summary panel → PG (patches.js rewrite) | ✅ Done (Part 22) |

### Next priorities
| # | Priority | Effort |
|---|----------|--------|
| 1 | Test all Part 21+22 features against live deployment | 1 hour |
| 2 | Test ledger CRUD + AP/RP Summary panel | 15 min |
| 3 | Review Ekol seed data against actual placement | 15 min |
| 4 | CW blotter → PG (if warranted) | 1-2 sessions |
| 5 | Book rows → PG (portfolio-by-year endpoint exists, needs write path) | 1 session |
| 6 | Contacts / address book → PG | 1 session |

---

## 12. Deployment

### Railway (Backend)
- Auto-deploys from `backend/` on push to main
- Health: `/health` (includes entity_count, entity_note_count)
- CORS: `@app.before_request` OPTIONS handler + `@app.after_request` headers
- Schema: `ensure_schema()` runs on startup — 3 separate transactions (tables → columns → indexes)
- Tables auto-created: all including `market_interactions`, `market_rules`

### Netlify (Frontend)
- Auto-deploys from `frontend/` on push to main
- Base: `frontend`, Publish: `.`
- **Files must be in `frontend/` not repo root**
- No build process — static files

### GitHub
- Repo: `aceeagles1981/ogb-tool` (public)
- Use GitHub Desktop for multi-file commits (one push = one deploy)
- Root `app.py` must match `backend/app.py                  (4,003 lines — +64: DELETE ledger, GET /mi/ledger-summary)

---

## 13. Ownership

Tool built entirely on personal time, personal hardware, personal API keys. Employment contract IP clause needs reviewing. Plan: scrub real placement references, demo to head of specialty with clean data, state ownership clearly, get professional advice on licensing/productising/acquisition.
