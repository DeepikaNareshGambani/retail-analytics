using retail.analytics.assocstats as stats from '../db/association-stats';

/**
 * Task 3 — Association service (OData V4, read-only).
 *
 * Separate service (own path /association) so Task 1's AnalyticsService and
 * Task 2's InsightsService stay byte-for-byte unchanged.
 *
 * The four collections are projections on real, persisted tables that are
 * populated once at startup from the JS statistics (srv/association-service.js
 * -> populate()). Because they are real tables they are natively aggregatable
 * ($apply) — so each Fiori Elements tab can stack a chart over its stats table
 * from one entity — and they support the /$count path used by the tab badges.
 */
@path : '/association'
@impl : 'srv/association-service.js'
service AssociationService {

  @readonly entity DemographicAffinity      as projection on stats.DemographicAffinityStats;
  @readonly entity PriceElasticity          as projection on stats.PriceElasticityStats;
  @readonly entity StoreSizeRevenue         as projection on stats.StoreSizeStats;
  @readonly entity StoreSizeCorrelation     as projection on stats.StoreSizeCorrelationStats;
}
