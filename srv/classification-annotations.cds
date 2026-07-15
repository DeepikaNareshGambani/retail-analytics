using ClassificationService from './classification-service';

/*
 * Task 2 (Fiori Elements edition) — UI + analytical annotations.
 *
 * Each classification is one aggregatable materialized entity, driving an FE tab
 * with a chart + a table. The OData Aggregation vocabulary (ApplySupported +
 * CustomAggregate + @Aggregation.default) lets the sap.fe chart issue $apply;
 * @Common.Label names the axes/columns; *Criticality colours the class column.
 */

// ===========================================================================
// 2a. Customer Segmentation (RFM) — spend by segment
// ===========================================================================
annotate ClassificationService.CustomerSegments with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ Segment, Continent, Country, AgeCategory ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalSpendUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : OrderCount },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : VIPScore }
  ]
};
annotate ClassificationService.CustomerSegments with @(
  Aggregation.CustomAggregate #TotalSpendUSD : 'Edm.Decimal',
  Aggregation.CustomAggregate #OrderCount    : 'Edm.Int32',
  Aggregation.CustomAggregate #VIPScore      : 'Edm.Int32'
);
annotate ClassificationService.CustomerSegments with {
  Segment       @Common.Label : 'Segment'        @Analytics.Dimension;
  Continent     @Common.Label : 'Continent'      @Analytics.Dimension;
  Country       @Common.Label : 'Country'        @Analytics.Dimension;
  AgeCategory   @Common.Label : 'Age Category'   @Analytics.Dimension;
  CustomerName  @Common.Label : 'Customer';
  TotalSpendUSD @Common.Label : 'Total Spend (USD)' @Analytics.Measure @Aggregation.default : #SUM;
  OrderCount    @Common.Label : 'Orders'         @Analytics.Measure @Aggregation.default : #SUM;
  VIPScore      @Common.Label : 'VIP Score'      @Analytics.Measure @Aggregation.default : #AVG;
  RecencyScore   @Common.Label : 'R';
  FrequencyScore @Common.Label : 'F';
  MonetaryScore  @Common.Label : 'M';
};
annotate ClassificationService.CustomerSegments with @(
  UI.HeaderInfo : { TypeName : 'Customer', TypeNamePlural : 'Customer Segmentation', Title : { $Type : 'UI.DataField', Value : CustomerName } },
  UI.SelectionFields : [ Segment, Continent, Country, AgeCategory ],
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Column,
    Dimensions        : [ Segment ],
    Measures          : [ TotalSpendUSD ],
    MeasureAttributes : [ { $Type : 'UI.ChartMeasureAttributeType', Measure : TotalSpendUSD, Role : #Axis1 } ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : CustomerName },
    { $Type : 'UI.DataField', Value : Segment, Criticality : SegmentCriticality, CriticalityRepresentation : #WithIcon },
    { $Type : 'UI.DataField', Value : Country },
    { $Type : 'UI.DataField', Value : AgeCategory },
    { $Type : 'UI.DataField', Value : TotalSpendUSD },
    { $Type : 'UI.DataField', Value : OrderCount },
    { $Type : 'UI.DataField', Value : VIPScore },
    { $Type : 'UI.DataField', Value : RecencyScore },
    { $Type : 'UI.DataField', Value : FrequencyScore },
    { $Type : 'UI.DataField', Value : MonetaryScore }
  ],
  UI.PresentationVariant : { SortOrder : [ { Property : TotalSpendUSD, Descending : true } ], Visualizations : [ '@UI.Chart#Chart' ] },
  UI.SelectionPresentationVariant #Main : { Text : 'Customer Segmentation', SelectionVariant : { Text : 'Customer Segmentation' }, PresentationVariant : ![@UI.PresentationVariant] }
);

// ===========================================================================
// 2b. Product Performance — margin vs volume quadrant scatter
// ===========================================================================
annotate ClassificationService.ProductTiers with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ ProductName, Quadrant ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalQuantitySold },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalRevenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : MarginPercent }
  ]
};
annotate ClassificationService.ProductTiers with @(
  Aggregation.CustomAggregate #TotalQuantitySold : 'Edm.Int32',
  Aggregation.CustomAggregate #TotalRevenueUSD   : 'Edm.Decimal',
  Aggregation.CustomAggregate #MarginPercent     : 'Edm.Decimal'
);
annotate ClassificationService.ProductTiers with {
  ProductName       @Common.Label : 'Product'            @Analytics.Dimension;
  Quadrant          @Common.Label : 'Quadrant'           @Analytics.Dimension;
  TotalQuantitySold @Common.Label : 'Units Sold'         @Analytics.Measure @Aggregation.default : #SUM;
  TotalRevenueUSD   @Common.Label : 'Revenue (USD)'      @Analytics.Measure @Aggregation.default : #SUM;
  MarginPercent     @Common.Label : 'Margin %'           @Analytics.Measure @Aggregation.default : #AVG;
};
annotate ClassificationService.ProductTiers with @(
  UI.HeaderInfo : { TypeName : 'Product', TypeNamePlural : 'Product Performance', Title : { $Type : 'UI.DataField', Value : ProductName } },
  UI.SelectionFields : [ Quadrant ],
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Scatter,
    Dimensions        : [ ProductName ],
    Measures          : [ TotalQuantitySold, MarginPercent ],
    MeasureAttributes : [
      { $Type : 'UI.ChartMeasureAttributeType', Measure : TotalQuantitySold, Role : #Axis1 },
      { $Type : 'UI.ChartMeasureAttributeType', Measure : MarginPercent,     Role : #Axis2 }
    ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : ProductName },
    { $Type : 'UI.DataField', Value : Quadrant, Criticality : QuadrantCriticality, CriticalityRepresentation : #WithIcon },
    { $Type : 'UI.DataField', Value : MarginPercent },
    { $Type : 'UI.DataField', Value : TotalQuantitySold },
    { $Type : 'UI.DataField', Value : TotalRevenueUSD }
  ],
  UI.PresentationVariant : { SortOrder : [ { Property : TotalRevenueUSD, Descending : true } ], Visualizations : [ '@UI.Chart#Chart' ] },
  UI.SelectionPresentationVariant #Main : { Text : 'Product Performance', SelectionVariant : { Text : 'Product Performance' }, PresentationVariant : ![@UI.PresentationVariant] }
);

// ===========================================================================
// 2c. Store Efficiency — revenue per m² by tier
// ===========================================================================
annotate ClassificationService.StoreTiers with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ Tier, StoreName ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalRevenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : RevenuePerSquareMeter },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : SquareMeters }
  ]
};
annotate ClassificationService.StoreTiers with @(
  Aggregation.CustomAggregate #TotalRevenueUSD       : 'Edm.Decimal',
  Aggregation.CustomAggregate #RevenuePerSquareMeter : 'Edm.Decimal',
  Aggregation.CustomAggregate #SquareMeters          : 'Edm.Decimal'
);
annotate ClassificationService.StoreTiers with {
  Tier                  @Common.Label : 'Tier'                @Analytics.Dimension;
  StoreName             @Common.Label : 'Store'               @Analytics.Dimension;
  TotalRevenueUSD       @Common.Label : 'Total Revenue (USD)' @Analytics.Measure @Aggregation.default : #SUM;
  RevenuePerSquareMeter @Common.Label : 'Revenue / m² (USD)'  @Analytics.Measure @Aggregation.default : #AVG;
  SquareMeters          @Common.Label : 'Floor Area (m²)'     @Analytics.Measure @Aggregation.default : #AVG;
  PercentileRank        @Common.Label : 'Percentile';
};
annotate ClassificationService.StoreTiers with @(
  UI.HeaderInfo : { TypeName : 'Store', TypeNamePlural : 'Store Efficiency', Title : { $Type : 'UI.DataField', Value : StoreName } },
  UI.SelectionFields : [ Tier ],
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Column,
    Dimensions        : [ Tier ],
    Measures          : [ RevenuePerSquareMeter ],
    MeasureAttributes : [ { $Type : 'UI.ChartMeasureAttributeType', Measure : RevenuePerSquareMeter, Role : #Axis1 } ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : StoreName },
    { $Type : 'UI.DataField', Value : Tier, Criticality : TierCriticality, CriticalityRepresentation : #WithIcon },
    { $Type : 'UI.DataField', Value : RevenuePerSquareMeter },
    { $Type : 'UI.DataField', Value : TotalRevenueUSD },
    { $Type : 'UI.DataField', Value : SquareMeters },
    { $Type : 'UI.DataField', Value : PercentileRank }
  ],
  UI.PresentationVariant : { SortOrder : [ { Property : RevenuePerSquareMeter, Descending : true } ], Visualizations : [ '@UI.Chart#Chart' ] },
  UI.SelectionPresentationVariant #Main : { Text : 'Store Efficiency', SelectionVariant : { Text : 'Store Efficiency' }, PresentationVariant : ![@UI.PresentationVariant] }
);
