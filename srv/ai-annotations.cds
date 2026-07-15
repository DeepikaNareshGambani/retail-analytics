using AIService from './ai-service';

/*
 * Task 4 — UI annotations for the executive-insights narrative table.
 * A plain (non-aggregatable) list, so Fiori Elements renders a ResponsiveTable
 * with plain reads + /$count (both supported by the materialized table).
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
