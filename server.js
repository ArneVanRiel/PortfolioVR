// server.js
const express = require('express');
const cors = require('cors');
const sql = require('mssql'); // Vervang 'mysql' door 'mssql'
const { getSec } = require('./BE_getSecData');
const axios = require('axios');
const { StringStream } = require("scramjet");
const { parse } = require("csv-parse/sync");

//const { spawn } = require('child_process');

const app = express();
app.use(express.json());
app.use(cors());

// Configure your Azure SQL Database connection
const config = {
  user: 'portfoliovr-server-admin',
  password: 'F0LKYYOYM284LFQ7$',
  server: 'portfoliovr-server.database.windows.net', 
  database: 'portfoliovr-database',
  options: {
    encrypt: true, // Versleutel de verbinding (vereist voor Azure SQL)
  },  
};

sql.connect(config, (err) => {
  if (err) throw err;
  console.log('Database verbonden!');
});

// Exporteer een functie om de databaseverbinding te initialiseren
const connectToDatabase = async () => {
    try {
        await sql.connect(config);
        console.log('Database verbonden!');
    } catch (err) {
        console.error('Database connectie fout:', err);
    }
};

module.exports = { connectToDatabase };


app.get('/api/getSecData/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const data = await getSec(ticker);
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Fout bij het ophalen van SEC-data:', error);
    res.status(500).send('Serverfout bij het ophalen van SEC-data.');
  }
});


// Functie om Python-script aan te roepen en de output te verwerken
function runPythonScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [`./python_files/${scriptName}.py`, ...args]);

    let dataString = '';
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    pythonProcess.stdout.on('end', () => {
      try {
        const data = JSON.parse(dataString);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      reject(data.toString());
    });
  });
}

// API-endpoint voor inloggen
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
      const query = 'SELECT * FROM Users WHERE username = @username'; // Gebruik parameterized query
      const request = new sql.Request();
      request.input('username', sql.NVarChar, username);
      const result = await request.query(query);

      if (result.recordset.length === 0) {
          return res.status(401).json({ message: 'Gebruiker niet gevonden' });
      }

      const user = result.recordset[0];
      const wachtwoordMatch = await bcrypt.compare(password, user.password);
      const userID = user.id
      const role = user.Roles; // Haal de rol van de gebruiker op

      if (!wachtwoordMatch) {
          return res.status(401).json({ message: 'Ongeldig wachtwoord' });
      }

      const token = jwt.sign({ username }, 'geheime_sleutel', { expiresIn: '1h' });
      res.json({ token, username, userID, role }); // Stuur de gebruikersnaam, gebruikersID en rol terug naar de frontend
  } catch (error) {
      console.error('Fout bij inloggen:', error);
      res.status(500).json({ message: 'Serverfout bij inloggen' });
  }
});

// Define an API route to fetch data
app.get('/api/tickersInDb', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT ticker FROM aandelen_data_ ORDER BY ticker ASC';
    const request = new sql.Request();
    const result = await request.query(query);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van gebruikerspunten en deelname:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van gebruikerspunten en deelname' });
  }
});

// Endpoint voor het ophalen van tickers
// bewerkt: 2025-03-12 (original date)
// bewerkt: 2025-06-02 (added data anomaly checks and date picker integration)
// bewerkt: 2025-06-02 (limited data fetching to MAX_LOOKBACK_MONTHS)
// bewerkt: 2025-06-02 (fixed excessive data and quarter sequence anomaly flags by using DISTINCT)
app.post("/api/tickers", async (req, res) => {
  try {
    const { dataPeriods, selectedDate, maxLookbackMonths } = req.body; // Expected data periods, selected reference date, and max lookback months

    // Determine the reference date for SQL queries. Use selectedDate if provided, otherwise current date.
    const refDate = selectedDate ? new Date(selectedDate) : new Date();
    // Format date to ISO string for SQL compatibility
    const sqlRefDate = refDate.toISOString();

    // Fetch all stock IDs and ticker symbols from the Stocks table
    const stocksResult = await sql.query(`SELECT aandeel_id, ticker_symbol FROM Stocks`);
    const stocks = stocksResult.recordset;

    // If no stocks are found, return a 404 response
    if (!stocks || stocks.length === 0) {
      return res.status(404).json({ message: "Geen tickers gevonden" });
    }

    let tickerOverviewData = []; // Array to store processed data for each ticker

    // Iterate over each stock to gather its data and perform checks
    for (const stock of stocks) {
      let totalCount = 0; // Counter for data completeness

      // Fetch all DISTINCT period_end_dates, fp_id, and form_id for the current stock,
      // considering only data within the global MAX_LOOKBACK_MONTHS before the selected reference date.
      // Sorted ascending for sequence check.
      const allPeriodDataResult = await new sql.Request()
        .input("stock_id", sql.Int, stock.aandeel_id)
        .input("refDate", sql.DateTime, sqlRefDate) // Pass the reference date to SQL
        .input("maxMonths", sql.Int, maxLookbackMonths) // Pass the max lookback months
        .query(
          `SELECT DISTINCT period_end_date, fp_id, form_id
           FROM fundamental_data
           WHERE stock_id = @stock_id
           AND period_end_date >= DATEADD(MONTH, -@maxMonths, @refDate) -- Filter by global max lookback
           AND period_end_date <= @refDate
           ORDER BY period_end_date ASC, fp_id ASC` // Ascending for consistent sequence check
        );

      // Create a structure similar to frontend's periodInfo for backend anomaly checks
      const uniquePeriodInfo = allPeriodDataResult.recordset.map(row => ({
          period_end_date: new Date(row.period_end_date),
          fp_id: row.fp_id,
          form_id: row.form_id
      }));

      // For general date checks (90d, 60d, 1Y, 10Y), use only the distinct period_end_dates
      // Sort descending for these checks as they often look at the latest date first
      const periodEndDates = uniquePeriodInfo
        .map(p => p.period_end_date)
        .sort((a, b) => b.getTime() - a.getTime()); // Sort descending

      // For quarter sequence check, use the uniquePeriodInfo (already sorted ascending from SQL)
      const quarterlyPeriodsForInitialCheck = uniquePeriodInfo.filter(p => p.fp_id >= 1 && p.fp_id <= 4);


      // Initialize flags for data anomaly checks
      let dataMissing90Days = false;
      let dataExcessive60Days = false;
      let dataExcessive1Year = false;
      let dataExcessive10Years = false;
      let quarterSequenceBroken = false; // New flag for the quarter sequence check

      // **Data Anomaly Checks (all relative to refDate and within the fetched period)**

      // 1. Check for missing data (no period_end_date in 90 days relative to refDate)
      if (periodEndDates.length === 0) {
        dataMissing90Days = true; // If no data exists within the filtered range, it's missing
      } else {
        const latestDate = periodEndDates[0]; // The most recent date within the filtered range
        const diffTime = Math.abs(refDate.getTime() - latestDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Difference in days
        if (diffDays > 90) {
          dataMissing90Days = true; // If the latest date is older than 90 days from refDate
        }
      }

      // 2. Check for excessive data (multiple period_end_dates within 60 days relative to refDate)
      // This loop checks if any two distinct dates are within a 60-day window
      for (let i = 0; i < periodEndDates.length; i++) {
        const currentDate = periodEndDates[i];
        for (let j = i + 1; j < periodEndDates.length; j++) { // Start from i+1 to avoid self-comparison and redundant checks
          const nextDate = periodEndDates[j];
          const diffDays = Math.ceil(Math.abs(currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 60) {
            dataExcessive60Days = true; // Found multiple dates within 60 days
            break; // No need to check further for this ticker for this specific anomaly
          }
        }
        if (dataExcessive60Days) break; // If excessive data found, move to the next ticker
      }

      // 3. Check for excessive data (more than 4 period_end_dates in 1 year relative to refDate)
      // 4. Check for excessive data (more than 40 period_end_dates in 10 years relative to refDate)
      const datesInLast1Year = [];
      const datesInLast10Years = [];

      // Iterate from the most recent dates (periodEndDates is descending, so iterate from end)
      for (let i = periodEndDates.length - 1; i >= 0; i--) {
          const date = periodEndDates[i];
          const diffDaysFromRef = Math.ceil(Math.abs(refDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDaysFromRef <= 365) { // Within the last 365 days (approx. 1 year)
            datesInLast1Year.push(date);
          }
          if (diffDaysFromRef <= 365 * 10) { // Within the last 3650 days (approx. 10 years)
            datesInLast10Years.push(date);
          }
      }

      if (datesInLast1Year.length > 4) {
        dataExcessive1Year = true;
      }
      if (datesInLast10Years.length > 40) {
        dataExcessive10Years = true;
      }

      // New: Check for fp_id sequence (1, 2, 3, 4, 1, ...) for consecutive quarterly periods
      // The `quarterlyPeriodsForInitialCheck` array already contains data filtered by `maxLookbackMonths` and `refDate`
      for (let i = 1; i < quarterlyPeriodsForInitialCheck.length; i++) {
          const prevPeriod = quarterlyPeriodsForInitialCheck[i - 1];
          const currentPeriod = quarterlyPeriodsForInitialCheck[i];

          const expectedNextFpId = (prevPeriod.fp_id % 4) + 1;
          const diffDays = Math.ceil(Math.abs(currentPeriod.period_end_date.getTime() - prevPeriod.period_end_date.getTime()) / (1000 * 60 * 60 * 24));

          const isFpIdSequenceCorrect = (currentPeriod.fp_id === expectedNextFpId);
          // Allow for some flexibility in quarter length (e.g., 75 to 105 days)
          const isTimeGapCorrect = (diffDays >= 75 && diffDays <= 105);

          if (!isFpIdSequenceCorrect || !isTimeGapCorrect) {
              quarterSequenceBroken = true;
              break; // Found a break, no need to check further for this ticker for the summary flag
          }
      }


      // **Existing totalCount calculation**
      // This part calculates the completeness based on the `dataPeriods` configuration
      for (const [datatype, months] of Object.entries(dataPeriods)) {
        const countResult = await new sql.Request()
          .input("stock_id", sql.Int, stock.aandeel_id)
          .input("data_type", sql.NVarChar, datatype)
          .input("months", sql.Int, months)
          .input("refDate", sql.DateTime, sqlRefDate) // Pass the reference date to SQL
          .query(
            `SELECT COUNT(*) as count
             FROM fundamental_data
             WHERE stock_id = @stock_id
             AND data_type = @data_type
             AND period_end_date >= DATEADD(MONTH, -@months, @refDate)
             AND period_end_date <= @refDate` // Ensure data is up to or before selected date
          );
        totalCount += countResult.recordset[0]?.count || 0;
      }

      // **Existing Fast Check 1: NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment**
      const fastCheck1Result = await new sql.Request()
        .input("stock_id", sql.Int, stock.aandeel_id)
        .input("refDate", sql.DateTime, sqlRefDate) // Pass the reference date to SQL
        .input("maxMonths", sql.Int, maxLookbackMonths) // ADDED: Declare @maxMonths for this request
        .query(
          `SELECT TOP 1
              period_end_date,
              (SELECT value FROM fundamental_data WHERE stock_id = @stock_id AND data_type = 'NetCashProvidedByUsedInOperatingActivities' AND period_end_date = fd.period_end_date) AS cashFlow,
              (SELECT value FROM fundamental_data WHERE stock_id = @stock_id AND data_type = 'PurchasesOfPropertyAndEquipment' AND period_end_date = fd.period_end_date) AS capex
           FROM fundamental_data fd
           WHERE stock_id = @stock_id AND form_id = 1
           AND period_end_date <= @refDate -- Ensure data is up to or before selected date
           AND period_end_date >= DATEADD(MONTH, -@maxMonths, @refDate) -- Filter by global max lookback
           ORDER BY period_end_date DESC`
        );

      let fastCheck1 = "❌";
      let lastNegativeDate = "N/A";
      if (fastCheck1Result.recordset.length > 0) {
        const { period_end_date, cashFlow, capex } = fastCheck1Result.recordset[0];
        // Check if both cashFlow and capex are numbers before performing calculation
        if (typeof cashFlow === 'number' && typeof capex === 'number' && (cashFlow - capex) > 0) {
          fastCheck1 = "✔️";
        } else {
          // If not passing the check or data is null, record the date
          lastNegativeDate = period_end_date ? period_end_date.toISOString().split("T")[0] : "N/A";
        }
      }

      // **Existing Fast Check 2: (Liabilities - LiabilitiesCurrent) / StockholdersEquity**
      const fastCheck2Result = await new sql.Request()
        .input("stock_id", sql.Int, stock.aandeel_id)
        .input("refDate", sql.DateTime, sqlRefDate) // Pass the reference date to SQL
        .input("maxMonths", sql.Int, maxLookbackMonths) // ADDED: Declare @maxMonths for this request
        .query(
          `SELECT
             fd.period_end_date,
             MAX(CASE WHEN fd.data_type = 'Liabilities' THEN fd.value END) AS Liabilities,
             MAX(CASE WHEN fd.data_type = 'LiabilitiesCurrent' THEN fd.value END) AS LiabilitiesCurrent,
             MAX(CASE WHEN fd.data_type = 'StockholdersEquity' THEN fd.value END) AS StockholdersEquity,
             (MAX(CASE WHEN fd.data_type = 'Liabilities' THEN fd.value END) -
             MAX(CASE WHEN fd.data_type = 'LiabilitiesCurrent' THEN fd.value END)) /
             NULLIF(MAX(CASE WHEN fd.data_type = 'StockholdersEquity' THEN fd.value END), 0) AS ratio
           FROM fundamental_data fd
           WHERE fd.stock_id = @stock_id
           AND fd.data_type IN ('Liabilities', 'LiabilitiesCurrent', 'StockholdersEquity')
           AND fd.period_end_date >= DATEADD(MONTH, -3, @refDate)
           AND fd.period_end_date <= @refDate -- Ensure data is up to or before selected date
           AND fd.period_end_date >= DATEADD(MONTH, -@maxMonths, @refDate) -- Filter by global max lookback
           GROUP BY fd.period_end_date
           ORDER BY fd.period_end_date DESC`
        );

      let fastCheck2 = "Niet beschikbaar";
      let fastCheck2Value = "N/A";
      if (fastCheck2Result.recordset.length > 0) {
        const { ratio } = fastCheck2Result.recordset[0];
        if (ratio !== null) { // Check if ratio is not null before using it
          fastCheck2 = ratio < 0.5 ? "✔️" : "❌";
          fastCheck2Value = ratio.toFixed(2);
        }
      }

      // Push all collected data and anomaly flags for the current ticker
      tickerOverviewData.push({
        ticker: stock.ticker_symbol,
        count: totalCount,
        fastCheck1,
        lastNegativeDate,
        fastCheck2,
        fastCheck2Value,
        dataMissing90Days,
        dataExcessive60Days,
        dataExcessive1Year,
        dataExcessive10Years,
        quarterSequenceBroken, // Include the new flag
      });
    }

    // Send the aggregated ticker overview data as a JSON response
    res.json(tickerOverviewData);
  } catch (error) {
    console.error("❌ Fout bij ophalen van tickers:", error);
    res.status(500).send("Server error");
  }
});


// Route om details per ticker op te halen
app.get("/api/ticker-data/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    const { selectedDate, maxLookbackMonths } = req.query; // Get selectedDate and maxLookbackMonths from query parameters

    // Determine the reference date for SQL queries. Use selectedDate if provided, otherwise current date.
    const refDate = selectedDate ? new Date(selectedDate) : new Date();
    // Format date to ISO string for SQL compatibility
    const sqlRefDate = refDate.toISOString();

    // Find the stock ID based on the ticker symbol
    const stockResult = await new sql.Request()
      .input("ticker", sql.NVarChar, ticker)
      .query(`SELECT aandeel_id FROM Stocks WHERE ticker_symbol = @ticker`);

    const stock = stockResult.recordset;

    // If ticker not found, return 404
    if (stock.length === 0) {
      return res.status(404).send("Ticker niet gevonden");
    }

    const stockId = stock[0].aandeel_id;

    // Fetch all fundamental data for the given stock ID, sorted by period_end_date
    // Added fp_id to the SELECT statement and filter by period_end_date <= @refDate
    // Also added filter for period_end_date >= DATEADD(MONTH, -@maxMonths, @refDate)
    const dataResult = await new sql.Request()
      .input("stock_id", sql.Int, stockId)
      .input("refDate", sql.DateTime, sqlRefDate) // Pass the reference date to SQL
      .input("maxMonths", sql.Int, maxLookbackMonths) // Pass the max lookback months
      .query(
        `SELECT period_end_date, form_id, data_type, value, fp_id
         FROM fundamental_data
         WHERE stock_id = @stock_id
         AND period_end_date >= DATEADD(MONTH, -@maxMonths, @refDate) -- Filter by global max lookback
         AND period_end_date <= @refDate
         ORDER BY period_end_date DESC`
      );

    // Send the detailed data as a JSON response
    res.json(dataResult.recordset);
  } catch (error) {
    console.error("❌ Fout bij ophalen van ticker data:", error);
    res.status(500).send("Server error");
  }
});


// Endpoint voor het ophalen van laatste kwartaal van alle tickers in database
// bewerkt: 2025-02-04

// Alpha Vantage API Key (vervang 'demo' door jouw eigen key)
const ALPHA_VANTAGE_API_KEY = "TJOHIG1FLBOHQTY1";

// Endpoint om earnings calendar op te halen en op te slaan in database
app.post("/api/store-earnings-calendar", async (req, res) => {
  try {
    // Haal earnings data op via Alpha Vantage API
    const response = await axios.get(
      `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    //console.log("Earnings API Response:", response.data); // ✅ Check de API-output

    // ✅ CSV omzetten naar JSON-array
    const earningsData = parse(response.data, {
      columns: ["ticker", "name", "reportDate", "fiscalDateEnding", "epsEstimate", "currency"],
      skip_empty_lines: true
    });

    console.log("Parsed Earnings Data:", earningsData); // Debugging


    if (!Array.isArray(earningsData) || earningsData.length === 0) {
      return res.status(500).json({ message: "Ongeldige API-response" });
    }

    // 🚀 Verwijder de eerste rij (headers)
    const earningsDataFiltered = earningsData.slice(1);

    const pool = await sql.connect(config);

    // Loop door earnings data en sla het op in de database
    for (const item of earningsDataFiltered) {
      const { ticker, reportDate, fiscalDateEnding } = item;
      if (!ticker || !reportDate || !fiscalDateEnding) continue; // Skip onvolledige records

      //console.log("Verwerken:", ticker, reportDate, fiscalDateEnding); // ✅ Logging


      await pool
        .request()
        .input("ticker", sql.VarChar, ticker)
        .input("reportDate", sql.Date, reportDate)
        .input("fiscalDateEnding", sql.Date, fiscalDateEnding)
        .input("updated_at", sql.DateTime, new Date())
        .query(
          `MERGE INTO earningsCalender AS target
          USING (SELECT @ticker AS ticker, @reportDate AS reportDate) AS source
          ON target.ticker = source.ticker AND target.reportDate = source.reportDate
          WHEN MATCHED THEN 
            UPDATE SET fiscalDateEnding = @fiscalDateEnding, updated_at = @updated_at
          WHEN NOT MATCHED THEN 
            INSERT (ticker, reportDate, fiscalDateEnding, updated_at) 
            VALUES (@ticker, @reportDate, @fiscalDateEnding, @updated_at);`
        );
    }

    res.json({ message: "Earnings calendar succesvol opgeslagen!" });
  } catch (error) {
    console.error("Fout bij opslaan van earnings calendar:", error);
    res.status(500).json({ message: "Serverfout bij opslaan earnings calendar." });
  }
});


// API Endpoint: `/api/latestData`
app.get('/api/latestData', async (req, res) => {
  try {
    // Stap 1: Haal tickers op uit database
    const query = `
        WITH LatestData AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY period_end_date DESC) AS rn
                FROM 
                    aandelen_data_
            ),
            NextEarnings AS (
                SELECT 
                    ticker, 
                    reportDate, 
                    fiscalDateEnding,
                    ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY reportDate ASC) AS rn
                FROM 
                    earningsCalender
                WHERE 
                    reportDate > DATEADD(day, -7, GETDATE()) -- Zorg ervoor dat de reportDate maximaal een week geleden is of in de toekomst ligt
            )
        SELECT
            l.ticker,
            l.period_start_date,
            l.period_end_date,
            e.reportDate AS next_report_date,
            e.fiscalDateEnding,
            l.LiabilitiesCurrent,
            l.Liabilities,
            l.StockholdersEquity,
            l.NetIncomeLoss,
            l.NetCashProvidedByUsedInOperatingActivities,
            l.PurchasesOfPropertyAndEquipment,
            l.Revenues,
            l.WeightedAverageNumberOfDilutedSharesOutstanding,
            l.Dividend
        FROM
            LatestData l
        LEFT JOIN
            NextEarnings e ON l.ticker = e.ticker AND e.rn = 1
        WHERE
            l.rn = 1
        ORDER BY
            e.reportDate;
        `;
    
    const result = await sql.query(query);

    // Stap 4: Stuur de verrijkte data terug
    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Fout bij ophalen van tickers:", error);
    res.status(500).json({ message: "Serverfout bij het ophalen van tickers." });
  }
});

// Endpoint voor het ophalen van het laatste kwartaal
// bewerkt: 2024-12-01
app.get('/api/lastQuarter/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const query = `
      SELECT TOP 1 * 
      FROM [dbo].[aandelen_data_] 
      WHERE ticker = @ticker 
      ORDER BY period_end_date DESC
    `;
    const request = new sql.Request();
    request.input('ticker', sql.VarChar, ticker);

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Geen gegevens gevonden voor de opgegeven ticker.' });
    }

    const lastQuarter = result.recordset[0];
    res.json({ lastQuarter });
  } catch (error) {
    console.error('Fout bij ophalen van laatste kwartaal:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van het laatste kwartaal.' });
  }
});

const cikCache = {}; // CIK cache om dubbele requests te vermijden

// ✅ Functie om CIK-code op te halen
async function getCIK(ticker) {
  if (cikCache[ticker]) return cikCache[ticker];
  try {
    const cikResponse = await axios.get('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'belegger-app/1.0 (contact: arne.van.riel@hotmail.be)' }
    });
    const companies = Object.values(cikResponse.data);
    const company = companies.find(c => c.ticker.toLowerCase() === ticker.toLowerCase());
    if (!company) return null;
    const cik = company.cik.toString().padStart(10, '0');
    cikCache[ticker] = cik;
    return cik;
  } catch (error) {
    console.error(`Fout bij ophalen CIK voor ${ticker}:`, error);
    return null;
  }
}

// ✅ API Endpoint om ontbrekende data op te halen
app.post('/api/fetch-missing-data', async (req, res) => {
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
});

// ✅ 2️⃣ Endpoint om ontbrekende data toe te voegen
app.post('/api/add-missing-data', async (req, res) => {
  try {
    const { approvedData } = req.body;
    if (!Array.isArray(approvedData) || approvedData.length === 0) {
      return res.status(400).json({ error: "Geen data om toe te voegen." });
    }

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
});

//bewerkt: 2025-01-05
app.post('/api/addTransaction', async (req, res) => {
  const { user_id, aandeel_id, broker_id, quantity, purchase_price, purchase_time, transaction_type, currency } = req.body;
  const currentTime = new Date();

  try {
      const request = new sql.Request();

      // Stap 1: Haal de laatste total_quantity op voor dit aandeel
      const getTotalQuery = `
          SELECT TOP 1 total_quantity FROM PF_transactions
          WHERE user_id = @user_id AND aandeel_id = @aandeel_id
          ORDER BY purchase_time DESC
      `;
      request.input('user_id', sql.Int, user_id);
      request.input('aandeel_id', sql.Int, aandeel_id);

      const previousResult = await request.query(getTotalQuery);
      let previousTotal = previousResult.recordset.length > 0 ? previousResult.recordset[0].total_quantity : 0;

      // Stap 2: Bereken nieuwe total_quantity
      let newTotalQuantity = transaction_type === 1 
          ? previousTotal + quantity 
          : previousTotal - quantity;

      // Stap 3: Voeg de nieuwe transactie in met de bijgewerkte total_quantity
      const insertQuery = `
          INSERT INTO PF_transactions 
          (user_id, aandeel_id, quantity, purchase_price, purchase_time, transaction_type, currency, broker_id, total_quantity)
          VALUES (@user_id, @aandeel_id, @quantity, @purchase_price, @purchase_time, @transaction_type, @currency, @broker_id, @total_quantity)
      `;

      request.input('quantity', sql.Decimal(15, 5), quantity);
      request.input('purchase_price', sql.Decimal(10, 2), purchase_price);
      request.input('purchase_time', sql.DateTime, purchase_time);
      request.input('transaction_type', sql.Int, transaction_type);
      request.input('currency', sql.VarChar, currency);
      request.input('broker_id', sql.Int, broker_id);
      request.input('total_quantity', sql.Decimal(15, 5), newTotalQuantity);

      await request.query(insertQuery);

      res.status(201).json({ message: 'Transactie succesvol toegevoegd' });
  } catch (error) {
      console.error('Fout bij het toevoegen van de transactie:', error);
      res.status(500).json({ message: 'Serverfout bij het toevoegen van de transactie' });
  }
});

// Haal transacties op uit de database
/*app.get('/api/transactions', async (req, res) => {
  try {
      const query = 'SELECT * FROM PF_transactions ORDER BY purchase_time DESC';
      const request = new sql.Request();
      const result = await request.query(query);

      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van transacties:', error);
      res.status(500).json({ message: 'Serverfout bij het ophalen van transacties' });
  }
});*/

// 2024-11-03 Route om gefilterde transacties op te halen
// Route om gefilterde transacties op te halen
app.get('/api/transactions', async (req, res) => {
  const { period, stockSymbol } = req.query; // Query-parameters voor filterperiode en stock symbol
  const currentTime = new Date();

  try {
      let query = `  
        SELECT 
        t.id,
        t.user_id,
        t.quantity,
        t.purchase_price,
        t.purchase_time,
        CASE 
          WHEN t.transaction_type = 1 THEN 'BUY' 
          WHEN t.transaction_type = 0 THEN 'SELL' 
          ELSE 'UNKNOWN' 
        END AS transaction_type,
        t.currency,
        t.total_quantity,
        t.aandeel_id,
        t.broker_id,
        s.ticker_symbol AS stock_symbol, 
        s.name AS stock_name,
        b.name AS platform
      FROM PF_transactions t
      JOIN Stocks s ON t.aandeel_id = s.aandeel_id
      JOIN Brokers b ON t.broker_id = b.broker_id
    `;
      const request = new sql.Request();
      const conditions = [];

      // Periodefilter
      if (period && period !== 'All') {
          const monthsMap = {
              "1M": 1,
              "3M": 3,
              "6M": 6,
              "1Y": 12,
              "2Y": 24,
              "5Y": 60,
          };

          const months = monthsMap[period];
          const pastDate = new Date(currentTime);
          pastDate.setMonth(currentTime.getMonth() - months);

          conditions.push('purchase_time >= @pastDate');
          request.input('pastDate', sql.DateTime, pastDate);
      }

      // Stock symbol filter met LIKE voor deelmatches
      if (stockSymbol) {
          conditions.push('stock_symbol LIKE @stockSymbol');
          request.input('stockSymbol', sql.VarChar, `%${stockSymbol}%`);
      }

      // Voeg WHERE en condities toe aan de query
      if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
      }

      // Voeg sortering toe
      query += ' ORDER BY purchase_time DESC';

      // Voer de query uit en retourneer de resultaten
      const result = await request.query(query);
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van transacties:', error);
      res.status(500).json({ message: 'Serverfout bij het ophalen van transacties' });
  }
});

//bewerkt: 2025-01-05
// API route om bestaande transacties te updaten met total_quantity
app.post('/api/updateTotalQuantities', async (req, res) => {
  try {
      const request = new sql.Request();

      // Haal alle unieke user_id en stock_symbol combinaties op
      const uniqueStocksQuery = `
          SELECT DISTINCT user_id, aandeel_id FROM PF_transactions
      `;
      const uniqueStocks = await request.query(uniqueStocksQuery);

      // Loop door elke combinatie en update total_quantity
      for (const record of uniqueStocks.recordset) {
          const { user_id, aandeel_id } = record;

          const transactionRequest = new sql.Request();
          transactionRequest.input('user_id', sql.Int, user_id);
          transactionRequest.input('aandeel_id', sql.Int, aandeel_id);

          const transactionsQuery = `
              SELECT id, aandeel_id, quantity, transaction_type 
              FROM PF_transactions
              WHERE user_id = @user_id AND aandeel_id = @aandeel_id
              ORDER BY purchase_time ASC
          `;
          const transactions = await transactionRequest.query(transactionsQuery);
          let runningTotal = 0;

          for (const transaction of transactions.recordset) {

              console.log(`Before Update: stock=${transaction.aandeel_id}, transaction_type=${transaction.transaction_type}, quantity=${transaction.quantity}, runningTotal=${runningTotal}`);
              console.log(`|${transaction.transaction_type}|`);
              console.log('Transaction type Type:', typeof transaction.transaction_type);

              if (transaction.transaction_type === 1) { 
                  runningTotal += transaction.quantity;
              } else if (transaction.transaction_type === 0) { 
                  runningTotal -= transaction.quantity; 
              }

              console.log(`After Update: stock=${transaction.aandeel_id}, transaction_type=${transaction.transaction_type}, quantity=${transaction.quantity}, runningTotal=${runningTotal}`);
              // Nieuwe request per update
              const updateRequest = new sql.Request();
              updateRequest.input('total_quantity', sql.Decimal(15, 5), runningTotal);
              updateRequest.input('id', sql.Int, transaction.id);

              const updateQuery = `
                  UPDATE PF_transactions
                  SET total_quantity = @total_quantity
                  WHERE id = @id
              `;

              await updateRequest.query(updateQuery);
          }
      }

      res.status(200).json({ message: 'Total quantities succesvol bijgewerkt voor bestaande transacties' });
  } catch (error) {
      console.error('Fout bij het bijwerken van total_quantity:', error);
      res.status(500).json({ message: 'Serverfout bij het updaten van total_quantity' });
  }
});


// Verwijder een transactie op basis van ID
app.delete('/api/transactions/:id', async (req, res) => {
  const transactionId = req.params.id;

  try {
      const query = 'DELETE FROM PF_transactions WHERE id = @id';
      const request = new sql.Request();
      request.input('id', sql.Int, transactionId);

      await request.query(query);
      res.status(200).json({ message: 'Transactie succesvol verwijderd' });
  } catch (error) {
      console.error('Fout bij het verwijderen van de transactie:', error);
      res.status(500).json({ message: 'Serverfout bij het verwijderen van de transactie' });
  }
});

//bewerkt: 2025-01-12
// Route om portfolio op te halen
app.get('/api/portfolio', async (req, res) => {
  const { inputDate } = req.query; // Query-parameter voor de gewenste datum
  const currentTime = inputDate ? new Date(inputDate) : new Date();

  try {
      // SQL-query voor het ophalen van het portfolio
      const query = `
DECLARE @input_date DATE = @inputDate;
            
            WITH LastTransaction AS (
                SELECT 
                    pt.*,
                    ROW_NUMBER() OVER (PARTITION BY pt.aandeel_id ORDER BY pt.purchase_time DESC) AS rn
                FROM 
                    PF_transactions pt
                WHERE 
                    pt.purchase_time <= DATEADD(DAY, 1, @input_date) -- Verhoog de input_date met 1 dag
            ),
            LastClosingPrice AS (
                SELECT 
                    dcp.*,
                    ROW_NUMBER() OVER (PARTITION BY dcp.aandeel_id ORDER BY dcp.date DESC) AS rn
                FROM 
                    DailyClosingPrices dcp
                WHERE 
                    dcp.date <= @input_date
            ),
            TotalPortfolioValue AS (
                SELECT SUM(lt.total_quantity * lcp.closing_price) AS total_value
                FROM LastTransaction lt
                LEFT JOIN LastClosingPrice lcp ON lt.aandeel_id = lcp.aandeel_id
                WHERE lt.rn = 1 AND lcp.rn = 1
            )
            SELECT 
                lt.id AS transaction_id,
                lt.aandeel_id,
                s.ticker_symbol,
                s.name AS stock_name,
                lt.purchase_time,
                lt.total_quantity,
                lcp.closing_price AS last_closing_price,
                lcp.date AS last_closing_date,
                lt.total_quantity * lcp.closing_price AS waarde,
                (lt.total_quantity * lcp.closing_price) / (SELECT total_value FROM TotalPortfolioValue) * 100 AS percentage
            FROM 
                LastTransaction lt
            LEFT JOIN 
                LastClosingPrice lcp ON lt.aandeel_id = lcp.aandeel_id
            LEFT JOIN 
                Stocks s ON lt.aandeel_id = s.aandeel_id
            CROSS JOIN 
                TotalPortfolioValue -- Voeg de totale waarde toe aan elke rij
            WHERE 
                lt.rn = 1 AND lcp.rn = 1
            ORDER BY waarde DESC;
        `;

      const request = new sql.Request();
      request.input('inputDate', sql.Date, currentTime);
      
      const result = await request.query(query);
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van portfolio:', error);
      res.status(500).json({ message: 'Serverfout bij het ophalen van portfolio' });
  }
});

app.post('/api/calculatePortfolioValues', async (req, res) => {
  try {
      const { userId } = req.body; // Verwacht `userId` in de request body
      if (!userId) {
          return res.status(400).json({ message: 'userId is verplicht.' });
      }

      const endDate = new Date(); // Vandaag
      const startDate = new Date(); // Drie maanden geleden
      startDate.setMonth(endDate.getMonth() - 12);

      const query = `
          DECLARE @start_date DATE = @startDate;
          DECLARE @end_date DATE = @endDate;
          DECLARE @user_id INT = @userId;

          -- Verwijder waardes ouder dan drie maanden
          DELETE FROM DailyPortfolioValue 
          WHERE user_id = @user_id AND date < @start_date;

          -- Bereken portfolio waarde enkel voor datums in DailyClosingPrices
          WITH DailyDates AS (
              SELECT DISTINCT date
              FROM DailyClosingPrices
              WHERE date BETWEEN @start_date AND @end_date
          ),
          DailyPortfolioValue AS (
              SELECT 
                  d.date,
                  SUM(lt.total_quantity * lcp.closing_price) AS total_value
              FROM DailyDates d
              CROSS APPLY (
                  -- Vind de meest recente transactie vóór de huidige datum
                  SELECT 
                      pt.aandeel_id,
                      pt.total_quantity,
                      ROW_NUMBER() OVER (PARTITION BY pt.aandeel_id ORDER BY pt.purchase_time DESC) AS rn
                  FROM 
                      PF_transactions pt
                  WHERE 
                      pt.purchase_time <= DATEADD(DAY, 1, d.date) AND pt.user_id = @user_id
              ) lt
              CROSS APPLY (
                  -- Vind de meest recente sluitingsprijs vóór de huidige datum
                  SELECT 
                      dcp.aandeel_id,
                      dcp.closing_price,
                      ROW_NUMBER() OVER (PARTITION BY dcp.aandeel_id ORDER BY dcp.date DESC) AS rn
                  FROM 
                      DailyClosingPrices dcp
                  WHERE 
                      dcp.date = d.date
              ) lcp
              WHERE 
                  lt.aandeel_id = lcp.aandeel_id AND
                  lt.rn = 1 AND
                  lcp.rn = 1
              GROUP BY d.date
          )
          SELECT date, ISNULL(total_value, 0) AS total_value
          FROM DailyPortfolioValue
          ORDER BY date
          OPTION (MAXRECURSION 0);
      `;

      const pool = await sql.connect(config);
      const request = pool.request();
      request.input('startDate', sql.Date, startDate);
      request.input('endDate', sql.Date, endDate);
      request.input('userId', sql.Int, userId);

      const result = await request.query(query);
      const dailyValues = result.recordset;

      for (const record of dailyValues) {
          await pool.request()
              .input('user_id', sql.Int, userId)
              .input('date', sql.Date, record.date)
              .input('total_value', sql.Decimal(18, 2), record.total_value)
              .query(`
                  MERGE INTO DailyPortfolioValue AS target
                  USING (SELECT @user_id AS user_id, @date AS date, @total_value AS total_value) AS source
                  ON target.date = source.date AND target.user_id = source.user_id
                  WHEN MATCHED THEN UPDATE SET total_value = source.total_value
                  WHEN NOT MATCHED THEN INSERT (user_id, date, total_value) VALUES (source.user_id, source.date, source.total_value);
              `);
      }

      res.status(200).json({ message: 'Portfolio waarden succesvol bijgewerkt.' });
  } catch (error) {
      console.error('Fout bij het berekenen van portfolio waarden:', error);
      res.status(500).json({ message: 'Serverfout bij het berekenen van portfolio waarden.' });
  }
});

app.get('/api/calculatePortfolioValues', async (req, res) => {
  try {
      const { userId, period } = req.query;
      const currentTime = new Date();

      const monthsMap = {
          "1M": 1,
          "3M": 3,
          "6M": 6,
          "1Y": 12,
          "2Y": 24,
          "5Y": 60,
      };

      const startDate = new Date();
      if (period && period !== "All") {
          startDate.setMonth(currentTime.getMonth() - monthsMap[period]);
      } else {
          startDate.setFullYear(1970); // Alle data
      }

      const query = `
          SELECT date, total_value
          FROM DailyPortfolioValue
          WHERE user_id = @userId AND date >= @startDate
          ORDER BY date ASC
      `;

      const pool = await sql.connect(config);
      const request = pool.request();
      request.input('userId', sql.Int, userId);
      request.input('startDate', sql.Date, startDate);

      const result = await request.query(query);
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error("Fout bij het ophalen van portfolio waarden:", error);
      res.status(500).json({ message: "Serverfout bij het ophalen van portfolio waarden." });
  }
});


app.get('/api/calculateReturns', async (req, res) => {
  try {
      const userId = 1; // Voorbeeld: haal dit uit een sessie of JWT
      const pool = await sql.connect(config);

      // Haal de period-parameter uit de querystring (bijv. 1M, 3M, 6M, 1Y, etc.)
      const { period } = req.query;

      // Bereken het begin van de periode op basis van de geselecteerde periode
      let dateFilter;
      switch (period) {
          case '1M':
              dateFilter = new Date();
              dateFilter.setMonth(dateFilter.getMonth() - 1);
              break;
          case '3M':
              dateFilter = new Date();
              dateFilter.setMonth(dateFilter.getMonth() - 3);
              break;
          case '6M':
              dateFilter = new Date();
              dateFilter.setMonth(dateFilter.getMonth() - 6);
              break;
          case '1Y':
              dateFilter = new Date();
              dateFilter.setFullYear(dateFilter.getFullYear() - 1);
              break;
          case '2Y':
              dateFilter = new Date();
              dateFilter.setFullYear(dateFilter.getFullYear() - 2);
              break;
          case '5Y':
              dateFilter = new Date();
              dateFilter.setFullYear(dateFilter.getFullYear() - 5);
              break;
          case 'All':
          default:
              dateFilter = null; // Geen filter voor "All"
              break;
      }

      // SQL-query om rendementen te berekenen met filtering op periode
      const request = pool.request();
      request.input('userId', sql.Int, userId);

      if (dateFilter) {
          // Als er een datumfilter is, voeg het toe aan de query
          request.input('dateFilter', sql.Date, dateFilter);
      }

      const query = `
          WITH TransactionsPerDate AS (
              SELECT 
                  CONVERT(DATE, t.purchase_time) AS transaction_date,
                  SUM(CASE 
                      WHEN t.transaction_type = 1 THEN t.quantity * t.purchase_price -- Aankoop
                      WHEN t.transaction_type = 0 THEN -t.quantity * t.purchase_price -- Verkoop
                      ELSE 0
                  END) AS total_transaction_value
              FROM PF_transactions t
              WHERE t.user_id = @userId
              ${dateFilter ? 'AND t.purchase_time >= @dateFilter' : ''}
              GROUP BY CONVERT(DATE, t.purchase_time)
          ),
          DailyReturns AS (
              SELECT 
                  dpv.date,
                  dpv.total_value,
                  ISNULL(tpd.total_transaction_value, 0) AS total_transaction_value,
                  LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) AS previous_total_value,
                  CASE 
                      WHEN LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) IS NULL THEN 1
                      ELSE (dpv.total_value - ISNULL(tpd.total_transaction_value, 0)) / 
                          LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date)
                  END AS return_value
              FROM DailyPortfolioValue dpv
              LEFT JOIN TransactionsPerDate tpd
              ON dpv.date = tpd.transaction_date
              WHERE dpv.user_id = @userId
              ${dateFilter ? 'AND dpv.date >= @dateFilter' : ''}
          ),
          CumulativeReturns AS (
              SELECT 
                  date,
                  total_value,
                  total_transaction_value,
                  previous_total_value,
                  return_value,
                  EXP(SUM(LOG(return_value)) OVER (PARTITION BY 1 ORDER BY date)) AS return_value_cumulative
              FROM DailyReturns
          )
          SELECT *
          FROM CumulativeReturns
          ORDER BY date ASC;
      `;

      const result = await request.query(query);

      const calculatedReturns = result.recordset;

      // Stuur de berekende waarden terug naar de client
      res.status(200).json({ calculatedReturns });
  } catch (error) {
      console.error('Fout bij het berekenen van rendement:', error);
      res.status(500).json({ message: 'Serverfout bij het berekenen van rendement.' });
  }
});



app.get('/api/portfolioReturns', async (req, res) => {
  try {
      const { userId } = req.query;
      const pool = await sql.connect(config);

      const result = await pool.request()
          .input('userId', sql.Int, userId)
          .query(`
              SELECT date, return_value
              FROM DailyPortfolioValue
              WHERE user_id = @userId
              ORDER BY date ASC;
          `);

      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van rendementen:', error);
      res.status(500).json({ message: 'Fout bij het ophalen van rendementen.' });
  }
});


app.get("/api/checkUpdates", async (req, res) => {
  try {
    const query = `
      SELECT 
          s.name,
          s.ticker_symbol,
          dcp.date AS last_closing_date
      FROM 
          PF_transactions pt
      JOIN 
          Stocks s ON pt.aandeel_id = s.aandeel_id
      JOIN 
          DailyClosingPrices dcp ON s.aandeel_id = dcp.aandeel_id
      WHERE 
          pt.id = (
              SELECT MAX(pt_inner.id)
              FROM PF_transactions pt_inner
              WHERE pt_inner.aandeel_id = pt.aandeel_id AND pt_inner.total_quantity > 0
          )
          AND dcp.date = (
              SELECT MAX(dcp_inner.date)
              FROM DailyClosingPrices dcp_inner
              WHERE dcp_inner.aandeel_id = dcp.aandeel_id
          )
      ORDER BY 
          s.name
    `;
    const result = await new sql.Request().query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Fout bij check updates:", error);
    res.status(500).json({ message: "Serverfout bij check updates." });
  }
});

app.get("/api/checkUpdatesTest", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const query = `
      SELECT s.name, s.ticker_symbol, dcp.date AS last_closing_date, dcp.last_updated_at
      FROM Stocks s
      LEFT JOIN DailyClosingPrices dcp ON s.aandeel_id = dcp.aandeel_id
      WHERE dcp.date = (SELECT MAX(date) FROM DailyClosingPrices WHERE aandeel_id = s.aandeel_id)
    `;

    const result = await new sql.Request().query(query);
    const stocksToUpdate = result.recordset.filter(stock => {
      return !stock.last_updated_at || stock.last_updated_at.split("T")[0] !== today;
    });

    res.status(200).json(stocksToUpdate);
  } catch (error) {
    console.error("Fout bij check updates:", error);
    res.status(500).json({ message: "Serverfout bij check updates." });
  }
});

app.get("/api/lastPriceUpdate", async (req, res) => {
  try {
    const query = `SELECT MAX(last_updated_at) AS lastUpdatedAt FROM DailyClosingPrices`;
    const result = await new sql.Request().query(query);
    res.status(200).json({ lastUpdatedAt: result.recordset[0].lastUpdatedAt });
  } catch (error) {
    console.error("Fout bij ophalen laatste update:", error);
    res.status(500).json({ message: "Serverfout bij ophalen laatste update." });
  }
});



app.post("/api/updatePrices", async (req, res) => {
  /*try {*/
    const query = `
      SELECT 
          s.name,
          s.ticker_symbol,
          s.aandeel_id,
          dcp.date AS last_closing_date
      FROM 
          PF_transactions pt
      JOIN 
          Stocks s ON pt.aandeel_id = s.aandeel_id
      JOIN 
          DailyClosingPrices dcp ON s.aandeel_id = dcp.aandeel_id
      WHERE 
          pt.id = (
              SELECT MAX(pt_inner.id)
              FROM PF_transactions pt_inner
              WHERE pt_inner.aandeel_id = pt.aandeel_id AND pt_inner.total_quantity > 0
          )
          AND dcp.date = (
              SELECT MAX(dcp_inner.date)
              FROM DailyClosingPrices dcp_inner
              WHERE dcp_inner.aandeel_id = dcp.aandeel_id
          )
      ORDER BY 
          s.name
    `;
    const stocksToUpdate = (await new sql.Request().query(query)).recordset;

    const today = new Date();
    const oneYearAgo = new Date(today);
    const twoYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    twoYearAgo.setFullYear(today.getFullYear() - 2);

    const pool = await sql.connect(config);
    for (const stock of stocksToUpdate) {
      /*const startDate = stock.last_closing_date
        ? new Date(stock.last_closing_date) < oneYearAgo 
          ? oneYearAgo.toISOString().split("T")[0]
          : stock.last_closing_date.toISOString().split("T")[0]
        : oneYearAgo.toISOString().split("T")[0];*/
      const startDate = stock.last_closing_date
        ? new Date(stock.last_closing_date) < twoYearAgo 
          ? twoYearAgo.toISOString().split("T")[0]
          : stock.last_closing_date.toISOString().split("T")[0]
        : twoYearAgo.toISOString().split("T")[0];
      //const startDate = twoYearAgo.toISOString().split("T")[0];
      const endDate = today.toISOString().split("T")[0];

      console.log(`Fetching data for ${stock.ticker_symbol}:`, { startDate, endDate });

      const apiKey = '3a6089f7212f4ad383160a4860499dae';
      const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${startDate}&end_date=${endDate}&token=${apiKey}`;
      //const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/GOOGL?start_date=2023-04-22&end_date=2024-04-22&token=${apiKey}`;
      console.log(`API URL for ${stock.ticker_symbol}:`, apiUrl);

      let data;
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          console.warn(`API error for ${stock.ticker_symbol}: ${response.statusText}`);
          continue; // Skip this stock
        }
        data = await response.json();
        console.log(`API data for ${stock.ticker_symbol}:`, data);

      } catch (apiError) {
        console.error(`Failed to fetch data for ${stock.ticker_symbol}:`, apiError.message);
        continue;
      }

      await pool.request()
        .input('aandeel_id', sql.Int, stock.aandeel_id)
        .input('threshold_date', sql.Date, today.toISOString().split("T")[0])
        .query(`
          DELETE FROM DailyClosingPrices 
          WHERE aandeel_id = @aandeel_id AND date < @threshold_date;
        `);

      for (const record of data) {
        const date = new Date(record.t * 1000).toISOString().split("T")[0];
        console.log(`Saving record for ${stock.ticker_symbol}:`, { aandeel_id: stock.aandeel_id, date, closing_price: record.c });

        await pool.request()
          .input("aandeel_id", sql.Int, stock.aandeel_id)
          .input("closing_price", sql.Decimal(10, 2), record.c)
          .input("date", sql.Date, date)
          .query(`
            MERGE INTO DailyClosingPrices AS target
            USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @date AS date) AS source
            ON target.date = source.date AND target.aandeel_id = source.aandeel_id
            WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price
            WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date) VALUES (source.aandeel_id, source.closing_price, source.date);
          `);
      }
    }

    res.status(200).json({ message: "Prijzen succesvol bijgewerkt." });
  /*} catch (error) {
    console.error("Error updating prices:", error);
    res.status(500).json({ message: "Error updating prices." });
  }*/
});

app.post("/api/updatePricesTest", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    const stocksToUpdateQuery = `
      SELECT s.aandeel_id, s.ticker_symbol, dcp.date AS last_closing_date, dcp.last_updated_at
      FROM Stocks s
      LEFT JOIN DailyClosingPrices dcp ON s.aandeel_id = dcp.aandeel_id
      WHERE dcp.date = (SELECT MAX(date) FROM DailyClosingPrices WHERE aandeel_id = s.aandeel_id)
    `;

    const stocksToUpdate = (await new sql.Request().query(stocksToUpdateQuery)).recordset.filter(stock => {
      return !stock.last_updated_at || stock.last_updated_at.split("T")[0] !== today;
    });

    if (stocksToUpdate.length === 0) {
      return res.status(200).json({ message: "Geen updates nodig vandaag." });
    }

    const pool = await sql.connect(config);

    for (const stock of stocksToUpdate) {
      const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${today}&end_date=${today}&token=API_KEY`;
      const response = await fetch(apiUrl);
      if (!response.ok) continue;

      const data = await response.json();
      if (data.length === 0) continue;

      const record = data[0];
      const closingPrice = record.c;
      const date = new Date(record.t * 1000).toISOString().split("T")[0];

      await pool.request()
        .input("aandeel_id", sql.Int, stock.aandeel_id)
        .input("closing_price", sql.Decimal(10, 2), closingPrice)
        .input("date", sql.Date, date)
        .input("last_updated_at", sql.DateTime, now)
        .query(`
          MERGE INTO DailyClosingPrices AS target
          USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @date AS date, @last_updated_at AS last_updated_at) AS source
          ON target.date = source.date AND target.aandeel_id = source.aandeel_id
          WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price, last_updated_at = source.last_updated_at
          WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date, last_updated_at) VALUES (source.aandeel_id, source.closing_price, source.date, source.last_updated_at);
        `);
    }

    res.status(200).json({ message: "Prijzen succesvol bijgewerkt." });
  } catch (error) {
    console.error("Error updating prices:", error);
    res.status(500).json({ message: "Fout bij het bijwerken van prijzen." });
  }
});


// ----------------- Brokers -----------------
// Haal alle brokers op
app.get('/api/brokers', async (req, res) => {
  try {
      const result = await sql.query('SELECT * FROM Brokers ORDER BY name');
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van brokers:', error);
      res.status(500).json({ message: 'Serverfout bij het ophalen van brokers' });
  }
});

// Update broker naam
app.put('/api/brokers/:id', async (req, res) => {
  const brokerId = req.params.id;
  const { name } = req.body;

  try {
      const query = 'UPDATE Brokers SET name = @name WHERE broker_id = @id';
      const request = new sql.Request();
      request.input('name', sql.VarChar, name);
      request.input('id', sql.Int, brokerId);

      await request.query(query);
      res.status(200).json({ message: 'Broker succesvol bijgewerkt' });
  } catch (error) {
      console.error('Fout bij het bijwerken van broker:', error);
      res.status(500).json({ message: 'Serverfout bij het bijwerken van broker' });
  }
});

// Verwijder een broker
app.delete('/api/brokers/:id', async (req, res) => {
  const brokerId = req.params.id;

  try {
      const query = 'DELETE FROM Brokers WHERE broker_id = @id';
      const request = new sql.Request();
      request.input('id', sql.Int, brokerId);

      await request.query(query);
      res.status(200).json({ message: 'Broker succesvol verwijderd' });
  } catch (error) {
      console.error('Fout bij het verwijderen van broker:', error);
      res.status(500).json({ message: 'Serverfout bij het verwijderen van broker' });
  }
});

// ----------------- Stock Exchanges -----------------
// Haal alle stock exchanges op
app.get('/api/stockexchange', async (req, res) => {
  try {
      const result = await sql.query('SELECT * FROM StockExchange ORDER BY name');
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Fout bij het ophalen van stock exchanges:', error);
      res.status(500).json({ message: 'Serverfout bij het ophalen van stock exchanges' });
  }
});

// Update stock exchange naam
app.put('/api/stockexchange/:id', async (req, res) => {
  const exchangeId = req.params.id;
  const { name } = req.body;

  try {
      const query = 'UPDATE StockExchange SET name = @name WHERE stock_exchange_id = @id';
      const request = new sql.Request();
      request.input('name', sql.VarChar, name);
      request.input('id', sql.Int, exchangeId);

      await request.query(query);
      res.status(200).json({ message: 'Stock exchange succesvol bijgewerkt' });
  } catch (error) {
      console.error('Fout bij het bijwerken van stock exchange:', error);
      res.status(500).json({ message: 'Serverfout bij het bijwerken van stock exchange' });
  }
});

// Verwijder een stock exchange
app.delete('/api/stockexchange/:id', async (req, res) => {
  const exchangeId = req.params.id;

  try {
      const query = 'DELETE FROM StockExchange WHERE stock_exchange_id = @id';
      const request = new sql.Request();
      request.input('id', sql.Int, exchangeId);

      await request.query(query);
      res.status(200).json({ message: 'Stock exchange succesvol verwijderd' });
  } catch (error) {
      console.error('Fout bij het verwijderen van stock exchange:', error);
      res.status(500).json({ message: 'Serverfout bij het verwijderen van stock exchange' });
  }
});

// ----------------- Stocks -----------------
// Voeg een nieuw aandeel toe
app.post('/api/stocks', async (req, res) => {
  const { name, ticker_symbol, stock_exchange_id } = req.body;

  if (!name || !ticker_symbol) {
      return res.status(400).json({ message: 'Naam en ticker symbool zijn verplicht' });
  }

  try {
      // Controleer op duplicaten
      const checkQuery = `
          SELECT * FROM Stocks 
          WHERE name = @name OR ticker_symbol = @ticker_symbol
      `;
      const checkRequest = new sql.Request();
      checkRequest.input('name', sql.VarChar, name);
      checkRequest.input('ticker_symbol', sql.VarChar, ticker_symbol);

      const existingStocks = await checkRequest.query(checkQuery);

      if (existingStocks.recordset.length > 0) {
          return res.status(409).json({ message: 'Aandeel met dezelfde naam of ticker bestaat al' });
      }

      // Voeg het aandeel toe als er geen duplicaat is
      const query = `
          INSERT INTO Stocks (name, ticker_symbol, stock_exchange_id)
          VALUES (@name, @ticker_symbol, @stock_exchange_id)
      `;
      const request = new sql.Request();
      request.input('name', sql.VarChar, name);
      request.input('ticker_symbol', sql.VarChar, ticker_symbol);
      request.input('stock_exchange_id', sql.Int, stock_exchange_id || null);

      await request.query(query);
      res.status(201).json({ message: 'Aandeel succesvol toegevoegd' });
  } catch (error) {
      console.error('Fout bij het toevoegen van aandeel:', error);
      res.status(500).json({ message: 'Serverfout bij het toevoegen van aandeel' });
  }
});


// Selecteer stocks
app.get('/api/SelectStock', async (req, res) => {
  try {
      const query = 'SELECT aandeel_id, name, ticker_symbol FROM Stocks';
      const result = await sql.query(query);
      res.status(200).json(result.recordset);
    } catch (error) {
      console.error('Error fetching stocks:', error);
      res.status(500).json({ message: 'Error fetching stocks from the database.' });
  }
});

// Selecteer stocks waarvan prijzen in db
app.get('/api/SelectStockInPricedb', async (req, res) => {
  try {
      const query = 'Select distinct s.aandeel_id, s.ticker_symbol, s.name  from DailyClosingPrices join Stocks s ON DailyClosingPrices.aandeel_id = s.aandeel_id';
      const result = await sql.query(query);
      res.status(200).json(result.recordset);
    } catch (error) {
      console.error('Error fetching stocks:', error);
      res.status(500).json({ message: 'Error fetching stocks from the database.' });
  }
});

// Selecteer dagelijkse prijzen op basis van aandeel_id
app.get('/api/GetDailyPrices', async (req, res) => {
  const { ticker_id } = req.query;
  
  if (!ticker_id) {
      return res.status(400).json({ message: 'ticker_id is required.' });
  }

  try {
      const query = `
          SELECT date, closing_price
          FROM DailyClosingPrices
          WHERE aandeel_id = @ticker_id
          ORDER BY date ASC
      `;

      const request = new sql.Request();
      request.input('ticker_id', sql.Int, ticker_id);

      const result = await request.query(query);
      res.status(200).json(result.recordset);
  } catch (error) {
      console.error('Error fetching daily prices:', error);
      res.status(500).json({ message: 'Error fetching daily prices from the database.' });
  }
});

/*app.get('/api/GetDailyPrices', async (req, res) => {
  const { ticker_id, symbol } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const startDate = twoYearsAgo.toISOString().split('T')[0];

  // Helper: zet DB-rijen of API-data om in { date, closing_price }
  const mapDb = rows =>
    rows.map(r => ({
      date:   r.date.toISOString().split('T')[0],
      closing_price: parseFloat(r.closing_price),
    }));
  const mapApi = arr =>
    arr.map(d => ({
      date: new Date(d.t * 1000).toISOString().split('T')[0],
      closing_price: d.c
    }));

  try {
    let dailyPrices = [];

    // 1) Probeer uit DB
    if (ticker_id) {
      const request = pool.request();
      request.input('ticker_id', sql.Int, ticker_id);
      const result = await request.query(`
        SELECT date, closing_price
        FROM DailyClosingPrices
        WHERE aandeel_id = @ticker_id
        ORDER BY date ASC
      `);
      if (result.recordset.length) {
        dailyPrices = mapDb(result.recordset);
      }
    }

    // 2) Fallback naar API als geen data uit DB én er is een symbol
    if ((!dailyPrices.length) && symbol) {
      const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${symbol}`
        + `?start_date=${startDate}&end_date=${today}&token=JOUW_API_KEY`;
      const apiResp = await fetch(apiUrl);
      if (!apiResp.ok) {
        console.warn(`Profit API fout voor ${symbol}: ${apiResp.statusText}`);
      } else {
        const apiData = await apiResp.json();
        if (Array.isArray(apiData) && apiData.length) {
          dailyPrices = mapApi(apiData);
        }
      }
    }

    if (!dailyPrices.length) {
      return res.status(404).json({ message: 'Geen prijsdata in DB of API gevonden.' });
    }

    return res.json(dailyPrices);

  } catch (err) {
    console.error('Fout in GetDailyPrices:', err);
    return res.status(500).json({ message: err.message });
  }
});*/


app.get('/api/inputChartData', async (req, res) => {
  const { ticker, financialOption } = req.query; // Haal de gebruikersnaam uit de query parameters

  try {
    const query = `SELECT period_end_date, fp, ${financialOption} AS financial FROM aandelen_data_ where ticker = @ticker AND period_end_date > DATEADD(Year, -10, CONVERT(date, GETDATE())) ORDER BY period_end_date ASC`;
    const request = new sql.Request();
    request.input('ticker', sql.VarChar, ticker);
    request.input('financialOption', sql.VarChar, financialOption);
    const result = await request.query(query);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van gebruikerspunten en deelname:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van gebruikerspunten en deelname' });
  }
});

app.get('/api/calculatedInputChartData', async (req, res) => {
  const { ticker, calculatedFinancialOption } = req.query; // Haal de gebruikersnaam uit de query parameters

  try {
    const query = `SELECT period_end_date, fp, ${calculatedFinancialOption} AS financial FROM aandelen_data_calc_ where ticker = @ticker ORDER BY period_end_date ASC`;
    const request = new sql.Request();
    request.input('ticker', sql.VarChar, ticker);
    request.input('calculatedFinancialOption', sql.VarChar, calculatedFinancialOption);
    const result = await request.query(query);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van gebruikerspunten en deelname:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van gebruikerspunten en deelname' });
  }
});

// Define an API route to fetch data
//period_end_date > '2012-01-01' and fp = 'FY' and 
app.get('/api/tickersFastCheckNotOk', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query("SELECT DISTINCT ticker FROM aandelen_data_ WHERE period_end_date > '2012-01-01' and fp = 'FY' and (NetCashProvidedByUsedInOperatingActivities < 0 or NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment < 0 or NetIncomeLoss < 0)");
    // Access the data (recordset)
    const data = result.recordset;

    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/api/tickersFastCheckOk', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query("SELECT DISTINCT ticker FROM aandelen_data_ WHERE period_end_date > '2012-01-01' and fp = 'FY' and ( NetCashProvidedByUsedInOperatingActivities > 0 AND NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment > 0 AND NetIncomeLoss > 0)");
    // Access the data (recordset)
    const data = result.recordset;

    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

// Define an API route to fetch data
app.get('/api/aandelenData', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query("SELECT period_start_date, period_end_date, fp, form, ticker, LiabilitiesCurrent, Liabilities, StockholdersEquity, NetIncomeLoss, NetCashProvidedByUsedInOperatingActivities, PurchasesOfPropertyAndEquipment, Revenues, WeightedAverageNumberOfDilutedSharesOutstanding, Dividend FROM aandelen_data_ ORDER BY ticker, period_end_date DESC");
    // Access the data (recordset)
    const data = result.recordset;

    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/api/IdealePortfolio/:inputDate', async (req, res) => {
  const { inputDate } = req.params;

  try {
    const tickersResult = await sql.query`SELECT DISTINCT ticker FROM aandelen_data_calc_`;

    // Bereid de data voor
    let idealePortfolioData = [];

    for (const row of tickersResult.recordset) {
      const ticker = row.ticker;
      const result = await sql.query`SELECT TOP 1 ticker, period_end_date, selectiecriteria, waarde_verdeling, intrinsieke_waarde FROM aandelen_data_calc_ WHERE ticker = ${ticker} AND period_end_date <= ${inputDate} ORDER BY period_end_date DESC`;
      
      if (result.recordset.length > 0) {
        idealePortfolioData.push(result.recordset[0]);
      }
    }

    // Stuur de data terug naar de frontend
    res.json(idealePortfolioData);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Er is een fout opgetreden bij het ophalen van de ideale portfolio data.');
  }
});

// Endpoint to fetch ticker symbol by aandeel_id
app.get('/api/getTickerByAandeelId/:aandeel_id', async (req, res) => {
  const { aandeel_id } = req.params;

  if (!aandeel_id) {
      return res.status(400).json({ message: 'aandeel_id is required.' });
  }

  try {
      const pool = await sql.connect(config);

      // Query to fetch ticker symbol
      const result = await pool.request()
          .input('aandeel_id', sql.Int, aandeel_id)
          .query('SELECT ticker_symbol FROM Stocks WHERE aandeel_id = @aandeel_id');

      if (result.recordset.length === 0) {
          return res.status(404).json({ message: `Ticker symbol not found for aandeel_id: ${aandeel_id}` });
      }

      res.status(200).json({ ticker_symbol: result.recordset[0].ticker_symbol });
  } catch (error) {
      console.error('Error fetching ticker symbol:', error);
      res.status(500).json({ message: 'Error fetching ticker symbol from the database.' });
  }
});


// Endpoint to update daily and weekly prices
app.post('/api/updateDailyAndWeeklyPrices', async (req, res) => {
  const { aandeel_id } = req.body;
  // Log het opgehaalde aandeel_id
  console.log(`Received aandeel_id: ${aandeel_id}`);
  if (!aandeel_id) {
      return res.status(400).json({ message: 'aandeel_id is required.' });
  }

  try {
      const pool = await sql.connect(config);

      // Haal de ticker op voor de gegeven aandeel_id
      const response1 = await fetch(`http://localhost:5000/api/getTickerByAandeelId/${aandeel_id}`);
      if (!response1.ok) {
          console.error(`Error fetching ticker for aandeel_id ${aandeel_id}:`, await response1.text());
          throw new Error(`Error fetching ticker symbol: ${response1.statusText}`);
      }
      const { ticker_symbol } = await response1.json();
      if (!ticker_symbol) {
          throw new Error(`Ticker symbol not found for aandeel_id: ${aandeel_id}`);
      }
      console.log(`Fetched ticker symbol: ${ticker_symbol}`);

      // Fetch daily and weekly prices from an external API
      const apiKey = '3a6089f7212f4ad383160a4860499dae';
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);

      const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${ticker_symbol}?token=${apiKey}&start_date=${oneYearAgo.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      data.forEach(entry => {
        if (entry.c == null) {
          console.error(`Null value found for closing_price at timestamp: ${entry.t}`);
        }
      });
      console.log(data);
      for (const record of data) {

          console.log(record.t)
      }
      
      // Save daily and weekly prices to the database
      for (const record of data) {
          // Convert Unix timestamp to YYYY-MM-DD format
          const date = new Date(record.t * 1000).toISOString().split('T')[0];

          // Verwijder gegevens ouder dan 1 jaar
          await pool.request()
          .input('aandeel_id', sql.Int, aandeel_id)
          .input('threshold_date', sql.Date, oneYearAgo.toISOString().split('T')[0])
          .query(`
              DELETE FROM DailyClosingPrices 
              WHERE aandeel_id = @aandeel_id AND date < @threshold_date;
          `);

          await pool.request()
              .input('aandeel_id', sql.Int, aandeel_id)
              .input('closing_price', sql.Decimal(10, 2), record.c)
              .input('date', sql.Date, date)
              .query(`
                  MERGE INTO DailyClosingPrices AS target
                  USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @date AS date) AS source
                  ON target.date = source.date AND target.aandeel_id = source.aandeel_id
                  WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price
                  WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date) VALUES (source.aandeel_id, source.closing_price, source.date);
              `);

          const weekEnding = new Date(date);
          weekEnding.setDate(weekEnding.getDate() + (7 - weekEnding.getDay()));
          const weekEndingDate = weekEnding.toISOString().split('T')[0];

          // Verwijder oude weekgegevens en voeg nieuwe toe of werk bij
          await pool.request()
              .input('aandeel_id', sql.Int, aandeel_id)
              .input('threshold_date', sql.Date, oneYearAgo.toISOString().split('T')[0])
              .query(`
                  DELETE FROM WeeklyClosingPrices 
                  WHERE aandeel_id = @aandeel_id AND week_ending < @threshold_date;
              `);

          await pool.request()
              .input('aandeel_id', sql.Int, aandeel_id)
              .input('closing_price', sql.Decimal(10, 2), record.c)
              .input('week_ending', sql.Date, weekEndingDate)
              .query(`
                  MERGE INTO WeeklyClosingPrices AS target
                  USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @week_ending AS week_ending) AS source
                  ON target.week_ending = source.week_ending AND target.aandeel_id = source.aandeel_id
                  WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price
                  WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, week_ending) VALUES (source.aandeel_id, source.closing_price, source.week_ending);
              `);
      }

      res.status(200).json({ message: 'Daily and weekly prices updated successfully.' });
  } catch (error) {
      console.error('Error updating daily and weekly prices:', error);
      res.status(500).json({ message: 'Error updating daily and weekly prices.' });
  }
});

app.post('/api/updateMonthlyPrices', async (req, res) => {
  const { aandeel_id } = req.body;

  if (!aandeel_id) {
      return res.status(400).json({ message: 'aandeel_id is vereist.' });
  }

  try {
      const pool = await sql.connect(config);

      // Haal de eerste en laatste transactiedatum en ticker op
      const transactionQuery = `
          SELECT 
              MIN(purchase_time) AS first_transaction_date,
              MAX(purchase_time) AS last_transaction_date,
              SUM(quantity) AS total_quantity,
              ticker_symbol
          FROM PF_transactions
          JOIN Stocks ON PF_transactions.aandeel_id = Stocks.aandeel_id
          WHERE PF_transactions.aandeel_id = @aandeel_id
          GROUP BY ticker_symbol
      `;
      const transactionResult = await pool.request()
          .input('aandeel_id', sql.Int, aandeel_id)
          .query(transactionQuery);

      if (!transactionResult.recordset.length) {
          return res.status(404).json({ message: 'Geen transacties gevonden voor dit aandeel.' });
      }

      const { first_transaction_date, last_transaction_date, total_quantity, ticker_symbol } = transactionResult.recordset[0];

      if (!first_transaction_date || total_quantity === 0) {
          return res.status(400).json({ message: 'Geen geldige transacties gevonden voor dit aandeel.' });
      }

      const firstDate = new Date(first_transaction_date);
      const startMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 0); // Laatste dag van vorige maand
      const lastDate = new Date(last_transaction_date);
      const endMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0); // Laatste dag van de maand

      const apiKey = '3a6089f7212f4ad383160a4860499dae';
      let currentMonth = startMonth;

      while (currentMonth <= endMonth) {
          const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

          // API-oproep om sluitingsprijzen te vinden voor de hele maand
          const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${ticker_symbol}?token=${apiKey}&start_date=${monthStart}&end_date=${monthEnd}`;
          const response = await fetch(apiUrl);

          if (!response.ok) {
              console.error(`Fout bij ophalen van data voor ${ticker_symbol} van ${monthStart} tot ${monthEnd}: ${response.statusText}`);
              currentMonth.setMonth(currentMonth.getMonth() + 1);
              continue;
          }

          const data = await response.json();

          // Zoek de laatste beschikbare sluitingsprijs in de maand
          const lastClosing = data.reverse().find((day) => day.c != null);

          if (!lastClosing) {
              console.warn(`Geen sluitprijs gevonden voor ${ticker_symbol} in maand ${monthEnd}.`);
              currentMonth.setMonth(currentMonth.getMonth() + 1);
              continue;
          }

          const closingPrice = lastClosing.c;
          const closingDate = lastClosing.date;

          // Sla de maandelijkse sluitprijs op in de database
          await pool.request()
              .input('aandeel_id', sql.Int, aandeel_id)
              .input('closing_price', sql.Decimal(10, 2), closingPrice)
              .input('month_end', sql.Date, closingDate)
              .query(`
                  MERGE INTO MonthlyClosingPrices AS target
                  USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @month_end AS month_ending) AS source
                  ON target.month_ending = source.month_ending AND target.aandeel_id = source.aandeel_id
                  WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price
                  WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, month_ending) VALUES (source.aandeel_id, source.closing_price, source.month_ending);
              `);

          currentMonth.setMonth(currentMonth.getMonth() + 1);
      }

      res.status(200).json({ message: 'Maandelijkse prijzen succesvol bijgewerkt.' });
  } catch (error) {
      console.error('Error updating monthly prices:', error);
      res.status(500).json({ message: 'Er is een fout opgetreden bij het bijwerken van maandelijkse prijzen.' });
  }
});


// Express route om de functie te gebruiken
app.get('/api/getSecData/:ticker', async (req, res) => {
  const { ticker } = req.params;

  try {
    const secData = await runPythonScript('changeDataToDatabaseFromSec', [ticker]);
    res.json({secData: secData});
  } catch (error) {
    console.error('Error bij het uitvoeren van Python-script:', error);
    res.status(500).send('Serverfout bij het uitvoeren van Python-script.');
  }
});

// Haal de laatste beschikbare cash voor een specifieke gebruiker op
app.get('/api/user/:userID', async (req, res) => {
  const { userID } = req.params;

  try {
      // Query om de meest recente availableCash voor een user op te halen
      const query = `
          SELECT TOP 1 availableCash, date 
          FROM Userdata_canChangeDaily 
          WHERE userID = @userID 
          ORDER BY date DESC
      `;
      const request = new sql.Request();
      request.input('userID', sql.Int, userID);

      const result = await request.query(query);
      if (result.recordset.length > 0) {
          res.json(result.recordset[0]); // Stuur de laatste beschikbare waarde
      } else {
          res.json({ availableCash: null, date: null });
      }
  } catch (error) {
      console.error('Fout bij het ophalen van user data:', error);
      res.status(500).json({ error: 'Er is een fout opgetreden bij het ophalen van de user data' });
  }
});

// Sla de availableCash van een user op, of werk bij als deze al bestaat voor dezelfde datum
app.post('/api/user/update', async (req, res) => {
  const { userID, availableCash, date } = req.body;

  try {
      // Query om te controleren of er al een rij bestaat voor de user en datum
      const query = `
          IF EXISTS (SELECT * FROM Userdata_canChangeDaily WHERE userID = @userID AND date = @date)
          BEGIN
              UPDATE Userdata_canChangeDaily 
              SET availableCash = @availableCash
              WHERE userID = @userID AND date = @date;
          END
          ELSE
          BEGIN
              INSERT INTO Userdata_canChangeDaily (userID, availableCash, date) 
              VALUES (@userID, @availableCash, @date);
          END
      `;

      const request = new sql.Request();
      request.input('userID', sql.Int, userID);
      request.input('availableCash', sql.Decimal(18, 2), availableCash);
      request.input('date', sql.Date, date);

      await request.query(query);
      res.status(200).json({ message: 'Data succesvol opgeslagen' });
  } catch (error) {
      console.error('Fout bij het opslaan van data:', error);
      res.status(500).json({ error: 'Serverfout bij het opslaan van data' });
  }
});


// Haal de entries voor de meest recente datum op
app.get('/:userID', async (req, res) => {
  const { userID } = req.params;

  try {
    // Vind de meest recente datum
    const dateResult = await new sql.Request()
      .input('userID', sql.Int, userID)
      .query(`
        SELECT MAX(date) AS latestDate
        FROM UserCashEntries
        WHERE userID = 1
      `);

    const latestDate = dateResult.recordset[0].latestDate;
    if (!latestDate) {
      return res.status(404).json({ message: 'Geen data gevonden' });
    }

    // Haal alle entries voor die datum op
    const entriesResult = await new sql.Request()
      .input('userID', sql.Int, userID)
      .input('date', sql.Date, latestDate)
      .query(`
        SELECT name, value
        FROM UserCashEntries
        WHERE userID = 1 AND date = @date
      `);

    res.json({ availableCash: entriesResult.recordset, date: latestDate });
  } catch (error) {
    console.error('Error fetching user cash entries:', error);
    res.status(500).json({ error: 'Serverfout bij het ophalen van cash entries' });
  }
});

// Sla alle entries voor de datum op: oude verwijderen, nieuwe invoegen
app.post('/update', async (req, res) => {
  const { userID, availableCash, date } = req.body; // availableCash = [{name, value}, ...]

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    
    // Verwijder bestaande entries voor deze user en datum
    await request
      .input('userID', sql.Int, userID)
      .input('date', sql.Date, date)
      .query(`
        DELETE FROM UserCashEntries
        WHERE userID = 1 AND date = @date
      `);

    // Voeg nieuwe entries in
    for (const entry of availableCash) {
      await request
        .input('name', sql.NVarChar(100), entry.name)
        .input('value', sql.Decimal(18, 2), entry.value)
        .query(`
          INSERT INTO UserCashEntries (userID, name, value, date)
          VALUES (1, @name, @value, @date)
        `);
    }

    await transaction.commit();
    res.status(200).json({ message: 'Entries succesvol opgeslagen' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error saving user cash entries:', error);
    res.status(500).json({ error: 'Serverfout bij het opslaan van cash entries' });
  }
});






/*async function getMovingAverage(prices) {
    try {
        const response = await axios.post('http://localhost:8000/calculate', { prices });
        return response.data.moving_average;
    } catch (error) {
        console.error("Error fetching moving average:", error);
    }
}

app.post('/api/get-moving-average', async (req, res) => {
  const prices = req.body.prices;
  const movingAverage = await getMovingAverage(prices);
  res.json({ movingAverage });
});*/


// Algemene foutafhandeling
app.use((err, req, res, next) => {
  console.error('Serverfout:', err);
  res.status(500).json({ message: 'Er is een serverfout opgetreden' });
});

// Start de server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server luistert op poort ${port}`);
});
