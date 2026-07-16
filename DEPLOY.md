# Deploying to SAP BTP Cloud Foundry

This project deploys as a single MTA with three modules:

| Module | Type | What it is |
|---|---|---|
| `retail-analytics-srv` | Node.js | The CAP backend (OData V4: `/analytics`, `/insights`, `/classification`, `/association`, `/ai`, `/admin`, plus the `/reports/global-review.pdf` route) |
| `retail-analytics-db-deployer` | hdb | Deploys the CDS model + CSV data into a HANA HDI container |
| `retail-analytics` | approuter | Front door: XSUAA login, serves the Fiori Launchpad + 7 UI5 apps (static), forwards OData to the backend |

Auth is **XSUAA** (users log in). The UI is served by the approuter from `app/router/resources/`, which is generated at build time by `scripts/bundle-ui.mjs` (copies each app's `webapp/` to `resources/<manifest id>/` and the launchpad to `resources/home/`).

---

## 0. Prerequisites (one-time)

- `cf` CLI, `mbt` (Cloud MTA Build Tool), and Node 18+ installed.
- A CF org/space on SAP BTP with these entitlements assigned to the subaccount:
  - **SAP HANA Cloud** (`hana` service, `hdi-shared` plan) — and an instance that is **running**.
  - **Authorization & Trust Management** (`xsuaa`, `application` plan).
  - *(optional, for real AI narratives)* **SAP AI Core** (`aicore`) for RPT-1 / Generative AI Hub.

### Verify HANA Cloud is available and running
```bash
cf login          # SSO/passcode; pick your org + space
cf marketplace | grep -i hana         # confirm the 'hana' service is entitled
cf services                            # is there a running HANA Cloud + an hdi-shared already?
```
If there is **no HANA Cloud instance**, create one (BTP Cockpit → your space → SAP HANA Cloud → *Create*, plan `hana`, ~30–40 min to provision) and make sure it is **started** (HANA Cloud auto-stops nightly; start it before deploying). The MTA will create the `hdi-shared` container against it automatically — you do **not** pre-create the hdi-container.

---

## 1. Build the deployable archive
```bash
npm install            # keep package-lock.json in sync (only needed after dependency changes)
mbt build -t ./mta_archives
# -> mta_archives/retail-analytics_1.0.0.mtar
```
`mbt build` runs `cds build --production` (compiles the model to HANA artifacts) and `scripts/bundle-ui.mjs` (bundles the UI into the approuter) automatically.

## 2. Deploy
```bash
cf login               # if not already
cf deploy mta_archives/retail-analytics_1.0.0.mtar
```
First deploy takes a while (creates the XSUAA service, the HDI container, runs the HANA deployer to load ~62k sales rows, then stages the srv + approuter). Watch for the deployer step — this is where any SQLite→HANA differences would surface (none expected; the production build compiles clean).

## 3. Open it
```bash
cf apps                # find the URL of the 'retail-analytics' (approuter) app
```
Open `https://retail-analytics-<org>-<space>.<region>.hana.ondemand.com` → log in → the **Retail Analytics Suite** launchpad appears with tiles for all four tasks.

## 4. Grant yourself the role (if any tile is forbidden)
The app only requires authentication, but to be safe assign the role collection:
- BTP Cockpit → Security → **Role Collections** → `RetailAnalyticsViewer` → assign your user.
- Or via CLI with the `RetailAnalyticsViewer` collection. Re-login after assigning.

---

## 5. (Optional) Real AI narratives via RPT-1 / Generative AI Hub
The AI features (explanation bot + PDF report) work **without** an LLM using a deterministic, grounded fallback. To use a real model:

**Option A — SAP Generative AI Hub (RPT-1):** bind an `aicore` service instance to `retail-analytics-srv` (add it as a resource in `mta.yaml` and `requires` on the srv module), then redeploy. `srv/lib/llm.js` auto-detects the `aicore` binding.

**Option B — any OpenAI-compatible endpoint (quick):**
```bash
cf set-env retail-analytics-srv LLM_API_KEY   "<key>"
cf set-env retail-analytics-srv LLM_BASE_URL  "https://<host>/v1"      # optional
cf set-env retail-analytics-srv LLM_MODEL     "gpt-4o-mini"            # optional
cf restage retail-analytics-srv
```
With neither set, the report/bot label themselves as the grounded fallback.

---

## Redeploy after code changes
```bash
mbt build -t ./mta_archives && cf deploy mta_archives/retail-analytics_1.0.0.mtar
```

## Troubleshooting
- **HANA deployer fails / times out:** the HANA Cloud instance is probably stopped — start it in BTP Cockpit and redeploy.
- **`npm ci ... not in sync`:** run `npm install` and rebuild (the lockfile drifted).
- **UI 404s but OData works:** the approuter didn't get `resources/` — confirm `node scripts/bundle-ui.mjs` ran in the build (it's in `mta.yaml` `before-all`).
- **Blank page / CSRF errors on writes:** these apps are read-only; if needed, set `"csrfProtection": false` on the service route in `app/router/xs-app.json`.
- **Undeploy everything:** `cf undeploy retail-analytics --delete-services`.
