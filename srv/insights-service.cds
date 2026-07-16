using retail.analytics.insights as insights from './insights-views';

/**
 * Task 2 — Retail Insights service (OData V4, read-only).
 *
 * Separate service (own path /insights, own JS impl) so Task 1's AnalyticsService
 * stays byte-for-byte unchanged.
 *
 * The four analytical collections below are COMPUTED entities: their shape is
 * declared here (so $metadata is correct) but their rows are produced entirely
 * in srv/insights-service.js. They are marked @cds.persistence.skip so CAP does
 * not try to create or read a database table for them — the on(READ) handler
 * returns the rows. The classifications they expose (segment / quadrant / tier)
 * react to two runtime knobs passed as custom query options:
 *
 *     ?vipThreshold=<8..14>          VIP Score slider
 *     ?flagshipPercentile=<5..50>    Flagship Percentile slider
 *     ?continent=<..>&country=<..>&ageCategory=<Youth|Senior>   smart filter bar
 *
 * CustomerGeo is a normal CDS view (no handler) feeding the dependent dropdowns.
 */
@path : '/insights'
@impl : 'srv/insights-service.js'
service InsightsService {

  // -- Customer Segmentation (RFM) ------------------------------------------
  @readonly
  @cds.persistence.skip
  entity CustomerSegmentation {
    key CustomerKey        : Integer;
        CustomerName       : String(200);
        Continent          : String(50);
        Country            : String(100);
        AgeCategory        : String(10);
        TotalSpendUSD      : Decimal(15, 2);
        OrderCount         : Integer;
        DaysSinceLastOrder : Integer;
        RecencyScore       : Integer;   // 1..5
        FrequencyScore     : Integer;   // 1..5
        MonetaryScore      : Integer;   // 1..5
        VIPScore           : Integer;   // 3..15  (R+F+M)
        CustomerSegment    : String(10);// VIP | Regular | At Risk (coarse band)
        RFMSegment         : String(20);// one of 11 RFM personas (fine-grained)
  }

  // -- Product Performance (median quadrants) -------------------------------
  @readonly
  @cds.persistence.skip
  entity ProductPerformance {
    key ProductKey        : Integer;
        ProductName       : String(300);
        TotalQuantitySold : Integer;
        TotalRevenueUSD   : Decimal(15, 2);
        MarginPercent     : Decimal(7, 2);
        MedianMargin      : Decimal(7, 2);   // same value on every row -> chart cross-line
        MedianQuantity    : Integer;         // same value on every row -> chart cross-line
        ProductQuadrant   : String(20);      // Star | Margin Driven | Volume Driven | Laggard
  }

  // -- Store Efficiency (percentile tiers) ----------------------------------
  @readonly
  @cds.persistence.skip
  entity StoreEfficiency {
    key StoreKey              : Integer;
        StoreName             : String(120);
        SquareMeters          : Decimal(12, 2);
        TotalRevenueUSD       : Decimal(15, 2);
        RevenuePerSquareMeter : Decimal(15, 2);
        PercentileRank        : Decimal(7, 2);   // 0..100 within physical stores
        StoreTier             : String(20);      // Flagship | Standard | Underperforming | Online Channel
  }

  // -- Order-line table (one row per sales line, classification-enriched) ----
  @readonly
  @cds.persistence.skip
  entity OrderLines {
    key OrderNumber     : Integer;
    key LineItem        : Integer;
        CustomerKey     : Integer;   // hidden in UI — used for chart->table filtering
        ProductKey      : Integer;   // hidden in UI — used for chart->table filtering
        StoreKey        : Integer;   // hidden in UI — used for chart->table filtering
        Continent       : String(50);
        CustomerSegment : String(10);
        ProductName     : String(300);
        ProductQuadrant : String(20);
        StoreTier       : String(20);
        GrossRevenueUSD : Decimal(15, 2);
  }

  // -- Dependent dropdown source (plain view, generic READ) -----------------
  @readonly
  entity CustomerGeo as projection on insights.CustomerGeo;
}
