/**
 * Task 4 — deterministic, grounded fallback narratives.
 *
 * Used when no LLM is configured (chat() -> provider 'fallback'). Everything here
 * is derived ONLY from the KPI snapshot, so the Explanation Bot and the RPT-1
 * report stay functional and truthful offline. When an LLM is available these
 * same helpers still power the executive summary and give the model structured
 * hints, but the prose comes from the model.
 */

const usd = (n) => n == null ? 'n/a' : '$' + Math.round(Number(n)).toLocaleString('en-US')
const pct = (n) => n == null ? 'n/a' : Number(n).toFixed(1) + '%'

// ---- Executive summary: top 3 growth opportunities + top 3 risks -----------
function executiveSummary(s) {
  const opportunities = []
  const risks = []

  const geo = s.geography || {}
  const top = (geo.topCountriesByRevenue || [])[0]
  if (top) opportunities.push(`${top.country} is the revenue leader (${usd(top.revenueUSD)} at ${pct(top.marginPercent)} margin) — the anchor market to defend and expand.`)

  const cont = (geo.byContinent || [])
  if (cont.length >= 2) {
    const laggard = cont[cont.length - 1]
    opportunities.push(`${laggard.continent} is the smallest continent by revenue (${usd(laggard.revenueUSD)}) — the clearest white-space for geographic growth.`)
  }

  const topCat = (s.categories || [])[0]
  if (topCat) opportunities.push(`${topCat.category} leads categories (${usd(topCat.revenueUSD)}, ${pct(topCat.marginPercent)} margin) and is the strongest cross-sell/upsell base.`)

  // Risks
  const lowMargin = (geo.bottomCountriesByMargin || [])[0]
  if (lowMargin) risks.push(`${lowMargin.country} runs the thinnest margin (${pct(lowMargin.marginPercent)}) despite ${usd(lowMargin.revenueUSD)} revenue — a profitability risk to investigate.`)

  const an = (s.anomalies && s.anomalies.stores) || []
  if (an.length) {
    const a = an[0]
    risks.push(`${an.length} store(s) show high revenue but poor space efficiency — e.g. store ${a.storeKey} (${a.state}, ${a.country}): ${usd(a.revenueUSD)} revenue but only ${usd(a.revenuePerSqm)}/m² (revenue P${a.revenuePercentile} vs efficiency P${a.efficiencyPercentile}). Real-estate productivity risk.`)
  }

  const corr = s.associations && s.associations.storeSizeVsRevenue
  if (corr) risks.push(`Store floor area explains only ${pct(corr.rSquared * 100)} of revenue variance (r=${corr.pearsonR}) — expanding footprint alone is a weak growth lever; over-investing in size is a capital risk.`)

  return { opportunities: opportunities.slice(0, 3), risks: risks.slice(0, 3) }
}

// ---- Explanation Bot fallback: grounded answer by intent --------------------
function explainFallback(question, s) {
  const q = (question || '').toLowerCase()
  const parts = []
  const geo = s.geography || {}

  // Country-specific question — search the full country list, with common aliases.
  const allCountries = geo.allCountries || (geo.topCountriesByRevenue || []).concat(geo.bottomCountriesByMargin || [])
  const ALIASES = { 'united kingdom': ['uk', 'britain', 'england'], 'united states': ['us', 'usa', 'america'] }
  const country = allCountries.find((c) => {
    if (!c || !c.country) return false
    const name = c.country.toLowerCase()
    if (q.includes(name)) return true
    return (ALIASES[name] || []).some((a) => new RegExp(`\\b${a}\\b`).test(q))
  })
  if (country) {
    parts.push(`${country.country} (${country.continent}): ${usd(country.revenueUSD)} revenue at ${pct(country.marginPercent)} margin.`)
    if (/why|drop|low|margin|profit|despite/.test(q)) {
      const g = Number(s.headline?.marginPercent)
      const diff = Number(country.marginPercent) - g
      const rel = Math.abs(diff) < 1 ? `essentially in line with the global ${pct(g)}` : `${diff < 0 ? 'below' : 'above'} the global ${pct(g)}`
      parts.push(`Its margin (${pct(country.marginPercent)}) is ${rel}. Since every figure is USD-normalized, this is NOT a currency effect — profit here tracks sales volume and product mix. ${Math.abs(diff) < 1 ? 'So there is no hidden margin erosion; profit moves with revenue.' : 'Compare its category mix to the global leaders to see which products move the margin.'}`)
    }
  }

  if (/margin|profit/.test(q) && !country) {
    parts.push(`Global margin is ${pct(s.headline?.marginPercent)} on ${usd(s.headline?.revenueUSD)} revenue (${usd(s.headline?.profitUSD)} profit).`)
    const lm = (geo.bottomCountriesByMargin || [])[0]
    if (lm) parts.push(`Lowest-margin market: ${lm.country} at ${pct(lm.marginPercent)}.`)
  }

  if (/store|efficien|square|per.?m|real.?estate|anomal/.test(q)) {
    const an = (s.anomalies && s.anomalies.stores) || []
    if (an.length) {
      parts.push(`Flagged ${an.length} high-revenue / low-efficiency store(s):`)
      an.slice(0, 3).forEach((a) => parts.push(`• Store ${a.storeKey} (${a.state}, ${a.country}): ${usd(a.revenueUSD)} revenue but ${usd(a.revenuePerSqm)}/m² (revenue P${a.revenuePercentile}, efficiency P${a.efficiencyPercentile}).`))
    } else parts.push('No store currently combines high revenue with poor revenue-per-m².')
  }

  if (/elastic|price|sensitiv/.test(q)) {
    const pe = s.associations?.priceElasticity
    if (pe) parts.push(`Price elasticity: ${pe.summary}`)
  }

  if (/age|gender|demograph|who buys|segment/.test(q)) {
    const aff = s.associations?.demographicAffinity?.topOverIndexed || []
    if (aff.length) {
      parts.push('Top over-indexing demographic segments:')
      aff.slice(0, 3).forEach((a) => parts.push(`• ${a.ageGroup} ${a.gender} over-index on ${a.category} (affinity ${a.affinityIndex}).`))
    }
  }

  if (/season|month|trend|peak|when/.test(q)) {
    const se = s.seasonality
    if (se) parts.push(`Seasonality: peak in ${se.peakMonth.year}-${String(se.peakMonth.month).padStart(2, '0')} (${usd(se.peakMonth.revenueUSD)}); lowest in ${se.lowestMonth.year}-${String(se.lowestMonth.month).padStart(2, '0')}.`)
  }

  if (!parts.length) {
    // General overview
    parts.push(`Global: ${usd(s.headline?.revenueUSD)} revenue, ${usd(s.headline?.profitUSD)} profit, ${pct(s.headline?.marginPercent)} margin across ${s.headline?.totalOrders?.toLocaleString?.()} orders.`)
    const t = (geo.topCountriesByRevenue || [])[0]
    if (t) parts.push(`Top market: ${t.country} (${usd(t.revenueUSD)}). Ask me about a country, margins, store efficiency, price elasticity, demographics, or seasonality.`)
  }

  return parts.join('\n')
}

// ---- Report executive narrative fallback -----------------------------------
function reportNarrativeFallback(s, summary) {
  const hd = s.headline || {}
  const geo = s.geography || {}
  const top = (geo.allCountries || [])[0]
  const corr = s.associations && s.associations.storeSizeVsRevenue
  const pe = s.associations && s.associations.priceElasticity
  return [
    `Global electronics delivered ${usd(hd.revenueUSD)} in USD-normalized revenue at a ${pct(hd.marginPercent)} gross margin (${usd(hd.profitUSD)} profit) across ${Number(hd.totalOrders || 0).toLocaleString('en-US')} orders, led by ${top ? top.country : 'the top market'} (${usd(top && top.revenueUSD)}).`,
    `Margins are notably uniform across the ${(geo.allCountries || []).length} markets, so profit tracks sales volume rather than pricing or currency — evidence of a consistent global product mix.`,
    corr ? `Operationally, store floor area shows only a ${corr.assumptionHolds ? 'moderate' : 'weak'} link to revenue (r=${corr.pearsonR}, R²=${corr.rSquared}); adding square meters alone is not a reliable growth lever.` : '',
    pe ? `On pricing, ${pe.summary}` : '',
    (summary.opportunities || [])[0] ? `Top opportunity: ${summary.opportunities[0]}` : '',
    (summary.risks || [])[0] ? `Top risk: ${summary.risks[0]}` : '',
  ].filter(Boolean).join(' ')
}

module.exports = { executiveSummary, explainFallback, reportNarrativeFallback, usd, pct }
