# Retail & Inventory: Global Electronics Sales Analytics

A production-grade analytics suite on **SAP BTP**, built on the **SAP Cloud Application Programming Model (CAP, Node.js)** with **native SAP Fiori Elements** over **OData V4**, deployed to **Cloud Foundry** as a Multi-Target Application (HANA + XSUAA + approuter) behind a unified **Fiori Launchpad**.

> *Data Analysis on the SAP Business Technology Platform — Saarland University, Summer Semester 2026.*

The dataset is a global electronics retailer: **26,326 orders / 197,757 units / ~$55.8M** USD-normalized revenue across **8 markets, 8 categories, 58 stores, ~11,900 customers, ~2,500 products**.

---

## Architecture

```
Browser ──> Approuter (XSUAA login)
              ├── static UI: Fiori Launchpad + 7 UI5 apps
              └── OData V4 ──> CAP srv (Node.js) ──> SAP HANA (HDI container)
                                  └── /reports/global-review.pdf (SAP-RPT-1 PDF)
```

- **Backend:** CAP (Node.js), six OData V4 services, computed analytics materialized into HANA tables for Fiori-Elements aggregation.
- **UI:** Native Fiori Elements floorplans (ALP, List Report, Object Page) tiled in one Fiori Launchpad.
- **AI:** Explanation Bot + SAP-RPT-1 report, grounded in a compact KPI snapshot, with a runtime LLM provider abstraction.
- **Deploy:** MTA — CAP srv + HANA db-deployer + approuter + XSUAA. See [DEPLOY.md](DEPLOY.md).

---

## The four tasks

| # | Task | UI floorplan | App(s) | Service |
|---|------|--------------|--------|---------|
| 1 | **Sales Visualization** — revenue, profit, margin, quantity by geography, category, time | Analytical List Page | `app/salesanalytics` | `/analytics` |
| 2 | **Classification** — customer / product / store segmentation | 3× Analytical List Page | `app/salesclassification`, `app/salesclassproducts`, `app/salesclassstores` | `/classification` |
| 3 | **Association analytics** — demographic affinity, price elasticity, store-size↔revenue correlation | Multi-view List Report | `app/salesassociation` | `/association` |
| 4 | **AI suite** — KPI dashboard, Explanation Bot, SAP-RPT-1 PDF | Object Page + custom actions | `app/retailassistant` | `/ai`, `/reports` |

All four are reachable from the unified launchpad **`app/home/flpSandbox.html`** ("Retail Analytics Suite").

### Task 2 — deeper segmentation
- **Customers:** RFM quintile scoring → an **11-segment persona matrix** (Champions, Loyal, Potential Loyalist, New, Promising, Need Attention, About to Sleep, At Risk, Can't Lose Them, Hibernating, Lost) plus a coarse VIP/Regular/At-Risk band.
- **Products:** margin × volume median split → Star / Margin-Driven / Volume-Driven / Laggard.
- **Stores:** revenue-per-m² percentile tiers → Flagship / Standard / Underperforming / Online.

### Task 3 — key findings
- **Store size vs revenue:** Pearson **r = 0.60 (R² = 0.36)** across 57 stores — bigger ≠ proportionally more.
- **Price elasticity:** Laptops −0.14, Smartphones −0.12 (R² ≈ 0.83) — demand is **inelastic**.
- **Demographic affinity:** mild over-indexing (108–113), e.g. Under-30 Male → Cell phones / Cameras.

### Task 4 — AI (Bot + SAP-RPT-1 tier)
- **`getKPISnapshot`** builds one deterministic, USD-normalized JSON context (~1,336 tokens) from Task 1 views + Task 3 stats.
- **Explanation Bot** (`explainKPI`, persona *Virtual Store Manager*) answers grounded questions; prompts in `srv/lib/prompts.js` (grounding-first + few-shot).
- **SAP-RPT-1 PDF** (`/reports/global-review.pdf`, persona *SAP RPT-1*) — a board-ready "Annual Global Sales Review" rendered with `pdfkit`: KPI card band + native bar charts + AI narrative.
- **Provider abstraction** (`srv/lib/llm.js`): SAP Generative AI Hub → OpenAI-compatible → deterministic grounded fallback.
- **Grounding eval:** `npm run test:ai` runs 19 checks that answers never invent figures.

---

## Data model & services

**Core entities** (`db/schema.cds`): `Customers`, `Products`, `Stores`, `Sales` (composite key order+line), `ExchangeRates`. All monetary values are **USD-normalized**; local currency is derived per transaction, never summed across currencies.

**Materialized analytics tables** (populated lazily from service logic so Fiori Elements can `$apply`/`$count`):
`db/classification-stats.cds`, `db/association-stats.cds`, `db/ai-insights.cds`.

**OData V4 services:**

| Path | Service | Purpose |
|------|---------|---------|
| `/analytics` | AnalyticsService | Task 1 KPI/aggregation views |
| `/classification` | ClassificationService | Task 2 FE classification (materialized) |
| `/insights` | InsightsService | Task 2 computation source (RFM/quadrant/tier) |
| `/association` | AssociationService | Task 3 association stats |
| `/ai` | AIService | Snapshot, bot, executive summary, report payload |
| `/admin` | AdminService | Data administration |
| `/reports/global-review.pdf` | (bootstrap route) | SAP-RPT-1 PDF |

---

## Project structure

```
db/         data model, materialized stat tables, CSV seed data
srv/        CAP services (.cds + .js), UI annotations, lib/ (llm, prompts, ai-fallback, report)
app/        Fiori Elements apps, freestyle app, home launchpad, approuter (app/router)
scripts/    bundle-ui.mjs (bundles UI into the approuter at build time)
test/       ai-eval.js (grounding eval)
mta.yaml    Multi-Target Application descriptor (srv + db-deployer + approuter + xsuaa + hdi)
DEPLOY.md   Cloud Foundry deployment runbook
```

---

## Run locally

```bash
npm install
npm run watch-home     # opens the unified launchpad (Fiori Launchpad sandbox)
# or a single app:  npm run watch-salesanalytics | watch-salesassociation | watch-retailassistant
npm run test:ai        # AI grounding eval (server must be running)
```
Local uses SQLite (dev); production uses SAP HANA. Validate the production build with `cds build --production`.

For a real LLM locally: `LLM_API_KEY=... [LLM_BASE_URL=...] [LLM_MODEL=...]`. Without it, the AI uses the grounded fallback.

## Deploy to Cloud Foundry

See **[DEPLOY.md](DEPLOY.md)** for the full runbook. In short:

```bash
mbt build -t ./mta_archives
cf login -a <API-ENDPOINT> --sso
cf deploy mta_archives/retail-analytics_1.0.0.mtar
```
The MTA creates an XSUAA instance and an HDI container on SAP HANA Cloud, loads the CSV data, and stages the CAP service + approuter. A **running** HANA Cloud instance is required.

---

## Tech stack

SAP CAP (Node.js) · OData V4 · SAP Fiori Elements (ALP, List Report, Object Page) · Fiori Launchpad · SAP HANA Cloud (HDI) · XSUAA · Application Router · Cloud MTA Build Tool · pdfkit · SAP Generative AI Hub (RPT-1) with fallback.

## Excellence features (beyond the baseline)
- 11-segment RFM persona matrix; BCG-style product quadrants; percentile store tiers.
- AI grounding evaluation harness (19 checks) + provider abstraction with grounded fallback.
- Native pdfkit charts in the RPT-1 PDF; revenue-efficiency anomaly detection; unified launchpad.

## Contributors
Deepika Naresh Gambani · Monica Pei · Yuyang Pei
