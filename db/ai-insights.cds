namespace retail.analytics.aiinsights;

/*
 * Task 4 — materialized AI dashboard model.
 *
 * AIDashboard is a single row (ID = 1) carrying the headline USD KPIs; it drives
 * the Object Page KPI header and owns the executive insights via association.
 * ExecutiveInsight holds the AI-generated top opportunities + risks. Both are
 * populated once (lazily, on first read) from the KPI snapshot in
 * srv/ai-service.js so the Fiori Elements dashboard has data.
 */

entity AIDashboard {
  key ID            : Integer;
      title         : String(80);
      topMarket     : String(100);
      revenueUSD    : Decimal(15, 2);
      profitUSD     : Decimal(15, 2);
      marginPercent : Decimal(7, 2);
      totalOrders   : Integer;
      totalUnits    : Integer;
      insights      : Association to many ExecutiveInsight on insights.dash = ID;
}

entity ExecutiveInsight {
  key ID          : Integer;
      dash        : Integer;      // constant 1 — links each insight to AIDashboard
      category    : String(20);   // 'Opportunity' | 'Risk'
      rank        : Integer;      // 1..3 within its category
      insight     : String(1000);
      criticality : Integer;      // 3 = Opportunity (positive), 1 = Risk (negative)
}
