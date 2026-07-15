namespace retail.analytics.assocstats;

/*
 * Task 3 — materialized analysis results (real, persisted tables).
 *
 * The three association analyses need cross-row statistics (age-bucket affinity
 * index, log-log price-elasticity regression, Pearson store correlation) that
 * cannot be expressed as SQL aggregates. So they are computed in JS and written
 * into these tables once at startup (see srv/association-service.js -> populate()).
 *
 * Being real tables, they are natively $apply-able (so Fiori Elements can draw a
 * chart AND a stats table from the SAME entity, stacked in one tab) and support
 * the dedicated /$count path (so the FE tab count badges are correct). Column
 * names match the JS producer objects exactly so INSERT needs no mapping.
 */

// 3a. Demographic affinity — one row per age bucket x gender x category.
entity DemographicAffinityStats {
  key AgeBucket           : String(10);
  key Gender              : String(10);
  key Category            : String(100);
      RevenueUSD          : Decimal(15, 2);
      Quantity            : Integer;
      LineCount           : Integer;
      CategorySharePct    : Decimal(7, 2);
      AffinityIndex       : Decimal(9, 2);
      AffinityCriticality : Integer;
}

// 3b. Price elasticity — one row per subcategory.
entity PriceElasticityStats {
  key Subcategory           : String(100);
      Category              : String(100);
      AvgUnitPriceUSD       : Decimal(12, 2);
      TotalQuantity         : Integer;
      ProductCount          : Integer;
      ElasticityCoefficient : Decimal(9, 3);
      RSquared              : Decimal(5, 3);
      Interpretation        : String(30);
      ElasticityCriticality : Integer;
}

// 3c-i. Store size vs revenue — one row per physical store.
entity StoreSizeStats {
  key StoreKey        : Integer;
      StoreLabel      : String(120);
      SquareMeters    : Decimal(12, 2);
      SizeBand        : String(20);
      TotalRevenueUSD : Decimal(15, 2);
      RevenuePerSqm   : Decimal(15, 2);
}

// 3c-ii. Store size vs revenue — Pearson correlation verdict (single row).
entity StoreSizeCorrelationStats {
  key ID              : Integer;
      PearsonR        : Decimal(6, 4);
      RSquared        : Decimal(6, 4);
      Slope           : Decimal(15, 4);
      Intercept       : Decimal(15, 4);
      SampleSize      : Integer;
      Strength        : String(20);
      Direction       : String(12);
      AssumptionHolds : Boolean;
      Interpretation  : String(500);
}
