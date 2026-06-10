const cds = require('@sap/cds')

/**
 * Custom logic for AnalyticsService (defined in srv/service.cds, path /analytics).
 *
 * Enriches each Sales record with derived USD financials, computed via the
 * existing Sales -> product association (product.unitPriceUSD / unitCostUSD).
 * When the order is in a non-USD currency, also derives local-currency figures
 * using ExchangeRates, matched on (orderDate, currencyCode).
 */
module.exports = cds.service.impl(async function () {
  const { Sales, Products, ExchangeRates } = this.entities

  this.on('READ', Sales, async (req, next) => {
    // 1. Let CAP run the normal query (honors $filter/$top/$orderby/etc.)
    const result = await next()
    if (!result) return result

    const rows = Array.isArray(result) ? result : [result]
    if (rows.length === 0) return result

    // 2. Look up product price/cost for the products in this page of results
    const productKeys = [
      ...new Set(rows.map(r => r.product_ProductKey).filter(k => k != null)),
    ]
    const products = productKeys.length
      ? await SELECT.from(Products)
          .columns('ProductKey', 'unitPriceUSD', 'unitCostUSD')
          .where({ ProductKey: { in: productKeys } })
      : []
    const productByKey = new Map(products.map(p => [p.ProductKey, p]))

    // 3. Look up exchange rates for the distinct (orderDate, currency) pairs
    //    of any non-USD orders in this page of results.
    const pairKey = (date, currency) => `${date}|${currency}`
    const ratePairs = new Map()
    for (const r of rows) {
      if (r.currencyCode && r.currencyCode !== 'USD' && r.orderDate) {
        ratePairs.set(pairKey(r.orderDate, r.currencyCode), {
          date: r.orderDate,
          currency: r.currencyCode,
        })
      }
    }
    const rateByKey = new Map()
    if (ratePairs.size) {
      const pairs = [...ratePairs.values()]
      const dates = [...new Set(pairs.map(p => p.date))]
      const currencies = [...new Set(pairs.map(p => p.currency))]
      // Fetch by date/currency sets, then match exact (date, currency) pairs
      // below. Over-fetching the cross product is harmless: lookups are keyed
      // on the exact pair.
      const rates = await SELECT.from(ExchangeRates)
        .columns('date', 'currency', 'exchange')
        .where({ date: { in: dates }, currency: { in: currencies } })
      for (const x of rates) {
        rateByKey.set(pairKey(x.date, x.currency), Number(x.exchange))
      }
    }

    // 4. Compute derived fields per row
    for (const row of rows) {
      const qty = Number(row.quantity) || 0
      const p = productByKey.get(row.product_ProductKey)
      const unitPrice = p ? Number(p.unitPriceUSD) || 0 : 0
      const unitCost = p ? Number(p.unitCostUSD) || 0 : 0

      const revenueUSD = qty * unitPrice
      const costUSD = qty * unitCost
      const profitUSD = revenueUSD - costUSD
      const marginPercent = revenueUSD > 0 ? (profitUSD / revenueUSD) * 100 : 0

      row.revenueUSD = round2(revenueUSD)
      row.costUSD = round2(costUSD)
      row.profitUSD = round2(profitUSD)
      row.marginPercent = round2(marginPercent)

      // Local-currency figures (only when a rate is available)
      let rate
      if (!row.currencyCode || row.currencyCode === 'USD') {
        rate = 1 // USD orders: local == USD
      } else {
        rate = rateByKey.get(pairKey(row.orderDate, row.currencyCode))
      }

      if (rate == null) {
        row.revenueLocal = null
        row.costLocal = null
        row.profitLocal = null
      } else {
        row.revenueLocal = round2(revenueUSD * rate)
        row.costLocal = round2(costUSD * rate)
        row.profitLocal = round2(profitUSD * rate)
      }
    }

    return result
  })
})

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
