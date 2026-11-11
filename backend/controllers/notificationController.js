const axios = require('axios');
const { sql, config } = require('../config/database');

const HEADERS = { 'User-Agent': "PortfolioVR arne.van.riel@hotmail.be" };

const { getCik, getFinancialData, processFinancialData, saveProcessedDataToDb } = require('./secImportController');
const { calculateAndSaveStockHistory } = require('./screenerController');
const { clearAdvisorCache, calculateStrategyAdvisorInternal, calculateEtfStrategyInternal } = require('./portfolioController');

// Map om bij te houden wanneer elk aandeel voor het laatst bij SEC is gecheckt (ticker -> timestamp)
const lastCheckedTimeByStock = new Map();
let isCheckRunning = false;

// Bepaal of er een concrete actie vereist is naar aanleiding van nieuwe kwartaalcijfers
const determineStockQuarterAction = async (pool, stockId, ticker, quarterLabel, fy, reportDate) => {
    try {
        // 1. Controleer of de gebruiker aandelen bezit van dit fonds
        const txRes = await pool.request()
            .input('stock_id', sql.Int, stockId)
            .query(`
                SELECT ISNULL(SUM(CASE WHEN transaction_type = 'BUY' THEN quantity WHEN transaction_type = 'SELL' THEN -quantity ELSE 0 END), 0) AS shares_owned
                FROM PF_transactions
                WHERE aandeel_id = @stock_id
            `);
        const sharesOwned = parseFloat(txRes.recordset[0]?.shares_owned || 0);
        const isOwned = sharesOwned > 0.0001;

        // 2. Haal de 2 meest recente kwartaalberekeningen op
        const calcRes = await pool.request()
            .input('stock_id', sql.Int, stockId)
            .query(`
                SELECT TOP 2 period_end_date, selectiecriteria, waarde_verdeling
                FROM stock_calculations
                WHERE stock_id = @stock_id
                ORDER BY period_end_date DESC
            `);
        const rows = calcRes.recordset;
        const curCalc = rows[0] || null;
        const prevCalc = rows[1] || null;

        const curScore = curCalc?.selectiecriteria ?? null;
        const curWv = curCalc?.waarde_verdeling !== null && curCalc?.waarde_verdeling !== undefined ? parseFloat(curCalc.waarde_verdeling) : null;
        const prevWv = prevCalc?.waarde_verdeling !== null && prevCalc?.waarde_verdeling !== undefined ? parseFloat(prevCalc.waarde_verdeling) : null;

        const dateSuffix = reportDate ? `, eindigend op ${reportDate}` : '';

        if (isOwned) {
            // Aandeel in portefeuille: check score < 5 of daling waardeverdeling
            if (curScore !== null && curScore < 5) {
                const actionShares = Math.round(sharesOwned * 100) / 100;
                return {
                    action_required: true,
                    action_type: 'MANDATORY_SELL_SCORE',
                    action_shares: actionShares,
                    action_pct: 100,
                    action_title: '🔴 Volledige Verkoop Vereist (Score < 5)',
                    message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n⚡ ACTIE VEREIST: Verkoop 100% (${actionShares} stuks)\nReden: Kwaliteit gedaald naar score ${curScore}/5 (voldoet niet meer aan Super-Kwaliteit criteria).`
                };
            }

            if (prevWv !== null && curWv !== null && curWv < prevWv && prevWv > 0) {
                const absDiff = curWv - prevWv; // bv. -0.02 of -0.15
                const dropPct = ((prevWv - curWv) / prevWv) * 100;
                const roundedDropPct = Math.round(dropPct * 10) / 10;
                const rawShares = Math.round((sharesOwned * (dropPct / 100)) * 100) / 100;

                // Haal huidige koers en wisselkoers op om EUR verkoopbedrag te bepalen
                let priceInEur = 0;
                try {
                    const priceRes = await pool.request()
                        .input('stock_id', sql.Int, stockId)
                        .query(`
                            SELECT TOP 1 closing_price 
                            FROM DailyClosingPrices 
                            WHERE aandeel_id = @stock_id 
                            ORDER BY date DESC
                        `);
                    const rawPrice = parseFloat(priceRes.recordset[0]?.closing_price || 0);

                    const isEurStock = (ticker && (ticker.endsWith('.DE') || ticker.endsWith('.AS') || ticker.endsWith('.BR')));
                    if (isEurStock) {
                        priceInEur = rawPrice;
                    } else {
                        const fxRes = await pool.request().query(`
                            SELECT TOP 1 rate 
                            FROM DailyExchangeRates 
                            WHERE currency_pair = 'EURUSD' 
                            ORDER BY date DESC
                        `);
                        const fxRate = parseFloat(fxRes.recordset[0]?.rate || 1.08);
                        priceInEur = fxRate > 0 ? (rawPrice / fxRate) : rawPrice;
                    }
                } catch (e) {
                    console.warn(`[Auto-SEC] Kon koers/FX niet bepalen voor ${ticker}:`, e.message);
                }

                const rawSellAmountEur = rawShares * priceInEur;

                // STRATEGIE REGEL VOOR DEELVERKOPEN:
                // 1. < €50: NIET VERKOPEN (onevenredige transactiekosten)
                // 2. €50 - €100: Afronden naar €100
                // 3. >= €100: Normaal voorgesteld bedrag
                if (rawSellAmountEur < 50) {
                    return {
                        action_required: false,
                        action_type: 'PARTIAL_SELL_TOO_SMALL',
                        action_shares: 0,
                        action_pct: 0,
                        action_title: '🟡 Deelverkoop Te Klein (< €50: Niet Verkopen)',
                        message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n🟡 GEEN VERKOOP VEREIST: Waardeverdeling licht gedaald van ${prevWv.toFixed(2)}% naar ${curWv.toFixed(2)}% (${absDiff.toFixed(2)}% verschil, -${roundedDropPct}%).\nHet berekende verkoopbedrag is slechts € ${rawSellAmountEur.toFixed(2)} (< minimum drempel van € 50).\nNiet verkopen wegens onevenredige transactiekosten. Score: ${curScore}/5. Positie behouden.`
                    };
                } else if (rawSellAmountEur >= 50 && rawSellAmountEur < 100) {
                    const effectiveAmountEur = 100;
                    const effectiveShares = Math.min(sharesOwned, Math.round((effectiveAmountEur / (priceInEur || 1)) * 100) / 100);
                    const effectivePct = Math.round((effectiveShares / sharesOwned) * 1000) / 10;
                    return {
                        action_required: true,
                        action_type: 'MANDATORY_PARTIAL_SELL_WV',
                        action_shares: effectiveShares,
                        action_pct: effectivePct,
                        action_title: '🔴 Deelverkoop Vereist (Afgerond naar €100)',
                        message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n⚡ ACTIE VEREIST: Verkoop ${effectiveShares} stuks (€ 100,00)\nReden: Waardeverdeling gedaald van ${prevWv.toFixed(2)}% naar ${curWv.toFixed(2)}% (${absDiff.toFixed(2)}% verschil, -${roundedDropPct}%). Oorspronkelijk voorstel was € ${rawSellAmountEur.toFixed(2)}, afgerond naar minimum effectieve ordergrootte van € 100. Score ${curScore}/5.`
                    };
                } else {
                    // >= €100
                    return {
                        action_required: true,
                        action_type: 'MANDATORY_PARTIAL_SELL_WV',
                        action_shares: rawShares,
                        action_pct: roundedDropPct,
                        action_title: `🔴 Deelverkoop Vereist (-${roundedDropPct}%)`,
                        message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n⚡ ACTIE VEREIST: Verkoop ${rawShares} stuks (-${roundedDropPct}% = € ${rawSellAmountEur.toFixed(2)})\nReden: Waardeverdeling gedaald van ${prevWv.toFixed(2)}% naar ${curWv.toFixed(2)}% (${absDiff.toFixed(2)}% verschil, -${roundedDropPct}%). Score ${curScore}/5.`
                    };
                }
            }

            // 3. Waardeverdeling is stabiel gebleven of gestegen (curWv >= prevWv)
            const isRose = (prevWv !== null && curWv !== null && curWv > prevWv);
            const isSame = (prevWv !== null && curWv !== null && curWv === prevWv);
            let wvExplanation = '';
            if (isRose) {
                const gain = curWv - prevWv;
                const gainPct = prevWv > 0 ? ((gain / prevWv) * 100) : 0;
                wvExplanation = `Waardeverdeling gestegen van ${prevWv.toFixed(2)}% naar ${curWv.toFixed(2)}% (+${gain.toFixed(2)}% verschil, +${gainPct.toFixed(1)}%).`;
            } else if (isSame) {
                wvExplanation = `Waardeverdeling stabiel gebleven op ${curWv.toFixed(2)}% (0.00% verandering).`;
            } else {
                wvExplanation = `Waardeverdeling: ${curWv !== null ? curWv.toFixed(2) + '%' : '-'}.`;
            }

            return {
                action_required: false,
                action_type: 'HOLD',
                action_shares: 0,
                action_pct: 0,
                action_title: '✅ Positie Behouden',
                message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n✅ Positie Behouden: Score ${curScore}/5. ${wvExplanation} Geen verkoopactie nodig.`
            };
        } else {
            // Watchlist / universum aandeel (niet in portefeuille)
            let changeText = '';
            if (prevWv !== null && curWv !== null) {
                const diff = curWv - prevWv;
                const relPct = prevWv > 0 ? ((diff / prevWv) * 100) : 0;
                changeText = `(vorige: ${prevWv.toFixed(2)}%, verschil: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}% of ${relPct >= 0 ? '+' : ''}${relPct.toFixed(1)}%)`;
            }
            return {
                action_required: false,
                action_type: 'WATCHLIST',
                action_shares: 0,
                action_pct: 0,
                action_title: '👁️ Watchlist',
                message: `Nieuwe cijfers (${quarterLabel} ${fy}${dateSuffix}) berekend voor ${ticker}.\n\n👁️ Watchlist: Score ${curScore ?? '-'}/5, Waardeverdeling ${curWv ? curWv.toFixed(2) + '%' : '-'} ${changeText}. Geen positie in portefeuille.`
            };
        }
    } catch (err) {
        console.error(`Fout in determineStockQuarterAction voor ${ticker}:`, err.message);
        return {
            action_required: false,
            action_type: 'NONE',
            action_shares: 0,
            action_pct: 0,
            action_title: 'Nieuwe Kwartaalcijfers',
            message: `Nieuwe cijfers (${quarterLabel} ${fy}) geïmporteerd & berekend voor ${ticker}!`
        };
    }
};

// Automatische controle & import van nieuwe SEC kwartaalcijfers (10-Q / 10-K)
const checkNewSecQuarters = async ({ force = false } = {}) => {
    if (isCheckRunning) {
        console.log('[Auto-SEC] SEC controle is reeds actief op de achtergrond. Tweede aanroep overgeslagen.');
        return { running: true };
    }
    isCheckRunning = true;
    console.log(`[Auto-SEC] Starten met ${force ? 'geforceerde' : 'automatische'} controle op nieuwe SEC kwartaalcijfers...`);

    const updatedStocks = [];
    try {
        const pool = await sql.connect(config);

        // 1. Haal alle relevante aandelen op (Watchlist, Ideale Portfolio, Huidige Portefeuille)
        // Sluit ETF's en Europese beurzen (.AS, .DE) uit
        const stocksResult = await pool.request().query(`
            SELECT DISTINCT s.aandeel_id, s.ticker_symbol, s.name 
            FROM Stocks s 
            WHERE (s.inWatchlist = 1 OR s.inIdealePortfolio = 1 OR s.aandeel_id IN (
                SELECT DISTINCT aandeel_id FROM PF_transactions
            ))
            AND (s.asset_type_id = 1 OR s.asset_type_id IS NULL)
            AND s.ticker_symbol NOT LIKE '%.AS'
            AND s.ticker_symbol NOT LIKE '%.DE'
            ORDER BY s.ticker_symbol ASC
        `);
        const stocks = stocksResult.recordset;

        const now = Date.now();
        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

        for (const stock of stocks) {
            const { aandeel_id, ticker_symbol } = stock;

            // Debounce: als aandeel in de afgelopen 4 uur al is gecheckt en niet geforceerd, sla over
            if (!force && lastCheckedTimeByStock.has(ticker_symbol)) {
                const lastTime = lastCheckedTimeByStock.get(ticker_symbol);
                if (now - lastTime < FOUR_HOURS_MS) {
                    continue;
                }
            }

            // 2. Haal de laatste period_end_date op uit fundamental_data
            const latestDataQuery = await pool.request()
                .input('stock_id', sql.Int, aandeel_id)
                .query(`
                    SELECT MAX(period_end_date) as max_pe, MAX(report_date) as max_rd 
                    FROM fundamental_data 
                    WHERE stock_id = @stock_id
                `);

            const maxPe = latestDataQuery.recordset[0]?.max_pe;
            const lastPeriodEndDateStr = maxPe ? (maxPe instanceof Date ? maxPe.toISOString().split('T')[0] : String(maxPe).split('T')[0]) : null;

            const CIK = await getCik(ticker_symbol);
            if (!CIK) continue;

            lastCheckedTimeByStock.set(ticker_symbol, now);

            // Rate limit bescherming voor SEC API (max 10 calls/sec)
            await new Promise(r => setTimeout(r, 120));

            let secResponse;
            try {
                secResponse = await axios.get(`https://data.sec.gov/submissions/CIK${CIK}.json`, {
                    headers: HEADERS,
                    timeout: 8000
                });
            } catch (netErr) {
                console.warn(`[Auto-SEC] Kon submissions niet ophalen voor ${ticker_symbol}: ${netErr.message}`);
                continue;
            }

            const filings = secResponse.data?.filings?.recent;
            if (!filings || !filings.form) continue;

            for (let i = 0; i < filings.form.length; i++) {
                const form = filings.form[i];
                if (form === '10-Q' || form === '10-K') {
                    const reportDate = filings.reportDate[i]; // Periode einddatum (bv. 2026-09-30)
                    const filingDate = filings.filingDate[i]; // Datum van indiening (bv. 2026-10-22)

                    // Check of deze filing nieuwer is dan onze database
                    if (!lastPeriodEndDateStr || reportDate > lastPeriodEndDateStr) {
                        const reportDateObj = new Date(reportDate);
                        const fy = reportDateObj.getFullYear();
                        const month = reportDateObj.getMonth() + 1;

                        let quarterLabel = 'FY';
                        if (form === '10-Q') {
                            if (month >= 2 && month <= 4) quarterLabel = 'Q1';
                            else if (month >= 5 && month <= 7) quarterLabel = 'Q2';
                            else if (month >= 8 && month <= 10) quarterLabel = 'Q3';
                            else quarterLabel = 'Q4';
                        }

                        console.log(`[Auto-SEC] 🚀 Nieuwe ${form} filing gedetecteerd voor ${ticker_symbol} (${quarterLabel} ${fy}, eindigend op ${reportDate}, ingediend op ${filingDate})!`);

                        try {
                            // 1. Download financiële facts van SEC
                            const financialData = await getFinancialData(CIK);

                            // 2. Verwerk financiële data
                            const allProcessed = processFinancialData(financialData, ticker_symbol);

                            // 3. Filter voor deze nieuwe periode
                            const newQuarterData = allProcessed.filter(d => d.period_end_date && d.period_end_date.startsWith(reportDate));

                            if (newQuarterData.length > 0) {
                                // Sla exacte filingDate als report_date op!
                                newQuarterData.forEach(d => { d.report_date = filingDate; });

                                // 4. Sla op in fundamental_data
                                await saveProcessedDataToDb(aandeel_id, newQuarterData);

                                // 5. Volledige 10-jaar kwartaalberekeningen & Waardeverdeling synchroniseren in stock_calculations
                                await calculateAndSaveStockHistory(aandeel_id, ticker_symbol);

                                console.log(`[Auto-SEC] ✅ ${newQuarterData.length} datapunten opgeslagen & berekend voor ${ticker_symbol} (${quarterLabel} ${fy})!`);

                                // 6. Notificatie toevoegen met concrete actieberekening (verkoop / behouden / watchlist)
                                const actionInfo = await determineStockQuarterAction(pool, aandeel_id, ticker_symbol, quarterLabel, fy, reportDate);

                                await pool.request()
                                    .input('stock_id', sql.Int, aandeel_id)
                                    .input('ticker', sql.NVarChar, ticker_symbol)
                                    .input('message', sql.NVarChar, actionInfo.message)
                                    .input('new_quarter', sql.NVarChar, form)
                                    .input('new_year', sql.Int, fy)
                                    .input('action_required', sql.Bit, actionInfo.action_required ? 1 : 0)
                                    .input('action_type', sql.NVarChar, actionInfo.action_type)
                                    .input('action_shares', sql.Float, actionInfo.action_shares)
                                    .input('action_pct', sql.Float, actionInfo.action_pct)
                                    .input('action_title', sql.NVarChar, actionInfo.action_title)
                                    .query(`
                                        INSERT INTO PF_Notifications 
                                        (stock_id, ticker, message, is_read, new_quarter, new_year, action_required, action_type, action_shares, action_pct, action_title)
                                        VALUES 
                                        (@stock_id, @ticker, @message, 0, @new_quarter, @new_year, @action_required, @action_type, @action_shares, @action_pct, @action_title)
                                    `);

                                updatedStocks.push({ ticker: ticker_symbol, form, quarterLabel, fy, reportDate, filingDate, actionInfo });
                            }
                        } catch (importErr) {
                            console.error(`[Auto-SEC] Fout bij importeren van facts voor ${ticker_symbol}:`, importErr.message);
                        }

                        break; // Enkel de meest recente filing verwerken
                    }
                }
            }
        }

        if (updatedStocks.length > 0) {
            clearAdvisorCache();
            console.log(`[Auto-SEC] 🎉 Automatische SEC check voltooid: ${updatedStocks.length} aandeel/aandelen succesvol bijgewerkt! Strategy Advisor cache geleegd.`);
        } else {
            console.log('[Auto-SEC] Automatische SEC check voltooid: Alle aandelen zijn up-to-date.');
        }

        return { success: true, updatedStocks };

    } catch (error) {
        console.error('[Auto-SEC] Fout bij automatische SEC synchronisatie:', error.message);
        return { success: false, error: error.message };
    } finally {
        isCheckRunning = false;
    }
};

// Synchroniseer actieve koopkansen (zowel losse kwaliteitsaandelen als ETF DCA) naar PF_Notifications
// Zorgt voor 100% consistentie met de Tijdlijn & Strategie tabbladen:
// - Losse aandelen: Uitsluitend als er echt gekocht moet worden (Score 5/5, koers <= 1.05x intrinsiek, WV niet gedaald, streefdoel NIET bereikt, actie stuks > 0).
// - ETF DCA: Uitsluitend als er een valide MACD signaal is met opgebouwde pot en aankoop nog niet is uitgevoerd.
let isStrategySyncRunning = false;
let lastStrategySyncTime = 0;
const STRATEGY_SYNC_COOLDOWN_MS = 15 * 60 * 1000; // 15 minuten

const syncActiveStrategyAlerts = async (pool, userId = 1, { force = false } = {}) => {
    if (isStrategySyncRunning) return;
    if (!force && (Date.now() - lastStrategySyncTime < STRATEGY_SYNC_COOLDOWN_MS)) return;
    isStrategySyncRunning = true;
    try {
        lastStrategySyncTime = Date.now();
        // 1. LOSSE AANDELEN KOOPKANSEN
        // Haal de berekende tijdlijn op van de Strategy Advisor (bevat reeds alle streefdoelen, score 5/5, onderwaardering, stabiele WV, etc.)
        let stockTimeline = [];
        try {
            const stocksAdvisor = await calculateStrategyAdvisorInternal(userId, { forceRefresh: false });
            stockTimeline = stocksAdvisor?.timeline || [];
        } catch (e) {
            console.warn('[NotificationSync] Kon Strategy Advisor data niet ophalen:', e.message);
        }

        // Filter uitsluitend op échte valide openstaande koopacties conform de wens van de gebruiker:
        // - status === 'OPEN_OPPORTUNITY'
        // - !isCautionStock
        // - !isTargetReached
        // - shares > 0
        const activeStockBuys = stockTimeline.filter(item =>
            item.status === 'OPEN_OPPORTUNITY' &&
            !item.isCautionStock &&
            !item.isTargetReached &&
            (Number(item.shares) > 0 || Number(item.actionShares) > 0)
        );

        // Verwijder eventuele oude koopnotificaties voor aandelen die momenteel NIET meer in activeStockBuys staan (zoals INTU en UNH)
        const activeStockTickers = activeStockBuys.map(b => b.ticker);
        if (activeStockTickers.length > 0) {
            const tickerListStr = activeStockTickers.map(t => "'" + t + "'").join(',');
            await pool.request().query(
                "DELETE FROM PF_Notifications WHERE action_type IN ('BUY_OPPORTUNITY', 'BUY_OPPORTUNITY_TARGET_REACHED') AND ticker NOT IN (" + tickerListStr + ")"
            );
        } else {
            await pool.request().query(
                "DELETE FROM PF_Notifications WHERE action_type IN ('BUY_OPPORTUNITY', 'BUY_OPPORTUNITY_TARGET_REACHED')"
            );
        }

        // Voeg de valide koopacties toe indien nog niet aanwezig
        for (const buy of activeStockBuys) {
            const notifExists = await pool.request()
                .input('stock_id', sql.Int, buy.stockId)
                .input('alert_pattern', sql.NVarChar, '%' + buy.date + '%')
                .query('SELECT id FROM PF_Notifications WHERE stock_id = @stock_id AND action_type = \'BUY_OPPORTUNITY\' AND message LIKE @alert_pattern');

            if (notifExists.recordset.length === 0) {
                const totalValEur = buy.totalAmount || (buy.shares * buy.signalPrice);
                const message = 'MACD Koopsignaal gedetecteerd voor ' + buy.ticker + ' (signaal van ' + buy.date + ').\n\n⚡ ACTIE VEREIST: Koop ' + buy.shares + ' stuks (à ca. € ' + buy.signalPrice.toFixed(2) + ' = € ' + totalValEur.toFixed(2) + ').\nScore: 5/5 Super-Kwaliteit, conform allocatiemodel en binnen streefdoel.';

                await pool.request()
                    .input('stock_id', sql.Int, buy.stockId)
                    .input('ticker', sql.NVarChar, buy.ticker)
                    .input('message', sql.NVarChar, message)
                    .input('action_required', sql.Bit, 1)
                    .input('action_type', sql.NVarChar, 'BUY_OPPORTUNITY')
                    .input('action_shares', sql.Float, buy.shares)
                    .input('action_pct', sql.Float, 0)
                    .input('action_title', sql.NVarChar, '🟢 Koopkans (5/5 Kwaliteit)')
                    .query('INSERT INTO PF_Notifications (stock_id, ticker, message, is_read, action_required, action_type, action_shares, action_pct, action_title, created_at) VALUES (@stock_id, @ticker, @message, 0, @action_required, @action_type, @action_shares, @action_pct, @action_title, GETDATE())');
                console.log('[NotificationSync] Nieuwe losse aandeel koopnotificatie aangemaakt voor ' + buy.ticker);
            }
        }

        // 2. ETF DCA KOOPKANSEN
        let etfTimeline = [];
        try {
            const etfAdvisor = await calculateEtfStrategyInternal(userId, { forceRefresh: false });
            etfTimeline = etfAdvisor?.timeline || [];
        } catch (e) {
            console.warn('[NotificationSync] Kon ETF Strategie data niet ophalen:', e.message);
        }

        const activeEtfBuys = etfTimeline.filter(item =>
            item.status === 'OPEN_OPPORTUNITY' &&
            (Number(item.shares) >= 1 || Number(item.actionShares) >= 1)
        );

        const activeEtfTickers = activeEtfBuys.map(b => b.ticker);
        if (activeEtfTickers.length > 0) {
            const etfListStr = activeEtfTickers.map(t => "'" + t + "'").join(',');
            await pool.request().query(
                "DELETE FROM PF_Notifications WHERE action_type = 'ETF_BUY_OPPORTUNITY' AND ticker NOT IN (" + etfListStr + ")"
            );
        } else {
            await pool.request().query(
                "DELETE FROM PF_Notifications WHERE action_type = 'ETF_BUY_OPPORTUNITY'"
            );
        }

        for (const etfBuy of activeEtfBuys) {
            const notifExists = await pool.request()
                .input('stock_id', sql.Int, etfBuy.stockId)
                .input('date_pattern', sql.NVarChar, '%' + etfBuy.date + '%')
                .query('SELECT id FROM PF_Notifications WHERE stock_id = @stock_id AND action_type = \'ETF_BUY_OPPORTUNITY\' AND message LIKE @date_pattern');

            if (notifExists.recordset.length === 0) {
                const totalInvest = etfBuy.totalAmount || (etfBuy.shares * etfBuy.signalPrice);
                const message = 'MACD Koopsignaal gedetecteerd voor ' + etfBuy.ticker + ' (' + etfBuy.name + ') op ' + etfBuy.date + '.\n\n⚡ ACTIE VEREIST: Koop ' + etfBuy.shares + ' stuks (à ca. € ' + etfBuy.signalPrice.toFixed(2) + ' = € ' + totalInvest.toFixed(2) + ').\nConform Arne 100% Buy & Hold DCA ETF strategie.';

                await pool.request()
                    .input('stock_id', sql.Int, etfBuy.stockId)
                    .input('ticker', sql.NVarChar, etfBuy.ticker)
                    .input('message', sql.NVarChar, message)
                    .input('action_required', sql.Bit, 1)
                    .input('action_type', sql.NVarChar, 'ETF_BUY_OPPORTUNITY')
                    .input('action_shares', sql.Float, etfBuy.shares)
                    .input('action_pct', sql.Float, 0)
                    .input('action_title', sql.NVarChar, '🟢 ETF DCA Koopkans')
                    .query('INSERT INTO PF_Notifications (stock_id, ticker, message, is_read, action_required, action_type, action_shares, action_pct, action_title, created_at) VALUES (@stock_id, @ticker, @message, 0, @action_required, @action_type, @action_shares, @action_pct, @action_title, GETDATE())');
                console.log('[NotificationSync] Nieuwe ETF koopnotificatie aangemaakt voor ' + etfBuy.ticker);
            }
        }
    } catch (err) {
        console.error('Fout bij synchroniseren strategie notificaties:', err.message);
    } finally {
        isStrategySyncRunning = false;
    }
};

const getNotifications = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const userId = req.user?.id || 1;

        // Blokkeer het ophalen van notificaties NIET op de zware strategie-simulatie,
        // tenzij expliciet ?sync=true wordt meegegeven.
        if (req.query.sync === 'true') {
            await syncActiveStrategyAlerts(pool, userId, { force: true });
        } else if (process.uptime() > 120 && (Date.now() - lastStrategySyncTime >= STRATEGY_SYNC_COOLDOWN_MS)) {
            syncActiveStrategyAlerts(pool, userId).catch(err =>
                console.warn('[NotificationSync] Achtergrond-sync fout:', err.message)
            );
        }

        const result = await pool.request().query(`
            SELECT id, stock_id, ticker, message, created_at, is_read, new_quarter, new_year,
                   action_required, action_type, action_shares, action_pct, action_title 
            FROM PF_Notifications 
            WHERE is_read = 0 
            ORDER BY action_required DESC, created_at DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen meldingen:', err.message);
        res.status(500).json({ message: 'Fout bij het ophalen van meldingen.' });
    }
};

const markAsRead = async (req, res) => {
    const { id } = req.body;
    try {
        const pool = await sql.connect(config);
        if (id) {
            await pool.request()
                .input('id', sql.Int, id)
                .query('UPDATE PF_Notifications SET is_read = 1 WHERE id = @id');
            res.json({ message: 'Melding gemarkeerd als gelezen.' });
        } else {
            await pool.request().query('UPDATE PF_Notifications SET is_read = 1 WHERE is_read = 0');
            res.json({ message: 'Alle meldingen gemarkeerd als gelezen.' });
        }
    } catch (err) {
        console.error('Fout bij markeren melding:', err.message);
        res.status(500).json({ message: 'Fout bij bijwerken melding.' });
    }
};

module.exports = {
    checkNewSecQuarters,
    getNotifications,
    markAsRead,
    syncActiveStrategyAlerts
};
