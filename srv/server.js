const cds = require('@sap/cds')
const { renderReportPDF } = require('./lib/report')

/**
 * Custom server bootstrap.
 *
 * Registers the downloadable RPT-1 report as a plain GET endpoint (outside the
 * /ai OData namespace so it isn't intercepted by the OData router). The Fiori UI
 * links to this URL to download the "Annual Global Sales Review" PDF.
 *
 * Registered in the 'bootstrap' phase (this file loads before services mount),
 * so the route is in place ahead of the OData routers.
 */
cds.on('bootstrap', (app) => {
  app.get('/reports/global-review.pdf', async (_req, res) => {
    try {
      const ai = await cds.connect.to('AIService')
      const data = JSON.parse(await ai.send('generateGlobalReview'))
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'attachment; filename="Annual-Global-Sales-Review.pdf"')
      renderReportPDF(res, data)
    } catch (e) {
      cds.log('ai').error('report generation failed:', e)
      res.status(500).send('Report generation failed: ' + e.message)
    }
  })
})

module.exports = cds.server
