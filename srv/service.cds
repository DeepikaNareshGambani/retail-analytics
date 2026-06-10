using retail.analytics from '../db/schema';

/**
 * Read-only analytics service exposing the full retail model for reporting
 * and exploration (OData V4).
 */
@path: '/analytics'
@impl: 'srv/analytics-service.js'
service AnalyticsService {

  @readonly entity Customers     as projection on analytics.Customers;
  @readonly entity Products      as projection on analytics.Products;
  @readonly entity Stores        as projection on analytics.Stores;
  @readonly entity ExchangeRates as projection on analytics.ExchangeRates;

  // Sales enriched with derived financials computed in analytics-service.js.
  // The virtual elements carry the values calculated in the on-READ handler.
  @readonly entity Sales as projection on analytics.Sales {
    *,
    virtual null as revenueUSD    : Decimal(15, 2),
    virtual null as costUSD       : Decimal(15, 2),
    virtual null as profitUSD     : Decimal(15, 2),
    virtual null as marginPercent : Decimal(7, 2),
    virtual null as revenueLocal  : Decimal(15, 2),
    virtual null as costLocal     : Decimal(15, 2),
    virtual null as profitLocal   : Decimal(15, 2),
  };
}

/**
 * Editable admin service for maintaining master data and sales records.
 */
@path: '/admin'
@requires: 'authenticated-user'
service AdminService {

  entity Customers     as projection on analytics.Customers;
  entity Products      as projection on analytics.Products;
  entity Stores        as projection on analytics.Stores;
  entity Sales         as projection on analytics.Sales;
  entity ExchangeRates as projection on analytics.ExchangeRates;
}
