import React, { useMemo, useState, useEffect } from 'react';
import http from '../../http-common';
import { useIncognito } from '../../hooks/useIncognito';

const TaxesTab = ({ transactions, rawHoldings, displayCurrency, onUpdate }) => {
    const [updating, setUpdating] = useState(false);
    const [expandedMonths, setExpandedMonths] = useState({});
    const [expandedDivYears, setExpandedDivYears] = useState({});
    const [expandedCgYears, setExpandedCgYears] = useState({ '2026': true });
    const [selectedCgYear, setSelectedCgYear] = useState('2026');
    const [hidePaid, setHidePaid] = useState(false);
    const [baselinePrices, setBaselinePrices] = useState({});
    const [showStrategyAdvisor, setShowStrategyAdvisor] = useState(false);
    
    const userRole = localStorage.getItem('role') || 'user';
    const isDemo = userRole === 'demo';

    // Helpertje voor valuta (formeel in EUR voor Belgische fiscus)
    const isIncognito = useIncognito();
    const formatCur = (val, forceEur = false) => {
        if (isIncognito) return '€ ••••••';
        const curr = forceEur ? 'EUR' : displayCurrency;
        return new Intl.NumberFormat(curr === 'EUR' ? 'nl-BE' : 'en-US', { 
            style: 'currency', 
            currency: curr 
        }).format(val || 0);
    };

    // Haal de officiële ijkprijzen van 31 december 2025 op
    useEffect(() => {
        let isMounted = true;
        http.get('/portfolio/baseline-prices-2025')
            .then(res => {
                if (isMounted && res.data) {
                    setBaselinePrices(res.data);
                }
            })
            .catch(err => {
                console.warn('Kon 2025 ijkprijzen niet ophalen:', err.message);
            });
        return () => { isMounted = false; };
    }, []);

    const { taxData, monthlyTob, yearlyDivsArray, capitalGainsData } = useMemo(() => {
        let manualTob = 0;   // TOB die je zelf nog moet betalen (eToro)
        let autoTob = 0;     // TOB die de broker al heeft betaald (DeGiro, Bolero, Saxo)
        let totalFees = 0;
        const monthlyData = {};
        const yearlyDividends = {};

        // 1. Maak een snelle opzoeklijst voor de TOB rate per aandeel (standaard 0.35%)
        const tobRates = {};
        rawHoldings.forEach(h => {
            tobRates[h.ticker] = h.tob_rate !== undefined ? parseFloat(h.tob_rate) : 0.0035;
        });

        // 2. Loop door alle transacties voor TOB, Dividenden en Kosten
        transactions.forEach(t => {
            const broker = String(t.broker_name || t._brokerName || '').toLowerCase();
            const isEtoro = broker.includes('etoro') || Number(t.broker_id) === 1;
            
            const quantity = parseFloat(t.quantity) || 0;
            const price = parseFloat(t.price) || 0;
            const tTaxes = parseFloat(t.taxes) || 0;
            const tFees = parseFloat(t.fees) || 0;
            
            const isUsd = String(t.currency || '').toUpperCase() === 'USD';
            let exRate = parseFloat(t.exchange_rate);
            
            if (isUsd && (!exRate || exRate === 1 || exRate === 0)) {
                exRate = parseFloat(t.historical_exchange_rate) || 1;
            } else if (!exRate) {
                exRate = 1;
            }

            const valueNative = quantity * price;
            const valueEur = isUsd ? (valueNative / exRate) : valueNative;
            const valueDisplay = displayCurrency === 'EUR' ? valueEur : (isUsd ? valueNative : valueNative * exRate);
            
            const feesDisplay = displayCurrency === 'EUR' ? (isUsd ? tFees / exRate : tFees) : (isUsd ? tFees : tFees * exRate);
            totalFees += feesDisplay;
            
            const txType = String(t.transaction_type || '').trim().toUpperCase();

            // Dividend Logica
            if (txType === 'DIVIDEND') {
                const taxesDisplay = displayCurrency === 'EUR' ? (isUsd ? tTaxes / exRate : tTaxes) : (isUsd ? tTaxes : tTaxes * exRate);
                const netDividend = valueDisplay - taxesDisplay;
                
                const dateObj = new Date(t.purchase_time);
                const year = dateObj.getFullYear();
                
                if (!yearlyDividends[year]) {
                    yearlyDividends[year] = { total: 0, stocks: {} };
                }
                yearlyDividends[year].total += netDividend;
                
                const ticker = t.ticker_symbol || `ID: ${t.aandeel_id}`;
                if (!yearlyDividends[year].stocks[ticker]) {
                    yearlyDividends[year].stocks[ticker] = { ticker: ticker, amount: 0, count: 0 };
                }
                yearlyDividends[year].stocks[ticker].amount += netDividend;
                yearlyDividends[year].stocks[ticker].count += 1;
            } 
            // TOB Logica (Kopen en Verkopen)
            else if (txType === 'BUY' || txType === 'SELL') {
                const rate = tobRates[t.ticker_symbol] || 0.0035;
                const tobCostEur = valueEur * rate;
                const tobCostDisplay = displayCurrency === 'EUR' ? tobCostEur : (tobCostEur * exRate);

                if (isEtoro) {
                    manualTob += tobCostDisplay;

                    const dateObj = new Date(t.purchase_time);
                    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                    
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {
                            month: monthKey,
                            amount: 0,
                            transactionIds: [],
                            allPaid: true,
                            transactions: []
                        };
                    }
                    monthlyData[monthKey].amount += tobCostDisplay;
                    monthlyData[monthKey].transactionIds.push(t.id);
                    monthlyData[monthKey].transactions.push({
                        id: t.id,
                        date: t.purchase_time,
                        ticker: t.ticker_symbol || `ID: ${t.aandeel_id}`,
                        type: txType,
                        value: valueDisplay,
                        rate: rate,
                        tobCost: tobCostDisplay
                    });
                    if (!t.tob_paid) monthlyData[monthKey].allPaid = false;
                } else {
                    const actualTaxesDisplay = displayCurrency === 'EUR' ? (isUsd ? tTaxes / exRate : tTaxes) : (isUsd ? tTaxes : tTaxes * exRate);
                    autoTob += (tTaxes > 0) ? actualTaxesDisplay : tobCostDisplay;
                }
            }
        });

        // 3. FIFO Berekening Meerwaardebelasting (Wetgeving 2026 - FOD Financiën)
        // Sortering strikt chronologisch
        const sortedTrans = [...transactions].sort((a, b) => {
            const da = new Date(a.purchase_time).getTime();
            const db = new Date(b.purchase_time).getTime();
            return da === db ? (a.id - b.id) : da - db;
        });

        const queues = {};
        const salesByYear = {};

        sortedTrans.forEach(t => {
            const txType = String(t.transaction_type || '').trim().toUpperCase();
            if (txType !== 'BUY' && txType !== 'SELL') return;

            const aid = t.aandeel_id || t.ticker_symbol;
            if (!queues[aid]) queues[aid] = [];

            const isUsd = String(t.currency || '').toUpperCase() === 'USD';
            let exRate = parseFloat(t.exchange_rate);
            if (isUsd && (!exRate || exRate === 1 || exRate === 0)) {
                exRate = parseFloat(t.historical_exchange_rate) || 1;
            } else if (!exRate) {
                exRate = 1;
            }

            const rawPrice = parseFloat(t.price) || 0;
            const priceEur = isUsd ? (rawPrice / exRate) : rawPrice;
            const tDate = new Date(t.purchase_time);
            const isPre2026 = tDate < new Date('2026-01-01T00:00:00Z');
            const qty = parseFloat(t.quantity) || 0;

            if (txType === 'BUY') {
                let costPerUnitEur = priceEur;
                let usedBaseline = false;

                // Voor aandelen gekocht vóór 2026: ijkpunt is de slotkoers van 31/12/2025 (Fotomoment)
                if (isPre2026) {
                    const baseObj = baselinePrices[aid] || baselinePrices[t.ticker_symbol];
                    const basePrice = t.baseline_price_2025 !== undefined && t.baseline_price_2025 !== null 
                        ? parseFloat(t.baseline_price_2025) 
                        : (baseObj ? parseFloat(baseObj.price) : null);
                    
                    const baseFx = t.baseline_fx_rate_2025 !== undefined && t.baseline_fx_rate_2025 !== null 
                        ? parseFloat(t.baseline_fx_rate_2025) 
                        : (baseObj ? parseFloat(baseObj.fx_rate) : 1.1746);

                    if (basePrice && !isNaN(basePrice)) {
                        const basePriceEur = isUsd ? (basePrice / (baseFx || 1.1746)) : basePrice;
                        // Bescherming historisch verlies: wettelijke aanschaffingswaarde = max(werkelijke aankoop, 31/12/2025)
                        if (basePriceEur > costPerUnitEur) {
                            costPerUnitEur = basePriceEur;
                            usedBaseline = true;
                        }
                    }
                }

                queues[aid].push({
                    qty: qty,
                    costEurPerUnit: costPerUnitEur,
                    buyDate: t.purchase_time,
                    isPre2026,
                    usedBaseline
                });
            } else if (txType === 'SELL') {
                let remainingToSell = qty;
                let totalCostEur = 0;
                let hadBaselineLots = false;

                while (remainingToSell > 0.000001 && queues[aid].length > 0) {
                    const lot = queues[aid][0];
                    if (lot.usedBaseline) hadBaselineLots = true;

                    if (lot.qty <= remainingToSell) {
                        totalCostEur += lot.qty * lot.costEurPerUnit;
                        remainingToSell -= lot.qty;
                        queues[aid].shift();
                    } else {
                        totalCostEur += remainingToSell * lot.costEurPerUnit;
                        lot.qty -= remainingToSell;
                        remainingToSell = 0;
                    }
                }

                // Fallback indien er meer verkocht wordt dan er aankoophistoriek is
                if (remainingToSell > 0.000001) {
                    const baseObj = baselinePrices[aid] || baselinePrices[t.ticker_symbol];
                    const basePrice = t.baseline_price_2025 !== undefined && t.baseline_price_2025 !== null 
                        ? parseFloat(t.baseline_price_2025) 
                        : (baseObj ? parseFloat(baseObj.price) : null);
                    const baseFx = t.baseline_fx_rate_2025 !== undefined && t.baseline_fx_rate_2025 !== null 
                        ? parseFloat(t.baseline_fx_rate_2025) 
                        : (baseObj ? parseFloat(baseObj.fx_rate) : 1.1746);

                    if (basePrice && !isNaN(basePrice)) {
                        const basePriceEur = isUsd ? (basePrice / (baseFx || 1.1746)) : basePrice;
                        totalCostEur += remainingToSell * basePriceEur;
                        hadBaselineLots = true;
                    } else {
                        totalCostEur += remainingToSell * priceEur;
                    }
                }

                const proceedsEur = qty * priceEur;
                const gainEur = proceedsEur - totalCostEur;
                const saleYear = tDate.getFullYear();

                if (saleYear >= 2026) {
                    if (!salesByYear[saleYear]) salesByYear[saleYear] = [];
                    salesByYear[saleYear].push({
                        id: t.id,
                        date: t.purchase_time,
                        ticker: t.ticker_symbol || `ID: ${t.aandeel_id}`,
                        name: t.stock_name || t.ticker_symbol || '',
                        broker: t.broker_name || t._brokerName || (Number(t.broker_id) === 1 ? 'eToro' : 'Broker'),
                        qty: qty,
                        sellPriceEur: priceEur,
                        proceedsEur,
                        costEur: totalCostEur,
                        gainEur,
                        hadBaselineLots
                    });
                }
            }
        });

        // 4. Consolidatie per jaar met toepassing van € 10.000 vrijstelling & € 1.000 meeneemregeling
        const allCgYears = Object.keys(salesByYear).map(Number);
        if (!allCgYears.includes(2026)) allCgYears.push(2026);
        allCgYears.sort((a, b) => a - b);

        let cumulativeCarryOver = 0; // max 5 jaar x € 1.000 = max € 5.000 extra vrijstelling
        const capitalGainsByYear = {};

        allCgYears.forEach(year => {
            const sales = salesByYear[year] || [];
            const totalGains = sales.filter(s => s.gainEur > 0).reduce((acc, s) => acc + s.gainEur, 0);
            const totalLosses = sales.filter(s => s.gainEur < 0).reduce((acc, s) => acc + Math.abs(s.gainEur), 0);
            const netGain = totalGains - totalLosses; // kan negatief zijn

            const baseExemption = 10000;
            const availableExemption = Math.min(15000, baseExemption + cumulativeCarryOver);

            // Belasting is 10% over de positieve netto winst boven de vrijstelling
            const positiveNetGain = Math.max(0, netGain);
            const taxableBase = Math.max(0, positiveNetGain - availableExemption);
            const taxDue = taxableBase * 0.10;

            const usedExemption = Math.min(positiveNetGain, availableExemption);
            const remainingExemption = Math.max(0, availableExemption - positiveNetGain);
            
            // Meeneemregeling: maximaal € 1.000 ongebruikte vrijstelling per jaar overdraagbaar
            const yearCarryOver = Math.min(1000, remainingExemption);

            capitalGainsByYear[year] = {
                year: String(year),
                sales: sales.sort((a, b) => new Date(b.date) - new Date(a.date)),
                salesCount: sales.length,
                totalProceeds: sales.reduce((acc, s) => acc + s.proceedsEur, 0),
                totalGains,
                totalLosses,
                netGain,
                baseExemption,
                carriedOverExemption: cumulativeCarryOver,
                availableExemption,
                usedExemption,
                taxableBase,
                taxDue,
                remainingExemption,
                yearCarryOver
            };

            // Bouw de carry-over op voor het volgende kalenderjaar (plafond van 5 opeenvolgende jaren = max € 5.000)
            cumulativeCarryOver = Math.min(5000, cumulativeCarryOver + yearCarryOver);
        });

        const monthlyTobArray = Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
        const yearlyDivsArray = Object.entries(yearlyDividends).map(([year, data]) => ({ 
            year, 
            amount: data.total,
            stocks: Object.values(data.stocks).sort((a,b) => b.amount - a.amount)
        })).sort((a, b) => b.year - a.year);
        
        return { 
            taxData: { manualTob, autoTob, totalFees }, 
            monthlyTob: monthlyTobArray, 
            yearlyDivsArray,
            capitalGainsData: capitalGainsByYear
        };
    }, [transactions, rawHoldings, displayCurrency, baselinePrices]);

    const toggleTobPaid = async (monthGroup) => {
        if (isDemo) return;

        const expectedAmount = monthGroup.amount.toFixed(2);
        const userInput = window.prompt(`Weet je zeker dat je de status wilt wijzigen?\nBevestig door het exacte TOB bedrag in te typen (${expectedAmount}):`);
        
        if (userInput !== expectedAmount && userInput !== expectedAmount.replace('.', ',')) {
            alert("Incorrect bedrag ingevoerd. Actie geannuleerd.");
            return;
        }

        setUpdating(true);
        try {
            await http.post('/portfolio/transactions/mark-tob-paid', {
                transactionIds: monthGroup.transactionIds,
                isPaid: !monthGroup.allPaid
            });
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error("Fout bij opslaan TOB status", err);
            alert("Er is een fout opgetreden bij het updaten.");
        } finally {
            setUpdating(false);
        }
    };

    const toggleMonth = (month) => {
        setExpandedMonths(prev => ({
            ...prev,
            [month]: !prev[month]
        }));
    };
    
    const toggleDivYear = (year) => {
        setExpandedDivYears(prev => ({ ...prev, [year]: !prev[year] }));
    };

    const toggleCgYear = (year) => {
        setExpandedCgYears(prev => ({ ...prev, [year]: !prev[year] }));
    };

    const currentYear = new Date().getFullYear().toString();
    const currentYearDivs = yearlyDivsArray.find(d => d.year === currentYear)?.amount || 0;
    
    // Meerwaardebelasting data voor het actieve/huidige jaar
    const activeCgYear = selectedCgYear || (capitalGainsData[currentYear] ? currentYear : '2026');
    const cgSummary = capitalGainsData[activeCgYear] || {
        year: activeCgYear,
        sales: [],
        salesCount: 0,
        totalGains: 0,
        totalLosses: 0,
        netGain: 0,
        baseExemption: 10000,
        carriedOverExemption: 0,
        availableExemption: 10000,
        usedExemption: 0,
        taxableBase: 0,
        taxDue: 0,
        remainingExemption: 10000,
        yearCarryOver: 1000
    };

    const exemptionPercent = Math.min(Math.max(0, (cgSummary.usedExemption / (cgSummary.availableExemption || 10000)) * 100), 100);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Top Kaarten: Fiscale Samenvatting */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Fiscaal Dashboard & Belastingoverzicht</h3>
                        <p className="text-sm text-gray-500">Automatische berekening van de Beurstaks (TOB), Dividendvrijstelling én de nieuwe Belgische Meerwaardebelasting (2026+).</p>
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start md:self-auto">
                        <i className="ph-fill ph-check-circle mr-1.5 text-sm"></i> FOD Financiën 2026 Compliant
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* 1. Meerwaardebelasting Card */}
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <i className="ph-fill ph-scales text-emerald-600 text-2xl"></i>
                                    <h4 className="font-semibold text-emerald-900">Meerwaardebelasting</h4>
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wide bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded">
                                    {activeCgYear}
                                </span>
                            </div>
                            
                            <div className="text-3xl font-extrabold text-emerald-950 my-2 privacy-blur">
                                {formatCur(cgSummary.taxDue, true)}
                            </div>
                            
                            <div className="flex items-center gap-1.5 mb-2">
                                {cgSummary.taxDue === 0 ? (
                                    <span className="inline-flex items-center text-xs font-semibold text-emerald-700">
                                        <i className="ph-bold ph-check text-xs mr-1 text-emerald-600"></i> Volledig Vrijgesteld (€ 0)
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center text-xs font-semibold text-red-600">
                                        <i className="ph-bold ph-warning text-xs mr-1"></i> 10% heffing boven grens
                                    </span>
                                )}
                            </div>

                            {/* Progress bar van de vrijstelling */}
                            <div className="w-full bg-emerald-200 bg-opacity-70 rounded-full h-2 mt-2 mb-1">
                                <div 
                                    className={`h-2 rounded-full transition-all duration-500 ${cgSummary.taxDue > 0 ? 'bg-red-500' : 'bg-emerald-600'}`} 
                                    style={{ width: `${exemptionPercent}%` }}
                                ></div>
                            </div>
                            
                            <div className="flex justify-between text-[11px] text-emerald-800 font-medium mt-1">
                                <span>Benut: {formatCur(cgSummary.usedExemption, true)}</span>
                                <span>Vrijstelling: {formatCur(cgSummary.availableExemption, true)}</span>
                            </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-emerald-200 text-[11px] text-emerald-900 space-y-1">
                            <div className="flex justify-between">
                                <span className="text-emerald-700">Resterende belastingvrije som:</span>
                                <strong className="privacy-blur">{formatCur(cgSummary.remainingExemption, true)}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-emerald-700">Overdraagbaar naar {Number(activeCgYear) + 1}:</span>
                                <strong className="text-emerald-800 privacy-blur">+{formatCur(cgSummary.yearCarryOver, true)}</strong>
                            </div>
                        </div>
                    </div>

                    {/* 2. Zelf aan te geven TOB */}
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-5 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <i className="ph-fill ph-warning-circle text-orange-500 text-2xl"></i>
                                <h4 className="font-semibold text-orange-800">TOB Zelf Aangeven</h4>
                            </div>
                            <div className="text-3xl font-extrabold text-orange-900 my-2 privacy-blur">{formatCur(taxData.manualTob)}</div>
                            <p className="text-xs text-orange-700 leading-relaxed">
                                Berekend over al je transacties op <strong>eToro</strong>. Dit bedrag moet je periodiek zelf aangeven en storten aan de FOD Financiën.
                            </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-orange-200 text-[11px] text-orange-800 font-medium">
                            Aangifteplicht binnen 2 maanden na transactie
                        </div>
                    </div>

                    {/* 3. Automatisch verwerkte TOB */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <i className="ph-fill ph-check-circle text-gray-500 text-2xl"></i>
                                <h4 className="font-semibold text-gray-700">Automatische TOB</h4>
                            </div>
                            <div className="text-3xl font-extrabold text-gray-900 my-2 privacy-blur">{formatCur(taxData.autoTob)}</div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Berekend over transacties bij Belgische brokers en <strong>DeGiro</strong>. Reeds ingehouden en doorgestort door de broker.
                            </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-gray-500 font-medium">
                            Geen actie vereist voor belastingaangifte
                        </div>
                    </div>

                    {/* 4. Belastingvrije Som Dividenden */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <i className="ph-fill ph-piggy-bank text-blue-500 text-2xl"></i>
                                    <h4 className="font-semibold text-blue-800">Dividenden {currentYear}</h4>
                                </div>
                                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Limiet €833</span>
                            </div>
                            <div className="text-3xl font-extrabold text-blue-900 my-2 privacy-blur">{formatCur(currentYearDivs)}</div>
                            
                            {/* Progress Bar Dividenden */}
                            <div className="w-full bg-blue-200 rounded-full h-2 mt-2 mb-1">
                                <div className={`h-2 rounded-full ${currentYearDivs > 833 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min((currentYearDivs / 833) * 100, 100)}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[11px] text-blue-800 font-medium">
                                <span>{((currentYearDivs / 833) * 100).toFixed(0)}% benut</span>
                                <span>{currentYearDivs <= 833 ? 'Vrijgesteld' : `Aangeven: ${formatCur(currentYearDivs - 833)}`}</span>
                            </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-blue-200 text-[11px] text-blue-700">
                            {currentYearDivs <= 833 ? 'Geen aangifte nodig in Vak VII' : 'Code 1444 in personenbelasting'}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTIE: MEERWAARDEBELASTING DETAIL & VERKOPEN */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                                <i className="ph-bold ph-scales text-lg"></i>
                            </span>
                            <h3 className="text-xl font-bold text-gray-900">Meerwaardebelasting op Financiële Activa (10%)</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Gerealiseerde winsten en verliezen op aandelen, ETF's en effecten sinds 1 januari 2026. Historische posities worden beschermd via de slotkoers van 31/12/2025.
                        </p>
                    </div>

                    {/* Jaarknoppen */}
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg self-start md:self-auto">
                        {Object.keys(capitalGainsData).sort().map(yr => (
                            <button
                                key={yr}
                                onClick={() => setSelectedCgYear(yr)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    activeCgYear === yr 
                                        ? 'bg-white text-emerald-800 shadow-sm border border-gray-200' 
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {yr}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Dashboard Metrics voor het Geselecteerde Jaar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gerealiseerde Meerwaarden</span>
                        <div className="text-xl font-bold text-emerald-600 mt-1 privacy-blur">
                            +{formatCur(cgSummary.totalGains, true)}
                        </div>
                        <span className="text-[11px] text-gray-400">Bruto winst op verkopen in {activeCgYear}</span>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Minderwaarden (Verliezen)</span>
                        <div className="text-xl font-bold text-red-500 mt-1 privacy-blur">
                            -{formatCur(cgSummary.totalLosses, true)}
                        </div>
                        <span className="text-[11px] text-gray-400">Verrekend in mindering van de winst</span>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Netto Gerealiseerd</span>
                        <div className={`text-xl font-bold mt-1 privacy-blur ${cgSummary.netGain >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCur(cgSummary.netGain, true)}
                        </div>
                        <span className="text-[11px] text-gray-400">Winst minus verlies in {activeCgYear}</span>
                    </div>

                    <div className={`rounded-lg p-4 border ${cgSummary.taxDue > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Te Betalen Belasting</span>
                        <div className={`text-xl font-extrabold mt-1 privacy-blur ${cgSummary.taxDue > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {formatCur(cgSummary.taxDue, true)}
                        </div>
                        <span className="text-[11px] text-gray-500">
                            {cgSummary.taxDue > 0 ? `10% op ${formatCur(cgSummary.taxableBase, true)}` : '€ 0 verschuldigd (vrijgesteld)'}
                        </span>
                    </div>
                </div>

                {/* Vrijstellingsstatus & Carry-over breakdown banner */}
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-xl p-5 mb-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h4 className="font-bold text-emerald-950 flex items-center gap-2 text-sm">
                                <i className="ph-fill ph-shield-check text-emerald-600 text-lg"></i>
                                Vrijstellingskorf {activeCgYear}: {formatCur(cgSummary.availableExemption, true)}
                                {cgSummary.carriedOverExemption > 0 && (
                                    <span className="text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                        inclusief +{formatCur(cgSummary.carriedOverExemption, true)} overdracht
                                    </span>
                                )}
                            </h4>
                            <p className="text-xs text-emerald-800 leading-relaxed">
                                Je hebt dit jaar <strong>{formatCur(cgSummary.usedExemption, true)}</strong> van je vrijstelling opgebruikt. 
                                Je kan in {activeCgYear} nog <strong className="text-emerald-900 bg-emerald-100/70 px-1 py-0.5 rounded">{formatCur(cgSummary.remainingExemption, true)}</strong> aan zuivere nettowinst realiseren vóór je 10% belasting betaalt.
                            </p>
                        </div>

                        <div className="bg-white/80 backdrop-blur rounded-lg p-3 border border-emerald-200/60 shadow-2xs min-w-[220px]">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                                Meeneemregeling naar {Number(activeCgYear) + 1}
                            </span>
                            <div className="flex items-baseline justify-between">
                                <span className="text-lg font-extrabold text-emerald-900 privacy-blur">
                                    +{formatCur(cgSummary.yearCarryOver, true)}
                                </span>
                                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                    Max € 1.000/jr
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-500 block mt-1">
                                Overdracht blijft 5 jaar geldig (max. € 15.000 totaal plafond)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tabel met alle verkopen in het actieve jaar */}
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                            <span>Verkooptransacties in {activeCgYear}</span>
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {cgSummary.salesCount} {cgSummary.salesCount === 1 ? 'verkoop' : 'verkopen'}
                            </span>
                        </h4>
                    </div>

                    {cgSummary.salesCount > 0 ? (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Datum</th>
                                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Asset</th>
                                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Broker</th>
                                        <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Stuks</th>
                                        <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Verkoopwaarde (EUR)</th>
                                        <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Fiscale Aankoopwaarde</th>
                                        <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Gerealiseerde Winst / Verlies</th>
                                        <th className="px-4 py-2.5 text-center font-semibold text-gray-600">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {cgSummary.sales.map((s, idx) => (
                                        <tr key={s.id || idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                                                {new Date(s.date).toLocaleDateString('nl-BE')}
                                            </td>
                                            <td className="px-4 py-2.5 font-bold text-gray-900">
                                                {s.ticker}
                                                {s.name && s.name !== s.ticker && (
                                                    <span className="block text-[10px] font-normal text-gray-400 truncate max-w-[150px]">{s.name}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-600">{s.broker}</td>
                                            <td className="px-4 py-2.5 text-right font-medium text-gray-700">{s.qty.toLocaleString('nl-BE', { maximumFractionDigits: 5 })}</td>
                                            <td className="px-4 py-2.5 text-right font-medium text-gray-900 privacy-blur">{formatCur(s.proceedsEur, true)}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600 privacy-blur">
                                                {formatCur(s.costEur, true)}
                                                {s.hadBaselineLots && (
                                                    <span className="block text-[9px] text-emerald-600 font-semibold" title="Berekend met 31/12/2025 ijkkoers (historische winst belastingvrij)">
                                                        ✓ 31/12/2025 ijk
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-bold privacy-blur ${s.gainEur >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {s.gainEur >= 0 ? `+${formatCur(s.gainEur, true)}` : formatCur(s.gainEur, true)}
                                            </td>
                                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                                {cgSummary.taxDue === 0 ? (
                                                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full">
                                                        Vrijgesteld
                                                    </span>
                                                ) : (
                                                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full">
                                                        Binnen mandje
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
                            <i className="ph-fill ph-scales text-gray-400 text-3xl mb-1"></i>
                            <p className="text-sm font-medium text-gray-700">Geen verkopen geregistreerd in {activeCgYear}</p>
                            <p className="text-xs text-gray-400 mt-1">Zodra je effecten verkoopt in {activeCgYear}, berekent de app hier automatisch je meerwaarde en de fiscale impact.</p>
                        </div>
                    )}
                </div>

                {/* ADVIEZ- EN OPTIMALISATIEKADER: "Verkopen 31 dec & Terugkopen 1 jan?" */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                    <button 
                        onClick={() => setShowStrategyAdvisor(prev => !prev)}
                        className="w-full flex items-center justify-between text-left font-bold text-slate-900 group"
                    >
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                                <i className="ph-fill ph-lightbulb text-lg"></i>
                            </span>
                            <div>
                                <span className="text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                                    Fiscaal Advies & Strategie: Verkopen op 31 december en terugkopen op 1 januari?
                                </span>
                                <span className="block text-xs font-normal text-slate-500 mt-0.5">
                                    Analyse van Tax Gain Harvesting, transactiekosten (TOB) en de Belgische algemene antimisbruikbepaling.
                                </span>
                            </div>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                            {showStrategyAdvisor ? 'Inklappen ▲' : 'Lees Analyse ▼'}
                        </span>
                    </button>

                    {showStrategyAdvisor && (
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 text-xs text-slate-700 leading-relaxed">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                                    <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                        <i className="ph-bold ph-trend-up text-emerald-600"></i>
                                        1. De Rekensom (Waarom het idee slim klinkt)
                                    </h5>
                                    <p>
                                        In theorie heet dit <em>Tax Gain Harvesting</em>: door elk jaar winst te verzilveren tot aan de vrijstellingsgrens van <strong>€ 10.000</strong>, "klik" je die winst belastingvrij vast (€ 0 belasting).
                                    </p>
                                    <p>
                                        Bij het terugkopen stijgt je fiscale instapprijs (cost basis). Als je die activa jaren later definitief verkoopt, bespaar je potentieel <strong>10% meerwaardebelasting</strong> over die € 10.000 (€ 1.000 pure fiscale besparing).
                                    </p>
                                    <div className="bg-emerald-50 text-emerald-900 p-2.5 rounded border border-emerald-100">
                                        <strong>Kosten vs Opbrengst:</strong> Op een positie van bijv. € 20.000 met € 10.000 winst betaal je bij heraankoop 2x beurstaks (bijv. 0,12% voor tracker = € 48, of 0,35% voor aandeel = € 140) + makelaarsloon. De potentiële winst van € 1.000 overtreft die € 50 - € 150 transactiekosten ruimschoots!
                                    </div>
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                                    <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                        <i className="ph-bold ph-warning text-amber-500"></i>
                                        2. De Juridische Valkuil: Antimisbruikbepaling
                                    </h5>
                                    <p>
                                        België kent geen letterlijke <em>wash sale rule</em> van 30 dagen zoals de VS, maar beschikt wel over de <strong>algemene antimisbruikbepaling (art. 344, §1 WIB 92)</strong>.
                                    </p>
                                    <p>
                                        Als je op 31 december aandeel X verkoopt en op 1 of 2 januari direct <em>exact hetzelfde aandeel X</em> terugkoopt zonder dat je enig marktrisico liep, kan de fiscus dit kwalificeren als een <strong>kunstmatige rechtshandeling zonder economische realiteit</strong>.
                                    </p>
                                    <div className="bg-amber-50 text-amber-900 p-2.5 rounded border border-amber-100">
                                        <strong>Gevolg bij controle:</strong> De fiscus mag de verkoop en heraankoop negeren (fiscale herkwalificatie), waardoor je oude lagere aanschaffingsprijs blijft gelden en je de betaalde TOB en kosten kwijt bent.
                                    </div>
                                </div>
                            </div>

                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-2">
                                <h5 className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                                    <i className="ph-fill ph-shield-check text-indigo-600"></i>
                                    Hoe doe je dit in de praktijk wél 100% fiscaal veilig?
                                </h5>
                                <ul className="list-disc pl-5 space-y-1.5 text-indigo-900">
                                    <li>
                                        <strong>De Tracker / ETF-Swap (Beste methode):</strong> Verkoop ETF A (bijvoorbeeld <em>iShares Core S&P 500</em>) en koop onmiddellijk een evenwaardige ETF B van een andere aanbieder (bijvoorbeeld <em>Vanguard S&P 500</em> of <em>Invesco S&P 500</em>). Omdat dit twee verschillende fondsen met een andere ISIN-code zijn, is dit een legitieme herschikking van je portefeuille en <em>geen</em> schijnverkoop van hetzelfde aandeel!
                                    </li>
                                    <li>
                                        <strong>Voldoende tussentijdse marktexposure:</strong> Wil je per se hetzelfde aandeel terugkopen? Wacht minstens een aantal beursdagen of weken tussen verkoop en aankoop. Doordat de koers in tussentijd kan schommelen, is er sprake van reëel marktrisico en economische realiteit.
                                    </li>
                                    <li>
                                        <strong>Benut de meeneemregeling (€ 1.000):</strong> Als je niet wil handelen of kosten wil vermijden, verlies je niet alles: de wet voorziet dat je automatisch tot <strong>€ 1.000</strong> aan ongebruikte vrijstelling mag meenemen naar het volgende jaar (maximaal 5 jaar op rij op te bouwen tot € 15.000 totale vrijstelling).
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* SECTIE: MAANDELIJKS TOB OVERZICHT */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Te Betalen TOB (Maandelijks Overzicht)</h3>
                        <p className="text-xs text-gray-500">Beurstaks over eToro transacties die je periodiek zelf dient aan te geven en te betalen.</p>
                    </div>
                    <label className="flex items-center cursor-pointer text-sm text-gray-600 font-medium">
                        <input type="checkbox" checked={hidePaid} onChange={e => setHidePaid(e.target.checked)} className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                        Verberg betaalde periodes
                    </label>
                </div>
                {monthlyTob.filter(m => hidePaid ? !m.allPaid : true).length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Maand</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Aantal Transacties</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Bedrag (TOB)</th>
                                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {monthlyTob.filter(m => hidePaid ? !m.allPaid : true).map(m => (
                                    <React.Fragment key={m.month}>
                                        <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleMonth(m.month)}>
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                <span className="mr-2 text-gray-400 text-xs">{expandedMonths[m.month] ? '▼' : '▶'}</span>
                                                {m.month}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{m.transactionIds.length}</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 privacy-blur">{formatCur(m.amount)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); toggleTobPaid(m); }}
                                                    disabled={updating || isDemo}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm ${m.allPaid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'} ${isDemo ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    title={isDemo ? "Niet toegestaan voor demo accounts" : "Status wijzigen"}
                                                >
                                                    {m.allPaid ? 'Betaald ✔' : 'Te Betalen'}
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedMonths[m.month] && (
                                            <tr>
                                                <td colSpan="4" className="bg-gray-50 p-4 border-b border-gray-200">
                                                    <table className="min-w-full text-xs text-left text-gray-600 bg-white border border-gray-200 rounded">
                                                        <thead className="bg-gray-100">
                                                            <tr>
                                                                <th className="px-3 py-2 font-medium">Datum</th>
                                                                <th className="px-3 py-2 font-medium">Asset</th>
                                                                <th className="px-3 py-2 font-medium">Type</th>
                                                                <th className="px-3 py-2 font-medium text-right">Transactiewaarde</th>
                                                                <th className="px-3 py-2 font-medium text-right">TOB %</th>
                                                                <th className="px-3 py-2 font-medium text-right">TOB Bedrag</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {m.transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => (
                                                                <tr key={t.id} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2">{new Date(t.date).toLocaleDateString('nl-BE')}</td>
                                                                    <td className="px-3 py-2 font-semibold text-gray-800">{t.ticker}</td>
                                                                    <td className="px-3 py-2">{t.type}</td>
                                                                    <td className="px-3 py-2 text-right privacy-blur">{formatCur(t.value)}</td>
                                                                    <td className="px-3 py-2 text-right">{(t.rate * 100).toFixed(2)}%</td>
                                                                    <td className="px-3 py-2 text-right font-medium text-gray-900 privacy-blur">{formatCur(t.tobCost)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Geen eToro transacties (zelf aan te geven) gevonden voor de geselecteerde periode.</p>
                )}
            </div>

            {/* SECTIE: JAARLIJKS DIVIDENDEN OVERZICHT */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Dividendbelasting per Jaar</h3>
                <p className="text-sm text-gray-500 mb-4">Overzicht van netto ontvangen dividenden. De Belgische belastingvrije som bedraagt €833 per jaar (inkomstenjaar 2024+). Bedragen hierboven dien je aan te geven via Code 1444.</p>
                {yearlyDivsArray.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Jaar</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Netto Dividenden</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Aan te geven in Code 1444 (Boven €833)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {yearlyDivsArray.map(d => (
                                    <React.Fragment key={d.year}>
                                        <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleDivYear(d.year)}>
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                <span className="mr-2 text-gray-400 text-xs">{expandedDivYears[d.year] ? '▼' : '▶'}</span>
                                                {d.year}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 privacy-blur">{formatCur(d.amount)}</td>
                                            <td className={`px-4 py-3 text-right font-bold privacy-blur ${d.amount > 833 ? 'text-red-600' : 'text-green-600'}`}>
                                                {d.amount > 833 ? formatCur(d.amount - 833) : (isIncognito ? '€ ••••••' : '€ 0,00')}
                                            </td>
                                        </tr>
                                        {expandedDivYears[d.year] && (
                                            <tr>
                                                <td colSpan="3" className="bg-gray-50 p-4 border-b border-gray-200">
                                                    <table className="min-w-full text-xs text-left text-gray-600 bg-white border border-gray-200 rounded">
                                                        <thead className="bg-gray-100">
                                                            <tr>
                                                                <th className="px-3 py-2 font-medium">Asset</th>
                                                                <th className="px-3 py-2 font-medium text-right">Aantal Uitbetalingen</th>
                                                                <th className="px-3 py-2 font-medium text-right">Netto Dividend</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {d.stocks.map(s => (
                                                                <tr key={s.ticker} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2 font-semibold text-gray-800">{s.ticker}</td>
                                                                    <td className="px-3 py-2 text-right">{s.count}x</td>
                                                                    <td className="px-3 py-2 text-right font-medium text-emerald-600 privacy-blur">{formatCur(s.amount)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Geen dividenden gevonden in de database.</p>
                )}
            </div>

            {/* SECTIE: BROKER KOSTEN */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Broker Gebruik & Externe Kosten</h3>
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-gray-600">Betaalde transactiekosten en makelaarslonen (Fees)</span>
                    <span className="font-bold text-gray-900 privacy-blur">{formatCur(taxData.totalFees)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaxesTab;
