using AnalyticsService from './analytics-views';

/*
 * Analytical + UI annotations for the retail dashboard.
 *
 *  - SalesFacts is the line-grain analytical entity (aggregated at runtime via
 *    $apply). It drives the Analytical List Page (filter bar + chart + table)
 *    and the Overview Page chart cards (Revenue by Country / Category / Month /
 *    Store) through qualified UI.Chart / UI.PresentationVariant annotations.
 *  - OverallPerformance is a single grand-total row driving the Overview Page
 *    KPI cards (Revenue, Profit, Margin %).
 *
 * All money is USD. marginPercent is profit/revenue (not additive), so it is
 * exposed only on pre-aggregated entities, never summed.
 */

// ===========================================================================
// SalesFacts — analytical capabilities (enable $apply / aggregation)
// ===========================================================================
// The sap.fe v4 MDC ChartDelegate builds its chart propertyInfo ONLY from the
// OData Aggregation vocabulary — it ignores @Analytics.Dimension/@Analytics.Measure
// (those drive the older OVP analytical card / table). It needs each dimension in
// GroupableProperties and each measure in AggregatableProperties; otherwise the
// chart items resolve to _fe_groupable_<dim>/_fe_aggregatable_<measure> with no
// matching property info → "[50017] Invalid data binding". Declaring ApplySupported
// by hand replaces CAP's auto-generated restrictions, so these lists must be explicit.
annotate AnalyticsService.SalesFacts with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [
    customerCountry, customerContinent, category, subcategory, brand,
    productName, storeCountry, storeState, orderYear, orderMonth, channel, orderDate
  ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : revenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : costUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : profitUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : quantity }
  ]
};

annotate AnalyticsService.SalesFacts with @(
  Aggregation.CustomAggregate #revenueUSD : 'Edm.Decimal',
  Aggregation.CustomAggregate #costUSD    : 'Edm.Decimal',
  Aggregation.CustomAggregate #profitUSD  : 'Edm.Decimal',
  Aggregation.CustomAggregate #quantity   : 'Edm.Int32'
);

// Each measure needs THREE annotations that work together:
//   @Analytics.Measure          — classifies it as a measure for the sap.fe
//                                  chart/table feed (UI side).
//   @Aggregation.default: #SUM  — tells the CAP *runtime* how to compute the
//                                  custom aggregate. The runtime reads this from
//                                  the CSN, not the EDMX, so it never appears in
//                                  $metadata — but without it, aggregate(<measure>)
//                                  fails with 500 'Default aggregation ... not found'.
//   @Aggregation.CustomAggregate#<measure> (above) — declares the aggregate's
//                                  result type; without it you get 500 'Result
//                                  type for custom aggregation ... not found'.
// Dimensions must carry @Analytics.Dimension or sap.chart cannot bind them as
// chart/groupby dimensions ("Invalid data binding").
annotate AnalyticsService.SalesFacts with {
  revenueUSD        @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Revenue (USD)';
  costUSD           @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Cost (USD)';
  profitUSD         @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Profit (USD)';
  quantity          @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Quantity';

  customerCountry   @Analytics.Dimension @Common.Label : 'Country';
  customerContinent @Analytics.Dimension @Common.Label : 'Continent';
  category          @Analytics.Dimension @Common.Label : 'Category';
  subcategory       @Analytics.Dimension @Common.Label : 'Subcategory';
  brand             @Analytics.Dimension @Common.Label : 'Brand';
  productName       @Analytics.Dimension @Common.Label : 'Product';
  storeCountry      @Analytics.Dimension @Common.Label : 'Store Country';
  storeState        @Analytics.Dimension @Common.Label : 'Store State';
  orderYear         @Analytics.Dimension @Common.Label : 'Year';
  orderMonth        @Analytics.Dimension @Common.Label : 'Month';
  channel           @Analytics.Dimension @Common.Label : 'Sales Channel';
  orderDate         @Analytics.Dimension @Common.Label : 'Order Date';
}

// DataPoints used as KPI headers on the Overview Page chart cards.
annotate AnalyticsService.SalesFacts with @(
  // Title is a single word on purpose: the sap.fe KPI tag abbreviates the
  // DataPoint Title (1 word -> first 3 letters), so 'Revenue' -> "Rev" rather
  // than "Revenue (USD)" -> "R". Full text shows in the tag tooltip.
  UI.DataPoint #revenue : {
    $Type : 'UI.DataPointType',
    Value : revenueUSD,
    Title : 'Revenue'
  },
  UI.DataPoint #profit : {
    $Type : 'UI.DataPointType',
    Value : profitUSD,
    Title : 'Profit'
  }
);

// ===========================================================================
// SalesFacts — Analytical List Page: filter bar, default chart, table
// ===========================================================================
annotate AnalyticsService.SalesFacts with @(
  UI.SelectionFields : [
    customerCountry,
    customerContinent,
    category,
    brand,
    orderYear,
    storeCountry,
    channel
  ],

  UI.LineItem : [
    { Value : customerCountry },
    { Value : category },
    { Value : brand },
    { Value : orderYear },
    { Value : revenueUSD },
    { Value : profitUSD },
    { Value : quantity }
  ],

  // Default visualization (Revenue by Category)
  UI.Chart : {
    $Type      : 'UI.ChartDefinitionType',
    ChartType  : #Column,
    Dimensions : [ category ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : category,   Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant : {
    Visualizations : [ '@UI.Chart', '@UI.LineItem' ],
    SortOrder      : [{ Property : revenueUSD, Descending : true }]
  }
);

// ===========================================================================
// SalesFacts — qualified charts for the four dashboard cards
// ===========================================================================

// 1) Revenue by Country
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byCountry : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Revenue by Country',
    ChartType  : #Column,
    Dimensions : [ customerCountry ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : customerCountry, Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD,      Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byCountry : {
    Visualizations : [ '@UI.Chart#byCountry' ],
    GroupBy        : [ customerCountry ],
    SortOrder      : [{ Property : revenueUSD, Descending : true }],
    MaxItems       : 15
  }
);

// 2) Revenue by Category
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byCategory : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Revenue by Category',
    ChartType  : #Donut,
    Dimensions : [ category ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : category,   Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byCategory : {
    Visualizations : [ '@UI.Chart#byCategory' ],
    GroupBy        : [ category ],
    SortOrder      : [{ Property : revenueUSD, Descending : true }]
  }
);

// 3) Monthly Sales Trend
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byMonth : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Monthly Sales Trend',
    ChartType  : #Line,
    Dimensions : [ orderYear, orderMonth ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [
      { $Type : 'UI.ChartDimensionAttributeType', Dimension : orderYear,  Role : #Category },
      { $Type : 'UI.ChartDimensionAttributeType', Dimension : orderMonth, Role : #Category }
    ],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType', Measure : revenueUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byMonth : {
    Visualizations : [ '@UI.Chart#byMonth' ],
    GroupBy        : [ orderYear, orderMonth ],
    SortOrder      : [
      { Property : orderYear,  Descending : false },
      { Property : orderMonth, Descending : false }
    ]
  }
);

// 4) Store Performance (top markets by revenue)
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byStore : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Store Performance',
    ChartType  : #Column,
    Dimensions : [ storeCountry ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : storeCountry, Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD,   Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byStore : {
    Visualizations : [ '@UI.Chart#byStore' ],
    GroupBy        : [ storeCountry ],
    SortOrder      : [{ Property : revenueUSD, Descending : true }],
    MaxItems       : 15
  }
);

// 5) Online vs Physical — revenue split by sales channel
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byChannel : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Online vs Physical Sales',
    ChartType  : #Donut,
    Dimensions : [ channel ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : channel,    Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byChannel : {
    Visualizations : [ '@UI.Chart#byChannel' ],
    GroupBy        : [ channel ],
    SortOrder      : [{ Property : revenueUSD, Descending : true }]
  }
);

// 6) Daily Revenue Trend — revenue over time at orderDate (day) granularity
annotate AnalyticsService.SalesFacts with @(
  UI.Chart #byDate : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Daily Revenue Trend',
    ChartType  : #Line,
    Dimensions : [ orderDate ],
    Measures   : [ revenueUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : orderDate,  Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : revenueUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#revenue' }]
  },
  UI.PresentationVariant #byDate : {
    Visualizations : [ '@UI.Chart#byDate' ],
    GroupBy        : [ orderDate ],
    SortOrder      : [{ Property : orderDate, Descending : false }]
  },
  // "Last 90 days" window. The dataset is historical (ends 2021-02-20), so a
  // today-relative range would be empty; this filters to the last 90 calendar
  // days of available data (2020-11-23 .. max). Applied by the Daily Revenue
  // Trend card via selectionAnnotationPath.
  UI.SelectionVariant #last90Days : {
    $Type         : 'UI.SelectionVariantType',
    Text          : 'Last 90 Days',
    SelectOptions : [{
      $Type        : 'UI.SelectOptionType',
      PropertyName : orderDate,
      Ranges       : [{
        $Type  : 'UI.SelectionRangeType',
        Sign   : #I,
        Option : #GE,
        Low    : '2020-11-23'
      }]
    }]
  }
);

// ===========================================================================
// SalesFacts — Revenue & Profit KPI tags (with dimensional drill-downs)
// ===========================================================================
// These two KPIs aggregate SalesFacts directly (SUM), so their headline value is
// the grand total and their drill-down charts are meaningful: revenue by month
// (reusing UI.Chart#byMonth) and profit by category (new UI.Chart#profitByCategory).
annotate AnalyticsService.SalesFacts with @(
  UI.SelectionVariant #all : {
    $Type         : 'UI.SelectionVariantType',
    Text          : 'All Sales',
    SelectOptions : []
  },

  // Profit by category — drill-down for the Profit KPI.
  UI.Chart #profitByCategory : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Profit by Category',
    ChartType  : #Column,
    Dimensions : [ category ],
    Measures   : [ profitUSD ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : category,  Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : profitUSD, Role : #Axis1, DataPoint : '@UI.DataPoint#profit' }]
  },
  UI.PresentationVariant #profitByCategory : {
    $Type          : 'UI.PresentationVariantType',
    Visualizations : [ '@UI.Chart#profitByCategory' ],
    GroupBy        : [ category ],
    SortOrder      : [{ Property : profitUSD, Descending : true }]
  }
);

annotate AnalyticsService.SalesFacts with @(
  UI.KPI #revenue : {
    $Type            : 'UI.KPIType',
    DataPoint        : ![@UI.DataPoint#revenue],
    SelectionVariant : ![@UI.SelectionVariant#all],
    Detail           : { $Type : 'UI.KPIDetailType', DefaultPresentationVariant : ![@UI.PresentationVariant#byMonth] }
  },
  UI.KPI #profit : {
    $Type            : 'UI.KPIType',
    DataPoint        : ![@UI.DataPoint#profit],
    SelectionVariant : ![@UI.SelectionVariant#all],
    Detail           : { $Type : 'UI.KPIDetailType', DefaultPresentationVariant : ![@UI.PresentationVariant#profitByCategory] }
  }
);

// ===========================================================================
// OverallPerformance — KPI cards (Total Revenue, Total Profit, Avg Margin %)
// ===========================================================================
// OverallPerformance is always a SINGLE grand-total row (constant key ID = 1,
// no GROUP BY). sap.fe v4 KPI tags use the analytical ($apply/aggregate) path,
// so the entity must be aggregation-capable — the annotations below make it so.
// Because there is exactly one row, SUM/AVG over it returns that row's value,
// i.e. the pre-computed grand totals (and the SQL weighted margin) unchanged.
annotate AnalyticsService.OverallPerformance with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter' ],
  Rollup                 : #None,
  GroupableProperties    : [ ID ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : revenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : profitUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : marginPercent }
  ]
};

annotate AnalyticsService.OverallPerformance with @(
  Aggregation.CustomAggregate #revenueUSD    : 'Edm.Decimal',
  Aggregation.CustomAggregate #profitUSD     : 'Edm.Decimal',
  Aggregation.CustomAggregate #marginPercent : 'Edm.Decimal'
);

annotate AnalyticsService.OverallPerformance with {
  // marginPercent uses #AVG ("Average Margin %"); on the single total row this
  // equals the SQL weighted margin SUM(profit)/SUM(revenue)*100.
  revenueUSD    @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Total Revenue (USD)';
  profitUSD     @Analytics.Measure @Aggregation.default : #SUM @Common.Label : 'Total Profit (USD)';
  marginPercent @Analytics.Measure @Aggregation.default : #AVG @Common.Label : 'Average Margin %';
  // ID is the only groupable property — used as the (single-bar) dimension for
  // each KPI's required detail chart.
  ID            @Analytics.Dimension @Common.Label : 'Overall';
}

annotate AnalyticsService.OverallPerformance with @(
  UI.LineItem : [
    { Value : revenueUSD },
    { Value : profitUSD },
    { Value : marginPercent }
  ],
  UI.DataPoint #revenue : {
    $Type : 'UI.DataPointType',
    Value : revenueUSD,
    Title : 'Total Revenue (USD)'
  },
  UI.DataPoint #profit : {
    $Type : 'UI.DataPointType',
    Value : profitUSD,
    Title : 'Total Profit (USD)'
  },
  // Single-word Title -> KPI tag shows "Mar" rather than "Average Margin %" -> "AM%".
  UI.DataPoint #margin : {
    $Type       : 'UI.DataPointType',
    Value       : marginPercent,
    Title       : 'Margin',
    TargetValue : 60,
    Criticality : #Positive
  }
);

// Empty SelectionVariant => KPI evaluates over all data (grand total).
annotate AnalyticsService.OverallPerformance with @(
  UI.SelectionVariant #all : {
    $Type         : 'UI.SelectionVariantType',
    Text          : 'All Sales',
    SelectOptions : []
  }
);

// Margin KPI detail. marginPercent is a non-additive ratio (SUM(profit)/SUM(revenue)),
// so it stays on the single-row OverallPerformance — its drill-down is a single
// bar (dimension ID). Revenue & Profit KPIs live on SalesFacts (below) with real
// dimensional drill-downs. sap.fe's KPI converter drops a tag unless UI.KPI.Detail
// resolves a PresentationVariant whose Visualizations include a Chart.
annotate AnalyticsService.OverallPerformance with @(
  UI.Chart #kpiMargin : {
    $Type      : 'UI.ChartDefinitionType',
    Title      : 'Average Margin %',
    ChartType  : #Column,
    Dimensions : [ ID ],
    Measures   : [ marginPercent ],
    DimensionAttributes : [{ $Type : 'UI.ChartDimensionAttributeType', Dimension : ID,            Role : #Category }],
    MeasureAttributes   : [{ $Type : 'UI.ChartMeasureAttributeType',   Measure   : marginPercent, Role : #Axis1, DataPoint : '@UI.DataPoint#margin' }]
  },
  UI.PresentationVariant #kpiMargin : { $Type : 'UI.PresentationVariantType', Visualizations : [ '@UI.Chart#kpiMargin' ] }
);

annotate AnalyticsService.OverallPerformance with @(
  UI.KPI #margin : {
    $Type            : 'UI.KPIType',
    DataPoint        : ![@UI.DataPoint#margin],
    SelectionVariant : ![@UI.SelectionVariant#all],
    Detail           : { $Type : 'UI.KPIDetailType', DefaultPresentationVariant : ![@UI.PresentationVariant#kpiMargin] }
  }
);
