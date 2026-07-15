using retail.analytics.classification as cl from '../db/classification-stats';

/**
 * Task 2 (Fiori Elements edition) — Classification service (OData V4, read-only).
 *
 * Exposes the materialized classification tables so a Fiori Elements app can
 * chart + tabulate them. Separate path (/classification) and impl so the
 * existing freestyle Task 2 (InsightsService, /insights) stays untouched.
 */
@path : '/classification'
@impl : 'srv/classification-service.js'
service ClassificationService {

  @readonly entity CustomerSegments as projection on cl.CustomerSegment;
  @readonly entity ProductTiers     as projection on cl.ProductTier;
  @readonly entity StoreTiers       as projection on cl.StoreTier;
}
