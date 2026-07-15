namespace retail.analytics.aiinsights;

/*
 * Task 4 — materialized executive insights.
 *
 * The AI-generated executive summary (top 3 growth opportunities + top 3 risk
 * areas) flattened into rows so a Fiori Elements List Report can render it as a
 * clean, criticality-coloured table. Populated once at startup from the KPI
 * snapshot (srv/ai-service.js -> populateInsights()).
 */
entity ExecutiveInsight {
  key ID          : Integer;
      category    : String(20);   // 'Opportunity' | 'Risk'
      rank        : Integer;      // 1..3 within its category
      insight     : String(1000);
      criticality : Integer;      // 3 = Opportunity (positive), 1 = Risk (negative)
}
