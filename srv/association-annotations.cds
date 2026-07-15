using AssociationService from './association-service';

/*
 * Task 3 — UI + analytical annotations for the Association dashboard.
 *
 * Each analysis is one aggregatable entity (materialized table). Its tab stacks
 * a CHART over a stats TABLE — both from the same entity. The OData Aggregation
 * vocabulary (ApplySupported + CustomAggregate + @Aggregation.default) is what
 * lets the sap.fe chart issue $apply; the @Common.Label annotations give the
 * axes/columns business names (mirrors Task 1's SalesFacts).
 */

// ===========================================================================
// 3a. Demographic Affinity  (grain: age bucket x gender x category)
// ===========================================================================
annotate AssociationService.DemographicAffinity with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ AgeBucket, Gender, Category ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : RevenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : Quantity },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : AffinityIndex },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : CategorySharePct }
  ]
};
annotate AssociationService.DemographicAffinity with @(
  Aggregation.CustomAggregate #RevenueUSD       : 'Edm.Decimal',
  Aggregation.CustomAggregate #Quantity         : 'Edm.Int32',
  Aggregation.CustomAggregate #AffinityIndex    : 'Edm.Decimal',
  Aggregation.CustomAggregate #CategorySharePct : 'Edm.Decimal'
);
annotate AssociationService.DemographicAffinity with {
  AgeBucket           @Common.Label : 'Age Group'        @Analytics.Dimension;
  Gender              @Common.Label : 'Gender'           @Analytics.Dimension;
  Category            @Common.Label : 'Product Category' @Analytics.Dimension;
  RevenueUSD          @Common.Label : 'Revenue (USD)'    @Analytics.Measure @Aggregation.default : #SUM;
  Quantity            @Common.Label : 'Units'            @Analytics.Measure @Aggregation.default : #SUM;
  AffinityIndex       @Common.Label : 'Affinity Index'   @Analytics.Measure @Aggregation.default : #AVG;
  CategorySharePct    @Common.Label : 'Segment Share %'  @Analytics.Measure @Aggregation.default : #AVG;
};
annotate AssociationService.DemographicAffinity with @(
  UI.HeaderInfo : { TypeName : 'Segment', TypeNamePlural : 'Demographic Affinity', Title : { $Type : 'UI.DataField', Value : Category } },
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Column,
    Dimensions        : [ Category, Gender ],
    Measures          : [ RevenueUSD ],
    MeasureAttributes : [ { $Type : 'UI.ChartMeasureAttributeType', Measure : RevenueUSD, Role : #Axis1 } ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : AgeBucket },
    { $Type : 'UI.DataField', Value : Gender },
    { $Type : 'UI.DataField', Value : Category },
    { $Type : 'UI.DataField', Value : AffinityIndex,    Criticality : AffinityCriticality },
    { $Type : 'UI.DataField', Value : CategorySharePct },
    { $Type : 'UI.DataField', Value : RevenueUSD },
    { $Type : 'UI.DataField', Value : Quantity }
  ],
  UI.PresentationVariant : {
    SortOrder      : [ { Property : AffinityIndex, Descending : true } ],
    Visualizations : [ '@UI.Chart#Chart', '@UI.LineItem' ]
  },
  UI.SelectionPresentationVariant #Main : {
    Text                : 'Demographic Affinity',
    SelectionVariant    : { Text : 'Demographic Affinity' },
    PresentationVariant : ![@UI.PresentationVariant]
  }
);

// ===========================================================================
// 3b. Price Elasticity  (grain: subcategory)
// ===========================================================================
annotate AssociationService.PriceElasticity with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ Subcategory, Category, Interpretation ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : AvgUnitPriceUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalQuantity },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : ProductCount },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : ElasticityCoefficient },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : RSquared }
  ]
};
annotate AssociationService.PriceElasticity with @(
  Aggregation.CustomAggregate #AvgUnitPriceUSD       : 'Edm.Decimal',
  Aggregation.CustomAggregate #TotalQuantity         : 'Edm.Int32',
  Aggregation.CustomAggregate #ProductCount          : 'Edm.Int32',
  Aggregation.CustomAggregate #ElasticityCoefficient : 'Edm.Decimal',
  Aggregation.CustomAggregate #RSquared              : 'Edm.Decimal'
);
annotate AssociationService.PriceElasticity with {
  Subcategory           @Common.Label : 'Subcategory'          @Analytics.Dimension;
  Category              @Common.Label : 'Category'             @Analytics.Dimension;
  Interpretation        @Common.Label : 'Interpretation'       @Analytics.Dimension;
  AvgUnitPriceUSD       @Common.Label : 'Avg Unit Price (USD)' @Analytics.Measure @Aggregation.default : #AVG;
  TotalQuantity         @Common.Label : 'Units Sold'           @Analytics.Measure @Aggregation.default : #SUM;
  ProductCount          @Common.Label : 'Products'             @Analytics.Measure @Aggregation.default : #SUM;
  ElasticityCoefficient @Common.Label : 'Elasticity (ε)'       @Analytics.Measure @Aggregation.default : #AVG;
  RSquared              @Common.Label : 'R²'                   @Analytics.Measure @Aggregation.default : #AVG;
};
annotate AssociationService.PriceElasticity with @(
  UI.HeaderInfo : { TypeName : 'Subcategory', TypeNamePlural : 'Price Elasticity', Title : { $Type : 'UI.DataField', Value : Subcategory } },
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Scatter,
    Dimensions        : [ Subcategory ],
    Measures          : [ AvgUnitPriceUSD, TotalQuantity ],
    MeasureAttributes : [
      { $Type : 'UI.ChartMeasureAttributeType', Measure : AvgUnitPriceUSD, Role : #Axis1 },
      { $Type : 'UI.ChartMeasureAttributeType', Measure : TotalQuantity,   Role : #Axis2 }
    ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : Subcategory },
    { $Type : 'UI.DataField', Value : Category },
    { $Type : 'UI.DataField', Value : ElasticityCoefficient, Criticality : ElasticityCriticality },
    { $Type : 'UI.DataField', Value : Interpretation },
    { $Type : 'UI.DataField', Value : RSquared },
    { $Type : 'UI.DataField', Value : AvgUnitPriceUSD },
    { $Type : 'UI.DataField', Value : TotalQuantity },
    { $Type : 'UI.DataField', Value : ProductCount }
  ],
  UI.PresentationVariant : {
    SortOrder      : [ { Property : TotalQuantity, Descending : true } ],
    Visualizations : [ '@UI.Chart#Chart', '@UI.LineItem' ]
  },
  UI.SelectionPresentationVariant #Main : {
    Text                : 'Price Elasticity',
    SelectionVariant    : { Text : 'Price Elasticity' },
    PresentationVariant : ![@UI.PresentationVariant]
  }
);

// ===========================================================================
// 3c-i. Store Size vs Revenue  (grain: physical store)
// ===========================================================================
annotate AssociationService.StoreSizeRevenue with @Aggregation.ApplySupported : {
  $Type                  : 'Aggregation.ApplySupportedType',
  Transformations        : [ 'aggregate', 'groupby', 'filter', 'concat', 'identity' ],
  Rollup                 : #None,
  GroupableProperties    : [ StoreLabel, SizeBand, StoreKey ],
  AggregatableProperties : [
    { $Type : 'Aggregation.AggregatablePropertyType', Property : TotalRevenueUSD },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : SquareMeters },
    { $Type : 'Aggregation.AggregatablePropertyType', Property : RevenuePerSqm }
  ]
};
annotate AssociationService.StoreSizeRevenue with @(
  Aggregation.CustomAggregate #TotalRevenueUSD : 'Edm.Decimal',
  Aggregation.CustomAggregate #SquareMeters    : 'Edm.Decimal',
  Aggregation.CustomAggregate #RevenuePerSqm   : 'Edm.Decimal'
);
annotate AssociationService.StoreSizeRevenue with {
  StoreLabel      @Common.Label : 'Store'               @Analytics.Dimension;
  SizeBand        @Common.Label : 'Store Size Band'     @Analytics.Dimension;
  StoreKey        @Common.Label : 'Store Key'           @Analytics.Dimension;
  SquareMeters    @Common.Label : 'Floor Area (m²)'     @Analytics.Measure @Aggregation.default : #AVG;
  TotalRevenueUSD @Common.Label : 'Total Revenue (USD)' @Analytics.Measure @Aggregation.default : #SUM;
  RevenuePerSqm   @Common.Label : 'Revenue / m² (USD)'  @Analytics.Measure @Aggregation.default : #AVG;
};
annotate AssociationService.StoreSizeRevenue with @(
  UI.HeaderInfo : { TypeName : 'Store', TypeNamePlural : 'Store Size vs Revenue', Title : { $Type : 'UI.DataField', Value : StoreLabel } },
  UI.Chart #Chart : {
    $Type             : 'UI.ChartDefinitionType',
    ChartType         : #Column,
    Dimensions        : [ SizeBand ],
    Measures          : [ TotalRevenueUSD ],
    MeasureAttributes : [ { $Type : 'UI.ChartMeasureAttributeType', Measure : TotalRevenueUSD, Role : #Axis1 } ]
  },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : StoreLabel },
    { $Type : 'UI.DataField', Value : SizeBand },
    { $Type : 'UI.DataField', Value : SquareMeters },
    { $Type : 'UI.DataField', Value : TotalRevenueUSD },
    { $Type : 'UI.DataField', Value : RevenuePerSqm }
  ],
  UI.PresentationVariant : {
    SortOrder      : [ { Property : TotalRevenueUSD, Descending : true } ],
    Visualizations : [ '@UI.Chart#Chart', '@UI.LineItem' ]
  },
  UI.SelectionPresentationVariant #Main : {
    Text                : 'Store Size vs Revenue',
    SelectionVariant    : { Text : 'Store Size vs Revenue' },
    PresentationVariant : ![@UI.PresentationVariant]
  }
);

// ===========================================================================
// 3c-ii. Store Size vs Revenue — correlation verdict (single row, table only)
// ===========================================================================
annotate AssociationService.StoreSizeCorrelation with {
  PearsonR        @Common.Label : 'Pearson r';
  RSquared        @Common.Label : 'R²';
  Strength        @Common.Label : 'Strength';
  Direction       @Common.Label : 'Direction';
  AssumptionHolds @Common.Label : 'Bigger ⇒ More Revenue?';
  SampleSize      @Common.Label : 'Stores (n)';
  Interpretation  @Common.Label : 'Interpretation';
};
annotate AssociationService.StoreSizeCorrelation with @(
  UI.HeaderInfo : { TypeName : 'Correlation', TypeNamePlural : 'Correlation Verdict', Title : { $Type : 'UI.DataField', Value : Strength } },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : PearsonR },
    { $Type : 'UI.DataField', Value : RSquared },
    { $Type : 'UI.DataField', Value : Strength },
    { $Type : 'UI.DataField', Value : Direction },
    { $Type : 'UI.DataField', Value : AssumptionHolds },
    { $Type : 'UI.DataField', Value : SampleSize },
    { $Type : 'UI.DataField', Value : Interpretation }
  ],
  UI.PresentationVariant : { Visualizations : [ '@UI.LineItem' ] },
  UI.SelectionPresentationVariant #Main : {
    Text                : 'Correlation Verdict',
    SelectionVariant    : { Text : 'Correlation Verdict' },
    PresentationVariant : ![@UI.PresentationVariant]
  }
);
