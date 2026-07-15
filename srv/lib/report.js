const PDFDocument = require('pdfkit')
const { usd, pct } = require('./ai-fallback')

/**
 * Task 4 — RPT-1 "Annual Global Sales Review" PDF renderer.
 *
 * Streams a management-ready PDF into an HTTP response. Content is grounded in
 * the KPI snapshot (Task 1 KPIs + Task 3 association findings) and the AI/RPT-1
 * executive narrative. All monetary values are USD-normalized (aggregating mixed
 * local currencies is not meaningful — noted in the report).
 */
function renderReportPDF(res, { snapshot, summary, narrative, provider }) {
  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true })
  doc.pipe(res)

  const BRAND = '#2b5c8a'
  const MUTED = '#666666'
  const w = doc.page.width - 108

  const h1 = (t) => doc.moveDown(0.6).fillColor(BRAND).fontSize(15).font('Helvetica-Bold').text(t).moveDown(0.3).fillColor('black').font('Helvetica').fontSize(10)
  const para = (t) => doc.fillColor('black').font('Helvetica').fontSize(10).text(t, { align: 'left' }).moveDown(0.3)
  const bullet = (t) => doc.fontSize(10).font('Helvetica').fillColor('black').text('•  ' + t, { indent: 8 }).moveDown(0.15)
  const rule = () => { doc.moveDown(0.2); doc.strokeColor('#dddddd').lineWidth(1).moveTo(54, doc.y).lineTo(54 + w, doc.y).stroke(); doc.moveDown(0.4) }

  // ---- Title ----
  doc.fillColor(BRAND).fontSize(24).font('Helvetica-Bold').text('Annual Global Sales Review')
  doc.fillColor(MUTED).fontSize(11).font('Helvetica').text('Global Electronics — Retail Intelligence Report')
  doc.moveDown(0.2).fontSize(9).fillColor(MUTED)
    .text(`Generated ${new Date(snapshot.generatedAt).toLocaleString('en-US')}  ·  Currency: USD-normalized  ·  Engine: ${provider}`)
  rule()

  const hd = snapshot.headline || {}
  para(`This review covers ${fmt(hd.totalOrders)} orders and ${fmt(hd.totalUnits)} units. Total revenue was ${usd(hd.revenueUSD)} at a ${pct(hd.marginPercent)} gross margin (${usd(hd.profitUSD)} profit). All figures are normalized to USD; local-currency amounts are preserved per transaction but are not summed across currencies, as that is not analytically meaningful.`)

  // ---- Executive narrative (AI / RPT-1) ----
  h1('Executive Narrative')
  para(narrative)

  // ---- Opportunities & risks ----
  h1('Top 3 Growth Opportunities')
  ;(summary.opportunities || []).forEach(bullet)
  doc.moveDown(0.3)
  h1('Top 3 Risk Areas')
  ;(summary.risks || []).forEach(bullet)

  // ---- Financial KPIs ----
  doc.addPage()
  h1('Financial Performance by Market')
  const cols = [{ k: 'country', w: 150 }, { k: 'continent', w: 110 }, { k: 'revenueUSD', w: 130, money: 1 }, { k: 'marginPercent', w: 80, pct: 1 }]
  tableHeader(doc, ['Country', 'Continent', 'Revenue (USD)', 'Margin'], cols)
  ;(snapshot.geography?.allCountries || []).forEach((c) => tableRow(doc, c, cols))
  doc.moveDown(0.5)
  h1('Top Categories')
  ;(snapshot.categories || []).slice(0, 5).forEach((c) => bullet(`${c.category}: ${usd(c.revenueUSD)} (${pct(c.marginPercent)} margin, ${fmt(c.units)} units)`))

  // ---- Task 3: Demographic correlations ----
  doc.addPage()
  h1('Demographic Correlations')
  para('Segments that over-index (affinity index > 100) on a product category relative to the overall population:')
  ;(snapshot.associations?.demographicAffinity?.topOverIndexed || []).forEach((a) =>
    bullet(`${a.ageGroup} ${a.gender} → ${a.category} (affinity ${a.affinityIndex}, ${pct(a.segmentSharePct)} of segment revenue)`))

  // ---- Task 3: Store size vs revenue ----
  h1('Store Size vs. Revenue — Does Bigger Mean More?')
  const corr = snapshot.associations?.storeSizeVsRevenue
  if (corr) {
    para(corr.interpretation)
    bullet(`Pearson r = ${corr.pearsonR}, R² = ${corr.rSquared}, n = ${corr.sampleSize} stores`)
    bullet(`Verdict: the "bigger store ⇒ more revenue" assumption ${corr.assumptionHolds ? 'broadly HOLDS, but weakly' : 'does NOT hold'}.`)
  }
  const anomalies = snapshot.anomalies?.stores || []
  if (anomalies.length) {
    doc.moveDown(0.2); para('Space-efficiency outliers (high revenue, poor revenue per m²):')
    anomalies.slice(0, 4).forEach((a) => bullet(`Store ${a.storeKey} (${a.state}, ${a.country}): ${usd(a.revenueUSD)} revenue but ${usd(a.revenuePerSqm)}/m²`))
  }

  // ---- Task 3: Price elasticity ----
  h1('Price Elasticity')
  const pe = snapshot.associations?.priceElasticity
  if (pe) {
    para(pe.summary)
    ;(pe.mostElastic || []).slice(0, 4).forEach((e) => bullet(`${e.subcategory}: elasticity ${e.elasticity} (R²=${e.rSquared}, ${e.interpretation})`))
  }

  // ---- Footer on every page ----
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
      .text(`Annual Global Sales Review  ·  USD-normalized  ·  Page ${i + 1} of ${range.count}`,
        54, doc.page.height - 40, { width: w, align: 'center' })
  }

  doc.end()
}

// ---- tiny table helpers ----
function tableHeader(doc, labels, cols) {
  const y = doc.y
  let x = 54
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
  labels.forEach((l, i) => { doc.text(l, x, y, { width: cols[i].w }); x += cols[i].w })
  doc.moveDown(0.2)
  doc.strokeColor('#cccccc').lineWidth(0.7).moveTo(54, doc.y).lineTo(54 + cols.reduce((a, c) => a + c.w, 0), doc.y).stroke()
  doc.moveDown(0.2).font('Helvetica').fillColor('black')
}
function tableRow(doc, row, cols) {
  const y = doc.y
  let x = 54
  doc.fontSize(9).font('Helvetica').fillColor('black')
  cols.forEach((c) => {
    let v = row[c.k]
    if (c.money) v = usd(v)
    else if (c.pct) v = pct(v)
    doc.text(String(v ?? ''), x, y, { width: c.w })
    x += c.w
  })
  doc.moveDown(0.2)
}
function fmt(n) { return n == null ? 'n/a' : Number(n).toLocaleString('en-US') }

module.exports = { renderReportPDF }
