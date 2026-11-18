# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Customer Radar (team LDS, UIT; AISC2026 finals on 2026-12-10). It analyses Vietnamese multi-channel customer feedback. A **Data Trust Layer** gives every feedback a trust weight, and all metrics are computed from those weighted totals rather than raw counts. Statistical alerts sit on top of the metrics, and a playbook engine turns alerts into recommendations that wait for human approval.

Code comments, UI text, docs and commit messages are in Vietnamese. Answer the user in Vietnamese: short, plain, with a concrete example.

**UI upgrade (from 2026-11-12; round 2 "glass + motion" and pain points / cases / import from 2026-11-13; merged into `main` on 2026-11-14 after the user approved):** the plan, task board, agent roles and hand-off log live in [KE-HOACH-GIAO-DIEN.md](KE-HOACH-GIAO-DIEN.md). Any UI, design or animation work starts there (read its sections 1, 2 and 8), and updates its sections 8 and 9 when done. Do not copy that plan into this file.

**Butler / Zalo (planned 2026-11-16, not built yet):** the design and step-by-step build plan for the 24/7 "Quản gia" (alerts to the owner over a Zalo Bot, remote commands, mobile `/butler` page) live in [KE-HOACH-QUAN-GIA.md](KE-HOACH-QUAN-GIA.md). The user hands the build to Gemini (rules in [GEMINI.md](GEMINI.md)) and Claude reviews the diff. Only step 6.0 exists: `backend/services/work_items.js` (cached alerts, inbox items, pain points, `recordDecision`, copied from `routes/api.js`); `routes/api.js` does not use it yet.

Besides these two plans, this is the only project document. The old `README.md`, `docs/`, `HANDOFF.md` and handoff files were removed on 2026-11-11 (still in git history). Section "Quy tắc làm việc và lịch" at the end holds the working rules and dates from earlier sessions.

## Commands

Frontend (repo root: React 19 + Vite 8 + Tailwind v4):
```bash
npm run dev        # http://localhost:5173, proxies /api -> http://127.0.0.1:5000
npm run build
npm run lint       # oxlint (.oxlintrc.json: react/rules-of-hooks is an error)
```

Backend (`backend/`: Node + Express 5 + MongoDB driver, CommonJS):
```bash
npm start / npm run dev    # server.js on :5000 (dev = node --watch)
npm test                   # test/run_tests.js: no MongoDB, no LLM calls, ~90 tests in a few seconds
npm run verify             # data/verify_detection.js: generate synthetic data, check that injected incidents are detected and false positives stay at 0%
npm run eval               # evaluation/run_evaluation.js: rules vs ViSoBERT F1 on the gold sets
npm run check              # test/requirements_check.js
npm run seed               # seed_realistic_data.js: OVERWRITES the demo DB (supports --anchor)
node scripts/collect_real.js --products=6 --pages=2 [--dry]   # bulk Tiki collector into the real DB
```

Tests:
- There is no per-test filter. `run_tests.js` is one file with a local `test(name, fn)` helper, and the whole suite runs in seconds.
- To focus on one test, temporarily run only the section you need; add new tests to the same file.

Full local demo on Windows: `pwsh -File .\start-demo.ps1`. It opens separate windows for the ViSoBERT service (:8001), the backend and the frontend.

Python NLP service (`nlp_service/`): `python service.py` serves on :8001; `train.py` fine-tunes. Training data must go through `npm run nlp:prepare`, so that training and serving share the same `prepareInput` preprocessing, including PII masking. See `nlp_service/README.md`.

## Architecture

### Two databases on one Atlas cluster

`server.js` maps the `X-Workspace` header (or `?workspace=`) to a database and attaches it as `req.db`:
- `demo` → `MONGODB_DB`, default `customer_radar` (synthetic data);
- `real` → `MONGODB_REAL_DB`, default `customer_radar_real` (real reviews collected from Tiki).

Every route must use `req.db`, never a global DB handle. The frontend sets the header globally in `src/lib/workspace.js` (an axios default, applied in `App.jsx`). The workspace picker sits under the logo in the sidebar.

`backend/.env` points at the **production** Atlas cluster, so a local backend reads and writes the live demo data. To try anything that writes (audit labels, decisions, scraping), use a throwaway database:
1. Seed it: `MONGODB_DB=customer_radar_ui_test MONGODB_REAL_DB=customer_radar_ui_test_real node seed_realistic_data.js --reviews=3000 --days=60 --future=0`.
2. Start `server.js` with the same two env vars.
3. Afterwards, drop both databases with a script that first checks `db.databaseName` contains `_test`.

### Analysis context, the read path

`services/analysis_context.js` `getContext(db)` is the core of every GET endpoint. It:
- loads the feedbacks and transactions of that database;
- gets model signals from `visobert_client.js`;
- runs `trust_layer.runTrustLayer`;
- caches the result **per database**, stale-while-revalidate. The cache key is doc counts + newest `_id` + `meta.labels.version`; any script that edits labels in place must `$inc` that version, or prod serves stale labels for up to 3 h.

Routes then call `applyFilters(ctx.items, req.query, ctx.asOf)` and the `metrics` / `alert_engine` / `recommender` / `playbook` functions.

Time anchoring:
- Demo: future-dated docs are hidden (`timestamp $not $gt now`), so seeded "replay" data appears day by day.
- Real: time is anchored to the newest review (`ctx.asOf`), and freshness comes from `ingestedAt` (the last collection time). Always pass `ctxNow(ctx)` / `ctx.asOf` instead of `new Date()`.

After any write, call `invalidate(req.db)`.

### Trust Layer (`services/trust_layer.js`)

- **T0** source tiers P1–P5 (P1 = order id or platform-verified purchase).
- **T1** rule spam filter. The model score alone can never reject a feedback.
  - Rejected: ads with contact details, keyboard mashing, emoji-only content.
  - Short reviews such as "ok" or "hàng tốt" are NOT spam. They get `trust.lowInfo` and still count. On real Tiki data, rejecting them inflated the complaint rate.
- **T2** five authenticity signals:
  - near-duplicate clusters (SimHash + cosine within 48 h);
  - time bursts (median/MAD);
  - account anomalies (Isolation Forest in `anomaly.js`);
  - star/text mismatch;
  - transaction or delivery-date mismatch.
- **T3** weight `w = tier × (1 − A) × 0.5^(age/H)`, stored with `toFixed(4)`. `metrics.isCountable` = `weight > 0`.
  - `H` is set per workspace in `analysis_context.js`: 30 days for demo, `REAL_HALF_LIFE_DAYS` (180) for real.
  - Real Tiki reviews are mostly years old; with 30 days almost all of them rounded to weight 0.
- **T4** review queue.
- **T5** funnel and data-health score.

### Metrics and alerts

- `metrics.js`: the weighted complaint rate (WCR) needs transactions as its denominator. Channels with no matching transactions use the same-channel negative share or velocity instead.
- `alert_engine.js` + `statistics.js`: alerts use
  - a two-proportion z-test against a 28-day baseline, with the dual condition (p < 0.01 plus a business-size threshold);
  - EWMA drift on the complaint rate;
  - Benjamini–Hochberg FDR correction;
  - de-duplication of alerts.
- `playbook.js` / `playbook_library.js` / `recommender.js` map (cause × severity) to actions. The LLM only rephrases; it never adds facts.
- `metrics.buildEvidence` returns, for each dashboard card, how many counted feedbacks are verified (P1/P2), human-reviewed, or only inferred. `/api/stats` exposes it as `evidence`, and the UI draws it as the "evidence bar".

### Features built on the context

- **Assistant** (`chat_engine.js` + `chat_tools.js`, `POST /api/chat`):
  - routes intent with rules, runs tools that compute numbers in JS over the full data, retrieves evidence with BM25, then lets the LLM rephrase only (`synthesize`);
  - returns `facts`, `evidence` and `meta.provider`;
  - without an LLM, `deterministicAnswer` still answers.
- **`services/insights.js`** holds the pure logic for:
  - human label review: `audit_labels` collection, `/api/audit/*` (the Wilson 95% CI summary still exists in the API but the UI no longer shows it, since 2026-11-16);
  - before/after effect of accepted decisions: `recommendation_log`, `/api/decisions`;
  - product comparison with a two-proportion test: `/api/compare`;
  - grounded reply drafts: `/api/reply/draft`, with a template fallback.
- Decisions are logged with `by` and a `snapshot` of the alert title. Alert ids have the form `Category|Cause|Product|Region|date`, so code parses scope from them.
- Gemini's free tier (500 requests/day) is shared by labelling, the assistant and reply drafts.

### Write path (ingest)

- `scraper.js` fetches Tiki reviews from the public API and keeps platform facts (verifiedPurchase, deliveredAt, ratings, seller replies). Other sites use cheerio or puppeteer.
- `ai_analyzer.analyzeFeedbackBatch` labels each review. It tries the ViSoBERT service first, then the LLM (Gemini `GEMINI_LABEL_MODEL`, Groq as fallback), then keyword rules. Throttle with `LLM_CONCURRENCY`, `LLM_MIN_INTERVAL_MS` and `LLM_RETRY_429`; the free Gemini tier allows 15 RPM and 500 requests per day.
- `ingest.js`:
  - `buildFeedbackDocs` masks names and builds a salted pseudo `customerId` with `PII_SALT`;
  - `saveFeedbacks` upserts on `dedupKey` with `$setOnInsert`.
- Used by `POST /api/scrape` and `scripts/collect_real.js`. The collector refuses to run without a secret `PII_SALT`, or when the real DB name equals the demo DB name.
- The server runs the collector itself every 24 h (`services/real_collector.js`); there is no GitHub workflow.

### Labelling pipeline for real data (sarcasm-aware)

- **Cascade** (`label_cascade.labelReviews`, used by `/api/scrape` and `collect_real.js`). Reviews go in as `{text, rating}`:
  1. The primary labeller labels each review. The LLM prompt includes the star rating and explicit sarcasm rules, and returns `sarcasm`.
  2. `sarcasm.sarcasmSignals` flags rating/text conflict and praise next to a negative fact.
  3. Flagged reviews get a second opinion from a different model (`ai_analyzer.judgeSarcasm`: Groq first, then Gemini).
  4. `resolveVotes` takes the majority of primary, judge and rating vote.
  - A review needs a human (`needsReview`) only when there is no majority or the two models name different categories.
  - Every vote is stored in `labelVotes`.
- **Trust Layer:** `starTextMismatch` does not penalise suspected or confirmed sarcasm. Before this, real sarcastic complaints were down-weighted as fake.
- **Human labels:** stored in `audit_labels`. `analysis_context.applyHumanLabels` applies them to the items BEFORE the Trust Layer runs, so they override machine labels everywhere. The old label is kept in `machineLabel`.
- **Audit queues** (`?mode=`):
  - `random`: the only queue counted in the accuracy CI (API only; the random-check tab and its accuracy panel were removed from the UI on 2026-11-16, the real workspace had 0 labels);
  - `sarcasm`;
  - `review`.
- **Blind test set:** `insights.isBlindTest(id)`, a stable 15% chosen by SHA-1 of the id. Never use these items for training.
- **Backfill:** `scripts/relabel_sarcasm.js` re-runs the cascade on an existing real DB. Flags: `--dry`, `--retry-failed`, `--recheck-sarcastic`.
- **Sarcasm boundary:** a review with no praise (`sarcasm.hasPraise`) can never be sarcastic; "praise but complaint" and 5-star literal complaints are not sarcasm (`SARCASM_NOT` in `ai_analyzer.js`). A sarcastic verdict with Positive sentiment goes to human review. Praise regexes use `\p{L}` boundaries ("ưng" must not match inside "nhưng").
- **Model v4** (`nlp_service`):
  - optional heads from `labels.json` (`sarcasm` added; old checkpoints load unchanged);
  - per-row `weight`;
  - a `[N sao] ` input prefix when `meta.inputRating` is true;
  - multi-cause decoding per category (`causes`).
  - The Python decode and `src/lib/visobertBrowser.js` must stay in sync.
- **Kaggle flow** (`kaggle/README.md`):
  1. `teacher_io.js export`;
  2. `01_teacher_qwen3.ipynb` on Kaggle;
  3. `teacher_io.js import` (into `teacher_labels`, training only);
  4. `export_training_data.js`;
  5. `02_train_visobert_v4.ipynb` on Kaggle;
  6. `eval_real.py` on the blind test.
- The notebooks are generated by `kaggle/make_notebooks.py`. Edit that file, not the `.ipynb`.
- Do NOT use `phamluan/vn_msa_sar`: it has no licence, and 397/450 of its sarcastic rows are augmented.

### Livestream (`/live`, `routes/live.js`, `services/live/`)

Real-time comment intake for live-selling sessions (TikTok Live, YouTube Live, manual/CSV/webhook, and a megalive simulator).

- **Pipeline:** connector -> `intent.classifyComment` (rules, no LLM per comment) -> `LiveAggregator` -> batched insert into `live_comments` + SSE push. `hub.js` owns one in-memory `Runtime` per running session.
- **Intents:** complaint > question (with topic) > order > praise > chatter. Matching runs on accent-folded lowercase text with `(?<![a-z0-9])` boundaries, so unaccented typing ("gia bn", "con size m ko") works. Also extracts size, colour, quantity, height/weight, and the product (by cart number "giỏ 3" or by keyword; otherwise the "currently presenting" product, flagged `productInferred`).
- **Queue:** questions with the same topic + product (+ size for stock/size) are grouped into one card with a count; complaints are never grouped and always rank first. `groupKey` is stored on each comment so "answered" is marked per group. 3 new askers reopen an answered card.
- **Answers:** `answer.suggestAnswer` uses ONLY the session catalog and policy; missing facts give "shop kiểm tra rồi báo lại" with `grounded: false`. The LLM rewrite (`/groups/rewrite`) is given only the template's facts.
- **Collections:** `live_sessions` (catalog, policy, status, `ingestKey`, `summary` frozen at stop) and `live_comments` (PII-masked text, `author.handle` kept for order follow-up + salted `author.hash`, intent, status, answer, `labelledBy: rules|human`).
- **Workspaces:** the simulator is refused in the real workspace. Only simulated sessions can be deleted. `EventSource` cannot send headers, so the stream and exports take `?workspace=`.
- **Restart:** sessions without a runtime are reported `interrupted`; `/resume` preloads stored comments and reconnects. Simulator message ids include a per-run id, or resumed runs would be deduped away.
- **Memory (Render 512 MB):** replays of stored comments (`preload`, `buildSnapshot`, `refreshRuntime`, `buildReport`, revenue at stop) read with a cursor + `REPLAY_PROJECTION` (aggregator.js), never a bare `.toArray()` of a whole session. Simulator sessions stop themselves at `LIVE_SIM_MAX_COMMENTS` (default 50.000); `/resume` refuses a simulator session already over the cap.
- **TikTok:** `tiktok-live-connector` (ESM, loaded with dynamic `import()`). Measured 2026-11: proto v3 puts text in `content` (docs say `comment`), handle in `displayId`, viewers in `total` (string). Too many reconnects -> `DEVICE_BLOCKED` for ~15-30 min.
- **Exports:** `kind=comments` (no handles, for fine-tuning), `kind=qa` (human-confirmed Q/A pairs), `kind=orders` (CSV with handles, for the shop).
- **Action coach (`coach.js`, data to action):** pure rules over `agg.events` (windows anchored to `now`, not the last comment: silence on a live session is itself a signal). Types: complaint_spike, soldout_demand (with nearest in-stock alternative and lost value), question_burst (top 2 only; size bursts read the whole size guide on air), low_stock, backlog, hot_other_product, ask_not_buy, engagement_drop, missing_info (merged by topic+product). Max 6 actions, max 2 per type. `POST /actions` marks done/dismissed (10-min cooldown, stored in `live_sessions.actions`); some actions execute (switch product, mark the question group answered on air). `measureEffect` compares 3 min before/after; the UI says it is not a controlled comparison.
- **Post-live report (`report.js`):** funnel, revenue estimated from order comments (stock replayed in time order, so orders after a variant sells out count as lost demand), missed questions, catalog gaps, complaints by main-taxonomy category (`complaintCategory` live rules first, then `classifyByRulesFallback`), actions with effects, comparison with the previous ended session, and a prioritised to-do list for the next live. `summary.revenue`/`lostRevenue` are frozen at stop.
- **Peak load and resilience (2026-11-17):**
  - Webhook ingest uses the in-memory runtime session (no Atlas read per request) and acks after ingest; the write runs in the background (`?wait=1` waits for it). `flush()` shares one in-flight write plus at most one follow-up; a failed batch goes back to the front of `pending` (cap `PENDING_MAX` 100k, overflow counted as `health.dropped`), so an Atlas blip loses nothing.
  - SSE pushes comments in batches (`comments` event, every 200 ms), not one event per comment; `useLiveSession` handles both `comments` and the old `comment`.
  - `coach` indexes orders and recent events once per run and runs at most every 3 s (`COACH_EVERY_MS`; reset when an action is done or dismissed). At 35k comments a full snapshot went from 112 ms to about 60 ms, 5 ms when reused.
  - Stalled TikTok/YouTube connection (no event for `LIVE_STALL_MS`, default 3 min) is closed and reopened (`checkStall`).
  - On startup `hub.autoResume` reopens sessions active in the last `LIVE_AUTO_RESUME_MIN` (20) minutes; SIGTERM/SIGINT run `hub.flushAll()` before exit.
  - `runtime.healthInfo()` (pending writes, write failures, dropped, reconnects, status since) is in `publicSession.health` and every `stats` snapshot; the console shows a warning while writes fail. `GET /health/live` returns RSS, heap, CPU ms and event-loop delay without a DB ping (`services/process_health.js`).
  - `npm run live:load` (port 5077, `_test` DB): default 200/s for 60 s then 500/s for 10 s, 20 SSE viewers; checks no errors, every viewer and the DB get every comment, display lag p95 < 1,5 s, loop p99 < 200 ms, RSS growth, intent accuracy on labelled lines. Measured locally: webhook p50 ~14 to 130 ms, lag p95 ~30 to 210 ms, ~0,6 to 0,7 ms CPU per comment as measured by the harness (includes test overhead; the Render-like run below is the better capacity figure). Heavier: `RATE=500 BURST_RATE=1500 VIEWERS=50`. Render-like run: `THROTTLE=0.1` preloads `scripts/cpu_throttle.js` (blocks the server 90 ms of every 100 ms, an approximation of ~0,1 CPU; real share can be slightly higher when busy) and `NODE_OPTIONS=--max-old-space-size=256`; measured 2026-11-17: 100, 200, 300 and 500 comments/s (bursts to 1000) all passed with 0 errors, every comment delivered and stored, display lag p95 ~0,4 to 0,5 s, RSS ~405 MB (354 MB before the run, from the preloaded analysis context). Treat ~300/s as the safe figure for Render free.
  - While any live runtime is active, background context refreshes (TTL expiry and after writes) are deferred, rechecked every minute, at most `LIVE_DEFER_MAX_MS` (30 min); pages keep serving the current context (`refreshing` after a write). Reason: on Render the worker shares ~0,1 CPU with the main thread, and a recompute starved the live stream (prod `/health/live` on 2026-11-17: 14,4 s max block at boot, steady state p99 21 ms, max 0,7 s). Do not deploy during a live.
  - Keep-awake while live: `hub.ensureLiveKeepAlive()` (called by `startSession`) pings `${RENDER_EXTERNAL_URL}/health/live` every `LIVE_KEEPALIVE_MS` (10 min) while any runtime is active and stops when none is, so Render free does not sleep mid-session (it sleeps after 15 min without inbound requests; a wake-up took 29,7 s on 2026-11-18). Works without the butler or a Zalo link. An external uptime ping is still recommended.
  - `npm run live:resilience`: Zalo tech alerts through a real `liveTick`, then SIGKILL of a server mid-session and auto-resume with no lost comments.
- **Zalo during a live (`services/butler/live_tech.js`):** besides start, urgent actions, end report and schedule nudges, the live watcher sends technical incidents: lost platform connection > 1 min or connection error, writes failing > 30 s or comments dropped, server overload (loop p99 ≥ 500 ms or RSS ≥ 450 MB while a session runs), and a session still "live" in Mongo with no runtime 2 min after boot. Each episode is sent once (`live_tech|user|key|since`), ignores quiet hours, and a matching "Đã ổn lại" (`live_tech_ok|...`) goes only to users who got the alert. The end-of-live Zalo report now lists the top 3 `report.todo` items ("Việc cho phiên sau").
- **Bridge to the main pipeline:** `POST /push-feedback` labels complaints with `labelReviews` and saves them as feedbacks (`source` TikTok/YouTube/Livestream, `collectedVia: 'livestream'`, `platformFacts.reviewId` = live comment id for dedup), then `invalidate(db)`. `GET /live/overview` feeds the dashboard `LiveDigest`; the assistant has a `live` intent whose facts are prefetched in `/chat` (`services/live/brief.js`) into a per-request ctx copy.

### Synthetic data

- `data/generator.js` + `data/variation.js` create realistic multi-channel feedback and transactions with injected incidents (INC-xx). `seed_realistic_data.js` writes them to the demo DB.
- Each planted item carries `_plantedAs`: `spam`, `inauthentic` or `lowInfo`.
- `verify_detection.js` is the regression check for the generator together with the alert engine: every required incident must be detected, with 0% false positives.

### Taxonomy and labels

- `taxonomy.js` defines 7 categories × 27 causes; `normalizer.js` handles teencode and slang and masks PII.
- The browser runs a fine-tuned ViSoBERT as int8 ONNX, loaded from Hugging Face, in `src/lib/visobertBrowser.js`.
- Its decoder mirrors `nlp_service/visobert_model.py::decode` and `service.py::/explain`. **If you change one, change the other.**

### Frontend

- Pages live in `src/components/*.jsx`, with routes in `App.jsx`. Building blocks are in `components/ui`, `shell`, `dashboard`, `alerts`, `trust`, `analytics` and `feedback`.
- The sidebar shows the nine pages in `lib/nav.js` in three groups (daily work without a label, then "Phân tích" and "Dữ liệu"), rendered as ONE `NavList` so the active-page mark can slide across groups. Reports, Settings and Lab are `HIDDEN_PAGES`, reachable through Ctrl+K and in-context links.
- Only Dashboard and the auth pages are in the main bundle. Every other page is `lazyPage(() => import(...))` (`lib/lazyPage.js`): `MainLayout` preloads all of them when the browser is idle, and a loaded page renders without React.lazy so no fallback flashes. If a chunk fails to load (old hashes after a Vercel deploy), the page reloads once. Main JS went from 1,2 MB (353 KB gzip) to about 700 KB (210 KB gzip) on 2026-11-16.
- Empty workspace: `useWorkspaceEmpty()` (`lib/workspaceEmpty.js`, reads `/trust/health` `rawCollected`). Dashboard renders `shell/StartGuide.jsx` instead of its sections, `/feedbacks` says the store has no feedback yet, and `MainLayout` shows `NoDataNotice` on the other data pages. The sidebar health score shows "—" instead of a red 0.
- Touch screens: controls are at least 40px tall under `pointer-coarse:` (see DESIGN.md section 6); mouse layouts are unchanged.
- Tabs are driven by `?tab=` in the URL:
  - Cảnh báo: `?tab=log`;
  - Tin cậy dữ liệu: `?tab=audit` (tab "Duyệt nhãn": queues Cần duyệt and Nghi mỉa mai);
  - Phân tích: `?tab=compare|segments`;
  - Nguồn dữ liệu: `?tab=url|file|shops|history` (read once on mount).
- The assistant drawer (`shell/Assistant.jsx`) is opened from anywhere with `askAssistant(q)` / `openAssistant()` in `lib/assistant.js`, which uses a window event. `MainLayout` remounts on every route change, so the chat history lives in sessionStorage.
- `lib/format.js` has the shared wording helpers:
  - `evidenceOf` maps a feedback to verified / human / inferred;
  - `alertInWords` describes an alert in plain words (no z or p);
  - `LABELLER_LABEL`.
- Data comes through hooks in `src/hooks/` (`useDashboardData`, `useDecisions`).
- Design system "Sổ kiểm chứng":
  - tokens are in `src/index.css` (light `:root`, dark `[data-theme='dark']`) and mapped to Tailwind in `src/styles/tailwind.css`;
  - the `glass*` and `hero*` names are legacy aliases, now solid surfaces;
  - `font-mono` renders the sans font (Be Vietnam Pro) with tabular figures; `font-code` is the only real monospace, used for z/p/n strings.
- Filters persist in localStorage (`lib/storage.js`); URL deep-link filters must not overwrite them.

UI conventions agreed with the user:
- Sentence-case labels; no all-caps letter-spaced labels.
- Vietnamese decimals (`0,64%`). Show small rates with 2 decimals so 0.04% does not round to "0,0%".
- No z, p or EWMA in manager-facing text; keep them behind a "Số liệu kiểm định" disclosure.
- No middle-dot `·` separators in visible copy.
- No controls that do nothing: fake toggles and sample shops were removed on purpose.
- No explanatory small print: no disclaimers ("Hệ thống chỉ đề xuất..."), no self-checks ("Phép trừ khớp"), no "bấm để..." hints that repeat what the control shows, no sentence that restates a number already on screen (cleaned 2026-11-16).

### Dashboard (data to action, plain language)

- Order: summary sentence (built from the merged to-do list) -> filters -> **Việc hôm nay** (`TodayInbox.jsx`) -> **Cửa hàng đang thế nào** (`StoreHealth.jsx`, three metrics in one block, one shared evidence line) -> charts -> recent feedback.
- `TodayInbox.buildTodo` merges pending alerts (expand inline for the plan + accept/dismiss via `useDecisions`) with `GET /api/inbox` items: urgent live actions, live orders not yet confirmed, live complaints not pushed, suspicious feedback queue, `needsReview` labels, stale real data. Only critical/high rows get a primary button.
- Vocabulary for shop owners: "Có chứng từ" (not "Đối soát được"), "AI đoán", "Đã mua thật", "Khách không hài lòng", "Độ tin số liệu", "AI chế độ cơ bản". Empty category shows "—".
- Smallest text is 13px: `--text-xs` is overridden in `styles/tailwind.css`; do not reintroduce `text-[0.6x/0.7x rem]`.
- **Type scale** (tokens in `styles/tailwind.css`): `text-xs` 13, `text-sm` 14, `text-base` 16, `text-heading` 18 (panel titles), `text-display` 26 (page title, summary sentence), `text-metric` 32 (key numbers). No `text-[…rem]`.
- **Surfaces:** panels are `GlassPanel` or `glass-strong rounded-xl` (same white surface + 1px line). The only ink block is the summary header.
- **Signature element:** the summary header carries the evidence ledger (`/trust/health`: collected − spam − suspected fake − pending − too old = `countedForMetrics`, plus % with evidence). The arithmetic must add up exactly; it matches the counted figure shown on every page.

### Analysis cadence (`services/cadence.js`)

- Every "recent vs before" computation (alerts, period comparison, negative velocity, `/trend`, assistant, pain-point trend, case charts, UI wording) uses ONE window chosen from data density, computed once per context (`ctx.cadence`, `cadenceOf(ctx)`, exposed in `/stats.cadence`).
- Ladder 7, 14, 30, 60, 90, 180, 365, 730 days: the smallest rung with ≥ 50 counted feedbacks in the window and ≥ 100 in the baseline (1 to 4 windows back). Dense demo data stays at 7 vs 28 days (`verify` unchanged); real Tiki data (reviews span ~4 years) becomes 6 vs 24 months. Never hard-code "7 ngày" / "28 ngày" in copy; use `spanWords` / `cadenceWords`.
- Follow-up of decisions and cases: days elapsed are wall-clock (`openedAt`), the before/after windows are anchored on data time and at least one cadence window long.

### Pain points, cases, file import (data to action)

- `services/pain_points.js`: per product group (`product_group.js`, `productCategory` or product name) finds 2 to 4 syllable phrases that complaints mention far more than everything else (log-odds z, lift, two side backgrounds). No hard-coded group, product or phrase (a test greps for it); only generic Vietnamese function words. Stop words are matched on the ACCENTED form for accented words ("ố" is not "ở", "bàn" is not "bạn"), folded form only for unaccented typing.
- The unfiltered result is computed in the context worker (`ctx.painDefault`, members re-attached by id on the main thread); filtered queries are memoised in `routes/api.js` `painPointsFor`.
- `/inbox` adds up to 3 pain points without an open case (real data rarely has spikes but always has recurring complaints).
- `services/case_file.js` + `/cases*`: 4 steps (scope, who does what, ready-made drafts, follow-up); missing data is stated, never invented.
- `POST /api/import/feedbacks` (real workspace only, 50 rows per batch, dedup before labelling). Rows without a date get `timeInferred: true`: kept in totals/categories/pain points, excluded from every time window, burst and 48 h duplicate check, and from the data anchor (`metrics.timeOf`). Import dedup key uses the pseudo customer id and file row, so two customers writing the same sentence are not merged.
- Rules fallback (`classifyByRulesFallback(text, rating)`): no keyword → stars decide; 1 to 2 stars beat weak praise words.
- Blind check of pain points: `.hallmark/kiem-mu-diem-dau*.html`, see `KE-HOACH-GIAO-DIEN.md` 13.7.

### Accounts (`/auth`, `/login`, `/signup`)

- Backend: `services/auth.js` (pure helpers + Mongo calls) and `routes/auth.js` mounted at `/api/auth` (`POST /signup`, `POST /login`, `POST /logout`, `GET /me`, `PATCH /me`). Accounts live in their own database, `MONGODB_AUTH_DB` or `<MONGODB_DB>_auth` (prod `customer_radar_auth`; a local run with `MONGODB_DB=..._test` writes to `..._test_auth`), so `npm run seed` never touches them.
- Passwords: Node `crypto.scrypt` with a per-user salt (`scrypt$N$r$p$salt$hash`), no extra package. Sessions: random 32-byte token sent as `Authorization: Bearer`; only its SHA-256 is stored in `auth_sessions` with a TTL index (30 days with "Giữ đăng nhập", 12 h without). `publicUser` never returns the hash.
- Abuse limits: per IP (`rate_limit.js`: signup 5 per 10 min, login 20 per 5 min) and per email (10 wrong passwords in 15 min lock that email 15 min). A wrong login never says whether the email exists.
- The demo account `demo@customerradar.vn` / `demo2026` is created at startup if missing (never overwritten) and cannot be renamed (`PATCH /me` 403). `POST /api/auth/(signup|login|logout)` are exempt from the `X-Write-Key` guard.
- Frontend: `src/lib/auth.js` (session in localStorage or sessionStorage, event `cr-auth`, `safeNext`). `App.jsx` gates every app page: no session redirects to `/auth?next=<path>`; the three auth pages share `components/auth/AuthShell.jsx` (see DESIGN.md, "Khung ngắm tài khoản"). 
- The data API requires a session (`auth.requireSession`, mounted on `/api` right after `/api/auth`): every `/api/*` returns 401 `{ code: 'auth_required' }` without a valid Bearer token, except `/api/auth/*`, `GET /api/trust/health` (aggregate ledger only; the landing page and the auth ink block read it) and the live webhook `POST /api/live/sessions/:id/comments` (has its ingestKey). EventSource and download links cannot send headers, so only `GET /api/live/sessions/:id/(stream|export)` also accept `?access_token=` (`liveUrl` adds it). The frontend axios interceptor clears the session on `auth_required`, and App sends the user to `/auth?next=`. When a request carries `by` (decisions, review labels, live answers), the server overwrites it with the account name. `AUTH_REQUIRED=0` turns the guard off for local experiments.
- Session lookups are cached in memory for 5 minutes. A new login or signup is written to the cache at once, and concurrent requests with the same token share one lookup. Measured 2026-11-16 on local + Atlas: 12 parallel calls with a cold token took 1,860 ms before this cache, now 181 ms, and 26 ms right after login. Logout and profile edits evict the entry immediately.
- Calling the prod API by hand (measuring, checking a deploy) now needs a token: `POST /api/auth/login` with the demo account, then `Authorization: Bearer <token>`. Never print the token.

### Quản gia (`/butler`, `services/butler/`, Zalo)

24/7 store butler that watches workspaces on a timer, alerts the shop owner over a Zalo Bot, takes remote commands (both on Zalo and on the mobile-first `/butler` web page / PWA), and logs every action back into the shared decision log.

- **Shared work items (`services/work_items.js`):** `detectAlertsCached`, `buildRecommendationsCached`, `painPointsFor`, `buildInboxItems` and `recordDecision` are shared by `routes/api.js` and the butler so web and Zalo always see the same items and write the same `recommendation_log` (`via: 'web' | 'zalo'`).
- **Modules (`services/butler/` + `routes/butler.js`):**
  - `text.js`: Vietnamese plain-text formatting, quiet-hours check (`inQuiet`), 2,000-char chunking (`chunk`), alert and digest copy (`buildAlertMessage`, `buildDigest`, `shouldNotify`).
  - `commands.js`: accent-tolerant parser (`parseCommand`) for tasks, plans (`xem n`), decisions (`duyệt n`, `bỏ qua n vì ...`), status, live, collect, mute, workspace, link codes and free-form questions.
  - `zalo.js`: Zalo Bot client (`bot-api.zaloplatforms.com`), token redaction on every error, circuit breaker (5 consecutive failures pause 2 min), long-polling (`startPolling`), constant-time `verifySecret` and `normalizeUpdate`.
  - `store.js` & `outbox.js`: Mongo helpers and persistent outgoing queue (`butler_outbox`, sequential 1 msg / 1.1 s spacing, `sentParts` tracking for multi-part retries, exponential retry `[30s, 2m, 10m, 30m]`, `BUTLER_FAST_RETRY=1` for automated tests).
  - `incidents.js` & `watcher.js`: stable incident fingerprinting (`alert|...`, `live|...`, `inbox|...`), lease lock (`meta._id='butler_watch'`), baseline seeding on first run, clearing `notified: []` when resolved so recurring incidents notify again, immediate escalation when severity rises, and morning digest.
  - `engine.js` & `inbound.js`: command execution, per-chat serial queue with global concurrency cap (2), 20 msg/min/chat rate limit, and 6-digit account linking (demo account `demo@customerradar.vn` is refused with 403).
- **Collections in `authDb`:** `butler_links` (1-1 `userId` and `zaloChatId`, plus `settings` and `lastTasks` snapshot for number handles), `butler_link_codes` (10-min TTL), `butler_messages` (30-day TTL, shared web + Zalo history), `butler_pending` (5-min TTL), `butler_outbox` (30-day TTL), `butler_inbound` (2-day TTL, `message_id` dedup), and `butler_incidents` (30-day TTL from `lastSeenAt`).
- **Two-step writes:** `duyệt n`, `bỏ qua n vì ...` and `thu thập` never write immediately; they save a 5-minute confirmation in `butler_pending` and only call `recordDecision` or `realCollector.runOnce` when the owner replies `có` (or cancel on `thôi`).
- **Two bots (local vs Render) & env vars:** Zalo allows only one active delivery mode per bot, so use a separate test bot locally (`ZALO_MODE=poll`, `ZALO_BOT_TOKEN`) and a production bot on Render (`ZALO_MODE=webhook`, `ZALO_WEBHOOK_SECRET`, `PUBLIC_APP_URL`). Other vars: `BUTLER` (`BUTLER=0` kill-switch disables polling, watcher and outbox while keeping the web app normal), `ZALO_API_BASE`, `BUTLER_WATCH_MINUTES` (default 5), `BUTLER_WATCH_FIRST_DELAY_SEC` (default 180), `BUTLER_LIVE_WATCH_SEC` (default 60), `BUTLER_KEEPALIVE`.
- **Livestream (`live_watch.js`, `routes/live_schedule.js`):** a second, light watcher (lock `meta._id='butler_live_watch'`, every `BUTLER_LIVE_WATCH_SEC`) reads only `live_sessions`, the in-memory `hub.runtimeFor(...)` snapshots and `live_schedule`; it never calls `getContext`, so it must run in the same process as the live hub. It sends: session started, urgent in-session actions (incident `_id` identical to the 5-minute watcher's `${ws}|inbox|live|<session>|<action>`, so neither watcher double-sends; ignores quiet hours; at most one message per session per 3 min), end-of-session report (`hub.reportFor`), reminders before a scheduled live, and a nudge 10 min after a missed start. Every message is deduped by a fixed `dedupKey` (`live_start|`, `live_alert|`, `live_end|`, `live_remind|`, `live_late|`), checked with one batched outbox query per tick. Outbox caps `kind: 'live'` at 20 messages per hour per user. `live_schedule` lives in each workspace DB (max 50 future items, CRUD at `/api/live/schedule`); `POST /api/live/sessions` links the nearest matching schedule (`linkSession`). Owners turn it off with `settings.live = false`; the bot command `lịch` lists upcoming schedules and the morning digest lists today's.
- **Render free-tier sleep:** Render sleeps after 15 min without inbound HTTP. Setting `BUTLER_KEEPALIVE=1` with `RENDER_EXTERNAL_URL` pings `/health` every 10 min from inside the process (the live watcher also turns this on by itself while a scheduled live starts within 2 hours); for guaranteed 24/7 watching, pair with an external uptime ping every 10 min.
- **Local mock, E2E and load tests (always on `_test` DBs):**
  - Mock Zalo server (:5055): `node scripts/mock_zalo.js`
  - Full E2E (steps 1 to 16, 12 to 16 cover schedules and live sessions): `cd backend && node scripts/butler_e2e.js`
  - Load test (300 messages, webhook burst, RSS, `BUTLER=0`, 3 live sessions; the live-tick limit scales with measured Atlas round trip): `cd backend && node scripts/butler_load.js`

### Bảng số liệu (`/insights`, BI-style)

- `GET /api/bi/cube` (`services/bi_cube.js`, pure): every counted feedback as one integer row `[back, source, category, sentiment, evidence, product, cause, rating, weight×10000]` plus shared dictionaries; memoised per context version. About 370 KB for 14 k rows.
- `src/lib/cube.js` slices it in the browser: each visual applies every selection except its own dimension (cross-filtering). Selections live in the URL (`days`, `sent`, `src`, `cat`, `prod`, by dictionary key, not index).
- Negative rate is weight-based, like every other page.

### Báo cáo PDF (`/reports`)

- `src/lib/reportModel.js` (pure) turns `/stats`, `/trend`, `/categories`, `/recommendations`, `/root-causes` and `/trust/health` into the sentences, rows and figures; `components/report/ReportDocument.jsx` paginates them automatically: every block is rendered once in a hidden 674 px column to measure its height, then `paginate()` fills A4 sheets (794 x 1123 px); a heading keeps with the next block (`keepWithNext`), `breakBefore` forces a new sheet. Page count depends on the data (4 pages on demo, 11/2026). Heads are action titles built in `model.titles`; summary findings have a bold `lead`. The root gets `data-ready="1"` when laid out; export waits for it.
- Export captures each `[data-page]` separately with html2canvas (scale 2) into its own PDF page; no slicing. Chart text is HTML over the SVG, because html2canvas rasterises SVG without webfonts. Colours: `REPORT` / `REPORT_VARS` in `report_kit.jsx`, read by `report/report.css`.
- `/reports?preview=1` shows the same sheets. Limits: 10 causes, 4 actions.
- KPI changes are words ("Tăng 8,4%"), muted when either 7-day window has < 30 feedbacks. The "Khác" category is feedback with no issue group, not "unclassified".
- Ledger: `/trust/health` returns `ledger` (`metrics.ledgerSplit`): pending-review items that still carry weight are counted, so only `pendingNotCounted` is subtracted. Both the dashboard ledger and the report use it.

### Performance and data flow (2026-11)

- **Context compute runs in a worker thread** (`services/context_worker.js` + pure `context_compute.js`). The main thread only reads Mongo; Trust Layer (7 s locally, tens of seconds on Render) no longer blocks requests or the live SSE. `_id` is converted to a string before crossing the thread. `CONTEXT_WORKER=0` computes inline (fallback is automatic if the worker dies).
- **Writes never make the next request wait.** `invalidate(db)` keeps the previous context as `stale` (flag `refreshing: true`) and recomputes in the background. Small writes (`/trust/label`, `/audit/label`) also `patchServing()` the serving context so the change shows immediately. `/nav/status` exposes `refreshing`.
- **Frontend data version** (`src/lib/dataVersion.js`): the sidebar polls `/nav/status` (every 4 s while refreshing) and bumps the version when refreshing ends; `useDashboardData`, the inbox, Analytics and `useFeedbackPage` re-fetch on bump. Write actions call `reportRefreshing(true)`.
- **`GET /feedbacks` is paginated server-side** (`?page&limit&q&sentiment&evidence` -> `{items,total,pages,counts}`), accent-insensitive search cached per item in a WeakMap. `?view=negative` returns slim negative items + `anchor` for Analytics. No page/limit = full list (CSV export only). Tables use `feedback/FeedbackList.jsx`, `feedback/FeedbackDetail.jsx`, `ui/Pager.jsx`.
- `/stats` is memoised per context version + filters. Live: ended-session snapshots and reports are memoised (`hub.memoized`), dropped by any non-GET request on `/sessions/:id`.
- Mongo client: pool 2-20, `appName`, retry reads/writes. Extra indexes: `audit_labels.feedbackId` (unique), `teacher_labels.feedbackId`, `live_comments {sessionId,intent,orderStatus|pushedToFeedback}`.

## Deployment

- Backend on Render: https://aisc2026-q1vx.onrender.com
- Frontend on Vercel: https://aisc-2026.vercel.app (SPA rewrites in `vercel.json`; `VITE_API_URL` points at Render)
- Pushing to `main` deploys both. The production backend reads the same Atlas cluster as local `.env`, so a local seed changes the live demo.

## Rules specific to this repo

- Secrets live only in `backend/.env`, `nlp_service/.env` and the git remote URL in `.git/config`. That remote URL contains a token without `workflow` scope, so pushes that change `.github/workflows/` are rejected. Mask the token in push output: `| sed -E 's#https://[^@]*@#https://***@#'`. Never print `PII_SALT`.
- Destructive operations on the production databases (drop, reseed) need the user's approval.
- Commit and push to `main` are allowed. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never tune training data to sentences that fail the test set. Never reuse hand-written synthetic sarcasm templates; they failed before. Keep the blind test set unseen, and report numbers honestly (say which labels are synthetic and which are human).
- Run long jobs (collection, seeding) detached with PowerShell `Start-Process`, logging to a file.
- On Windows, Bash heredocs containing backticks or `${}` break easily. Write scripts to files with the Write tool instead.

## Tự thu thập kho thật
- `backend/services/real_collector.js`: máy chủ tự lấy đánh giá Tiki mới mỗi 24 giờ (kiểm tra mỗi 30 phút, Render ngủ dậy thì bù), khóa trong `meta._id='autocollect'` hạn 15 phút, nhịp tim mỗi 60 giây. `scripts/collect_real.js` dùng chung lõi. Workflow GitHub đã xóa.
- Tìm sản phẩm Tiki phải `sort: 'top_seller'` (thứ tự mặc định từ 11/2026 trả hàng mới chưa có đánh giá).
- Muối băm (services/pii_salt.js): lấy từ biến PII_SALT, không có thì từ `meta._id='pii_salt'` của kho thật. Không có muối bí mật thì ingest KHÔNG lưu customerId (null), livestream dùng muối ngẫu nhiên của tiến trình; thu thập vẫn chạy. Tắt tự thu thập bằng `AUTO_COLLECT=0`. Chạy máy chủ local phải đặt `MONGODB_REAL_DB=..._test` hoặc `AUTO_COLLECT=0`, vì local trỏ cùng cụm Atlas với prod.
- (K7-02) `POST /api/seed` mặc định trả 403; chỉ chạy khi `ALLOW_SEED_ROUTE=1` và đang ở kho demo (không bao giờ đặt trên prod; nạp lại dùng `npm run seed`). `/api/scrape` chặn SSRF (`services/url_guard.js`); Chromium chỉ bật khi `ALLOW_BROWSER_SCRAPE=1`, mặc định tắt. WCR dùng mẫu số giao dịch cùng phạm vi lọc (`scopeTransactions` trong `analysis_context.js`).
- (14/11) Khóa ghi + CORS (`services/api_access.js`): khi Render có `WRITE_KEY`, mọi POST/PUT/PATCH/DELETE phải gửi `X-Write-Key` đúng mã (trừ webhook `POST /api/live/sessions/:id/comments`, đã có ingestKey); biến trống thì không khóa. Giao diện gửi mã từ `VITE_WRITE_KEY` (Vercel), chỉ trên lệnh ghi. Mã nằm trong gói JS nên chỉ chặn bot và script gọi bừa, không thay được đăng nhập. CORS chỉ cho `https://aisc-2026.vercel.app`, localhost mọi cổng và `CORS_ORIGINS` (phân cách dấu phẩy). `GET /feedbacks` không phân trang (xuất CSV) giới hạn 6 lượt/phút/IP. Không bao giờ in giá trị `WRITE_KEY`.

## Quy tắc làm việc và lịch (gộp từ bản bàn giao 11/11/2026)

### Người dùng
- Sinh viên UIT, nhóm LDS; xưng "ta", gọi Claude là "mày". Trả lời tiếng Việt, văn nói, ngắn, có ví dụ đời thường.
- Thích Claude tự làm hết; chỉ hỏi khi thật sự là quyết định của người dùng, hỏi bằng danh sách đánh số trong văn bản (KHÔNG dùng hộp thoại AskUserQuestion).
- Gán nhãn (tab Duyệt nhãn ở trang Tin cậy dữ liệu) và finetune ViSoBERT v4 là việc của một bạn cùng nhóm, không phải của người dùng.
- Việc giao diện thì người dùng gọi skill `/hallmark` (cài tại `C:\Users\DELL\.claude\skills\hallmark`, ảnh chụp trong `.hallmark/`, đã gitignore).

### Chữ trong giao diện và văn bản sản phẩm
- Không dùng: dấu "·" nối chuỗi, mũi tên "→" dán vào chữ hay nút, nhãn IN HOA, chữ "tuyệt đối", emoji, chấm tròn trạng thái trang trí, vòng tròn hay đồng hồ đo, biểu đồ donut, thẻ lồng thẻ, sọc màu bên trái thẻ.
- Số kiểu Việt: thập phân dấu phẩy (2,45%), nghìn dấu chấm (14.128). Khoảng số viết "20 đến 30".
- Ô trống hiện "—" (người dùng chốt 11/11).
- Số phải khớp giữa các trang (sổ đối chiếu = số "được tính" ở mọi trang).

### Vận hành prod
- Không gọi API prod dồn dập: tối đa 1 lần mỗi 20 đến 30 giây, gọi nhanh bị Cloudflare chặn ("Just a moment...") và Render trả 429.
- Đổi frontend thuần (`src/`, `index.html`) thì Render KHÔNG deploy lại; đổi backend thì có. Render free 512 MB RAM, không có endpoint phiên bản, deploy mất khoảng 5 đến 7 phút.
- Mỗi lần Render deploy, phiên live demo bị ngắt (`interrupted`). Bật lại (người dùng tự chạy, lệnh POST lên prod bị chặn với Claude):
  `curl -X POST -H "X-Workspace: demo" https://aisc2026-q1vx.onrender.com/api/live/sessions/<id phiên>/resume`
  Hướng dẫn người dùng cụ thể: gõ `! <lệnh>` trong khung chat, hoặc PowerShell dùng `curl.exe`.
- Trước mỗi push quét diff đã stage: `git diff --cached | grep -E "hf_|ghp_|mongodb\+srv|AIza|gsk_|sk-or-|PII_SALT="`. Push lọc token: `git push origin main 2>&1 | sed -E 's#https://[^@]*@#https://***@#'`.
- Không ghi dữ liệu mô phỏng vào feedbacks của prod, và không viết tính năng để máy chủ tự làm việc bị chặn (là lách lệnh chặn). Simulator livestream chỉ chạy ở kho demo.
- Git Bash đổi `/dashboard` thành đường dẫn Windows khi truyền làm tham số node: đặt `MSYS_NO_PATHCONV=1`. File test backend dùng CRLF.
- Giao diện local trỏ prod: PowerShell `$env:VITE_API_URL='https://aisc2026-q1vx.onrender.com/api'` rồi `npx vite --port 5199 --strictPort`. Backend local: `AUTO_COLLECT=0`, `PORT=5000`, `node server.js`.
- Chấm giao diện: `node C:/Users/DELL/.claude/skills/hallmark/scripts/sloplint.mjs src --genre modern-minimal --scope app --render --kept --url http://localhost:5199/<route>`.

### ID và đường dẫn
- Mô hình ONNX trên HF: `tdn278/customer-radar-visobert-onnx`.
- Trang so sánh trước/sau + đối thủ: https://claude.ai/artifact/4vZXq73mA1MUpvJFrNJid9. Bảng đối thủ CHƯA kiểm chứng với Sapo, phần mềm chốt đơn livestream, kênh người bán sàn: chưa đưa lên slide.

### Lịch
- Dữ liệu replay của kho demo hết khoảng 17/11: nếu chưa nạp lại thì người dùng chạy `npm run seed` trong `backend`, rồi tạo hoặc bật lại phiên live.
- Khi đồng đội gửi `model_int8.onnx`, `tokenizer.json`, `meta.json`: đẩy HF, gắn web, chạy lại 4 tab Lab, chỉ báo số trên bộ test mù.
- 8 đến 9/12: người dùng chạy `npm run seed -- --anchor=2026-12-10T09:00:00+07:00`.
- 10/12/2026: chung kết.
