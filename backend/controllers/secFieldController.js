const axios = require('axios');

// Headers voor SEC API-verzoeken (User-Agent is verplicht)
const HEADERS = { 'User-Agent': "arne.van.riel@hotmail.be" };

// Helper functie om het CIK-nummer op te halen (hergebruikt logica)
const getCik = async (ticker) => {
    try {
        const response = await axios.get("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
        const companyTickers = response.data;
        for (const key in companyTickers) {
            if (companyTickers[key].ticker === ticker.toUpperCase()) {
                return `${companyTickers[key].cik_str}`.padStart(10, '0');
            }
        }
        return null;
    } catch (error) {
        console.error("Fout bij ophalen CIK:", error.message);
        return null;
    }
};

// Hoofdfunctie om velden op te halen
const getSecFields = async (req, res) => {
    const { ticker } = req.params;

    if (!ticker) {
        return res.status(400).json({ message: 'Ticker symbol is verplicht' });
    }

    try {
        // 1. Haal CIK op
        const cik = await getCik(ticker);
        if (!cik) {
            return res.status(404).json({ message: `Geen CIK gevonden voor ticker: ${ticker}` });
        }

        // 2. Haal alle company facts op
        const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
        const response = await axios.get(url, { headers: HEADERS });
        
        const facts = response.data.facts;
        const availableFields = [];

        // 3. Verwerk US-GAAP velden
        if (facts['us-gaap']) {
            for (const [key, value] of Object.entries(facts['us-gaap'])) {
                availableFields.push({
                    key: key,
                    label: value.label || 'Geen label',
                    description: value.description || 'Geen beschrijving',
                    type: 'us-gaap',
                    count: (value.units && (value.units.USD || value.units.shares)) ? (value.units.USD || value.units.shares).length : 0
                });
            }
        }

        // 4. Verwerk DEI velden (Document and Entity Information)
        if (facts['dei']) {
            for (const [key, value] of Object.entries(facts['dei'])) {
                availableFields.push({
                    key: key,
                    label: value.label || 'Geen label',
                    description: value.description || 'Geen beschrijving',
                    type: 'dei',
                    count: (value.units && (value.units.USD || value.units.shares)) ? (value.units.USD || value.units.shares).length : 0
                });
            }
        }

        // Sorteer alfabetisch op key
        availableFields.sort((a, b) => a.key.localeCompare(b.key));

        res.json({ ticker: ticker.toUpperCase(), cik, fields: availableFields });

    } catch (error) {
        console.error('Fout bij ophalen SEC velden:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen SEC data', error: error.message });
    }
};

module.exports = { getSecFields };