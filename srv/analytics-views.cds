namespace retail.analytics.dashboard;

using retail.analytics as ra from '../db/schema';
using AnalyticsService from './service';

/*
 * Analytical views for the retail dashboard.
 *
 * IMPORTANT: the revenue/cost/profit measures are recomputed here in SQL
 * (quantity * Products.unitPriceUSD / unitCostUSD) rather than reused from the
 * JS-computed virtual fields on AnalyticsService.Sales — those are evaluated in
 * the read handler and are not available to DB views. Defining them in SQL also
 * makes these views fully filterable/sortable/aggregatable server-side.
 *
 * All monetary aggregates are in USD. Summing local-currency amounts across
 * mixed currencies is not meaningful, so local currency is intentionally out of
 * scope at the aggregate level.
 *
 * marginPercent is always SUM(profit) / SUM(revenue) * 100 — never the average
 * of line-level margins — so large and small orders are weighted correctly.
 */

/**
 * Foundation fact view: one row per Sales line item, enriched with the
 * line-level USD measures and the dimensions every aggregate below groups by.
 */
entity SalesFacts as select from ra.Sales {
  key orderNumber,
  key lineItem,
      orderDate,
      year(orderDate)  as orderYear  : Integer,
      month(orderDate) as orderMonth : Integer,

      customer.country   as customerCountry   : String(100),
      customer.continent as customerContinent : String(50),

      product.ProductKey  as productKey  : Integer,
      product.productName as productName : String(300),
      product.brand       as brand       : String(100),
      product.category    as category    : String(100),
      product.subcategory as subcategory : String(100),

      store.StoreKey     as storeKey     : Integer,
      store.country      as storeCountry : String(100),
      store.state        as storeState   : String(100),
      store.squareMeters as squareMeters : Decimal(12, 2),
      // Sales channel: StoreKey 0 is the Online store; everything else is a
      // physical store. Drives the Online vs Physical breakdown.
      case when store.StoreKey = 0 then 'Online' else 'Physical' end as channel : String(8),

      currencyCode,
      quantity,
      round(quantity * product.unitPriceUSD, 2)                         as revenueUSD : Decimal(15, 2),
      round(quantity * product.unitCostUSD, 2)                          as costUSD    : Decimal(15, 2),
      round(quantity * (product.unitPriceUSD - product.unitCostUSD), 2) as profitUSD  : Decimal(15, 2),
};

/** 1. Revenue by Country — geographic demand, keyed on customer country. */
entity RevenueByCountry as select from SalesFacts {
  key customerCountry          as country       : String(100),
      customerContinent        as continent     : String(50),
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(costUSD), 2)    as costUSD       : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)            as totalQuantity : Integer,
      count(distinct orderNumber) as orderCount : Integer,
      case when sum(revenueUSD) > 0
           then round(sum(profitUSD) / sum(revenueUSD) * 100, 2)
           else 0 end          as marginPercent : Decimal(7, 2),
} group by customerCountry, customerContinent;

/** 2. Revenue by Product Category. */
entity RevenueByCategory as select from SalesFacts {
  key category                  as category      : String(100),
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(costUSD), 2)    as costUSD       : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)            as totalQuantity : Integer,
      count(distinct productKey) as productCount : Integer,
      case when sum(revenueUSD) > 0
           then round(sum(profitUSD) / sum(revenueUSD) * 100, 2)
           else 0 end          as marginPercent : Decimal(7, 2),
} group by category;

/** 3. Monthly Sales Trend — ordered time series, keyed on (year, month). */
entity MonthlySalesTrend as select from SalesFacts {
  key orderYear                as salesYear     : Integer,
  key orderMonth               as salesMonth    : Integer,
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(costUSD), 2)    as costUSD       : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)            as totalQuantity : Integer,
      count(distinct orderNumber) as orderCount : Integer,
} group by orderYear, orderMonth
  order by salesYear, salesMonth;

/**
 * 4. Top Products — aggregated per product. The dashboard selects the "top N"
 * via OData, e.g. ?$orderby=revenueUSD desc&$top=10 (by revenue, quantity, or
 * margin — all from this one view).
 */
entity TopProducts as select from SalesFacts {
  key productKey               as productKey    : Integer,
      productName              as productName   : String(300),
      brand                    as brand         : String(100),
      category                 as category      : String(100),
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)            as totalQuantity : Integer,
      case when sum(revenueUSD) > 0
           then round(sum(profitUSD) / sum(revenueUSD) * 100, 2)
           else 0 end          as marginPercent : Decimal(7, 2),
} group by productKey, productName, brand, category;

/**
 * 5. Store Performance. revenuePerSqm guards against the Online store
 * (StoreKey 0, squareMeters = null) — yields null rather than dividing by zero.
 */
entity StorePerformance as select from SalesFacts {
  key storeKey                 as storeKey      : Integer,
      storeCountry             as country       : String(100),
      storeState               as state         : String(100),
      squareMeters             as squareMeters  : Decimal(12, 2),
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)            as totalQuantity : Integer,
      count(distinct orderNumber) as orderCount : Integer,
      case when sum(revenueUSD) > 0
           then round(sum(profitUSD) / sum(revenueUSD) * 100, 2)
           else 0 end          as marginPercent : Decimal(7, 2),
      case when squareMeters > 0
           then round(sum(revenueUSD) / squareMeters, 2)
           else null end       as revenuePerSqm : Decimal(15, 2),
} group by storeKey, storeCountry, storeState, squareMeters;

/**
 * Grand-total KPIs as a single row, used to drive the Overview Page KPI cards
 * (Revenue, Profit, Margin %). A constant key (ID = 1) gives the entity an
 * OData key; with no GROUP BY the aggregates collapse to one total row.
 */
entity OverallPerformance as select from SalesFacts {
  key 1                       as ID            : Integer,
      round(sum(revenueUSD), 2) as revenueUSD    : Decimal(15, 2),
      round(sum(costUSD), 2)    as costUSD       : Decimal(15, 2),
      round(sum(profitUSD), 2)  as profitUSD     : Decimal(15, 2),
      sum(quantity)           as totalQuantity : Integer,
      count(distinct orderNumber) as orderCount : Integer,
      case when sum(revenueUSD) > 0
           then round(sum(profitUSD) / sum(revenueUSD) * 100, 2)
           else 0 end         as marginPercent : Decimal(7, 2),
};

/*
 * Expose all views read-only on the existing AnalyticsService (/analytics).
 * @cds.redirection.target: false keeps these aggregates out of association
 * auto-redirection so AnalyticsService.Sales stays the canonical target for
 * the Customers/Products/Stores `sales` associations.
 */
extend service AnalyticsService with {
  @readonly @cds.redirection.target: false entity SalesFacts        as projection on dashboard.SalesFacts;
  @readonly @cds.redirection.target: false entity RevenueByCountry  as projection on dashboard.RevenueByCountry;
  @readonly @cds.redirection.target: false entity RevenueByCategory as projection on dashboard.RevenueByCategory;
  @readonly @cds.redirection.target: false entity MonthlySalesTrend as projection on dashboard.MonthlySalesTrend;
  @readonly @cds.redirection.target: false entity TopProducts       as projection on dashboard.TopProducts;
  @readonly @cds.redirection.target: false entity StorePerformance  as projection on dashboard.StorePerformance;
  @readonly @cds.redirection.target: false entity OverallPerformance as projection on dashboard.OverallPerformance;
}
