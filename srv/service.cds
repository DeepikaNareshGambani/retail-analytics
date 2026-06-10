using retail.analytics from '../db/schema';

/**
 * Read-only analytics service exposing the full retail model for reporting
 * and exploration (OData V4).
 */
@path: '/analytics'
service AnalyticsService {

  @readonly entity Customers     as projection on analytics.Customers;
  @readonly entity Products      as projection on analytics.Products;
  @readonly entity Stores        as projection on analytics.Stores;
  @readonly entity Sales         as projection on analytics.Sales;
  @readonly entity ExchangeRates as projection on analytics.ExchangeRates;
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
