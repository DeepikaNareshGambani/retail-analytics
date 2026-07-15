/**
 * Task 4 — AI service (/ai).
 *
 * Exposes the AI suite for the retail dashboard. All features are grounded in a
 * single compact KPI snapshot so the LLM reasons only from real, USD-normalized
 * data:
 *   - getKPISnapshot()      : the shared context payload (pure data, no AI)
 *   - explainKPI(question)  : Virtual Store Manager / Explanation Bot   [added next]
 *   - generateGlobalReview(): RPT-1 "Annual Global Sales Review" PDF     [added next]
 *
 * Kept separate (own path /ai, own impl) so Tasks 1-3 stay untouched.
 */
using retail.analytics.aiinsights as aiinsights from '../db/ai-insights';

@path : '/ai'
@impl : 'srv/ai-service.js'
service AIService {

  // Executive insights (top opportunities + risks) as a queryable entity for the
  // Fiori Elements narrative table. Materialized at startup.
  @readonly entity ExecutiveInsights as projection on aiinsights.ExecutiveInsight;

  // Compact JSON snapshot of headline KPIs, regional extremes, store anomalies,
  // and the Task 3 association findings. Returned as a JSON string so it can be
  // dropped straight into an LLM prompt (kept small, ~<4k tokens).
  function getKPISnapshot() returns String;

  // Virtual Store Manager / Explanation Bot: answers a natural-language question
  // grounded strictly in the KPI snapshot. Returns { answer, provider } as JSON.
  // A function (read-only, no side effects) so the UI can call it via GET.
  function explainKPI(question : String) returns String;

  // Executive summary: top 3 growth opportunities + top 3 risk areas, grounded
  // in the snapshot. Returns { opportunities:[], risks:[], provider } as JSON.
  function getExecutiveSummary() returns String;

  // Full report payload (snapshot + executive summary + RPT-1 narrative) as JSON.
  // The downloadable PDF (srv/server.js, GET /reports/global-review.pdf) renders
  // this into the "Annual Global Sales Review".
  function generateGlobalReview() returns String;
}
