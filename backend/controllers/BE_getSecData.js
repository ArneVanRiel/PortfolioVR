// secData.js
const { sql, config } = require('../config/database');
const axios = require('axios');

async function getSec(ticker) {
  try {
    // Maak verbinding met de database
    const pool = await sql.connect(config);

    // Stel de request header in
    const headers = { 'User-Agent': "arne.van.riel@hotmail.be" };

    // Haal alle bedrijfsgegevens op
    const companyTickersResponse = await axios.get("https://www.sec.gov/files/company_tickers.json", { headers });
    const companyTickers = companyTickersResponse.data;

    // Zoek de CIK voor de gegeven ticker
    const companyData = Object.values(companyTickers).find(company => company.ticker === ticker);
    const cik = companyData.cik_str.padStart(10, '0');

    // Haal bedrijfsfeiten op
    const companyFactsResponse = await axios.get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers });
    const companyFacts = companyFactsResponse.data.facts['us-gaap'];

    // Selecteer de waarden
    let df = [];

    if (companyFacts['AssetsCurrent']) {
      const assetsCurrent = companyFacts['AssetsCurrent']['units']['USD'].map(item => ({
        period_end_date: item.end,
        fundamental_value: item.val,
        ticker: ticker,
        fundamental_name: 'AssetsCurrent'
      }));
      df = df.concat(assetsCurrent);
    }

    // Voeg hier meer velden toe zoals Assets, LiabilitiesCurrent, etc.

    // Voer SQL-query uit om gegevens op te halen
    const query = `SELECT * FROM aandelen_data_ WHERE ticker='${ticker}' ORDER BY period_end_date DESC`;
    const result = await pool.request().query(query);

    // Verwerk de gegevens
    const processedData = df.map(item => {
      const matchingRecord = result.recordset.find(record => record.period_end_date === item.period_end_date);
      return {
        ...item,
        fundamental_value_db: matchingRecord ? matchingRecord[item.fundamental_name] : null,
        in_database: matchingRecord ? 'True' : 'False'
      };
    });

    // Converteer de gegevens naar JSON
    const jsonOutput = JSON.stringify(processedData);
    console.log(jsonOutput);
    return jsonOutput;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
module.exports = { getSec }
