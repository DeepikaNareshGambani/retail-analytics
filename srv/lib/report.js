const PDFDocument = require('pdfkit')
const { usd, pct } = require('./ai-fallback')

/**
 * Task 4 — RPT-1 "Annual Global Sales Review" PDF renderer.
 *
 * Streams a management-ready PDF into an HTTP response. Content is grounded in
 * the KPI snapshot (Task 1 KPIs + Task 3 association findings) and the AI/RPT-1
 * executive narrative. All monetary values are USD-normalized (aggregating mixed
 * local currencies is not meaningful — noted in the report).
 *
 * Charts are drawn as native pdfkit vector graphics (a KPI card band + horizontal
 * bar charts) — no external image/chart dependency.
 */
function renderReportPDF(res, { snapshot, summary, narrative }) {
  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true })
  doc.pipe(res)

  const BRAND = '#2b5c8a'
  const MUTED = '#666666'
  const PALETTE = ['#2b5c8a', '#3d7ab5', '#5b9bd5', '#7fb3e0', '#9cc4e6', '#b9d6ef', '#88b04b', '#c98a3b']
  const w = doc.page.width - 108
  const bottomLimit = () => doc.page.height - 64

  // Flowing-text helpers. Each resets doc.x to the left margin first: the KPI
  // cards / bar charts draw at absolute x and leave the cursor on the right, and
  // pdfkit would otherwise inherit that x (rendering body text in a skinny
  // right-hand column). Passing width:w keeps them full-width.
  const LEFT = 54
  const h1 = (t) => { doc.moveDown(0.6); doc.x = LEFT; doc.fillColor(BRAND).fontSize(15).font('Helvetica-Bold').text(t, { width: w }); doc.moveDown(0.3).fillColor('black').font('Helvetica').fontSize(10) }
  const para = (t) => { doc.x = LEFT; doc.fillColor('black').font('Helvetica').fontSize(10).text(t, { width: w, align: 'left' }); doc.moveDown(0.3) }
  const bullet = (t) => { doc.x = LEFT; doc.fontSize(10).font('Helvetica').fillColor('black').text('•  ' + t, { width: w, indent: 8 }); doc.moveDown(0.15) }
  const rule = () => { doc.moveDown(0.2); doc.strokeColor('#dddddd').lineWidth(1).moveTo(54, doc.y).lineTo(54 + w, doc.y).stroke(); doc.moveDown(0.4) }

  // ---- KPI card band ----
  const kpiCards = (cards) => {
    const gap = 10
    const cardW = (w - gap * (cards.length - 1)) / cards.length
    const cardH = 56
    const y = doc.y
    let x = 54
    cards.forEach((c) => {
      doc.roundedRect(x, y, cardW, cardH, 5).fill('#f2f6fa')
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(15).text(c.value, x + 10, y + 11, { width: cardW - 20, lineBreak: false })
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(c.label.toUpperCase(), x + 10, y + 35, { width: cardW - 20, lineBreak: false })
      x += cardW + gap
    })
    doc.x = 54
    doc.y = y + cardH
    doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.6)
  }

  // ---- Horizontal bar chart ----
  const barChart = (data, { valueFmt = usd, labelW = 120, note } = {}) => {
    data = (data || []).filter((d) => d && d.value != null)
    if (!data.length) return
    const rowH = 15, gap = 5, valueW = 92
    const chartH = data.length * (rowH + gap) + (note ? 14 : 0)
    if (doc.y + chartH > bottomLimit()) doc.addPage()
    const x0 = 54
    const barX = x0 + labelW
    const barMaxW = w - labelW - valueW
    const maxV = Math.max(...data.map((d) => Math.abs(Number(d.value) || 0))) || 1
    let y = doc.y
    data.forEach((d, i) => {
      const v = Number(d.value) || 0
      const bw = Math.max(2, (Math.abs(v) / maxV) * barMaxW)
      doc.font('Helvetica').fontSize(9).fillColor('#333333')
        .text(String(d.label), x0, y + 2, { width: labelW - 6, ellipsis: true, lineBreak: false })
      doc.roundedRect(barX, y, bw, rowH - 2, 2).fill(PALETTE[i % PALETTE.length])
      doc.font('Helvetica').fontSize(9).fillColor('#333333')
        .text(valueFmt(v), barX + barMaxW + 4, y + 2, { width: valueW - 4, lineBreak: false })
      y += rowH + gap
    })
    doc.x = x0
    doc.y = y
    if (note) { doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(note, x0, doc.y, { width: w }).font('Helvetica').fillColor('black') }
    doc.x = x0
    doc.moveDown(0.5)
  }

  // ---- Title ----
  doc.fillColor(BRAND).fontSize(24).font('Helvetica-Bold').text('Annual Global Sales Review')
  doc.fillColor(MUTED).fontSize(11).font('Helvetica').text('Global Electronics — Retail Intelligence Report')
  doc.moveDown(0.2).fontSize(9).fillColor(MUTED)
    .text(`Generated ${new Date(snapshot.generatedAt).toLocaleString('en-US')}  ·  Currency: USD-normalized`)
  rule()

  const hd = snapshot.headline || {}

  // ---- KPI cards ----
  kpiCards([
    { label: 'Revenue', value: usdShort(hd.revenueUSD) },
    { label: 'Profit', value: usdShort(hd.profitUSD) },
    { label: 'Gross Margin', value: pct(hd.marginPercent) },
    { label: 'Orders', value: fmtShort(hd.totalOrders) },
  ])

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

  // ---- Financial KPIs + charts ----
  doc.addPage()
  const countries = snapshot.geography?.allCountries || []
  h1('Revenue by Market')
  barChart(countries.map((c) => ({ label: c.country, value: c.revenueUSD })))

  h1('Revenue by Continent')
  barChart((snapshot.geography?.byContinent || []).map((c) => ({ label: c.continent, value: c.revenueUSD })))

  h1('Financial Detail by Market')
  const cols = [{ k: 'country', w: 150 }, { k: 'continent', w: 110 }, { k: 'revenueUSD', w: 130, money: 1 }, { k: 'marginPercent', w: 80, pct: 1 }]
  tableHeader(doc, ['Country', 'Continent', 'Revenue (USD)', 'Margin'], cols)
  countries.forEach((c) => tableRow(doc, c, cols))

  // ---- Categories ----
  doc.addPage()
  h1('Revenue by Category')
  barChart((snapshot.categories || []).map((c) => ({ label: c.category, value: c.revenueUSD })))
  ;(snapshot.categories || []).slice(0, 5).forEach((c) => bullet(`${c.category}: ${usd(c.revenueUSD)} (${pct(c.marginPercent)} margin, ${fmt(c.units)} units)`))

  // ---- Task 3: Demographic correlations ----
  h1('Demographic Affinity')
  para('Segments that over-index (affinity index > 100) on a product category relative to the overall population:')
  const affinity = snapshot.associations?.demographicAffinity?.topOverIndexed || []
  barChart(
    affinity.map((a) => ({ label: `${a.ageGroup} ${a.gender} · ${a.category}`, value: a.affinityIndex })),
    { valueFmt: (v) => `index ${Math.round(v)}`, labelW: 190, note: 'Index 100 = the category’s share of overall revenue (parity). Higher = over-indexing.' },
  )

  // ---- Task 3: Store size vs revenue ----
  doc.addPage()
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
    const el = (pe.mostElastic || []).slice(0, 6)
    barChart(
      el.map((e) => ({ label: e.subcategory, value: Math.abs(Number(e.elasticity) || 0) })),
      { valueFmt: (v) => v.toFixed(2), labelW: 150, note: '|elasticity| ≥ 1 = elastic (price-sensitive); < 1 = inelastic. Best-fit subcategories shown.' },
    )
  }

  // ---- Footer on every page ----
  // The footer baseline sits below the bottom margin; pdfkit's centered line-
  // wrapper would auto-add a fresh page per footer write. Temporarily zeroing the
  // page's bottom margin removes the overflow check so no phantom pages appear.
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const savedBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
      .text(`Annual Global Sales Review  ·  USD-normalized  ·  Page ${i + 1} of ${range.count}`,
        54, doc.page.height - 40, { width: w, align: 'center' })
    doc.page.margins.bottom = savedBottom
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
// Compact forms for the KPI cards so they never overflow their box.
function usdShort(n) {
  if (n == null) return 'n/a'
  const v = Number(n)
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + Math.round(v)
}
function fmtShort(n) {
  if (n == null) return 'n/a'
  const v = Number(n)
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return String(v)
}

module.exports = { renderReportPDF }
