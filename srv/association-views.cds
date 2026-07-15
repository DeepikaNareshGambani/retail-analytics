namespace retail.analytics.association;

using retail.analytics as ra from '../db/schema';

/*
 * Task 3 — base line-grain fact for the Association dashboard
 * (Demographic Affinity / Price Elasticity / Store Size↔Revenue).
 *
 * Design notes
 * ------------
 *  - This is the Task 3 counterpart of Task 1's dashboard.SalesFacts and Task 2's
 *    insights.InsightsFacts. It carries the columns Task 3 needs together in one
 *    grain: customer gender + birthday (demographics) AND product unit price +
 *    subcategory (elasticity) — neither existing fact view exposes both.
 *  - The USD measure formula is identical to Task 1/2 (quantity * unitPriceUSD),
 *    so revenue stays consistent across every task and the "everything in USD"
 *    rule holds. See memory: currency-usd-not-from-exchange-rates.
 *  - Only portable SQL is used here (round + the association joins). All the
 *    statistics that differ between SQLite (dev) and HANA (prod) — age-from-
 *    birthday bucketing, Pearson correlation, log-log elasticity regression —
 *    are done in JS in srv/association-service.js, exactly like Task 2 does its
 *    medians/percentiles. That keeps this view HANA-safe.
 *  - Store size↔revenue reuses Task 1's dashboard.StorePerformance aggregate in
 *    the JS handler rather than re-aggregating here, so per-store revenue stays
 *    byte-for-byte identical to Task 1.
 */
entity AssociationFacts as select from ra.Sales {
  key orderNumber,
  key lineItem,

      customer.gender      as gender       : String(10),
      customer.birthday    as birthday      : Date,

      product.ProductKey   as productKey    : Integer,
      product.category     as category      : String(100),
      product.subcategory  as subcategory   : String(100),
      product.unitPriceUSD as unitPriceUSD  : Decimal(12, 2),

      store.StoreKey       as storeKey       : Integer,
      store.squareMeters   as squareMeters   : Decimal(12, 2),

      quantity,
      round(quantity * product.unitPriceUSD, 2) as revenueUSD : Decimal(15, 2),
};
