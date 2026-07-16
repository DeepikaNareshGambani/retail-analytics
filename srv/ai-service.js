const cds = require('@sap/cds')
const llm = require('./lib/llm')
const { executiveSummary, explainFallback, reportNarrativeFallback } = require('./lib/ai-fallback')
const { BOT_SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT } = require('./lib/prompts')

/**
 * Task 4 — AIService implementation (/ai).
 *
 * getKPISnapshot() assembles one compact, USD-normalized JSON context from the
 * existing analytical views (Task 1) and the materialized association stats
 * (Task 3). It is deterministic (no AI) and is the single source of truth every
 * AI feature is grounded in. Anomaly detection (high revenue, poor revenue/m²)
 * is plain code, not AI.
 *
 * explainKPI() and the report narrative call the LLM (srv/lib/llm.js), and fall
 * back to deterministic grounded text (srv/lib/ai-fallback.js) when no LLM is
 * configured — so the features work locally and against RPT-1 once deployed.
 */

// The bot/report system prompts live in ./lib/prompts.js (single source of
// truth, easy to review — prompt engineering is graded).

module.exports = cds.service.impl(async function () {
  // Populate the dashboard + insights tables lazily on first read of either.
  // Doing it here (rather than in a 'served' hook) guarantees the Task 3 stat
  // tables are already populated, so the snapshot — and thus the summary — is
  // complete.
  let insightsReady = false
  const ensure = async () => { if (insightsReady) return; await populateInsights(); insightsReady = true }
  this.before('READ', 'AIDashboards', ensure)
  this.before('READ', 'ExecutiveInsights', ensure)

  this.on('getKPISnapshot',      async () => JSON.stringify(await buildSnapshot()))
  this.on('getExecutiveSummary', async () => JSON.stringify(await buildExecutiveSummary()))
  this.on('explainKPI',          async (req) => JSON.stringify(await explain(req.data.question)))
  // Full report payload (snapshot + summary + AI narrative) for the PDF route
  // in srv/server.js.
  this.on('generateGlobalReview', async () => {
    const snapshot = await buildSnapshot()
    const summary  = executiveSummary(snapshot)
    const { narrative, provider } = await reportNarrative(snapshot, summary)
    return JSON.stringify({ snapshot, summary, narrative, provider })
  })
})

// AI/RPT-1 executive narrative for the report (LLM, else deterministic prose).
async function reportNarrative(snapshot, summary) {
  const user = `KPI SNAPSHOT (JSON):\n${JSON.stringify(snapshot)}\n\nEXECUTIVE SUMMARY (JSON):\n${JSON.stringify(summary)}\n\nWrite the Annual Global Sales Review executive narrative.`
  const { text, provider } = await llm.chat({ system: REPORT_SYSTEM_PROMPT, user, maxTokens: 700 })
  return {
    narrative : text || reportNarrativeFallback(snapshot, summary),
    provider  : text ? `RPT-1 / ${provider}` : 'deterministic fallback (no LLM configured)',
  }
}

// ---- Explanation Bot -------------------------------------------------------
async function explain(question) {
  const q = (question || '').trim()
  if (!q) return { answer: 'Please ask a question about the sales data.', provider: 'none' }

  const snapshot = await buildSnapshot()
  const user = `KPI SNAPSHOT (JSON):\n${JSON.stringify(snapshot)}\n\nMANAGER'S QUESTION: ${q}`
  const { text, provider } = await llm.chat({ system: BOT_SYSTEM_PROMPT, user, maxTokens: 500 })

  return {
    answer   : text || explainFallback(q, snapshot),
    provider : text ? provider : 'fallback (deterministic, grounded in snapshot — configure an LLM for richer answers)',
  }
}

// ---- Executive summary (top 3 opportunities / risks) -----------------------
async function buildExecutiveSummary() {
  const snapshot = await buildSnapshot()
  return { ...executiveSummary(snapshot), provider: 'deterministic (grounded in snapshot)' }
}

// Materialize the dashboard KPIs + executive summary into their tables.
async function populateInsights() {
  const { AIDashboard, ExecutiveInsight } = cds.entities('retail.analytics.aiinsights')
  const snapshot = await buildSnapshot()
  const { opportunities, risks } = executiveSummary(snapshot)
  const hd = snapshot.headline || {}
  const topMarket = (snapshot.geography && snapshot.geography.allCountries && snapshot.geography.allCountries[0] || {}).country

  const rows = [
    ...opportunities.map((insight, i) => ({ ID: i + 1,       dash: 1, category: 'Opportunity', rank: i + 1, insight, criticality: 3 })),
    ...risks.map((insight, i)         => ({ ID: 100 + i + 1, dash: 1, category: 'Risk',        rank: i + 1, insight, criticality: 1 })),
  ]

  await DELETE.from(ExecutiveInsight)
  await DELETE.from(AIDashboard)
  if (rows.length) await INSERT.into(ExecutiveInsight).entries(rows)
  await INSERT.into(AIDashboard).entries([{
    ID: 1,
    title: 'Global Electronics — Sales Health',
    topMarket,
    revenueUSD: hd.revenueUSD, profitUSD: hd.profitUSD, marginPercent: hd.marginPercent,
    totalOrders: hd.totalOrders, totalUnits: hd.totalUnits,
  }])
  cds.log('ai').info(`materialized dashboard + ${opportunities.length} opportunities + ${risks.length} risks`)
}

// Task 1 analytical views
const OVERALL   = 'retail.analytics.dashboard.OverallPerformance'
const BY_COUNTRY = 'retail.analytics.dashboard.RevenueByCountry'
const BY_CATEGORY = 'retail.analytics.dashboard.RevenueByCategory'
const BY_MONTH  = 'retail.analytics.dashboard.MonthlySalesTrend'
const STORES    = 'retail.analytics.dashboard.StorePerformance'
// Task 3 materialized stats
const DEMOGRAPHIC = 'retail.analytics.assocstats.DemographicAffinityStats'
const ELASTICITY  = 'retail.analytics.assocstats.PriceElasticityStats'
const CORRELATION = 'retail.analytics.assocstats.StoreSizeCorrelationStats'

async function buildSnapshot() {
  const [overall, countries, categories, months, stores, demographics, elasticity, correlation] =
    await Promise.all([
      SELECT.one.from(OVERALL),
      SELECT.from(BY_COUNTRY),
      SELECT.from(BY_CATEGORY),
      SELECT.from(BY_MONTH),
      SELECT.from(STORES),
      SELECT.from(DEMOGRAPHIC),
      SELECT.from(ELASTICITY),
      SELECT.one.from(CORRELATION),
    ])

  return {
    generatedAt : new Date().toISOString(),
    currency    : 'USD',
    note        : 'All monetary values are USD-normalized. marginPercent = profit/revenue.',

    headline : overall ? {
      revenueUSD    : r2(overall.revenueUSD),
      profitUSD     : r2(overall.profitUSD),
      marginPercent : r2(overall.marginPercent),
      totalOrders   : overall.orderCount,
      totalUnits    : overall.totalQuantity,
    } : null,

    geography : {
      // Full country list (small — 8 markets) so the bot can answer about ANY
      // country, not just the extremes.
      allCountries : [...countries].sort((a, b) => num(b.revenueUSD) - num(a.revenueUSD)).map(pickCountry),
      topCountriesByRevenue : top(countries, 'revenueUSD', 5).map(pickCountry),
      bottomCountriesByMargin : bottom(countries.filter((c) => num(c.revenueUSD) > 0), 'marginPercent', 3).map(pickCountry),
      byContinent : byContinent(countries),
    },

    categories : top(categories, 'revenueUSD', 6).map((c) => ({
      category      : c.category,
      revenueUSD    : r2(c.revenueUSD),
      marginPercent : r2(c.marginPercent),
      units         : c.totalQuantity,
    })),

    seasonality : seasonality(months),

    // Anomaly (deterministic): stores in the TOP quartile of total revenue but
    // the BOTTOM quartile of revenue-per-m² — high sales, poor space efficiency.
    anomalies : {
      description : 'Stores with high total revenue but poor revenue-per-square-meter efficiency.',
      stores      : revenueEfficiencyAnomalies(stores),
    },

    // Task 3 — association findings
    associations : {
      demographicAffinity : {
        note : 'AffinityIndex > 100 = this age/gender segment over-indexes on this category vs the overall population.',
        topOverIndexed : top(
          demographics.filter((d) => d.Gender !== 'Unknown' && d.AgeBucket !== 'Unknown' && num(d.LineCount) >= 50),
          'AffinityIndex', 6,
        ).map((d) => ({
          ageGroup : d.AgeBucket, gender : d.Gender, category : d.Category,
          affinityIndex : r2(d.AffinityIndex), segmentSharePct : r2(d.CategorySharePct),
        })),
      },
      storeSizeVsRevenue : correlation ? {
        pearsonR        : r4(correlation.PearsonR),
        rSquared        : r4(correlation.RSquared),
        sampleSize      : correlation.SampleSize,
        assumptionHolds : correlation.AssumptionHolds,
        interpretation  : correlation.Interpretation,
      } : null,
      priceElasticity : {
        note    : 'Elasticity = slope of ln(units) on ln(price) across price bands per subcategory. |e|>=1 elastic.',
        summary : elasticitySummary(elasticity),
        mostElastic : top(
          elasticity.filter((e) => e.ElasticityCoefficient != null),
          'RSquared', 5,
        ).map((e) => ({
          subcategory : e.Subcategory, elasticity : r3(e.ElasticityCoefficient),
          rSquared : r3(e.RSquared), interpretation : e.Interpretation,
        })),
      },
    },
  }
}

// ===========================================================================
// derivations
// ===========================================================================
function revenueEfficiencyAnomalies(stores) {
  const physical = stores.filter((s) => s.storeKey !== 0 && num(s.revenuePerSqm) > 0)
  if (physical.length < 4) return []
  const n = physical.length

  // Percentile rank (0..1) of each store on revenue and on revenue/m².
  const revRank = rankMap(physical, (s) => num(s.revenueUSD))
  const effRank = rankMap(physical, (s) => num(s.revenuePerSqm))

  // Anomaly = high revenue rank but a comparatively LOW efficiency rank.
  // gap = revenueRank - efficiencyRank; large positive gap => high sales, poor
  // space efficiency. Only consider genuinely high-revenue stores (>= median).
  return physical
    .map((s) => ({ s, gap: revRank.get(s.storeKey) - effRank.get(s.storeKey), rev: revRank.get(s.storeKey), eff: effRank.get(s.storeKey) }))
    .filter((x) => x.rev >= 0.5 && x.gap >= 0.25)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .map(({ s, rev, eff }) => ({
      storeKey : s.storeKey, country : s.country, state : s.state,
      squareMeters : r2(s.squareMeters), revenueUSD : r2(s.revenueUSD),
      revenuePerSqm : r2(s.revenuePerSqm),
      revenuePercentile : Math.round(rev * 100), efficiencyPercentile : Math.round(eff * 100),
    }))
}

// Map each store's value to its percentile rank in [0,1] (0 = lowest).
function rankMap(rows, valueFn) {
  const sorted = [...rows].sort((a, b) => valueFn(a) - valueFn(b))
  const m = new Map()
  sorted.forEach((s, i) => m.set(s.storeKey, sorted.length > 1 ? i / (sorted.length - 1) : 1))
  return m
}

function byContinent(countries) {
  const m = new Map()
  for (const c of countries) {
    const k = c.continent || 'Unknown'
    m.set(k, (m.get(k) || 0) + num(c.revenueUSD))
  }
  return [...m.entries()]
    .map(([continent, revenueUSD]) => ({ continent, revenueUSD: r2(revenueUSD) }))
    .sort((a, b) => b.revenueUSD - a.revenueUSD)
}

function seasonality(months) {
  if (!months.length) return null
  const withRev = months.map((m) => ({ ...m, rev: num(m.revenueUSD) }))
  const peak = withRev.reduce((a, b) => (b.rev > a.rev ? b : a))
  const low  = withRev.reduce((a, b) => (b.rev < a.rev ? b : a))
  return {
    peakMonth   : { year: peak.salesYear, month: peak.salesMonth, revenueUSD: r2(peak.rev) },
    lowestMonth : { year: low.salesYear, month: low.salesMonth, revenueUSD: r2(low.rev) },
    monthsCovered : months.length,
  }
}

function elasticitySummary(elasticity) {
  const scored = elasticity.filter((e) => e.ElasticityCoefficient != null)
  const elastic = scored.filter((e) => e.Interpretation === 'Elastic').length
  return `${scored.length} subcategories analyzed: ${elastic} elastic, ${scored.length - elastic} inelastic. ` +
    (elastic === 0 ? 'Demand is broadly price-inelastic — volume is driven by product need/features more than price.' : '')
}

// ===========================================================================
// helpers
// ===========================================================================
function pickCountry(c) {
  return { country: c.country, continent: c.continent, revenueUSD: r2(c.revenueUSD), marginPercent: r2(c.marginPercent) }
}
function top(rows, key, n)    { return [...rows].sort((a, b) => num(b[key]) - num(a[key])).slice(0, n) }
function bottom(rows, key, n) { return [...rows].sort((a, b) => num(a[key]) - num(b[key])).slice(0, n) }
function quantile(values, q) {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return 0
  const pos = (a.length - 1) * q
  const base = Math.floor(pos)
  return a[base + 1] !== undefined ? a[base] + (pos - base) * (a[base + 1] - a[base]) : a[base]
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function r2(n) { return n == null ? null : Math.round(num(n) * 100) / 100 }
function r3(n) { return n == null ? null : Math.round(num(n) * 1000) / 1000 }
function r4(n) { return n == null ? null : Math.round(num(n) * 10000) / 10000 }
