// controllers/availableBalanceController.js
const { sql, config } = require('../config/database'); // Importeer getRequest is verwijderd

// Functie om alle beschikbare saldo types op te halen
const getBalanceTypes = async (req, res) => {
    try {
        const request = new sql.Request(); // Verkrijg een nieuw request object
        const result = await request.query`SELECT balance_type_id, type_name FROM AvailableBalanceTypes ORDER BY balance_type_id`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen saldo types:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van saldo types.', error: err.message });
    }
};

// Functie om de meest recente beschikbare vermogensdata op te halen
const getLatestAvailableBalance = async (req, res) => {
    try {
        const request = new sql.Request(); // Verkrijg een nieuw request object
        const latestBalancesResult = await request.query`
            SELECT ab.balance_type_id, abt.type_name, ab.amount, ab.update_date
            FROM AvailableBalances ab
            JOIN AvailableBalanceTypes abt ON ab.balance_type_id = abt.balance_type_id
            WHERE ab.update_date IN (
                SELECT MAX(update_date)
                FROM AvailableBalances
                WHERE balance_type_id = ab.balance_type_id
                GROUP BY balance_type_id
            )
        `;

        const request2 = new sql.Request(); // Maak een nieuw request object aan voor de tweede query
        const lastUpdateDateResult = await request2.query`
            SELECT MAX(update_date) AS last_update_date
            FROM AvailableBalances
        `;
        const lastUpdateDate = lastUpdateDateResult.recordset[0]?.last_update_date || null;

        let totalAmount = 0;
        const balances = {};
        latestBalancesResult.recordset.forEach(record => {
            balances[record.type_name] = record.amount;
            totalAmount += parseFloat(record.amount);
        });

        res.status(200).json({
            totalAmount: totalAmount,
            lastUpdateDate: lastUpdateDate,
            balances: balances
        });

    } catch (err) {
        console.error('Fout bij ophalen meest recente saldo:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van het meest recente vermogen.', error: err.message });
    }
};

// Functie om een nieuwe set van beschikbare vermogensdata toe te voegen of bij te werken
const addOrUpdateAvailableBalance = async (req, res) => {
    const { balances } = req.body;
    const updateDate = new Date();

    if (!balances || !Array.isArray(balances) || balances.length === 0) {
        return res.status(400).json({ message: 'Geen saldo gegevens ontvangen.' });
    }

    let transaction; // Declareer transaction buiten de try blok om toegang te hebben in catch
    try {
        const pool = await sql.connect(config); // Gebruik pool.request() ipv sql.connect(config)
        transaction = new sql.Transaction(pool); // Maak transactie op de pool
        await transaction.begin();

        for (const balance of balances) {
            const { balance_type_id, amount } = balance;

            if (typeof balance_type_id === 'undefined' || typeof amount === 'undefined') {
                throw new Error('Ongeldige saldo gegevens: balance_type_id en amount zijn verplicht.');
            }

            await transaction.request() // Gebruik transaction.request() om aan de transactie te koppelen
                .input('balance_type_id', sql.Int, balance_type_id)
                .input('amount', sql.Decimal(18, 2), amount)
                .input('update_date', sql.Date, updateDate)
                .query`
                    INSERT INTO AvailableBalances (balance_type_id, amount, update_date)
                    VALUES (@balance_type_id, @amount, @update_date)
                `;
        }
        await transaction.commit();
        res.status(201).json({ message: 'Beschikbaar vermogen succesvol bijgewerkt.' });
    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error('Fout bij rollback transactie:', rollbackErr);
            }
        }
        console.error('Fout bij toevoegen/bijwerken saldo:', err);
        res.status(500).json({ message: 'Fout bij het bijwerken van het beschikbare vermogen.', error: err.message });
    }
};

module.exports = {
    getBalanceTypes,
    getLatestAvailableBalance,
    addOrUpdateAvailableBalance
};
