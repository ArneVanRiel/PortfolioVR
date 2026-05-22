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
    const result = await sql.query`SELECT aandeel_id as stock_id, ticker_symbol as ticker, name, isin, asset_type_id FROM Stocks`;
    res.json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van alle aandelen:', error);
    res.status(500).send('Serverfout bij het ophalen van alle aandelen.');
  }
};

const createStock = async (req, res) => {
  const { name, ticker_symbol, stock_exchange_id, asset_type_id, isin } = req.body;

  if (!name || !ticker_symbol || !asset_type_id) {
    return res.status(400).json({ message: 'Naam, ticker en asset type zijn verplicht.' });
  }

  try {
    const request = new sql.Request();
    await request
      .input('name', sql.NVarChar, name)
      .input('ticker_symbol', sql.NVarChar, ticker_symbol)
      .input('stock_exchange_id', sql.Int, stock_exchange_id || null)
      .input('asset_type_id', sql.Int, asset_type_id)
      .input('isin', sql.NVarChar, isin || null)
      .query(`
        INSERT INTO Stocks (name, ticker_symbol, stock_exchange_id, asset_type_id, isin)
        VALUES (@name, @ticker_symbol, @stock_exchange_id, @asset_type_id, @isin)
      `);

    res.status(201).json({ message: 'Aandeel succesvol toegevoegd.' });
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) { // Unique constraint violation
        return res.status(409).json({ message: 'Aandeel met deze ticker bestaat al.' });
    }
    console.error('Fout bij het aanmaken van aandeel:', error);
    res.status(500).json({ message: 'Serverfout bij het aanmaken van aandeel.' });
  }
};

const updateStock = async (req, res) => {
  const { id } = req.params;
  const { name, ticker, isin } = req.body;

  try {
    const request = new sql.Request();
    await request
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('ticker', sql.NVarChar, ticker)
      .input('isin', sql.NVarChar, isin || null)
      .query(`
        UPDATE Stocks 
        SET name = @name, ticker_symbol = @ticker, isin = @isin
        WHERE aandeel_id = @id
      `);
    res.status(200).json({ message: 'Aandeel succesvol bijgewerkt.' });
  } catch (error) {
    console.error('Fout bij het bijwerken van aandeel:', error);
    res.status(500).json({ message: 'Serverfout bij het bijwerken van aandeel.' });
  }
};

const deleteStock = async (req, res) => {
  const { id } = req.params;
  try {
    const request = new sql.Request();
    const result = await request.input('id', sql.Int, id).query(`DELETE FROM Stocks WHERE aandeel_id = @id`);
    if (result.rowsAffected[0] > 0) {
      res.status(200).json({ message: 'Aandeel succesvol verwijderd.' });
    } else {
      res.status(404).json({ message: 'Aandeel niet gevonden.' });
    }
  } catch (error) {
    console.error('Fout bij het verwijderen van aandeel:', error);
    if (error.number === 547) { // SQL Server Foreign Key constraint violation
      res.status(409).json({ message: 'Kan aandeel niet verwijderen omdat er nog transacties of berekeningen aan gekoppeld zijn.' });
    } else {
      res.status(500).json({ message: 'Serverfout bij het verwijderen van aandeel.' });
    }
  }
};

module.exports = { getSecData, fetchMissingData, addMissingData, getAllStocks, createStock, updateStock, deleteStock };