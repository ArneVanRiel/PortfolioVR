// controllers/secController.js
const { getSec } = require('./BE_getSecData');
const axios = require('axios');
const { sql } = require('../config/database'); // Import sql
//const { getCIK, cikCache } = require('../services/secService'); // Importeer de CIK-gerelateerde functies

const getSecData = async (req, res) => {
  const { ticker } = req.params;
  try {
    const data = await getSec(ticker);
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Fout bij het ophalen van SEC-data:', error);
    res.status(500).send('Serverfout bij het ophalen van SEC-data.');
  }
};

const fetchMissingData = async (req, res) => {
  const { ticker } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker is verplicht' });
  try {
    const cik = await getCIK(ticker);
    if (!cik) return res.status(404).json({ error: 'Geen CIK gevonden' });

    const secResponse = await axios.get(`https://data.sec.gov/api/xbrl/company_facts/${cik}.json`, {
      headers: { 'User-Agent': 'belegger-app/1.0 (contact: arne.van.riel@hotmail.be)' }
    });

    const companyData = secResponse.data;
    if (!companyData || !companyData.facts || !companyData.facts.us_gaap) return res.json([]);

    const financialKey = Object.keys(companyData.facts.us_gaap)[0];
    const financials = companyData.facts.us_gaap[financialKey]?.units.USD || [];

    const missingData = financials.map(f => ({
      ticker,
      period_end_date: f.end,
      value: f.val
    }));

    res.status(200).json(missingData);
  } catch (error) {
    console.error("Fout bij ophalen ontbrekende data:", error);
    res.status(500).json({ error: "Interne serverfout" });
  }
};

const addMissingData = async (req, res) => {
  try {
    const { approvedData } = req.body;
    if (!Array.isArray(approvedData) || approvedData.length === 0) {
      return res.status(400).json({ error: "Geen data om toe te voegen." });
    }

    const { sql } = require('../config/database'); // Importeer sql
    const insertQuery = `
      INSERT INTO [dbo].[aandelen_data_] (ticker, period_end_date, value)
      VALUES ${approvedData.map(d => `('${d.ticker}', '${d.period_end_date}', ${d.value})`).join(", ")}
    `;

    await new sql.Request().query(insertQuery);

    res.status(200).json({ message: "Ontbrekende data succesvol toegevoegd!" });

  } catch (error) {
    console.error("Fout bij invoegen van data:", error);
    res.status(500).json({ error: "Interne serverfout" });
  }
};

const getAllStocks = async (req, res) => {
  try {
    const result = await sql.query`SELECT aandeel_id as stock_id, ticker_symbol as ticker, name FROM Stocks`;
    res.json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van alle aandelen:', error);
    res.status(500).send('Serverfout bij het ophalen van alle aandelen.');
  }
};

module.exports = { getSecData, fetchMissingData, addMissingData, getAllStocks };