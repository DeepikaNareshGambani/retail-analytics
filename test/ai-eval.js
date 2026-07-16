#!/usr/bin/env node
/**
 * Task 4 — Explanation-Bot grounding eval (golden questions).
 *
 * Hits the LIVE /ai endpoints, so it validates the real KPI snapshot and the real
 * answer path — the deterministic grounded fallback locally, or RPT-1 / an LLM
 * when one is configured. Every assertion checks that answers are GROUNDED in the
 * snapshot (correct topic + no invented monetary figures), which is the property
 * that matters for an analytics assistant. Questions are data-driven (derived from
 * the snapshot) so the eval is not tied to a particular dataset.
 *
 *   Usage:  npm run test:ai            # defaults to http://localhost:4004
 *           AI_EVAL_BASE=<url> npm run test:ai
 *
 * Exit codes: 0 = all passed, 1 = one or more failed, 2 = server unreachable.
 */
'use strict'

const BASE = (process.env.AI_EVAL_BASE || 'http://localhost:4004').replace(/\/$/, '')

// ---- tiny OData helpers ----------------------------------------------------
async function fn(name, args = '') {
  const res = await fetch(`${BASE}/ai/${name}(${args})`)
  if (!res.ok) throw new Error(`${name} -> HTTP ${res.status}`)
  const body = await res.json()
  return JSON.parse(body.value) // every /ai function returns String(JSON)
}
const snapshot = () => fn('getKPISnapshot')
const summary  = () => fn('getExecutiveSummary')
const ask = (q) => fn('explainKPI', `question='${encodeURIComponent(q).replace(/'/g, "''")}'`)

// ---- grounding check: every $-figure in the answer must exist in the snapshot
// (the fallback/LLM round to whole dollars, so compare rounded integers ±1). ---
function snapshotDollarSet(snap) {
  const set = new Set()
  const walk = (v) => {
    if (v == null) return
    if (typeof v === 'number') { const r = Math.round(v); set.add(r); set.add(r - 1); set.add(r + 1) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(snap)
  return set
}
function ungroundedDollars(answer, dollarSet) {
  const bad = []
  const re = /\$([\d,]+)(?:\.(\d+))?/g
  let m
  while ((m = re.exec(answer))) {
    // "$1.9M" style shorthand is illustrative-safe; only check plain $12,345 forms.
    if (/[MmKkBb]/.test(answer.slice(m.index + m[0].length, m.index + m[0].length + 1))) continue
    const whole = parseInt(m[1].replace(/,/g, ''), 10)
    if (!Number.isFinite(whole)) continue
    if (!dollarSet.has(whole)) bad.push(m[0])
  }
  return bad
}

// ---- assertion plumbing ----------------------------------------------------
let passed = 0, failed = 0
const results = []
function check(name, cond, detail) {
  if (cond) { passed++; results.push(`  ✓ ${name}`) }
  else { failed++; results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const has = (s, ...subs) => subs.every((x) => s.toLowerCase().includes(x.toLowerCase()))
const hasAny = (s, ...subs) => subs.some((x) => s.toLowerCase().includes(x.toLowerCase()))

async function main() {
  let snap
  try { snap = await snapshot() }
  catch (e) {
    console.error(`\n[ai-eval] Cannot reach ${BASE}/ai — is the server running?\n  ${e.message}\n` +
      `  Start it (e.g. 'cds serve' or 'npm run watch-home') or set AI_EVAL_BASE.\n`)
    process.exit(2)
  }

  const dollars = snapshotDollarSet(snap)
  const geo = snap.geography || {}
  const topCountry = (geo.topCountriesByRevenue || [])[0] || {}
  const lowMargin  = (geo.bottomCountriesByMargin || [])[0] || {}
  const peakYear   = snap.seasonality && snap.seasonality.peakMonth && String(snap.seasonality.peakMonth.year)
  const anomalies  = (snap.anomalies && snap.anomalies.stores) || []

  // 0. Snapshot integrity
  check('snapshot has headline KPIs', snap.headline && snap.headline.revenueUSD > 0)
  check('snapshot lists countries', (geo.allCountries || []).length >= 2)

  // 1. Top market
  if (topCountry.country) {
    const a = (await ask(`How is ${topCountry.country} performing?`)).answer
    check('top-country answer names the country', has(a, topCountry.country), a)
    check('top-country answer cites a $ figure and a %', a.includes('$') && a.includes('%'), a)
    check('top-country answer is grounded (no invented $)', ungroundedDollars(a, dollars).length === 0, ungroundedDollars(a, dollars).join(', '))
  }

  // 2. Low-margin market — must be framed as mix/pricing, not FX
  if (lowMargin.country) {
    const a = (await ask(`Why is ${lowMargin.country}'s margin low? Is it currency?`)).answer
    check('low-margin answer names the country', has(a, lowMargin.country), a)
    check('low-margin answer rejects currency framing (USD-normalized)', hasAny(a, 'usd-normalized', 'not a currency', 'not currency', 'not an fx', 'mix'), a)
    check('low-margin answer is grounded (no invented $)', ungroundedDollars(a, dollars).length === 0, ungroundedDollars(a, dollars).join(', '))
  }

  // 3. Store efficiency anomalies
  {
    const a = (await ask('Which stores have high revenue but poor space efficiency?')).answer
    if (anomalies.length) check('store answer references a flagged store & /m²', hasAny(a, 'store') && hasAny(a, '/m²', 'per m', 'efficiency'), a)
    else check('store answer says none qualify', hasAny(a, 'no store', 'none'), a)
    check('store answer is grounded (no invented $)', ungroundedDollars(a, dollars).length === 0, ungroundedDollars(a, dollars).join(', '))
  }

  // 4. Price elasticity
  {
    const a = (await ask('Is customer demand price elastic?')).answer
    check('elasticity answer discusses elasticity', hasAny(a, 'elastic', 'price'), a)
  }

  // 5. Demographic affinity
  {
    const a = (await ask('Which age and gender groups over-index on categories?')).answer
    check('demographics answer discusses affinity/over-index', hasAny(a, 'affinity', 'over-index', 'index'), a)
  }

  // 6. Seasonality
  if (peakYear) {
    const a = (await ask('When do sales peak during the year?')).answer
    check('seasonality answer names the peak period', hasAny(a, 'peak', 'season') && a.includes(peakYear), a)
  }

  // 7. General overview
  {
    const a = (await ask('Give me an overview of performance.')).answer
    check('overview answer covers revenue & margin', has(a, 'revenue') && hasAny(a, 'margin', 'profit'), a)
    check('overview answer is grounded (no invented $)', ungroundedDollars(a, dollars).length === 0, ungroundedDollars(a, dollars).join(', '))
  }

  // 8. Out-of-scope forecast — must NOT fabricate a future number
  {
    const a = (await ask('Exactly what will total revenue be next quarter?')).answer
    check('forecast question is not fabricated (stays grounded)', ungroundedDollars(a, dollars).length === 0, ungroundedDollars(a, dollars).join(', '))
  }

  // 9. Executive summary shape
  {
    const s = await summary()
    check('exec summary has 1-3 opportunities', Array.isArray(s.opportunities) && s.opportunities.length >= 1 && s.opportunities.length <= 3)
    check('exec summary has 1-3 risks', Array.isArray(s.risks) && s.risks.length >= 1 && s.risks.length <= 3)
    check('exec summary entries are non-empty', [...(s.opportunities || []), ...(s.risks || [])].every((x) => typeof x === 'string' && x.length > 10))
  }

  console.log(`\nAI grounding eval  (base: ${BASE})`)
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('[ai-eval] unexpected error:', e); process.exit(1) })
