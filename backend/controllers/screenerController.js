// backend/controllers/screenerController.js
const axios = require('axios');
const { sql } = require('../config/database');
const { getCik, getFinancialData, processFinancialData } = require('./secImportController');

const HEADERS = { 'User-Agent': "arne.van.riel@hotmail.be" };

// Helper om gemiddelde te berekenen
const calculateMean = (arr) => {
  if (!arr || arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return sum / arr.length;
};

// Helper om standaarddeviatie te berekenen
const calculateStdDev = (arr) => {
  if (!arr || arr.length < 2) return 0;
  const mean = calculateMean(arr);
  const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

// Helper om rolling window te pakken
const getRollingWindow = (arr, currentIndex, windowSize) => {
  const startIndex = Math.max(0, currentIndex - windowSize + 1);
  return arr.slice(startIndex, currentIndex + 1);
};

const getShiftedValue = (arr, currentIndex, shift) => {
  const targetIndex = currentIndex + shift;
  if (targetIndex >= 0 && targetIndex < arr.length) {
    return arr[targetIndex];
  }
  return null;
};

// Helper om 10 jaar dagkoersen van Yahoo Finance op te halen en op te slaan in DailyClosingPrices
const fetchAndStore10YearDailyPrices = async (stockId, tickerSymbol) => {
  try {
    const yahooTicker = tickerSymbol.replace(/\./g, '-');
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (10 * 365 * 24 * 60 * 60);
    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&period1=${period1}&period2=${period2}`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });

    if (response.data && response.data.chart?.result?.[0]) {
      const result = response.data.chart.result[0];
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];

      // Eerst bestaande data voor dit aandeel in 1 keer wissen om duplicates te voorkomen
      const delReq = new sql.Request();
      await delReq.input('stockId', sql.Int, stockId).query('DELETE FROM DailyClosingPrices WHERE aandeel_id = @stockId');

      // Vervolgens in batches van 500 rijen tegelijk inserten (1 multi-row INSERT query = milliseconden ipv minuten!)
      const validRows = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const closePrice = closes[i];
        if (!ts || closePrice == null || isNaN(closePrice)) continue;
        const recordDateStr = new Date(ts * 1000).toISOString().split('T')[0];
        validRows.push({ date: recordDateStr, price: closePrice });
      }

      const chunkSize = 500;
      for (let i = 0; i < validRows.length; i += chunkSize) {
        const chunk = validRows.slice(i, i + chunkSize);
        const req = new sql.Request();
        req.input('stockId', sql.Int, stockId);
        
        const valueClauses = chunk.map((r, idx) => {
          req.input(`p_${idx}`, sql.Decimal(18, 2), r.price);
          req.input(`d_${idx}`, sql.VarChar(10), r.date);
          return `(@stockId, @p_${idx}, CAST(@d_${idx} AS DATE), GETDATE())`;
        });

        await req.query(`
          INSERT INTO DailyClosingPrices (aandeel_id, closing_price, date, last_updated_at)
          VALUES ${valueClauses.join(', ')}
        `);
      }

      console.log(`⚡ 10-jaar dagkoersen supersnel gesynchroniseerd voor ${tickerSymbol} (${validRows.length} records in ${Math.ceil(validRows.length / chunkSize)} batches).`);
    }
  } catch (err) {
    console.error(`Fout bij ophalen 10j koersen voor ${tickerSymbol}:`, err.message);
  }
};

// Zorg dat screener_results historie tabel bestaat
const ensureScreenerTableExists = async () => {
  try {
    await sql.query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'screener_results')
      CREATE TABLE screener_results (
          ticker VARCHAR(20) PRIMARY KEY,
          name NVARCHAR(255),
          score INT,
          status VARCHAR(20),
          in_database BIT DEFAULT 0,
          all_fcf_positive BIT,
          fcf_growth_positive BIT,
          avg_roe_10y_gt_15 BIT,
          roe_factor_positive BIT,
          ltd_factor_lt_1 BIT,
          gem_groeipercentage_FCF REAL,
          gemiddelde_stijging_ROE_10_Y REAL,
          waardefactor_ROE REAL,
          ltd_equity_mean REAL,
          waarde_verdeling REAL,
          updated_at DATETIME DEFAULT GETDATE()
      );
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('screener_results') AND name = 'waarde_verdeling')
      ALTER TABLE screener_results ADD waarde_verdeling REAL;
    `);
  } catch (err) {
    console.error("Fout bij aanmaken screener_results tabel:", err.message);
  }
};

// Sla screener resultaat op in DB
const saveScreenerResultToDb = async (result) => {
  if (!result || !result.ticker) return;
  try {
    await ensureScreenerTableExists();
    const req = new sql.Request();
    req.input('ticker', sql.VarChar, result.ticker);
    req.input('name', sql.NVarChar, result.name || result.ticker);
    req.input('score', sql.Int, result.score || 0);
    req.input('status', sql.VarChar, result.status || 'REJECTED');
    req.input('in_database', sql.Bit, result.inDatabase ? 1 : 0);

    const c = result.criteria || {};
    req.input('all_fcf_positive', sql.Bit, c.allFcfPositive ? 1 : 0);
    req.input('fcf_growth_positive', sql.Bit, c.fcfGrowthPositive ? 1 : 0);
    req.input('avg_roe_10y_gt_15', sql.Bit, c.avgRoe10Y_gt_15 ? 1 : 0);
    req.input('roe_factor_positive', sql.Bit, c.roeWaardefactorPositive ? 1 : 0);
    req.input('ltd_factor_lt_1', sql.Bit, c.ltdWaardefactor_lt_1 ? 1 : 0);

    const m = result.metrics || {};
    req.input('gem_groeipercentage_FCF', sql.Real, m.gem_groeipercentage_FCF || 0);
    req.input('gemiddelde_stijging_ROE_10_Y', sql.Real, m.gemiddelde_stijging_ROE_10_Y || 0);
    req.input('waardefactor_ROE', sql.Real, m.waardefactor_ROE || 0);
    req.input('ltd_equity_mean', sql.Real, m.ltd_equity_mean || 0);
    req.input('waarde_verdeling', sql.Real, m.waarde_verdeling || 0);

    await req.query(`
      MERGE INTO screener_results WITH (HOLDLOCK) AS target
      USING (SELECT @ticker AS ticker) AS source
      ON (target.ticker = source.ticker)
      WHEN MATCHED THEN
        UPDATE SET 
          name = @name,
          score = @score,
          status = @status,
          in_database = @in_database,
          all_fcf_positive = @all_fcf_positive,
          fcf_growth_positive = @fcf_growth_positive,
          avg_roe_10y_gt_15 = @avg_roe_10y_gt_15,
          roe_factor_positive = @roe_factor_positive,
          ltd_factor_lt_1 = @ltd_factor_lt_1,
          gem_groeipercentage_FCF = @gem_groeipercentage_FCF,
          gemiddelde_stijging_ROE_10_Y = @gemiddelde_stijging_ROE_10_Y,
          waardefactor_ROE = @waardefactor_ROE,
          ltd_equity_mean = @ltd_equity_mean,
          waarde_verdeling = @waarde_verdeling,
          updated_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (ticker, name, score, status, in_database, all_fcf_positive, fcf_growth_positive, avg_roe_10y_gt_15, roe_factor_positive, ltd_factor_lt_1, gem_groeipercentage_FCF, gemiddelde_stijging_ROE_10_Y, waardefactor_ROE, ltd_equity_mean, waarde_verdeling, updated_at)
        VALUES (@ticker, @name, @score, @status, @in_database, @all_fcf_positive, @fcf_growth_positive, @avg_roe_10y_gt_15, @roe_factor_positive, @ltd_factor_lt_1, @gem_groeipercentage_FCF, @gemiddelde_stijging_ROE_10_Y, @waardefactor_ROE, @ltd_equity_mean, @waarde_verdeling, GETDATE());
    `);
  } catch (err) {
    console.error(`Fout bij opslaan screener resultaat voor ${result.ticker}:`, err.message);
  }
};

// CIK & Company Name cache om dubbele requests naar SEC te voorkomen
let secCompanyMapCache = null;
let secCompanyMapLastFetch = 0;

const getSecCompanyMap = async () => {
  const now = Date.now();
  if (secCompanyMapCache && (now - secCompanyMapLastFetch < 3600000)) { // 1 uur cache
    return secCompanyMapCache;
  }
  try {
    const response = await axios.get("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
    const companyTickers = response.data;
    const map = {};
    for (const key in companyTickers) {
      const item = companyTickers[key];
      const tickerUpper = (item.ticker || '').toUpperCase();
      map[tickerUpper] = {
        cik: `${item.cik_str}`.padStart(10, '0'),
        title: item.title || tickerUpper
      };
    }
    secCompanyMapCache = map;
    secCompanyMapLastFetch = now;
    return map;
  } catch (err) {
    console.error("Fout bij ophalen SEC company tickers:", err.message);
    return secCompanyMapCache || {};
  }
};

// Helper om metrieken en selectiecriteria te berekenen voor 1 specifiek kwartaal (targetIndex)
const calculateQuarterMetrics = (quarterlyData, targetIndex) => {
  if (!quarterlyData || targetIndex < 0 || targetIndex >= quarterlyData.length) return null;
  const currentQuarter = quarterlyData[targetIndex];

  // 1. Bereken FCF groeiset over de voorafgaande tot 40 kwartalen (1 tot 10 jaar)
  const fcfGrowthRates = [];
  const shift_yr = 4;
  for (let i = 0; i < 40 && (targetIndex - i) >= 0; i++) {
    const currentQIdx = targetIndex - i;
    for (let years = 1; years <= 10; years++) {
      const prevQIdx = currentQIdx - (years * shift_yr);
      if (prevQIdx >= 0) {
        const currentFcf = quarterlyData[currentQIdx].fcf_yearly_ttm;
        const prevFcf = quarterlyData[prevQIdx].fcf_yearly_ttm;
        if (currentFcf && prevFcf && Math.abs(prevFcf) > 100000) {
          const growthRate = Math.pow(currentFcf / prevFcf, 1 / years) - 1;
          if (isFinite(growthRate) && growthRate < 1.0 && growthRate > -0.9) {
            fcfGrowthRates.push(growthRate);
          }
        }
      }
    }
  }

  let gem_groeipercentage_FCF = calculateMean(fcfGrowthRates);
  if (gem_groeipercentage_FCF > 0.5) gem_groeipercentage_FCF = 0.5;

  const standaard_deviatie_FCF = calculateStdDev(fcfGrowthRates);
  const waardefactor_FCF = standaard_deviatie_FCF ? gem_groeipercentage_FCF / (standaard_deviatie_FCF * standaard_deviatie_FCF) : 0;

  // 2. ROE 10-jaar venster (tot 40 kwartalen)
  const roeWindowData = getRollingWindow(quarterlyData, targetIndex, 40);
  const roe10YWindow = roeWindowData.map(r => r.roe_ttm || 0);
  const gemiddelde_stijging_ROE_10_Y = calculateMean(roe10YWindow);
  const standaard_deviatie_ROE = calculateStdDev(roe10YWindow);
  const waardefactor_ROE = gemiddelde_stijging_ROE_10_Y - standaard_deviatie_ROE;

  // 3. LTD / Equity 4-kwartaal gemiddelde
  const ltdEquity4QWindow = getRollingWindow(quarterlyData, targetIndex, 4).map(r => r.ltd_s_equity || 0);
  const ltdEquityMean = calculateMean(ltdEquity4QWindow);
  const waardefactor_LTD_equity = ltdEquityMean;

  // 4. Waardeverdeling
  const calcWV = waardefactor_FCF * (1 + waardefactor_ROE) * (-2 * waardefactor_LTD_equity + 2);
  const waarde_verdeling = isFinite(calcWV) ? calcWV : 0;

  // 5. Selectiecriteria (0-5 score)
  const last40Q = getRollingWindow(quarterlyData, targetIndex, 40);
  const allFcfPositive = last40Q.length > 0 && last40Q.every(r => (r.fcf_yearly_ttm || 0) > 0);
  const fcfGrowthPositive = gem_groeipercentage_FCF > 0;
  const avgRoe10Y_gt_15 = gemiddelde_stijging_ROE_10_Y >= 0.15;
  const roeWaardefactorPositive = waardefactor_ROE > 0;
  const ltdWaardefactor_lt_1 = waardefactor_LTD_equity < 1;

  const criteria = {
    allFcfPositive,
    fcfGrowthPositive,
    avgRoe10Y_gt_15,
    roeWaardefactorPositive,
    ltdWaardefactor_lt_1
  };

  const score = Object.values(criteria).filter(Boolean).length;
  let status = "REJECTED";
  if (score === 5) status = "TOP_MATCH";
  else if (score >= 3) status = "POTENTIAL";

  // 6. DCF Intrinsieke Waarde
  const discountRate = 0.15;
  const terminalGrowthRate = 0.02;
  let dcfSum = 0;
  for (let y = 1; y <= 10; y++) {
    const futureFcf = (currentQuarter.fcf_yearly_ttm || 0) * Math.pow(1 + gem_groeipercentage_FCF, y);
    dcfSum += futureFcf / Math.pow(1 + discountRate, y);
  }
  const terminalValue = ((currentQuarter.fcf_yearly_ttm || 0) * Math.pow(1 + gem_groeipercentage_FCF, 10) * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
  const discountedTerminalValue = terminalValue / Math.pow(1 + discountRate, 10);
  const totalValue = dcfSum + discountedTerminalValue;
  
  const shares = currentQuarter.WeightedAverageNumberOfDilutedSharesOutstanding || currentQuarter.weightedAverageNumberOfDilutedSharesOutstanding || 1;
  const intrinsieke_waarde = shares > 0 ? totalValue / shares : 0;

  return {
    period_end_date: currentQuarter.period_end_date,
    score,
    status,
    criteria,
    metrics: {
      gem_groeipercentage_FCF,
      standaard_deviatie_FCF,
      waardefactor_FCF,
      gemiddelde_stijging_ROE_10_Y,
      standaard_deviatie_ROE,
      waardefactor_ROE,
      ltd_equity_mean: ltdEquityMean,
      waardefactor_LTD_equity,
      waarde_verdeling
    },
    raw: {
      fcf_yearly_ttm: currentQuarter.fcf_yearly_ttm,
      netIncome_yearly_ttm: currentQuarter.netIncome_yearly_ttm,
      roe_ttm: currentQuarter.roe_ttm,
      ltd_s_equity: currentQuarter.ltd_s_equity,
      shares_outstanding: shares,
      intrinsieke_waarde: isFinite(intrinsieke_waarde) && intrinsieke_waarde > 0 ? intrinsieke_waarde : 0
    }
  };
};

// Verwerk en verrijk quarterlyData over de hele geschiedenis
const processQuarterlyTimeSeries = (quarterlyData) => {
  if (!quarterlyData || quarterlyData.length === 0) return [];

  // Sorteer op datum oplopend
  quarterlyData.sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));

  // Kwartaal FCF en Net Income
  quarterlyData.forEach((row, i) => {
    const prevRow = getShiftedValue(quarterlyData, i, -1);
    const operatingCash = row.NetCashProvidedByUsedInOperatingActivities || row.netCashProvidedByUsedInOperatingActivities || 0;
    const capex = row.PurchasesOfPropertyAndEquipment || row.purchasesOfPropertyAndEquipment || 0;
    const cumulativeFCF = operatingCash - capex;

    const prevOperatingCash = prevRow ? (prevRow.NetCashProvidedByUsedInOperatingActivities || prevRow.netCashProvidedByUsedInOperatingActivities || 0) : 0;
    const prevCapex = prevRow ? (prevRow.PurchasesOfPropertyAndEquipment || prevRow.purchasesOfPropertyAndEquipment || 0) : 0;
    const prevCumulativeFCF = prevOperatingCash - prevCapex;

    const isFirstQuarter = row.fp === 'Q1' || row.fp_id === 1 || row.fp === '1' || row.fp_id === 5;
    row.fcf_quarterly = (prevRow && !isFirstQuarter) ? cumulativeFCF - prevCumulativeFCF : cumulativeFCF;

    const cumulativeNI = row.NetIncomeLoss || row.netIncomeLoss || 0;
    const prevCumulativeNI = prevRow ? (prevRow.NetIncomeLoss || prevRow.netIncomeLoss || 0) : 0;
    row.netIncome_quarterly = (prevRow && !isFirstQuarter) ? cumulativeNI - prevCumulativeNI : cumulativeNI;
  });

  // TTM FCF, TTM Net Income, ROE, LTD/Equity
  quarterlyData.forEach((row, i) => {
    row.fcf_yearly_ttm = getRollingWindow(quarterlyData, i, 4).map(r => r.fcf_quarterly).reduce((s, v) => s + (v || 0), 0);
    row.netIncome_yearly_ttm = getRollingWindow(quarterlyData, i, 4).map(r => r.netIncome_quarterly).reduce((s, v) => s + (v || 0), 0);
    
    const equity = row.StockholdersEquity || row.stockholdersEquity || 0;
    row.roe_ttm = equity !== 0 ? row.netIncome_yearly_ttm / equity : 0;

    const liabilities = row.Liabilities || row.liabilities || 0;
    const liabilitiesCurrent = row.LiabilitiesCurrent || row.liabilitiesCurrent || 0;
    const non_curr_liabilities = liabilities - liabilitiesCurrent;
    row.ltd_s_equity = equity !== 0 ? non_curr_liabilities / equity : 0;
  });

  return quarterlyData;
};

// Evalueer 1 ticker in-memory via SEC
const screenSingleTickerFromSec = async (tickerUpper, companyInfo) => {
  const cik = companyInfo ? companyInfo.cik : await getCik(tickerUpper);
  if (!cik) {
    return {
      ticker: tickerUpper,
      name: companyInfo ? companyInfo.title : tickerUpper,
      error: "CIK nummer niet gevonden bij SEC.",
      score: 0,
      status: "ERROR",
      inDatabase: false
    };
  }

  const rawFacts = await getFinancialData(cik);
  if (!rawFacts || Object.keys(rawFacts).length === 0) {
    return {
      ticker: tickerUpper,
      name: companyInfo ? companyInfo.title : tickerUpper,
      error: "Geen SEC XBRL data gevonden.",
      score: 0,
      status: "ERROR",
      inDatabase: false
    };
  }

  const processedData = processFinancialData(rawFacts, tickerUpper, () => {});
  if (!processedData || processedData.length === 0) {
    return {
      ticker: tickerUpper,
      name: companyInfo ? companyInfo.title : tickerUpper,
      error: "Geen bruikbare financiële data na SEC parsing.",
      score: 0,
      status: "ERROR",
      inDatabase: false
    };
  }

  // Pivot data op period_end_date
  const pivoted = {};
  processedData.forEach(item => {
    const d = item.period_end_date;
    if (!pivoted[d]) {
      pivoted[d] = { period_end_date: d, fp: item.fp };
    }
    pivoted[d][item.metric] = parseFloat(item.value);
  });

  let quarterlyData = Object.values(pivoted);
  quarterlyData = processQuarterlyTimeSeries(quarterlyData);

  if (quarterlyData.length === 0) {
    return {
      ticker: tickerUpper,
      name: companyInfo ? companyInfo.title : tickerUpper,
      error: "Onvoldoende kwartaaldata.",
      score: 0,
      status: "ERROR",
      inDatabase: false
    };
  }

  // Bereken laatste kwartaal
  const latestResult = calculateQuarterMetrics(quarterlyData, quarterlyData.length - 1);

  return {
    ticker: tickerUpper,
    name: companyInfo ? companyInfo.title : tickerUpper,
    score: latestResult.score,
    status: latestResult.status,
    inDatabase: false,
    criteria: latestResult.criteria,
    metrics: latestResult.metrics,
    raw: latestResult.raw,
    totalQuarters: quarterlyData.length
  };
};

// Batch opslag van alle historische kwartalen naar stock_calculations
const saveHistoricalCalculationsToDb = async (stockId, calculatedHistory) => {
  if (!stockId || !calculatedHistory || calculatedHistory.length === 0) return;
  try {
    const delReq = new sql.Request();
    await delReq.input('stockId', sql.Int, stockId).query('DELETE FROM stock_calculations WHERE stock_id = @stockId');

    const chunkSize = 50;
    for (let i = 0; i < calculatedHistory.length; i += chunkSize) {
      const chunk = calculatedHistory.slice(i, i + chunkSize);
      const req = new sql.Request();
      req.input('stockId', sql.Int, stockId);

      const valueClauses = chunk.map((item, idx) => {
        const pEnd = item.period_end_date ? (item.period_end_date instanceof Date ? item.period_end_date.toISOString().split('T')[0] : item.period_end_date) : '2024-01-01';
        const m = item.metrics || {};
        const r = item.raw || {};

        req.input(`pe_${idx}`, sql.Date, new Date(pEnd));
        req.input(`g_fcf_${idx}`, sql.Decimal(18, 4), m.gem_groeipercentage_FCF || 0);
        req.input(`sd_fcf_${idx}`, sql.Decimal(18, 4), m.standaard_deviatie_FCF || 0);
        req.input(`wf_fcf_${idx}`, sql.Decimal(18, 4), m.waardefactor_FCF || 0);
        req.input(`g_roe_${idx}`, sql.Decimal(18, 4), m.gemiddelde_stijging_ROE_10_Y || 0);
        req.input(`sd_roe_${idx}`, sql.Decimal(18, 4), m.standaard_deviatie_ROE || 0);
        req.input(`wf_roe_${idx}`, sql.Decimal(18, 4), m.waardefactor_ROE || 0);
        req.input(`wf_ltd_${idx}`, sql.Decimal(18, 4), m.waardefactor_LTD_equity || 0);
        req.input(`ltd_m_${idx}`, sql.Decimal(18, 4), m.ltd_equity_mean || 0);
        req.input(`score_${idx}`, sql.Int, item.score || 0);
        req.input(`wv_${idx}`, sql.Decimal(38, 4), m.waarde_verdeling || 0);
        req.input(`intr_${idx}`, sql.Decimal(38, 4), r.intrinsieke_waarde || 0);
        req.input(`fcf_y_${idx}`, sql.Decimal(38, 4), r.fcf_yearly_ttm || 0);
        req.input(`shares_${idx}`, sql.Decimal(38, 4), r.shares_outstanding || 1);

        return `(@stockId, @pe_${idx}, @g_fcf_${idx}, @sd_fcf_${idx}, @wf_fcf_${idx}, @g_roe_${idx}, @sd_roe_${idx}, @wf_roe_${idx}, @wf_ltd_${idx}, @ltd_m_${idx}, @score_${idx}, @wv_${idx}, @intr_${idx}, @fcf_y_${idx}, @shares_${idx}, GETDATE(), GETDATE(), GETDATE())`;
      });

      await req.query(`
        INSERT INTO stock_calculations (stock_id, period_end_date, gem_groeipercentage_FCF, standaard_deviatie_FCF, waardefactor_FCF, gemiddelde_stijging_ROE_10_Y, standaard_deviatie_ROE, waardefactor_ROE, waardefactor_LTD_equity, ltd_equity_mean, selectiecriteria, waarde_verdeling, intrinsieke_waarde, latest_fcf_yearly_ttm, latest_shares_outstanding, calculation_date, created_at, updated_at)
        VALUES ${valueClauses.join(', ')}
      `);
    }
  } catch (err) {
    console.error(`Fout bij opslaan historische berekeningen voor stockId ${stockId}:`, err.message);
  }
};

// Helper om volledige kwartaalberekeningen voor een aandeel door te rekenen en op te slaan
const calculateAndSaveStockHistory = async (stockId, tickerUpper) => {
  try {
    const fdRes = await new sql.Request()
      .input('stockId', sql.Int, stockId)
      .query(`
        SELECT period_end_date, data_type, value, fp_id
        FROM fundamental_data
        WHERE stock_id = @stockId
        ORDER BY period_end_date ASC
      `);

    if (fdRes.recordset.length === 0) return;

    const pivoted = {};
    fdRes.recordset.forEach(record => {
      const dateStr = record.period_end_date instanceof Date ? record.period_end_date.toISOString().split('T')[0] : record.period_end_date;
      if (!pivoted[dateStr]) pivoted[dateStr] = { period_end_date: dateStr, fp_id: record.fp_id };
      const keyMap = {
        'LiabilitiesCurrent': 'LiabilitiesCurrent',
        'Liabilities': 'Liabilities',
        'StockholdersEquity': 'StockholdersEquity',
        'NetIncomeLoss': 'NetIncomeLoss',
        'NetCashProvidedByUsedInOperatingActivities': 'NetCashProvidedByUsedInOperatingActivities',
        'PurchasesOfPropertyAndEquipment': 'PurchasesOfPropertyAndEquipment',
        'WeightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageNumberOfDilutedSharesOutstanding'
      };
      pivoted[dateStr][keyMap[record.data_type] || record.data_type] = parseFloat(record.value);
    });

    let quarterlyData = Object.values(pivoted);
    quarterlyData = processQuarterlyTimeSeries(quarterlyData);

    const history = [];
    for (let i = 0; i < quarterlyData.length; i++) {
      const qResult = calculateQuarterMetrics(quarterlyData, i);
      if (qResult) history.push(qResult);
    }

    if (history.length > 0) {
      await saveHistoricalCalculationsToDb(stockId, history);
      console.log(`⚡ Volledige kwartaalberekeningen opgeslagen voor ${tickerUpper} (${history.length} kwartalen).`);
    }
  } catch (err) {
    console.error(`Fout bij berekenen historie voor ${tickerUpper}:`, err.message);
  }
};

// Hoofd endpoint controller: Fast Screen
const fastScreenTickers = async (req, res) => {
  try {
    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ message: "Voer minimaal 1 ticker in." });
    }

    const cleanedTickers = [...new Set(tickers.map(t => (t || '').trim().toUpperCase()).filter(Boolean))];
    if (cleanedTickers.length > 35) {
      return res.status(400).json({ message: "Maximale batchgrootte per screening is 35 tickers." });
    }

    const companyMap = await getSecCompanyMap();
    const results = [];

    for (const tickerUpper of cleanedTickers) {
      try {
        // DB Lookup query (voor reeds ingeladen aandelen)
        const request = new sql.Request();
        const dbStockResult = await request
          .input('ticker', sql.NVarChar, tickerUpper)
          .query(`
            SELECT TOP 1 
              s.aandeel_id, 
              s.name, 
              c.selectiecriteria, 
              c.gem_groeipercentage_FCF, 
              c.gemiddelde_stijging_ROE_10_Y, 
              c.waardefactor_ROE, 
              c.waardefactor_LTD_equity,
              c.ltd_equity_mean,
              c.waarde_verdeling
            FROM Stocks s
            INNER JOIN stock_calculations c ON s.aandeel_id = c.stock_id
            WHERE s.ticker_symbol = @ticker
            ORDER BY c.period_end_date DESC
          `);

        let itemResult = null;

        if (dbStockResult.recordset.length > 0 && dbStockResult.recordset[0].selectiecriteria !== null && dbStockResult.recordset[0].selectiecriteria !== undefined) {
          const dbRow = dbStockResult.recordset[0];
          
          const gem_groeipercentage_FCF = dbRow.gem_groeipercentage_FCF || 0;
          const gemiddelde_stijging_ROE_10_Y = dbRow.gemiddelde_stijging_ROE_10_Y || 0;
          const waardefactor_ROE = dbRow.waardefactor_ROE || 0;
          const ltd_equity_mean = dbRow.ltd_equity_mean || dbRow.waardefactor_LTD_equity || 0;
          
          let waarde_verdeling = dbRow.waarde_verdeling;
          if (waarde_verdeling === null || waarde_verdeling === undefined) {
            const fcfFactor = dbRow.waardefactor_FCF || gem_groeipercentage_FCF;
            waarde_verdeling = fcfFactor * (1 + waardefactor_ROE) * (-2 * ltd_equity_mean + 2);
          }
          if (!isFinite(waarde_verdeling)) waarde_verdeling = 0;

          const criteria = {
            allFcfPositive: gem_groeipercentage_FCF > 0,
            fcfGrowthPositive: gem_groeipercentage_FCF > 0,
            avgRoe10Y_gt_15: gemiddelde_stijging_ROE_10_Y >= 0.15,
            roeWaardefactorPositive: waardefactor_ROE > 0,
            ltdWaardefactor_lt_1: ltd_equity_mean < 1
          };

          const score = dbRow.selectiecriteria !== null ? dbRow.selectiecriteria : Object.values(criteria).filter(Boolean).length;
          let status = "REJECTED";
          if (score === 5) status = "TOP_MATCH";
          else if (score >= 3) status = "POTENTIAL";

          itemResult = {
            ticker: tickerUpper,
            name: dbRow.name || companyMap[tickerUpper]?.title || tickerUpper,
            score,
            status,
            inDatabase: true,
            stockId: dbRow.aandeel_id,
            criteria,
            metrics: {
              gem_groeipercentage_FCF,
              gemiddelde_stijging_ROE_10_Y,
              waardefactor_ROE,
              ltd_equity_mean,
              waarde_verdeling
            }
          };
        } else {
          // Niet in DB of nog geen berekening -> Live SEC screening
          const compInfo = companyMap[tickerUpper];
          itemResult = await screenSingleTickerFromSec(tickerUpper, compInfo);

          // Kleine pauze tussen SEC verzoeken (100ms) om SEC rate limits te vermijden
          await new Promise(res => setTimeout(res, 100));
        }

        results.push(itemResult);
        // Sla direct op in screener_results historie tabel
        await saveScreenerResultToDb(itemResult);

      } catch (errTicker) {
        console.error(`Fout bij screenen van ${tickerUpper}:`, errTicker.message);
        results.push({
          ticker: tickerUpper,
          name: companyMap[tickerUpper]?.title || tickerUpper,
          error: `Fout bij verwerken: ${errTicker.message}`,
          score: 0,
          status: "ERROR",
          inDatabase: false
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error("Fout in fastScreenTickers:", error);
    res.status(500).json({ message: "Serverfout bij het uitvoeren van de screening." });
  }
};

// Ophalen van eerder gescreende resultaten (Persistent marktgeheugen)
const getCachedScreenerResults = async (req, res) => {
  try {
    await ensureScreenerTableExists();
    const result = await sql.query(`
      SELECT 
        sr.ticker, sr.name, sr.score, sr.status, sr.in_database AS inDatabase, 
        sr.all_fcf_positive, sr.fcf_growth_positive, sr.avg_roe_10y_gt_15, sr.roe_factor_positive, sr.ltd_factor_lt_1,
        sr.gem_groeipercentage_FCF, sr.gemiddelde_stijging_ROE_10_Y, sr.waardefactor_ROE, sr.ltd_equity_mean,
        COALESCE(sc.waarde_verdeling, sr.waarde_verdeling) AS meegenomen_waarde_verdeling, 
        sr.updated_at
      FROM screener_results sr
      LEFT JOIN Stocks s ON s.ticker_symbol = sr.ticker
      LEFT JOIN (
          SELECT stock_id, waarde_verdeling,
                 ROW_NUMBER() OVER (PARTITION BY stock_id ORDER BY period_end_date DESC) as rn
          FROM stock_calculations
      ) sc ON sc.stock_id = s.aandeel_id AND sc.rn = 1
      ORDER BY ISNULL(COALESCE(sc.waarde_verdeling, sr.waarde_verdeling), -9999) DESC, sr.score DESC
    `);

    const formatted = result.recordset.map(row => {
      let wv = row.meegenomen_waarde_verdeling;
      if (wv === null || wv === undefined) {
        wv = (row.gem_groeipercentage_FCF || 0) * (1 + (row.waardefactor_ROE || 0)) * (-2 * (row.ltd_equity_mean || 0) + 2);
      }
      if (!isFinite(wv)) wv = 0;

      return {
        ticker: row.ticker,
        name: row.name,
        score: row.score,
        status: row.status,
        inDatabase: row.inDatabase === true || row.inDatabase === 1,
        criteria: {
          allFcfPositive: row.all_fcf_positive === true || row.all_fcf_positive === 1,
          fcfGrowthPositive: row.fcf_growth_positive === true || row.fcf_growth_positive === 1,
          avgRoe10Y_gt_15: row.avg_roe_10y_gt_15 === true || row.avg_roe_10y_gt_15 === 1,
          roeWaardefactorPositive: row.roe_factor_positive === true || row.roe_factor_positive === 1,
          ltdWaardefactor_lt_1: row.ltd_factor_lt_1 === true || row.ltd_factor_lt_1 === 1
        },
        metrics: {
          gem_groeipercentage_FCF: row.gem_groeipercentage_FCF,
          gemiddelde_stijging_ROE_10_Y: row.gemiddelde_stijging_ROE_10_Y,
          waardefactor_ROE: row.waardefactor_ROE,
          ltd_equity_mean: row.ltd_equity_mean,
          waarde_verdeling: wv
        },
        updatedAt: row.updated_at
      };
    });

    res.json({ results: formatted });
  } catch (error) {
    console.error("Fout bij ophalen cached screener resultaten:", error);
    res.status(500).json({ message: "Serverfout bij ophalen screener historie." });
  }
};

// Preset ticker lijsten
const getPresetTickers = async (req, res) => {
  const presets = [
    {
      id: "sp500_tech",
      name: "S&P 500 Big Tech & Chips",
      description: "Grote technologie- en chipbedrijven in de US",
      tickers: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "AVGO", "AMD", "QCOM", "TXN", "ORCL", "ADBE", "CRM", "INTU", "NOW", "AMAT", "LRCX", "KLAC", "PLTR", "IBM"]
    },
    {
      id: "nasdaq100_leaders",
      name: "Nasdaq 100 Leaders",
      description: "Top marktleiders uit de Nasdaq 100 index",
      tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "AVGO", "TSLA", "COST", "ASML", "AMD", "AZN", "PEP", "LIN", "TMUS", "ADBE", "CSCO", "PDD", "QCOM", "TXN"]
    },
    {
      id: "quality_growth",
      name: "Quality & High ROE Leaders",
      description: "Bedrijven met historisch sterke kapitaalrendementen",
      tickers: ["COST", "ISRG", "IDXX", "ODFL", "FAST", "POOL", "ROL", "TDG", "MEDP", "PAYC", "TYL", "CPRT", "VRSK", "SPGI", "MCO"]
    },
    {
      id: "semiconductors",
      name: "Halfgeleiders & Apparatuur",
      description: "Chipmakers en toeleveranciers",
      tickers: ["NVDA", "AVGO", "AMD", "QCOM", "TXN", "AMAT", "LRCX", "KLAC", "ADI", "MU", "MPWR", "MCHP", "NXPI", "ON", "MRVL"]
    },
    {
      id: "healthcare_pharma",
      name: "Medtech & Pharma Quality",
      description: "Gezondheidszorg- en medische apparatuurleiders",
      tickers: ["UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "ISRG", "VRTX", "REGN", "SYK", "BSX", "ZTS", "MDT", "BDX"]
    },
    {
      id: "consumer_retail",
      name: "Consumenten & Retail Kwaliteit",
      description: "Sterke merknamen en retail giganten",
      tickers: ["COST", "WMT", "HD", "PG", "KO", "PEP", "NKE", "MCD", "SBUX", "TJX", "LOW", "EL", "ORLY", "AZO"]
    },
    {
      id: "industrials",
      name: "Industrie & Kapitaalgoederen",
      description: "Toonaangevende industriële spelers",
      tickers: ["GE", "CAT", "DE", "HON", "UNP", "LMT", "RTX", "ETN", "ITW", "PH", "EMR", "CMI", "TT"]
    }
  ];

  res.json({ presets });
};

// Top marktkapitalisatie rangschikking voor sortering op bedrijfsgrootte
const MARKET_CAP_RANKED_TICKERS = [
  "NVDA", "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "BRK.B", "BRK.A",
  "LLY", "WMT", "JPM", "V", "UNH", "XOM", "MA", "COST", "PG", "HD", "JNJ", "BAC", "NFLX",
  "ABBV", "KO", "CRM", "AMD", "ORCL", "PEP", "MRK", "TMO", "LIN", "ADI", "DIS", "CSCO",
  "WFC", "INTU", "MCD", "ABT", "QCOM", "TXN", "DHR", "AMAT", "PM", "NOW", "GE", "CAT",
  "IBM", "ISRG", "AMGN", "LRCX", "SPGI", "BKNG", "GS", "NEE", "PLTR", "RTX", "HON", "ETN",
  "PFE", "SYK", "TJX", "AXP", "BLK", "UBER", "UNP", "LOW", "DE", "REGN", "VRTX", "COP",
  "PANW", "MCO", "FI", "LMT", "MS", "SCHW", "BA", "ADBE", "NKE", "ADP", "MMC", "SBUX",
  "KLAC", "SNPS", "CDNS", "CI", "C", "MDLZ", "T", "CVX", "BSX", "ZTS", "MDT", "BDX",
  "IDXX", "ODFL", "FAST", "POOL", "ROL", "TDG", "MEDP", "PAYC", "TYL", "CPRT", "VRSK"
];

const rankMap = {};
MARKET_CAP_RANKED_TICKERS.forEach((t, index) => {
  rankMap[t] = index + 1;
});

// Ophalen van alle SEC beschikbare aandelen (~10.000 tickers) met status in DB & screener cache
const getAllAvailableStocks = async (req, res) => {
  try {
    const companyMap = await getSecCompanyMap();
    await ensureScreenerTableExists();

    // 1. Tickers ophalen die al in de hoofd-database (Stocks) staan
    const dbStocksResult = await sql.query('SELECT DISTINCT ticker_symbol FROM Stocks');
    const dbTickersSet = new Set(dbStocksResult.recordset.map(r => (r.ticker_symbol || '').toUpperCase()));

    // 2. Tickers ophalen die al gescreend zijn in screener_results
    const screenedResult = await sql.query('SELECT ticker, status FROM screener_results');
    const screenedMap = new Map();
    screenedResult.recordset.forEach(r => {
      screenedMap.set((r.ticker || '').toUpperCase(), r.status);
    });

    const stockList = Object.keys(companyMap).map(ticker => {
      const cikInt = parseInt(companyMap[ticker].cik, 10) || 99999;
      const rank = rankMap[ticker] || (1000 + cikInt);
      const statusInCache = screenedMap.get(ticker);
      return {
        ticker,
        name: companyMap[ticker].title,
        inDatabase: dbTickersSet.has(ticker),
        isScreened: !!statusInCache,
        hasError: statusInCache === 'ERROR',
        rank
      };
    }).sort((a, b) => a.rank - b.rank);

    res.json({ total: stockList.length, stocks: stockList });
  } catch (error) {
    console.error("Fout bij ophalen alle beschikbare aandelen:", error);
    res.status(500).json({ message: "Serverfout bij ophalen aandelenlijst." });
  }
};

// Aandeel importeren in DB en toevoegen aan Watchlist / Ideale Portfolio
const importAndAddToWatchlist = async (req, res) => {
  const { ticker, target = 'watchlist', isin = null, name = null } = req.body; // target: 'watchlist', 'idealePortfolio', of 'both'

  if (!ticker) {
    return res.status(400).json({ message: "Ticker is verplicht." });
  }

  const tickerUpper = ticker.trim().toUpperCase();
  const isinVal = isin ? isin.trim().toUpperCase() : null;

  try {
    const { getCik, getFinancialData, processFinancialData, saveProcessedDataToDb } = require('./secImportController');
    const { performCalculations } = require('./calculationController');

    // 1. CIK ophalen
    const cik = await getCik(tickerUpper);
    if (!cik) {
      return res.status(404).json({ message: `Ticker ${tickerUpper} niet gevonden in SEC meesterlijst.` });
    }

    // 2. Controleren of aandeel al in Stocks tabel staat
    const reqDb = new sql.Request();
    let stockRes = await reqDb
      .input('ticker', sql.NVarChar, tickerUpper)
      .query('SELECT aandeel_id, name, inWatchlist, inIdealePortfolio FROM Stocks WHERE ticker_symbol = @ticker');

    let stockId = null;
    let stockName = name || tickerUpper;

    if (stockRes.recordset.length === 0) {
      // 3. SEC data ophalen & verwerken
      const rawFacts = await getFinancialData(cik);
      const companyMap = await getSecCompanyMap();
      if (!name) {
        stockName = companyMap[tickerUpper]?.title || tickerUpper;
      }

      const processedData = processFinancialData(rawFacts, tickerUpper);
      if (!processedData || processedData.length === 0) {
        return res.status(400).json({ message: `Geen bruikbare SEC data gevonden voor ${tickerUpper}.` });
      }

      // 4. Invoegen in Stocks tabel met ISIN & stock_exchange_id
      const insertReq = new sql.Request();
      const insertRes = await insertReq
        .input('ticker', sql.NVarChar, tickerUpper)
        .input('name', sql.NVarChar, stockName)
        .input('isin', sql.VarChar, isinVal)
        .input('inWatchlist', sql.Bit, target === 'watchlist' || target === 'both' ? 1 : 0)
        .input('inIdealePortfolio', sql.Bit, target === 'idealePortfolio' || target === 'both' ? 1 : 0)
        .query(`
          INSERT INTO Stocks (ticker_symbol, name, isin, inWatchlist, inIdealePortfolio, asset_type_id, stock_exchange_id)
          OUTPUT INSERTED.aandeel_id
          VALUES (@ticker, @name, @isin, @inWatchlist, @inIdealePortfolio, 1, 1)
        `);

      stockId = insertRes.recordset[0].aandeel_id;

      // 5. Invoegen fundamental_data via de veilige helper
      await saveProcessedDataToDb(stockId, processedData);

      // 6. Volledige 10-jaar kwartaalberekeningen uitvoeren & opslaan in stock_calculations
      await calculateAndSaveStockHistory(stockId, tickerUpper);

      // 7. 10 jaar dagkoersen ophalen voor backtest & grafieken
      await fetchAndStore10YearDailyPrices(stockId, tickerUpper);

    } else {
      stockId = stockRes.recordset[0].aandeel_id;
      stockName = stockRes.recordset[0].name || tickerUpper;

      // Update Watchlist / Ideale Portfolio vlaggen
      const updateReq = new sql.Request();
      const inWatchlistVal = target === 'watchlist' || target === 'both' ? 1 : stockRes.recordset[0].inWatchlist;
      const inIdealeVal = target === 'idealePortfolio' || target === 'both' ? 1 : stockRes.recordset[0].inIdealePortfolio;

      await updateReq
        .input('stockId', sql.Int, stockId)
        .input('inWatchlist', sql.Bit, inWatchlistVal)
        .input('inIdealePortfolio', sql.Bit, inIdealeVal)
        .query(`
          UPDATE Stocks 
          SET inWatchlist = @inWatchlist, inIdealePortfolio = @inIdealePortfolio
          WHERE aandeel_id = @stockId
        `);

      // Zorg dat ook bestaand aandeel de 10 jaar berekeningen en dagkoersen heeft
      await calculateAndSaveStockHistory(stockId, tickerUpper);
      await fetchAndStore10YearDailyPrices(stockId, tickerUpper);
    }

    // 8. screener_results bijwerken
    const screenerReq = new sql.Request();
    await screenerReq
      .input('ticker', sql.VarChar, tickerUpper)
      .query(`UPDATE screener_results SET in_database = 1 WHERE ticker = @ticker`);

    res.json({
      success: true,
      ticker: tickerUpper,
      stockId,
      name: stockName,
      target,
      message: `${tickerUpper} succesvol geïmporteerd (met 10j kwartaaldata & dagkoersen) & toegevoegd aan ${target === 'idealePortfolio' ? 'Ideale Portfolio' : 'Watchlist'}!`
    });
  } catch (error) {
    console.error(`Fout bij import & toevoegen aan watchlist voor ${tickerUpper}:`, error);
    res.status(500).json({ message: `Fout bij verwerken van ${tickerUpper}: ${error.message}` });
  }
};

// Ophalen van volledige historische kwartaalberekeningen voor een specifiek aandeel
const getTickerHistoricalCalculations = async (req, res) => {
  const { ticker } = req.params;
  if (!ticker) return res.status(400).json({ message: "Ticker is verplicht." });

  const tickerUpper = ticker.trim().toUpperCase();

  try {
    const companyMap = await getSecCompanyMap();
    let companyName = companyMap[tickerUpper]?.title || tickerUpper;
    let inDatabase = false;
    let stockId = null;

    // 1. Controleren of aandeel in DB staat met fundamental_data
    const reqDb = new sql.Request();
    const stockRes = await reqDb
      .input('ticker', sql.NVarChar, tickerUpper)
      .query(`
        SELECT s.aandeel_id, s.name, COUNT(fd.id) as fundamentalCount
        FROM Stocks s
        LEFT JOIN fundamental_data fd ON s.aandeel_id = fd.stock_id
        WHERE s.ticker_symbol = @ticker
        GROUP BY s.aandeel_id, s.name
      `);

    let quarterlyData = [];

    if (stockRes.recordset.length > 0 && stockRes.recordset[0].fundamentalCount > 0) {
      inDatabase = true;
      stockId = stockRes.recordset[0].aandeel_id;
      companyName = stockRes.recordset[0].name || companyName;

      // Haal alle fundamental data uit DB
      const fdRes = await new sql.Request()
        .input('stockId', sql.Int, stockId)
        .query(`
          SELECT period_end_date, data_type, value, fp_id
          FROM fundamental_data
          WHERE stock_id = @stockId
          ORDER BY period_end_date ASC
        `);

      const pivoted = {};
      fdRes.recordset.forEach(record => {
        const dateStr = record.period_end_date instanceof Date ? record.period_end_date.toISOString().split('T')[0] : record.period_end_date;
        if (!pivoted[dateStr]) pivoted[dateStr] = { period_end_date: dateStr, fp_id: record.fp_id };
        const keyMap = {
          'LiabilitiesCurrent': 'LiabilitiesCurrent',
          'Liabilities': 'Liabilities',
          'StockholdersEquity': 'StockholdersEquity',
          'NetIncomeLoss': 'NetIncomeLoss',
          'NetCashProvidedByUsedInOperatingActivities': 'NetCashProvidedByUsedInOperatingActivities',
          'PurchasesOfPropertyAndEquipment': 'PurchasesOfPropertyAndEquipment',
          'WeightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageNumberOfDilutedSharesOutstanding'
        };
        pivoted[dateStr][keyMap[record.data_type] || record.data_type] = parseFloat(record.value);
      });

      quarterlyData = Object.values(pivoted);
    } else {
      // 2. Ophalen direct via SEC
      const cik = companyMap[tickerUpper]?.cik || await getCik(tickerUpper);
      if (!cik) {
        return res.status(404).json({ message: `Ticker ${tickerUpper} niet gevonden bij SEC.` });
      }

      const rawFacts = await getFinancialData(cik);
      if (!rawFacts) {
        return res.status(404).json({ message: `Geen SEC data beschikbaar voor ${tickerUpper}.` });
      }

      const processedData = processFinancialData(rawFacts, tickerUpper, () => {});
      const pivoted = {};
      processedData.forEach(item => {
        const d = item.period_end_date;
        if (!pivoted[d]) pivoted[d] = { period_end_date: d, fp: item.fp };
        pivoted[d][item.metric] = parseFloat(item.value);
      });
      quarterlyData = Object.values(pivoted);
    }

    quarterlyData = processQuarterlyTimeSeries(quarterlyData);

    if (quarterlyData.length === 0) {
      return res.status(404).json({ message: `Onvoldoende data om historie te berekenen voor ${tickerUpper}.` });
    }

    // Bereken voor elk kwartaal de volledige set aan metrieken en score
    const history = [];
    for (let i = 0; i < quarterlyData.length; i++) {
      const qResult = calculateQuarterMetrics(quarterlyData, i);
      if (qResult) {
        history.push(qResult);
      }
    }

    // Als aandeel in DB staat, synchroniseer direct naar stock_calculations
    if (inDatabase && stockId) {
      saveHistoricalCalculationsToDb(stockId, history).catch(() => {});
    }

    res.json({
      ticker: tickerUpper,
      name: companyName,
      inDatabase,
      stockId,
      totalQuarters: history.length,
      history: history.sort((a, b) => new Date(b.period_end_date) - new Date(a.period_end_date)) // Nieuwste eerst
    });

  } catch (error) {
    console.error(`Fout bij ophalen geschiedenis voor ${tickerUpper}:`, error);
    res.status(500).json({ message: `Fout bij berekenen historie: ${error.message}` });
  }
};

// Batch herberekening van alle historische kwartalen voor alle aandelen in database
const recalculateAllDbHistory = async (req, res) => {
  try {
    const stocksRes = await sql.query(`
      SELECT DISTINCT s.aandeel_id, s.ticker_symbol, s.name
      FROM Stocks s
      INNER JOIN fundamental_data fd ON s.aandeel_id = fd.stock_id
    `);

    const stocks = stocksRes.recordset;
    if (stocks.length === 0) {
      return res.json({ success: true, count: 0, message: "Geen aandelen met financiële data gevonden." });
    }

    let totalQuartersCalculated = 0;
    const processedStocks = [];

    for (const stock of stocks) {
      try {
        const fdRes = await new sql.Request()
          .input('stockId', sql.Int, stock.aandeel_id)
          .query(`
            SELECT period_end_date, data_type, value, fp_id
            FROM fundamental_data
            WHERE stock_id = @stockId
            ORDER BY period_end_date ASC
          `);

        const pivoted = {};
        fdRes.recordset.forEach(record => {
          const dateStr = record.period_end_date instanceof Date ? record.period_end_date.toISOString().split('T')[0] : record.period_end_date;
          if (!pivoted[dateStr]) pivoted[dateStr] = { period_end_date: dateStr, fp_id: record.fp_id };
          const keyMap = {
            'LiabilitiesCurrent': 'LiabilitiesCurrent',
            'Liabilities': 'Liabilities',
            'StockholdersEquity': 'StockholdersEquity',
            'NetIncomeLoss': 'NetIncomeLoss',
            'NetCashProvidedByUsedInOperatingActivities': 'NetCashProvidedByUsedInOperatingActivities',
            'PurchasesOfPropertyAndEquipment': 'PurchasesOfPropertyAndEquipment',
            'WeightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageNumberOfDilutedSharesOutstanding'
          };
          pivoted[dateStr][keyMap[record.data_type] || record.data_type] = parseFloat(record.value);
        });

        let quarterlyData = Object.values(pivoted);
        quarterlyData = processQuarterlyTimeSeries(quarterlyData);

        const history = [];
        for (let i = 0; i < quarterlyData.length; i++) {
          const qResult = calculateQuarterMetrics(quarterlyData, i);
          if (qResult) history.push(qResult);
        }

        if (history.length > 0) {
          await saveHistoricalCalculationsToDb(stock.aandeel_id, history);
          totalQuartersCalculated += history.length;

          // Sla laatste stand ook op in screener_results
          const latest = history[history.length - 1];
          await saveScreenerResultToDb({
            ticker: stock.ticker_symbol,
            name: stock.name,
            score: latest.score,
            status: latest.status,
            inDatabase: true,
            criteria: latest.criteria,
            metrics: latest.metrics
          });

          processedStocks.push({
            ticker: stock.ticker_symbol,
            name: stock.name,
            quartersCount: history.length,
            latestScore: latest.score,
            latestWaardeVerdeling: latest.metrics.waarde_verdeling
          });
        }
      } catch (stockErr) {
        console.error(`Fout bij historische herberekening van ${stock.ticker_symbol}:`, stockErr.message);
      }
    }

    res.json({
      success: true,
      totalStocks: processedStocks.length,
      totalQuartersCalculated,
      stocks: processedStocks,
      message: `Volledige geschiedenis (${totalQuartersCalculated} kwartalen) succesvol berekend voor ${processedStocks.length} aandelen!`
    });

  } catch (error) {
    console.error("Fout bij batch herberekenen van geschiedenis:", error);
    res.status(500).json({ message: `Serverfout: ${error.message}` });
  }
};

// Bulk import van alle gevonden Score 5/5 aandelen naar database inclusief 10j kwartalen & 10j dagkoersen
const importAllScore5Stocks = async (req, res) => {
  const { tickers } = req.body || {}; // optioneel array van tickers

  try {
    const { getCik, getFinancialData, processFinancialData, saveProcessedDataToDb } = require('./secImportController');
    const { performCalculations } = require('./calculationController');
    const companyMap = await getSecCompanyMap();

    let targetTickers = [];
    if (Array.isArray(tickers) && tickers.length > 0) {
      targetTickers = tickers.map(t => t.trim().toUpperCase());
    } else {
      await ensureScreenerTableExists();
      const qRes = await sql.query(`SELECT ticker, name FROM screener_results WHERE score = 5 AND (in_database = 0 OR in_database IS NULL)`);
      targetTickers = qRes.recordset.map(r => r.ticker);
    }

    if (targetTickers.length === 0) {
      return res.json({
        success: true,
        count: 0,
        message: 'Er zijn momenteel geen nieuwe Score 5/5 aandelen die nog geïmporteerd moeten worden.'
      });
    }

    const imported = [];
    const failed = [];

    for (const tickerUpper of targetTickers) {
      try {
        const cik = await getCik(tickerUpper);
        if (!cik) {
          failed.push({ ticker: tickerUpper, reason: 'CIK niet gevonden in SEC' });
          continue;
        }

        // Check of aandeel al in Stocks staat
        const checkReq = new sql.Request();
        const stockRes = await checkReq
          .input('ticker', sql.NVarChar, tickerUpper)
          .query('SELECT aandeel_id, name FROM Stocks WHERE ticker_symbol = @ticker');

        let stockId = null;
        let stockName = companyMap[tickerUpper]?.title || tickerUpper;

        if (stockRes.recordset.length === 0) {
          const rawFacts = await getFinancialData(cik);
          const processedData = processFinancialData(rawFacts, tickerUpper);
          if (!processedData || processedData.length === 0) {
            failed.push({ ticker: tickerUpper, reason: 'Geen bruikbare SEC data' });
            continue;
          }

          const insertReq = new sql.Request();
          const insertRes = await insertReq
            .input('ticker', sql.NVarChar, tickerUpper)
            .input('name', sql.NVarChar, stockName)
            .input('isin', sql.VarChar, null)
            .input('inWatchlist', sql.Bit, 1)
            .input('inIdealePortfolio', sql.Bit, 0)
            .query(`
              INSERT INTO Stocks (ticker_symbol, name, isin, inWatchlist, inIdealePortfolio, asset_type_id, stock_exchange_id)
              OUTPUT INSERTED.aandeel_id
              VALUES (@ticker, @name, @isin, @inWatchlist, @inIdealePortfolio, 1, 1)
            `);
          stockId = insertRes.recordset[0].aandeel_id;
          await saveProcessedDataToDb(stockId, processedData);
        } else {
          stockId = stockRes.recordset[0].aandeel_id;
          stockName = stockRes.recordset[0].name || tickerUpper;
        }

        // 10 jaar kwartaalberekeningen & dagkoersen synchroniseren
        await calculateAndSaveStockHistory(stockId, tickerUpper);
        await fetchAndStore10YearDailyPrices(stockId, tickerUpper);

        // Update screener_results
        const scrReq = new sql.Request();
        await scrReq
          .input('ticker', sql.VarChar, tickerUpper)
          .query('UPDATE screener_results SET in_database = 1 WHERE ticker = @ticker');

        imported.push({ ticker: tickerUpper, name: stockName, stockId });
      } catch (tErr) {
        console.error(`Fout bij importeren van 5/5 aandeel ${tickerUpper}:`, tErr.message);
        failed.push({ ticker: tickerUpper, reason: tErr.message });
      }
    }

    res.json({
      success: true,
      count: imported.length,
      imported,
      failed,
      message: `${imported.length} van de ${targetTickers.length} Score 5/5 aandelen succesvol geïmporteerd (inclusief 10j kwartaalberekeningen & 10j dagkoersen)!`
    });
  } catch (error) {
    console.error('Fout in importAllScore5Stocks:', error);
    res.status(500).json({ message: `Serverfout bij bulk import: ${error.message}` });
  }
};

module.exports = {
  fastScreenTickers,
  getPresetTickers,
  getAllAvailableStocks,
  getCachedScreenerResults,
  importAndAddToWatchlist,
  importAllScore5Stocks,
  calculateAndSaveStockHistory,
  getTickerHistoricalCalculations,
  recalculateAllDbHistory
};

