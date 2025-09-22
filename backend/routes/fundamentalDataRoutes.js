// routes/fundamentalDataRoutes.js
const express = require('express');
const router = express.Router();
const fundamentalDataController = require('../controllers/fundamentalDataController');

// Route om handmatige fundamentele data toe te voegen of bij te werken
router.post('/manual', fundamentalDataController.addManualFundamentalData);

// Route om SEC data op te halen
router.post('/fetch-sec', fundamentalDataController.fetchAndParseSecData);

// Route om opgehaalde SEC data op te slaan
router.post('/save-sec-fetched', fundamentalDataController.saveFetchedSecData);

// Route om earnings calendar data op te halen via ticker
router.get('/earnings-calendar/:tickerSymbol', fundamentalDataController.getEarningsCalendarDatesByTicker);

// Route om Alpha Vantage data op te halen
router.post('/fetch-alphavantage', fundamentalDataController.fetchAndParseAlphaVantageData);

// Route om opgehaalde Alpha Vantage data op te slaan
router.post('/save-alphavantage-fetched', fundamentalDataController.saveFetchedAlphaVantageData);

// Route om alle fundamentele data voor een specifieke stock op te halen
router.get('/stock/:stockId/all-periods', fundamentalDataController.getAllFundamentalDataForStock);

// Route to get the latest fundamental data in a pivoted format
router.get('/stock/:stockId/latest-pivoted', fundamentalDataController.getLatestFundamentalDataPivoted);

// Route om de data sufficiency te controleren
router.get('/sufficiency-check/:stockId', fundamentalDataController.checkFundamentalDataSufficiency);

// Route om datumdata te controleren en suggesties te geven
router.get('/check-date-data/:stockId/:periodEndDate', fundamentalDataController.checkDateAndFetchData);

// NIEUW: Route om een specifieke fundamentele data rij te verwijderen op basis van ID
// De frontend stuurt nu de unieke 'id' van de rij.
router.delete('/delete-data/:id', fundamentalDataController.deleteFundamentalData);

router.post('/single-stock-analysis/:stockId', fundamentalDataController.getSingleStockAnalysis);

// NIEUW: Routes voor dropdowns
router.get('/fiscal-periods', fundamentalDataController.getFiscalPeriods);
router.get('/forms', fundamentalDataController.getForms);

// NIEUW: Route om Python SEC script uit te voeren
router.post('/run-python-sec-script', fundamentalDataController.runPythonSecScript);

module.exports = router;