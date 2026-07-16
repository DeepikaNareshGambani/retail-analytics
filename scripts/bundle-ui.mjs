/**
 * Deployment build step — bundle the UI into the approuter as static resources.
 *
 * The production CAP build (gen/srv) does not include the UI5 apps, and this
 * project uses a Fiori Launchpad SANDBOX (app/home/flpSandbox.html) rather than
 * SAP Build Work Zone. So at deploy time we copy every UI5 app's `webapp` folder
 * into app/router/resources/<manifest sap.app.id>/, and the launchpad html into
 * resources/home/. The approuter (see app/router/xs-app.json) then serves these
 * static, while OData/service paths are forwarded to the CAP backend.
 *
 * Mount names use each app's manifest `sap.app.id` (e.g. retail.analytics.
 * salesanalytics) so the launchpad's resourceroots resolve unchanged.
 *
 * Run from the repo root:  node scripts/bundle-ui.mjs
 */
import { readdirSync, existsSync, rmSync, mkdirSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const APP = join(ROOT, 'app')
const OUT = join(APP, 'router', 'resources')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// 1) Launchpad + any other static html directly under app/home/
if (existsSync(join(APP, 'home'))) {
  cpSync(join(APP, 'home'), join(OUT, 'home'), { recursive: true })
  console.log('bundled home/ (launchpad)')
}

// 2) Each UI5 app: mount its webapp at /<manifest sap.app.id>/
let count = 0
for (const d of readdirSync(APP, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'router' || d.name === 'home') continue
  const webapp = join(APP, d.name, 'webapp')
  const manifest = join(webapp, 'manifest.json')
  if (!existsSync(manifest)) continue
  const id = JSON.parse(readFileSync(manifest, 'utf8'))['sap.app'].id
  cpSync(webapp, join(OUT, id), { recursive: true })
  console.log(`bundled ${d.name} -> resources/${id}`)
  count++
}

console.log(`UI bundle complete: ${count} app(s) -> ${OUT}`)
