const cds = require('@sap/cds')

/**
 * Task 2 — InsightsService implementation (/insights).
 *
 * The four analytical collections are computed here from the line-grain
 * insights.InsightsFacts view (which already carries the Task 1 USD measures).
 * Everything that needs cross-row statistics lives in JS because it cannot be a
 * per-row CDS column:
 *   - Customer Segmentation : RFM quintile scoring  -> VIP / Regular / At Risk
 *   - Product Performance   : median split          -> Star / Margin Driven / Volume Driven / Laggard
 *   - Store Efficiency      : percentile ranking     -> Flagship / Standard / Underperforming / Online Channel
 *
 * Two slider knobs and the smart-filter values arrive as custom OData query
 * options (see insights-service.cds). The continent/country filter is pushed to
 * the DB; the age filter is applied in JS because AgeCategory is derived from
 * `birthday` and is not a stored column.
 */

// ---- tunables (documented assumptions; the real "business design" was not
//      attached, so these are sensible, easily-changed defaults) -------------
const VIP_THRESHOLD_DEFAULT = 12       // VIP score slider default; range 8..14
const FLAGSHIP_PCT_DEFAULT  = 20       // Flagship percentile slider default; range 5..50
const AT_RISK_MAX_SCORE     = 6        // VIPScore < 7  => "At Risk" (fixed band)
const SENIOR_MIN_AGE        = 50       // age >= 50 => Senior, else Youth (binary, per the 2-value filter)

module.exports = cds.service.impl(async function () {

  this.on('READ', 'CustomerSegmentation', async (req) => {
    const rows = await loadFacts(req)
    return computeCustomers(rows, vipThreshold(req)).list
  })

  this.on('READ', 'ProductPerformance', async (req) => {
    const rows = await loadFacts(req)
    return computeProducts(rows).list
  })

  this.on('READ', 'StoreEfficiency', async (req) => {
    const rows = await loadFacts(req)
    return computeStores(rows, flagshipPercentile(req)).list
  })

  this.on('READ', 'OrderLines', async (req) => {
    const rows = await loadFacts(req)
    const customers = computeCustomers(rows, vipThreshold(req)).byKey
    const products  = computeProducts(rows).byKey
    const stores    = computeStores(rows, flagshipPercentile(req)).byKey

    const top = clamp(int(opts(req).top, 1000), 1, 20000)
    const enriched = rows.map((r) => ({
      OrderNumber     : r.orderNumber,
      LineItem        : r.lineItem,
      CustomerKey     : r.customerKey,
      ProductKey      : r.productKey,
      StoreKey        : r.storeKey,
      Continent       : r.continent,
      CustomerSegment : customers.get(r.customerKey)?.CustomerSegment ?? 'Regular',
      ProductName     : r.productName,
      ProductQuadrant : products.get(r.productKey)?.ProductQuadrant ?? 'Laggard',
      StoreTier       : stores.get(r.storeKey)?.StoreTier ?? 'Standard',
      GrossRevenueUSD : round2(num(r.revenueUSD)),
    }))
    enriched.sort((a, b) => b.GrossRevenueUSD - a.GrossRevenueUSD)
    return enriched.slice(0, top)
  })
})

// ===========================================================================
// Fact loading + filters
// ===========================================================================
async function loadFacts(req) {
  const q = opts(req)
  let sel = SELECT.from('retail.analytics.insights.InsightsFacts')

  const where = {}
  if (q.continent) where.continent = q.continent
  if (q.country)   where.country   = q.country
  if (Object.keys(where).length) sel = sel.where(where)

  let rows = await sel
  if (q.ageCategory) rows = rows.filter((r) => ageCategory(r.birthday) === q.ageCategory)
  return rows
}

// ===========================================================================
// 1. Customer Segmentation — RFM quintile scoring
// ===========================================================================
function computeCustomers(rows, vipThresholdValue) {
  const byKey = new Map()
  let maxOrderTime = 0

  for (const r of rows) {
    const t = dateMs(r.orderDate)
    if (t > maxOrderTime) maxOrderTime = t

    let c = byKey.get(r.customerKey)
    if (!c) {
      c = {
        CustomerKey : r.customerKey,
        CustomerName: r.customerName,
        Continent   : r.continent,
        Country     : r.country,
        AgeCategory : ageCategory(r.birthday),
        TotalSpendUSD: 0,
        _orders     : new Set(),
        _lastOrder  : 0,
      }
      byKey.set(r.customerKey, c)
    }
    c.TotalSpendUSD += num(r.revenueUSD)
    c._orders.add(r.orderNumber)
    if (t > c._lastOrder) c._lastOrder = t
  }

  const list = [...byKey.values()]
  const refTime = maxOrderTime || Date.now() // recency anchor = most recent order in the (filtered) data
  for (const c of list) {
    c.TotalSpendUSD = round2(c.TotalSpendUSD)
    c.OrderCount = c._orders.size
    c.DaysSinceLastOrder = Math.round((refTime - c._lastOrder) / 86400000)
  }

  // Quintile (1..5) scores. Recency: fewer days is better (higherIsBetter = false).
  quintile(list, (c) => c.DaysSinceLastOrder, false, (c, s) => (c.RecencyScore = s))
  quintile(list, (c) => c.OrderCount,         true,  (c, s) => (c.FrequencyScore = s))
  quintile(list, (c) => c.TotalSpendUSD,      true,  (c, s) => (c.MonetaryScore = s))

  for (const c of list) {
    c.VIPScore = c.RecencyScore + c.FrequencyScore + c.MonetaryScore // 3..15
    c.CustomerSegment =
      c.VIPScore >= vipThresholdValue ? 'VIP'
      : c.VIPScore <= AT_RISK_MAX_SCORE ? 'At Risk'
      : 'Regular'
    delete c._orders; delete c._lastOrder
  }
  return { list, byKey }
}

// ===========================================================================
// 2. Product Performance — median split into four quadrants
// ===========================================================================
function computeProducts(rows) {
  const byKey = new Map()
  for (const r of rows) {
    let p = byKey.get(r.productKey)
    if (!p) {
      p = { ProductKey: r.productKey, ProductName: r.productName, _rev: 0, _cost: 0, _qty: 0 }
      byKey.set(r.productKey, p)
    }
    p._rev  += num(r.revenueUSD)
    p._cost += num(r.costUSD)
    p._qty  += num(r.quantity)
  }

  const list = [...byKey.values()]
  for (const p of list) {
    p.TotalRevenueUSD   = round2(p._rev)
    p.TotalQuantitySold = p._qty
    p.MarginPercent     = p._rev > 0 ? round2(((p._rev - p._cost) / p._rev) * 100) : 0
  }

  const medMargin = round2(median(list.map((p) => p.MarginPercent)))
  const medQty    = Math.round(median(list.map((p) => p.TotalQuantitySold)))
  for (const p of list) {
    const hiMargin = p.MarginPercent >= medMargin
    const hiVol    = p.TotalQuantitySold >= medQty
    p.ProductQuadrant =
      hiMargin && hiVol  ? 'Star'
      : hiMargin && !hiVol ? 'Margin Driven'
      : !hiMargin && hiVol ? 'Volume Driven'
      : 'Laggard'
    p.MedianMargin   = medMargin   // denormalised so the scatter can draw cross-lines
    p.MedianQuantity = medQty
    delete p._rev; delete p._cost; delete p._qty
  }
  return { list, byKey }
}

// ===========================================================================
// 3. Store Efficiency — percentile tiering (Online channel handled separately)
// ===========================================================================
function computeStores(rows, flagshipPct) {
  const byKey = new Map()
  for (const r of rows) {
    let s = byKey.get(r.storeKey)
    if (!s) {
      s = {
        StoreKey    : r.storeKey,
        SquareMeters: r.squareMeters != null ? num(r.squareMeters) : null,
        _state      : r.storeState,
        _country    : r.storeCountry,
        _rev        : 0,
      }
      byKey.set(r.storeKey, s)
    }
    s._rev += num(r.revenueUSD)
  }

  const list = [...byKey.values()]
  for (const s of list) {
    s.TotalRevenueUSD = round2(s._rev)
    s.StoreName = s.StoreKey === 0
      ? 'Online Channel'
      : `Store ${s.StoreKey} – ${s._state}, ${s._country}`
    s.RevenuePerSquareMeter = (s.StoreKey !== 0 && s.SquareMeters > 0)
      ? round2(s._rev / s.SquareMeters)
      : null
  }

  // Rank ONLY physical stores with a usable footprint (exclude StoreKey 0 Online).
  const ranked = list.filter((s) => s.StoreKey !== 0 && s.RevenuePerSquareMeter != null)
  const sorted = [...ranked].sort((a, b) => a.RevenuePerSquareMeter - b.RevenuePerSquareMeter)
  const n = sorted.length
  sorted.forEach((s, i) => { s.PercentileRank = round2(((i + 1) / n) * 100) })

  const flagshipFrom = 100 - flagshipPct // top flagshipPct% are Flagship
  for (const s of list) {
    if (s.StoreKey === 0) {
      s.StoreTier = 'Online Channel'
      s.PercentileRank = null
    } else if (s.RevenuePerSquareMeter == null) {
      s.StoreTier = 'Standard'              // physical store with no footprint -> unranked
      s.PercentileRank = null
    } else if (s.PercentileRank >= flagshipFrom) {
      s.StoreTier = 'Flagship'
    } else if (s.PercentileRank <= flagshipPct) {
      s.StoreTier = 'Underperforming'
    } else {
      s.StoreTier = 'Standard'
    }
    delete s._rev; delete s._state; delete s._country
  }
  return { list, byKey }
}

// ===========================================================================
// helpers
// ===========================================================================
function quintile(list, valueFn, higherIsBetter, assign) {
  const n = list.length
  if (!n) return
  const order = [...list].sort((a, b) => valueFn(a) - valueFn(b))
  order.forEach((it, i) => {
    let bucket = Math.floor((i / n) * 5) + 1 // 1..5 ascending (lowest value = 1)
    if (bucket > 5) bucket = 5
    assign(it, higherIsBetter ? bucket : 6 - bucket)
  })
}

function median(values) {
  if (!values.length) return 0
  const a = [...values].map(Number).sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

function ageCategory(birthday) {
  return age(birthday) >= SENIOR_MIN_AGE ? 'Senior' : 'Youth'
}
function age(birthday) {
  if (!birthday) return 0
  const b = new Date(birthday)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a
}

function dateMs(d) { return d ? new Date(d).getTime() : 0 }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

function opts(req) {
  return (req.http && req.http.req && req.http.req.query)
      || (req._ && req._.req && req._.req.query)
      || (req.req && req.req.query)
      || {}
}
function vipThreshold(req) { return clamp(int(opts(req).vipThreshold, VIP_THRESHOLD_DEFAULT), 8, 14) }
function flagshipPercentile(req) { return clamp(int(opts(req).flagshipPercentile, FLAGSHIP_PCT_DEFAULT), 5, 50) }
