const { sql } = require('../config/database');

const getAllBrokers = async (req, res) => {
    try {
        const result = await sql.query`SELECT broker_id, name FROM Brokers ORDER BY name ASC`;
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen brokers:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen brokers' });
    }
};

const createBroker = async (req, res) => {
    const { name } = req.body;
    try {
        await new sql.Request()
            .input('name', sql.NVarChar, name)
            .query(`INSERT INTO Brokers (name) VALUES (@name)`);
        res.status(201).json({ message: 'Broker succesvol toegevoegd' });
    } catch (err) {
        console.error('Fout bij toevoegen broker:', err);
        res.status(500).json({ message: 'Serverfout bij toevoegen broker' });
    }
};

const updateBroker = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await new sql.Request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar, name)
            .query(`UPDATE Brokers SET name = @name WHERE broker_id = @id`);
        res.json({ message: 'Broker succesvol bijgewerkt' });
    } catch (err) {
        console.error('Fout bij updaten broker:', err);
        res.status(500).json({ message: 'Serverfout bij updaten broker' });
    }
};

const deleteBroker = async (req, res) => {
    const { id } = req.params;
    try {
        await new sql.Request()
            .input('id', sql.Int, id)
            .query(`DELETE FROM Brokers WHERE broker_id = @id`);
        res.json({ message: 'Broker succesvol verwijderd' });
    } catch (err) {
        console.error('Fout bij verwijderen broker:', err);
        res.status(500).json({ message: 'Serverfout bij verwijderen broker' });
    }
};

module.exports = { getAllBrokers, createBroker, updateBroker, deleteBroker };