namespace retail.analytics.insights;

using retail.analytics as ra from '../db/schema';

/*
 * Task 2 — base analytical view for the Retail Insights dashboard
 * (Customer Segmentation / Product Quadrants / Store Efficiency).
 *
 * Design notes
 * ------------
 *  - This view is the Task 2 counterpart of Task 1's dashboard.SalesFacts. It
 *    deliberately re-uses the SAME USD-normalised measure formulas
 *    (quantity * unitPriceUSD / unitCostUSD) so revenue/cost stay identical to
 *    Task 1 and to the assignment's "everything in USD" rule.
 *  - It differs from SalesFacts only by carrying the natural KEYS and NAMES
 *    (customer / product / store) plus `birthday` and `squareMeters`, which the
 *    Task 2 classifications need but SalesFacts does not expose. SalesFacts is
 *    left completely untouched.
 *  - StoreKey 0 is the Online channel (squareMeters is null in the source); it
 *    is tagged here via `channel` and excluded from the store ranking later in
 *    the JS handler.
 *  - All RFM scoring, median quadrant classification and percentile tiering are
 *    done in srv/insights-service.js — they need cross-row statistics (quantiles,
 *    medians, percentiles) that are not expressible as a per-row CDS column.
 *    This view supplies the clean, filtered, USD-normalised line grain they run on.
 */
entity InsightsFacts as select from ra.Sales {
  key orderNumber,
  key lineItem,
      orderDate,

      customer.CustomerKey as customerKey       : Integer,
      customer.name        as customerName       : String(200),
      customer.continent   as continent          : String(50),
      customer.country     as country            : String(100),
      customer.birthday    as birthday           : Date,

      product.ProductKey   as productKey          : Integer,
      product.productName  as productName         : String(300),

      store.StoreKey       as storeKey            : Integer,
      store.state          as storeState          : String(100),
      store.country        as storeCountry        : String(100),
      store.squareMeters   as squareMeters        : Decimal(12, 2),
      case when store.StoreKey = 0 then 'Online' else 'Physical' end as channel : String(8),

      quantity,
      round(quantity * product.unitPriceUSD, 2)                         as revenueUSD : Decimal(15, 2),
      round(quantity * product.unitCostUSD, 2)                          as costUSD    : Decimal(15, 2),
};

/**
 * Distinct (continent, country) pairs that drive the dependent Continent ->
 * Country dropdowns in the smart filter bar. Plain CDS view — no JS needed.
 */
entity CustomerGeo as select from ra.Customers {
  key continent as continent : String(50),
  key country   as country   : String(100),
} group by continent, country;
