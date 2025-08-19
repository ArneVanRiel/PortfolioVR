// controllers/idealPortfolioController.js
const { sql, config } = require('../config/database'); // Importeer sql en config, getRequest is verwijderd

// Functie om de ideale portfolio instellingen op te halen
const getIdealPortfolioSettings = async (req, res) => {
    try {
        const request = new sql.Request(); // Gebruik new sql.Request()
        // Aanname: Er is slechts één rij in deze tabel voor de globale instellingen
        const result = await request.query`SELECT gewenst_rendement, terminal_rate FROM IdealPortfolioSettings`;
        if (result.recordset.length > 0) {
            res.status(200).json(result.recordset[0]);
        } else {
            // Geen instellingen gevonden, retourneer standaardwaarden of een lege set
            res.status(404).json({ message: 'Instellingen niet gevonden. Overweeg initiële waarden toe te voegen.' });
        }
    } catch (err) {
        console.error('Fout bij ophalen ideale portfolio instellingen:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van ideale portfolio instellingen.', error: err.message });
    }
};

// Functie om de ideale portfolio instellingen bij te werken
const updateIdealPortfolioSettings = async (req, res) => {
    const { gewenst_rendement, terminal_rate } = req.body;

    // Basisvalidatie
    if (typeof gewenst_rendement === 'undefined' || typeof terminal_rate === 'undefined' || isNaN(parseFloat(gewenst_rendement)) || isNaN(parseFloat(terminal_rate))) {
        return res.status(400).json({ message: 'Ongeldige input: gewenst_rendement en terminal_rate zijn verplicht en moeten numeriek zijn.' });
    }

    try {
        // Verbind met de databasepool
        const pool = await sql.connect(config);
        const request = new sql.Request(pool); // Gebruik new sql.Request(pool)

        // Aanname: Er is slechts één rij, we updaten de eerste/enige rij.
        // Als de tabel leeg is, voeren we een INSERT uit. Anders een UPDATE.
        const checkResult = await request.query`SELECT COUNT(*) AS count FROM IdealPortfolioSettings`;
        const count = checkResult.recordset[0].count;

        if (count === 0) {
            // Als er geen rij is, voeg toe
            await request.input('gewenst_rendement', sql.Decimal(5, 2), gewenst_rendement)
                         .input('terminal_rate', sql.Decimal(5, 2), terminal_rate)
                         .query`INSERT INTO IdealPortfolioSettings (gewenst_rendement, terminal_rate) VALUES (@gewenst_rendement, @terminal_rate)`;
            res.status(201).json({ message: 'Ideale portfolio instellingen succesvol toegevoegd.' });
        } else {
            // Anders, update de bestaande rij (neem aan dat er maar één is, of update met een specifiek ID)
            await request.input('gewenst_rendement', sql.Decimal(5, 2), gewenst_rendement)
                         .input('terminal_rate', sql.Decimal(5, 2), terminal_rate)
                         .query`UPDATE IdealPortfolioSettings SET gewenst_rendement = @gewenst_rendement, terminal_rate = @terminal_rate WHERE id = 1`; // Aanname: ID 1 is de globale instelling
            res.status(200).json({ message: 'Ideale portfolio instellingen succesvol bijgewerkt.' });
        }

    } catch (err) {
        console.error('Fout bij bijwerken ideale portfolio instellingen:', err);
        res.status(500).json({ message: 'Fout bij het bijwerken van ideale portfolio instellingen.', error: err.message });
    }
};

module.exports = {
    getIdealPortfolioSettings,
    updateIdealPortfolioSettings
};
