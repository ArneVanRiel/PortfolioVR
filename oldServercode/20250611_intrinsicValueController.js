// controllers/intrinsicValueController.js
const sql = require('mssql');
const { config } = require('../config/database');

async function fetchHistoricalDataForFCF(ticker, endDate) {
    try {
        const pool = await sql.connect(config);
        const request = pool.request();
        const tenYearsAgo = new Date(endDate);
        tenYearsAgo.setFullYear(endDate.getFullYear() - 10);

        const fcfDataResult = await request.input('ticker', sql.VarChar, ticker)
            .input('startDate', sql.Date, tenYearsAgo)
            .input('endDate', sql.Date, endDate)
            .query(`
                SELECT
                    period_end_date,
                    DATEPART(quarter, period_end_date) AS quarter,
                    DATEPART(year, period_end_date) AS year,
                    fd.fp_id,
                    SUM(CASE WHEN data_type = 'NetCashProvidedByUsedInOperatingActivities' THEN value ELSE 0 END) AS NetCashProvidedByUsedInOperatingActivities,
                    SUM(CASE WHEN data_type = 'PurchasesOfPropertyAndEquipment' THEN value ELSE 0 END) AS PurchasesOfPropertyAndEquipment
                FROM [dbo].[fundamental_data] fd
                JOIN [dbo].[Stocks] s ON fd.stock_id = s.aandeel_id
                WHERE s.ticker_symbol = @ticker
                    AND fd.period_end_date >= @startDate AND fd.period_end_date <= @endDate
                    AND fd.data_type IN ('NetCashProvidedByUsedInOperatingActivities', 'PurchasesOfPropertyAndEquipment')
                GROUP BY period_end_date, DATEPART(quarter, period_end_date), DATEPART(year, period_end_date), fd.fp_id
                ORDER BY period_end_date DESC;
            `);

        await pool.close();
        return fcfDataResult.recordset.map(row => ({
            date: row.period_end_date,
            quarter: row.quarter,
            year: row.year,
            fp: row.fp_id,
            fcf_3_12m: parseFloat(row.NetCashProvidedByUsedInOperatingActivities) - parseFloat(row.PurchasesOfPropertyAndEquipment)
        }));

    } catch (err) {
        console.error('Database error (historical FCF data):', err);
        return { error: 'Er is een fout opgetreden bij het ophalen van de historische FCF data.' };
    }
}

async function fetchLatestEquityAndShares(ticker, date) {
    try {
        const pool = await sql.connect(config);
        const request = pool.request();

        const latestDataResult = await request.input('ticker', sql.VarChar, ticker)
            .input('date', sql.Date, date)
            .query(`
                SELECT TOP 1
                    SUM(CASE WHEN fd.data_type = 'StockholdersEquity' THEN fd.value ELSE NULL END) AS StockholdersEquity,
                    SUM(CASE WHEN fd.data_type = 'WeightedAverageNumberOfDilutedSharesOutstanding' THEN fd.value ELSE NULL END) AS WeightedAverageNumberOfDilutedSharesOutstanding,
                    fd.period_end_date
                FROM [dbo].[fundamental_data] fd
                JOIN [dbo].[Stocks] s ON fd.stock_id = s.aandeel_id
                WHERE s.ticker_symbol = @ticker AND fd.period_end_date <= @date
                    AND fd.data_type IN ('StockholdersEquity', 'WeightedAverageNumberOfDilutedSharesOutstanding')
                GROUP BY fd.period_end_date
                ORDER BY fd.period_end_date DESC;
            `);

        await pool.close();

        if (latestDataResult.recordset.length > 0 &&
            latestDataResult.recordset[0].StockholdersEquity !== null &&
            latestDataResult.recordset[0].WeightedAverageNumberOfDilutedSharesOutstanding !== null) {
            return {
                stockholdersEquity: parseFloat(latestDataResult.recordset[0].StockholdersEquity),
                weightedAverageShares: parseFloat(latestDataResult.recordset[0].WeightedAverageNumberOfDilutedSharesOutstanding),
                date: latestDataResult.recordset[0].period_end_date
            };
        } else {
            return { error: 'Kon de meest recente Stockholders Equity of Weighted Average Shares niet vinden.' };
        }

    } catch (err) {
        console.error('Database error (equity/shares):', err);
        return { error: 'Er is een fout opgetreden bij het ophalen van de Stockholders Equity en Weighted Average Shares.' };
    }
}

function calculateFCFGrowth(fcfData) {
    if (!fcfData || fcfData.length < 2) {
        return { gem_groeipercentage_FCF: 0 };
    }

    // Sorteer de data op datum (oudste eerst voor shift operaties)
    fcfData.sort((a, b) => new Date(a.date) - new Date(b.date));

    const fcfDataWithCalculations = fcfData.map((item, index, arr) => {
        let fcf_q;
        const shiftedItem = arr[index - 1]; // shift(-1) in Python betekent het vorige element

        if (item.fp !== 1) { // Equivalent van != 'Q1' en != 'HY1' (HY1 is niet expliciet in je database)
            fcf_q = item.fcf_3_12m - (shiftedItem ? shiftedItem.fcf_3_12m : 0); // Behandel de eerste entry
        } else {
            fcf_q = item.fcf_3_12m;
        }

        return { ...item, 'FCF/q': fcf_q };
    });

    // Bereken FCF/yr
    const fcfDataWithYearly = fcfDataWithCalculations.map((item, index, arr) => {
        if ([1, 2, 3, 4].includes(item.fp)) {
            let yearlyFCF = item['FCF/q'];
            yearlyFCF += arr[index + 1] ? (arr[index + 1]['FCF/q'] || 0) : 0;
            yearlyFCF += arr[index + 2] ? (arr[index + 2]['FCF/q'] || 0) : 0;
            yearlyFCF += arr[index + 3] ? (arr[index + 3]['FCF/q'] || 0) : 0;
            return { ...item, 'FCF/yr': yearlyFCF };
        }
        return item;
    }).filter(item => item['FCF/yr'] !== undefined); // Filter alleen de jaarlijkse waarden

    if (fcfDataWithYearly.length < 2) {
        return { gem_groeipercentage_FCF: 0 };
    }

    const growthData = {};
    for (let i = 1; i <= 10; i++) {
        growthData[`gemiddelde stijging FCF/Y -${i}Y`] = fcfDataWithYearly.map((item, index, arr) => {
            const shiftedItem = arr[index + i];
            if (shiftedItem && shiftedItem['FCF/yr'] !== 0 && item['FCF/yr'] !== undefined) {
                return (item['FCF/yr'] / shiftedItem['FCF/yr']) ** (1 / i) - 1;
            }
            return undefined;
        }).filter(value => value !== undefined);
    }

    const gemiddelde_stijgingen_FCF = {};
    for (const key in growthData) {
        if (growthData[key].length > 0) {
            gemiddelde_stijgingen_FCF[key] = growthData[key].reduce((sum, value) => sum + value, 0) / growthData[key].length;
        }
    }

    const allGrowthRates = Object.values(gemiddelde_stijgingen_FCF).filter(value => !isNaN(value));
    const gem_groeipercentage_FCF = allGrowthRates.length > 0 ? allGrowthRates.reduce((sum, value) => sum + value, 0) / allGrowthRates.length : 0;

    return { gem_groeipercentage_FCF };
}


function calculateIntrinsicValue(stockholdersEquity, weightedAverageShares, gem_groeipercentage_FCF, gewenstRendement) {
    if (stockholdersEquity === null || weightedAverageShares === null) {
        return { error: 'Stockholders Equity of Weighted Average Shares is ongeldig.' };
    }

    const toekomstige_FCF = {};
    let laatsteFCF = stockholdersEquity; // We gebruiken de laatste Stockholders Equity als startpunt (kan verfijnd worden indien je een recentere FCF waarde hebt)

    let onderneming_10Y_FCF = 0;
    for (let i = 1; i <= 10; i++) {
        laatsteFCF *= (1 + gem_groeipercentage_FCF);
        toekomstige_FCF[`toekomstige FCF +${i}Y`] = laatsteFCF;
        onderneming_10Y_FCF += toekomstige_FCF[`toekomstige FCF +${i}Y`] / Math.pow(1 + gewenstRendement, i);
    }

    const intrinsieke_waarde = (stockholdersEquity + onderneming_10Y_FCF) / weightedAverageShares;

    return { intrinsieke_waarde };
}


/*app.post('/calculate-intrinsic-value', async (req, res) => {
    const { ticker, date, gewenstRendement } = req.body;

    if (!ticker || !date || gewenstRendement === undefined) {
        return res.status(400).json({ error: 'Ticker, datum en gewenst rendement zijn verplicht.' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
        return res.status(400).json({ error: 'Ongeldige datum formaat.' });
    }

    const historicalFCFResult = await fetchHistoricalDataForFCF(ticker, parsedDate);
    if (historicalFCFResult.error) {
        return res.status(500).json({ error: historicalFCFResult.error });
    }

    if (historicalFCFResult.length < 4) { // Minimaal 4 kwartalen nodig voor de eerste berekening
        return res.status(400).json({ error: 'Niet voldoende historische FCF data beschikbaar voor de berekening.' });
    }

    const latestEquitySharesResult = await fetchLatestEquityAndShares(ticker, parsedDate);
    if (latestEquitySharesResult.error) {
        return res.status(404).json({ error: latestEquitySharesResult.error });
    }

    const fcfGrowthResult = calculateFCFGrowth(historicalFCFResult);

    const intrinsicValueResult = calculateIntrinsicValue(
        latestEquitySharesResult.stockholdersEquity,
        latestEquitySharesResult.weightedAverageShares,
        fcfGrowthResult.gem_groeipercentage_FCF,
        gewenstRendement / 100
    );

    if (intrinsicValueResult.error) {
        return res.status(500).json({ error: intrinsicValueResult.error });
    }

    res.json({
        intrinsicValue: intrinsicValueResult.intrinsieke_waarde ? intrinsicValueResult.intrinsieke_waarde.toFixed(2) : null,
        latestDataDate: latestEquitySharesResult.date
    });
});*/

module.exports = { intrinsieke_waarde };