const cds = require('@sap/cds')

/**
 * Task 3 — AssociationService implementation (/association).
 *
 * The three analyses need cross-row statistics that cannot be SQL aggregates:
 *   - DemographicAffinity : age bucket x gender x category, with an affinity index
 *   - PriceElasticity     : log-log regression of quantity on price per subcategory
 *   - StoreSize<->Revenue : per-store rows + Pearson correlation verdict
 *
 * They are computed in JS from line-grain facts and MATERIALIZED into real tables
 * (db/association-stats.cds) once at startup by populate() below, so Fiori
 * Elements can chart + tabulate them from one aggregatable entity per analysis.
 *
 * Demographic + elasticity run on association.AssociationFacts (line grain).
 * Store rows/correlation reuse Task 1's dashboard.StorePerformance aggregate so
 * per-store revenue is identical to Task 1.
 */

const FACTS  = 'retail.analytics.association.AssociationFacts'
const STORES = 'retail.analytics.dashboard.StorePerformance'

// Age buckets (years). Birthday missing -> 'Unknown'.
const SENIOR = 60, MIDLIFE = 45, ADULT = 30

module.exports = cds.service.impl(async function () {
  // Populate the materialized stat tables once the DB (with CSV data) is ready.
  // Runs for SQLite (in-memory, every start) and HANA (on app start, filling the
  // deployed HDI tables). Idempotent: clears then re-inserts.
  cds.once('served', async () => {
    try {
      await populate()
    } catch (e) {
      console.error('[association] stat table population failed:', e)
    }
  })
})

async function populate() {
  const { DemographicAffinityStats, PriceElasticityStats, StoreSizeStats, StoreSizeCorrelationStats } =
    cds.entities('retail.analytics.assocstats')

  const facts  = await SELECT.from(FACTS)
  const stores = await SELECT.from(STORES)

  const demographics = computeDemographics(facts)
  const elasticity   = computeElasticity(facts)
  const storeRows    = buildStoreStats(stores)
  const correlation  = storeCorrelation(
    stores
      .filter((s) => s.storeKey !== 0 && num(s.squareMeters) > 0)
      .map((s) => ({ x: num(s.squareMeters), y: num(s.revenueUSD) }))
  )

  await DELETE.from(DemographicAffinityStats)
  await DELETE.from(PriceElasticityStats)
  await DELETE.from(StoreSizeStats)
  await DELETE.from(StoreSizeCorrelationStats)

  if (demographics.length) await INSERT.into(DemographicAffinityStats).entries(demographics)
  if (elasticity.length)   await INSERT.into(PriceElasticityStats).entries(elasticity)
  if (storeRows.length)    await INSERT.into(StoreSizeStats).entries(storeRows)
  await INSERT.into(StoreSizeCorrelationStats).entries([correlation])

  console.log(`[association] materialized stats: ${demographics.length} demographic, ` +
    `${elasticity.length} elasticity, ${storeRows.length} stores, 1 correlation`)
}

// Store size band from floor area (numeric thresholds -> portable, HANA-safe).
function sizeBand(sqm) {
  if (sqm == null)  return 'Online'
  if (sqm < 1000)   return '< 1,000 m²'
  if (sqm < 1500)   return '1,000-1,499 m²'
  if (sqm < 2000)   return '1,500-1,999 m²'
  return '2,000+ m²'
}

function buildStoreStats(stores) {
  return stores
    .filter((s) => s.storeKey !== 0 && num(s.squareMeters) > 0)
    .map((s) => ({
      StoreKey       : s.storeKey,
      StoreLabel     : `Store ${s.storeKey} - ${s.state ?? ''}, ${s.country ?? ''}`.replace(' - ,', ''),
      SquareMeters   : round2(num(s.squareMeters)),
      SizeBand       : sizeBand(num(s.squareMeters)),
      TotalRevenueUSD: round2(num(s.revenueUSD)),
      RevenuePerSqm  : s.revenuePerSqm != null ? round2(num(s.revenuePerSqm)) : null,
    }))
    .sort((a, b) => a.SquareMeters - b.SquareMeters)
}

// ===========================================================================
// 3a. Demographic Affinity
// ===========================================================================
function computeDemographics(rows) {
  const seg      = new Map()   // `${bucket}|${gender}|${category}` -> row
  const segTotal = new Map()   // `${bucket}|${gender}`            -> revenue
  const catTotal = new Map()   // category                         -> revenue
  let grandTotal = 0

  for (const r of rows) {
    const bucket = ageBucket(r.birthday)
    const gender = normGender(r.gender)
    const cat    = r.category || 'Unknown'
    const rev    = num(r.revenueUSD)
    const qty    = num(r.quantity)

    const segKey = `${bucket}|${gender}`
    const k = `${segKey}|${cat}`
    let a = seg.get(k)
    if (!a) {
      a = { AgeBucket: bucket, Gender: gender, Category: cat, RevenueUSD: 0, Quantity: 0, LineCount: 0 }
      seg.set(k, a)
    }
    a.RevenueUSD += rev
    a.Quantity   += qty
    a.LineCount  += 1

    segTotal.set(segKey, (segTotal.get(segKey) || 0) + rev)
    catTotal.set(cat, (catTotal.get(cat) || 0) + rev)
    grandTotal += rev
  }

  const list = [...seg.values()]
  for (const a of list) {
    const segRev          = segTotal.get(`${a.AgeBucket}|${a.Gender}`) || 0
    const segCatShare     = segRev > 0 ? a.RevenueUSD / segRev : 0
    const overallCatShare = grandTotal > 0 ? (catTotal.get(a.Category) || 0) / grandTotal : 0
    a.CategorySharePct = round2(segCatShare * 100)
    a.AffinityIndex    = overallCatShare > 0 ? round2((segCatShare / overallCatShare) * 100) : 0
    a.RevenueUSD       = round2(a.RevenueUSD)
    // UI criticality: 3 = over-indexed (>=110), 1 = under-indexed (<=90), else neutral
    a.AffinityCriticality = a.AffinityIndex >= 110 ? 3 : a.AffinityIndex <= 90 ? 1 : 0
  }

  list.sort((a, b) =>
    a.AgeBucket.localeCompare(b.AgeBucket) ||
    a.Gender.localeCompare(b.Gender) ||
    b.RevenueUSD - a.RevenueUSD)
  return list
}

// ===========================================================================
// 3b. Price Elasticity — log-log regression across price BANDS per subcategory
// ===========================================================================
// Method: within a subcategory, bin products into equal-count price bands
// (quartiles). Each band contributes one (avg price, avg units per product)
// point. Elasticity = slope of ln(avg qty) on ln(avg price) across the bands —
// i.e. %Δquantity / %Δprice. Binding to bands removes the per-product noise that
// makes the raw product-level scatter look flat, revealing the demand curve.
const ELAST_BANDS       = 4   // quartile price bands
const ELAST_MIN_PRODUCTS = 8  // need enough products to form meaningful bands

function computeElasticity(rows) {
  // Aggregate to product grain first (list price is constant per product).
  const prod = new Map()
  for (const r of rows) {
    let p = prod.get(r.productKey)
    if (!p) {
      p = { subcategory: r.subcategory || 'Unknown', category: r.category || 'Unknown', price: num(r.unitPriceUSD), qty: 0 }
      prod.set(r.productKey, p)
    }
    p.qty += num(r.quantity)
  }

  // Group products by subcategory.
  const sub = new Map()
  for (const p of prod.values()) {
    let s = sub.get(p.subcategory)
    if (!s) {
      s = { Subcategory: p.subcategory, Category: p.category, products: [], sumPrice: 0, sumQty: 0 }
      sub.set(p.subcategory, s)
    }
    s.products.push({ price: p.price, qty: p.qty })
    s.sumPrice += p.price
    s.sumQty   += p.qty
  }

  const list = []
  for (const s of sub.values()) {
    const nProd = s.products.length
    let coef = null, r2 = null, interp = 'Insufficient data'

    const valid = s.products
      .filter((p) => p.price > 0 && p.qty > 0)
      .sort((a, b) => a.price - b.price)

    if (valid.length >= ELAST_MIN_PRODUCTS) {
      const bands = priceBands(valid, ELAST_BANDS)
      const pts = bands
        .filter((b) => b.avgPrice > 0 && b.avgQty > 0)
        .map((b) => ({ x: Math.log(b.avgPrice), y: Math.log(b.avgQty) }))
      if (pts.length >= 3) {
        const reg = linreg(pts)
        if (reg && Number.isFinite(reg.slope)) {
          coef   = round3(reg.slope)
          r2     = round3(reg.r2)
          interp = Math.abs(reg.slope) >= 1 ? 'Elastic' : 'Inelastic'
        }
      }
    }

    list.push({
      Subcategory          : s.Subcategory,
      Category             : s.Category,
      AvgUnitPriceUSD      : round2(s.sumPrice / nProd),
      TotalQuantity        : s.sumQty,
      ProductCount         : nProd,
      ElasticityCoefficient: coef,
      RSquared             : r2,
      Interpretation       : interp,
      // UI criticality: 3 = Elastic, 1 = Insufficient data, 0 = Inelastic
      ElasticityCriticality: interp === 'Elastic' ? 3 : interp === 'Insufficient data' ? 1 : 0,
    })
  }

  list.sort((a, b) => b.TotalQuantity - a.TotalQuantity)
  return list
}

// Split price-sorted products into k equal-count bands; return each band's
// mean price and mean units-per-product.
function priceBands(sorted, k) {
  const n = sorted.length
  const bands = []
  for (let i = 0; i < k; i++) {
    const lo = Math.floor((i * n) / k)
    const hi = Math.floor(((i + 1) * n) / k)
    if (hi <= lo) continue
    let sp = 0, sq = 0
    for (let j = lo; j < hi; j++) { sp += sorted[j].price; sq += sorted[j].qty }
    const cnt = hi - lo
    bands.push({ avgPrice: sp / cnt, avgQty: sq / cnt })
  }
  return bands
}

// ===========================================================================
// 3c. Store size <-> revenue correlation
// ===========================================================================
function storeCorrelation(points) {
  const n = points.length
  const reg = linreg(points)
  if (!reg || n < 2) {
    return {
      ID: 1, PearsonR: 0, RSquared: 0, Slope: 0, Intercept: 0, SampleSize: n,
      Strength: 'Negligible', Direction: 'Positive', AssumptionHolds: false,
      Interpretation: 'Insufficient data to assess the store-size / revenue relationship.',
    }
  }

  const r        = Math.sqrt(reg.r2) * (reg.slope >= 0 ? 1 : -1)
  const absR     = Math.abs(r)
  const strength = absR >= 0.7 ? 'Strong' : absR >= 0.4 ? 'Moderate' : absR >= 0.2 ? 'Weak' : 'Negligible'
  const direction = r >= 0 ? 'Positive' : 'Negative'
  // The assumption "bigger store => more revenue" only holds if the correlation
  // is at least a moderate POSITIVE one.
  const holds = r >= 0.4

  const interpretation = holds
    ? `A ${strength.toLowerCase()} positive correlation (r = ${round4(r)}, R² = ${round4(reg.r2)}, n = ${n}) between store floor area and total revenue: larger stores do tend to earn more, so the common assumption broadly holds in this data.`
    : `Only a ${strength.toLowerCase()} ${direction.toLowerCase()} correlation (r = ${round4(r)}, R² = ${round4(reg.r2)}, n = ${n}) between store floor area and total revenue. The commonly assumed "bigger store => more revenue" relationship does NOT hold: floor area explains just ${round1(reg.r2 * 100)}% of the variance in revenue, so revenue is driven mainly by factors other than size (location, footfall, assortment).`

  return {
    ID: 1,
    PearsonR       : round4(r),
    RSquared       : round4(reg.r2),
    Slope          : round4(reg.slope),
    Intercept      : round4(reg.intercept),
    SampleSize     : n,
    Strength       : strength,
    Direction      : direction,
    AssumptionHolds: holds,
    Interpretation : interpretation,
  }
}

// ===========================================================================
// stats + helpers
// ===========================================================================
// Ordinary least squares on {x, y} points -> slope, intercept, r^2.
function linreg(points) {
  const n = points.length
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (const p of points) {
    sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y
  }
  const denomX = n * sxx - sx * sx
  if (denomX === 0) return null            // no variance in x -> slope undefined
  const slope     = (n * sxy - sx * sy) / denomX
  const intercept = (sy - slope * sx) / n
  const denomY    = n * syy - sy * sy
  const r  = denomY > 0 ? (n * sxy - sx * sy) / Math.sqrt(denomX * denomY) : 0
  return { slope, intercept, r2: r * r }
}

function ageBucket(birthday) {
  const a = age(birthday)
  if (a == null) return 'Unknown'
  if (a >= SENIOR)  return '60+'
  if (a >= MIDLIFE) return '45-59'
  if (a >= ADULT)   return '30-44'
  return 'Under 30'
}
function age(birthday) {
  if (!birthday) return null
  const b = new Date(birthday)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a
}
function normGender(g) {
  if (!g) return 'Unknown'
  const s = String(g).trim().toLowerCase()
  if (s.startsWith('m')) return 'Male'
  if (s.startsWith('f')) return 'Female'
  return 'Unknown'
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function round1(n) { return Math.round(n * 10) / 10 }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
function round3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000 }
function round4(n) { return Math.round((n + Number.EPSILON) * 10000) / 10000 }
