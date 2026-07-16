namespace retail.analytics.classification;

/*
 * Task 2 (Fiori Elements edition) — materialized classification results.
 *
 * The RFM customer segmentation, median-quadrant product tiers, and percentile
 * store tiers are computed in JS (Task 2's InsightsService). Fiori Elements
 * charts need an aggregatable ($apply-able) source and correct /$count, which
 * computed @cds.persistence.skip entities cannot serve — so these real tables
 * are materialized once (lazily, on first read) from InsightsService's existing
 * logic (see srv/classification-service.js). Column names mirror the source
 * entities; a *Criticality integer drives the FE semantic colours.
 */

// Customer segmentation (RFM) — one row per customer.
entity CustomerSegment {
  key CustomerKey        : Integer;
      CustomerName       : String(200);
      Continent          : String(50);
      Country            : String(100);
      AgeCategory        : String(10);
      TotalSpendUSD      : Decimal(15, 2);
      OrderCount         : Integer;
      DaysSinceLastOrder : Integer;
      RecencyScore       : Integer;
      FrequencyScore     : Integer;
      MonetaryScore      : Integer;
      VIPScore           : Integer;
      Segment            : String(10);   // VIP | Regular | At Risk (coarse band)
      SegmentCriticality : Integer;      // 3 VIP, 1 At Risk, 0 Regular
      RFMSegment            : String(20);// one of 11 RFM personas (fine-grained)
      RFMSegmentCriticality : Integer;   // 3 positive, 2 neutral, 1 at-risk
}

// Product performance (median quadrants) — one row per product.
entity ProductTier {
  key ProductKey          : Integer;
      ProductName         : String(300);
      TotalQuantitySold   : Integer;
      TotalRevenueUSD     : Decimal(15, 2);
      MarginPercent       : Decimal(7, 2);
      MedianMargin        : Decimal(7, 2);
      MedianQuantity      : Integer;
      Quadrant            : String(20);   // Star | Margin Driven | Volume Driven | Laggard
      QuadrantCriticality : Integer;      // 3 Star, 1 Laggard, 0 otherwise
}

// Store efficiency (percentile tiers) — one row per store.
entity StoreTier {
  key StoreKey              : Integer;
      StoreName             : String(120);
      SquareMeters          : Decimal(12, 2);
      TotalRevenueUSD       : Decimal(15, 2);
      RevenuePerSquareMeter : Decimal(15, 2);
      PercentileRank        : Decimal(7, 2);
      Tier                  : String(20);  // Flagship | Standard | Underperforming | Online Channel
      TierCriticality       : Integer;     // 3 Flagship, 1 Underperforming, 0 otherwise
}
