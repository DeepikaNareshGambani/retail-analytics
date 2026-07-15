const cds = require('@sap/cds')

/**
 * Task 2 (Fiori Elements edition) — ClassificationService implementation.
 *
 * Materializes the three classifications into real tables so Fiori Elements can
 * aggregate ($apply charts) and count them. It REUSES the existing Task 2 logic
 * by reading InsightsService's computed entities (RFM / median-quadrant /
 * percentile-tier, at their default thresholds) — no classification code is
 * duplicated and the freestyle app's backend is not touched.
 *
 * Populated lazily on first read of any classification entity (by then the DB
 * and InsightsService are ready).
 */
module.exports = cds.service.impl(async function () {
  let ready = false
  const ensure = async () => { if (ready) return; await populate(); ready = true }
  this.before('READ', 'CustomerSegments', ensure)
  this.before('READ', 'ProductTiers', ensure)
  this.before('READ', 'StoreTiers', ensure)
})

async function populate() {
  const { CustomerSegment, ProductTier, StoreTier } = cds.entities('retail.analytics.classification')
  const insights = await cds.connect.to('InsightsService')

  const [customers, products, stores] = await Promise.all([
    insights.read('CustomerSegmentation'),
    insights.read('ProductPerformance'),
    insights.read('StoreEfficiency'),
  ])

  const segCrit  = (s) => s === 'VIP' ? 3 : s === 'At Risk' ? 1 : 0
  const quadCrit = (q) => q === 'Star' ? 3 : q === 'Laggard' ? 1 : 0
  const tierCrit = (t) => t === 'Flagship' ? 3 : t === 'Underperforming' ? 1 : 0

  const custRows = customers.map((c) => ({
    CustomerKey: c.CustomerKey, CustomerName: c.CustomerName, Continent: c.Continent, Country: c.Country,
    AgeCategory: c.AgeCategory, TotalSpendUSD: c.TotalSpendUSD, OrderCount: c.OrderCount,
    DaysSinceLastOrder: c.DaysSinceLastOrder, RecencyScore: c.RecencyScore, FrequencyScore: c.FrequencyScore,
    MonetaryScore: c.MonetaryScore, VIPScore: c.VIPScore,
    Segment: c.CustomerSegment, SegmentCriticality: segCrit(c.CustomerSegment),
  }))
  const prodRows = products.map((p) => ({
    ProductKey: p.ProductKey, ProductName: p.ProductName, TotalQuantitySold: p.TotalQuantitySold,
    TotalRevenueUSD: p.TotalRevenueUSD, MarginPercent: p.MarginPercent, MedianMargin: p.MedianMargin,
    MedianQuantity: p.MedianQuantity, Quadrant: p.ProductQuadrant, QuadrantCriticality: quadCrit(p.ProductQuadrant),
  }))
  const storeRows = stores.map((s) => ({
    StoreKey: s.StoreKey, StoreName: s.StoreName, SquareMeters: s.SquareMeters,
    TotalRevenueUSD: s.TotalRevenueUSD, RevenuePerSquareMeter: s.RevenuePerSquareMeter,
    PercentileRank: s.PercentileRank, Tier: s.StoreTier, TierCriticality: tierCrit(s.StoreTier),
  }))

  await DELETE.from(CustomerSegment)
  await DELETE.from(ProductTier)
  await DELETE.from(StoreTier)
  if (custRows.length)  await INSERT.into(CustomerSegment).entries(custRows)
  if (prodRows.length)  await INSERT.into(ProductTier).entries(prodRows)
  if (storeRows.length) await INSERT.into(StoreTier).entries(storeRows)

  cds.log('classification').info(
    `materialized ${custRows.length} customers, ${prodRows.length} products, ${storeRows.length} stores`)
}
