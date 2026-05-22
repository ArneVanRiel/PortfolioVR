const { sql } = require('../config/database');

const getAllStockExchanges = async (req, res) => {
    try {
        const result = await sql.query`SELECT stock_exchange_id, name FROM StockExchange ORDER BY name ASC`;
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen beurzen:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen beurzen' });
    }
};

const createStockExchange = async (req, res) => {
    const { name } = req.body;
    try {
        await new sql.Request()
            .input('name', sql.NVarChar, name)
            .query(`INSERT INTO StockExchange (name) VALUES (@name)`);
        res.status(201).json({ message: 'Beurs succesvol toegevoegd' });
    } catch (err) {
        console.error('Fout bij toevoegen beurs:', err);
        res.status(500).json({ message: 'Serverfout bij toevoegen beurs' });
    }
};

const updateStockExchange = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await new sql.Request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar, name)
            .query(`UPDATE StockExchange SET name = @name WHERE stock_exchange_id = @id`);
        res.json({ message: 'Beurs succesvol bijgewerkt' });
    } catch (err) {
        console.error('Fout bij updaten beurs:', err);
        res.status(500).json({ message: 'Serverfout bij updaten beurs' });
    }
};

const deleteStockExchange = async (req, res) => {
    const { id } = req.params;
    try {
        await new sql.Request()
            .input('id', sql.Int, id)
            .query(`DELETE FROM StockExchange WHERE stock_exchange_id = @id`);
        res.json({ message: 'Beurs succesvol verwijderd' });
    } catch (err) {
        console.error('Fout bij verwijderen beurs:', err);
        res.status(500).json({ message: 'Serverfout bij verwijderen beurs' });
    }
};

module.exports = { getAllStockExchanges, createStockExchange, updateStockExchange, deleteStockExchange };