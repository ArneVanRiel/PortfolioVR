// controllers/secController.js
const { sql } = require('../config/database');

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

module.exports = { getAllStocks, createStock, updateStock, deleteStock };