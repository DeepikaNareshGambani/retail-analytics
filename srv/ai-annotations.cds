using AIService from './ai-service';

/*
 * Task 4 — UI annotations for the AI dashboard.
 *
 * AIDashboards drives an Object Page: a KPI header (Revenue / Profit / Margin /
 * Orders DataPoints) plus an Executive Insights section (the opportunities/risks
 * table via the `insights` association). ExecutiveInsights is a plain list, so FE
 * renders a ResponsiveTable with plain reads + /$count.
 */

// ===========================================================================
// AIDashboards — Object Page (KPI header + insights section)
// ===========================================================================
annotate AIService.AIDashboards with {
  title         @Common.Label : 'Dashboard';
  topMarket     @Common.Label : 'Top Market';
  revenueUSD    @Common.Label : 'Total Revenue (USD)';
  profitUSD     @Common.Label : 'Total Profit (USD)';
  marginPercent @Common.Label : 'Gross Margin %';
  totalOrders   @Common.Label : 'Orders';
  totalUnits    @Common.Label : 'Units';
};

annotate AIService.AIDashboards with @(
  UI.HeaderInfo : {
    TypeName       : 'Sales Health',
    TypeNamePlural : 'Sales Health',
    Title          : { $Type : 'UI.DataField', Value : title },
    Description    : { $Type : 'UI.DataField', Value : topMarket }
  },
  UI.DataPoint #revenue : { $Type : 'UI.DataPointType', Value : revenueUSD,    Title : 'Total Revenue (USD)' },
  UI.DataPoint #profit  : { $Type : 'UI.DataPointType', Value : profitUSD,     Title : 'Total Profit (USD)' },
  UI.DataPoint #margin  : { $Type : 'UI.DataPointType', Value : marginPercent, Title : 'Gross Margin %' },
  UI.DataPoint #orders  : { $Type : 'UI.DataPointType', Value : totalOrders,   Title : 'Total Orders' },
  UI.HeaderFacets : [
    { $Type : 'UI.ReferenceFacet', ID : 'kpiRevenue', Target : '@UI.DataPoint#revenue' },
    { $Type : 'UI.ReferenceFacet', ID : 'kpiProfit',  Target : '@UI.DataPoint#profit' },
    { $Type : 'UI.ReferenceFacet', ID : 'kpiMargin',  Target : '@UI.DataPoint#margin' },
    { $Type : 'UI.ReferenceFacet', ID : 'kpiOrders',  Target : '@UI.DataPoint#orders' }
  ],
  UI.Facets : [
    { $Type : 'UI.ReferenceFacet', ID : 'insightsSection', Label : 'Executive Insights', Target : 'insights/@UI.LineItem' }
  ],
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : title,         Label : 'Dashboard' },
    { $Type : 'UI.DataField', Value : revenueUSD,    Label : 'Revenue (USD)' },
    { $Type : 'UI.DataField', Value : profitUSD,     Label : 'Profit (USD)' },
    { $Type : 'UI.DataField', Value : marginPercent, Label : 'Margin %' }
  ]
);

/*
 * ExecutiveInsights — the opportunities/risks table shown in the OP section.
 * Grouped by Opportunity/Risk with semantic criticality status + icons.
 */
annotate AIService.ExecutiveInsights with {
  category    @Common.Label : 'Type';
  rank        @Common.Label : 'Priority';
  insight     @Common.Label : 'Insight';
};

annotate AIService.ExecutiveInsights with @(
  UI.HeaderInfo : {
    TypeName       : 'Insight',
    TypeNamePlural : 'Executive Insights',
    Title          : { $Type : 'UI.DataField', Value : category },
    Description    : { $Type : 'UI.DataField', Value : insight }
  },
  UI.LineItem : [
    { $Type                     : 'UI.DataField',
      Value                     : category,
      Criticality               : criticality,
      CriticalityRepresentation : #WithIcon,
      ![@UI.Importance]         : #High,
      Label                     : 'Type' },
    { $Type             : 'UI.DataField',
      Value             : insight,
      ![@UI.Importance] : #High,
      Label             : 'Insight' },
    { $Type             : 'UI.DataField',
      Value             : rank,
      ![@UI.Importance] : #Low,
      Label             : 'Priority' }
  ],
  UI.PresentationVariant : {
    GroupBy        : [ category ],
    SortOrder      : [ { Property : criticality, Descending : true }, { Property : rank } ],
    Visualizations : [ '@UI.LineItem' ]
  }
);
