import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useIncognito } from '../../hooks/useIncognito';

const TaxesTab = ({ transactions, rawHoldings, displayCurrency, onUpdate }) => {
    const [updating, setUpdating] = useState(false);
    const [expandedMonths, setExpandedMonths] = useState({});
    const [expandedDivYears, setExpandedDivYears] = useState({});
    const [hidePaid, setHidePaid] = useState(false);
    
    // Helpertje voor valuta
    const isIncognito = useIncognito();
    const formatCur = (val) => isIncognito ? '€ ••••••' : new Intl.NumberFormat(displayCurrency === 'EUR' ? 'nl-BE' : 'en-US', { style: 'currency', currency: displayCurrency }).format(val || 0);

    const { taxData, monthlyTob, yearlyDivsArray } = useMemo(() => {
        let manualTob = 0;   // TOB die je zelf nog moet betalen (eToro)
        let autoTob = 0;     // TOB die de broker al heeft betaald (DeGiro, Bolero, Saxo)
        let totalFees = 0;
        const monthlyData = {};
        const yearlyDividends = {};

        // Maak een snelle opzoeklijst voor de TOB rate per aandeel (standaard 0.35%)
        const tobRates = {};
        rawHoldings.forEach(h => {
            tobRates[h.ticker] = h.tob_rate !== undefined ? parseFloat(h.tob_rate) : 0.0035;
        });

        transactions.forEach(t => {
            // Gebruik broker_id of de opgehaalde broker_name
            const broker = String(t.broker_name || t._brokerName || '').toLowerCase();
            // Veilige check: forceer broker_id naar een nummer voor we vergelijken
            const isEtoro = broker.includes('etoro') || Number(t.broker_id) === 1;
            
            const quantity = parseFloat(t.quantity) || 0;
            const price = parseFloat(t.price) || 0;
            const tTaxes = parseFloat(t.taxes) || 0;
            const tFees = parseFloat(t.fees) || 0;
            
            const isUsd = String(t.currency || '').toUpperCase() === 'USD';
            let exRate = parseFloat(t.exchange_rate);
            
            // Gebruik historische rate van de database als handmatige rate niet is ingevuld (of 1/0 is voor USD)
            if (isUsd && (!exRate || exRate === 1 || exRate === 0)) {
                exRate = parseFloat(t.historical_exchange_rate) || 1;
            } else if (!exRate) {
                exRate = 1;
            }

            // 1. Waarde in originele valuta (bv. USD)
            const valueNative = quantity * price;
            
            // 2. Waarde in Euro (De Belgische fiscus eist de berekening op de dagwaarde in EUR)
            const valueEur = isUsd ? (valueNative / exRate) : valueNative;
            
            // 3. Omzetting naar de weergave valuta voor op het dashboard
            const valueDisplay = displayCurrency === 'EUR' ? valueEur : (isUsd ? valueNative : valueNative * exRate);
            
            // Kosten optellen in de juiste weergavemunt
            const feesDisplay = displayCurrency === 'EUR' ? (isUsd ? tFees / exRate : tFees) : (isUsd ? tFees : tFees * exRate);
            totalFees += feesDisplay;
            
            const txType = String(t.transaction_type || '').trim().toUpperCase();

            // 1. Dividend Logica
            if (txType === 'DIVIDEND') {
                // Let op: In theorie mag dit enkel voor individuele aandelen, niet ETF's
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
            // 2. TOB Logica (alleen op Kopen en Verkopen)
            else if (txType === 'BUY' || txType === 'SELL') {
                const rate = tobRates[t.ticker_symbol] || 0.0035;
                
                // Beurstaks MOET berekend worden op de Euro-waarde van die specifieke dag
                const tobCostEur = valueEur * rate;
                const tobCostDisplay = displayCurrency === 'EUR' ? tobCostEur : (tobCostEur * exRate);

                // eToro houdt geen TOB in, dus handmatig. De rest (Degiro, Bolero, Saxo) wel.
                if (isEtoro) {
                    manualTob += tobCostDisplay;

                    // Groepeer op maand voor het overzicht
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
                    // Als de broker zelf TOB afhield en we dit hebben opgeslagen in t.taxes (wat DeGiro doet), 
                    // gebruiken we dat exacte bedrag. Anders vallen we terug op onze eigen berekende schatting.
                    const actualTaxesDisplay = displayCurrency === 'EUR' ? (isUsd ? tTaxes / exRate : tTaxes) : (isUsd ? tTaxes : tTaxes * exRate);
                    autoTob += (tTaxes > 0) ? actualTaxesDisplay : tobCostDisplay;
                }
            }
        });

        const monthlyTobArray = Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
        const yearlyDivsArray = Object.entries(yearlyDividends).map(([year, data]) => ({ 
            year, 
            amount: data.total,
            stocks: Object.values(data.stocks).sort((a,b) => b.amount - a.amount)
        })).sort((a, b) => b.year - a.year);
        
        return { taxData: { manualTob, autoTob, totalFees }, monthlyTob: monthlyTobArray, yearlyDivsArray };
    }, [transactions, rawHoldings, displayCurrency]);

    const toggleTobPaid = async (monthGroup) => {
        setUpdating(true);
        try {
            await axios.post('/api/portfolio/transactions/mark-tob-paid', {
                transactionIds: monthGroup.transactionIds,
                isPaid: !monthGroup.allPaid
            });
            if (onUpdate) onUpdate(); // Herlaad portfolio in de parent
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

    const currentYear = new Date().getFullYear().toString();
    const currentYearDivs = yearlyDivsArray.find(d => d.year === currentYear)?.amount || 0;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Fiscaal Overzicht</h3>
                <p className="text-sm text-gray-500 mb-6">Automatische berekening van de Beurstaks (TOB) en het limiet-overzicht voor de belastingvrije som van dividenden.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Zelf aan te geven TOB */}
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-2">
                            <i className="ph-fill ph-warning-circle text-orange-500 text-2xl"></i>
                            <h4 className="font-semibold text-orange-800">TOB Zelf Aangeven</h4>
                        </div>
                        <div className="text-3xl font-extrabold text-orange-900 my-2 privacy-blur">{formatCur(taxData.manualTob)}</div>
                        <p className="text-xs text-orange-700 leading-relaxed">
                            Berekend over al je transacties op <strong>eToro</strong>. Dit bedrag moet je periodiek zelf aangeven en storten aan de FOD Financiën.
                        </p>
                    </div>

                    {/* Automatisch verwerkte TOB */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-2">
                            <i className="ph-fill ph-check-circle text-gray-500 text-2xl"></i>
                            <h4 className="font-semibold text-gray-700">Automatische TOB</h4>
                        </div>
                        <div className="text-3xl font-extrabold text-gray-900 my-2 privacy-blur">{formatCur(taxData.autoTob)}</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Berekend over transacties bij Belgische brokers en <strong>DeGiro</strong>. Deze belasting is reeds afgehouden en doorgestort door de broker.
                        </p>
                    </div>

                    {/* Belastingvrije Som Dividenden */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-2">
                            <i className="ph-fill ph-piggy-bank text-blue-500 text-2xl"></i>
                            <h4 className="font-semibold text-blue-800">Dividenden {currentYear} (Limiet: €833)</h4>
                        </div>
                        <div className="text-3xl font-extrabold text-blue-900 my-2 privacy-blur">{formatCur(currentYearDivs)}</div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-blue-200 rounded-full h-2.5 mt-3 mb-1">
                            <div className={`h-2.5 rounded-full ${currentYearDivs > 833 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min((currentYearDivs / 833) * 100, 100)}%` }}></div>
                        </div>
                        <div className="mt-4 bg-white bg-opacity-60 rounded-lg p-3 border border-blue-100">
                            <h5 className="font-bold text-blue-900 text-sm mb-2">Actie voor je belastingaangifte (Vak VII):</h5>
                            {currentYearDivs <= 833 ? (
                                <ul className="text-xs text-blue-800 space-y-1.5 list-disc pl-4">
                                    <li>Omdat eToro en DeGiro buitenlandse brokers zijn, houden zij standaard <strong>géén Belgische 30% Roerende Voorheffing</strong> in.</li>
                                    <li>Je totale netto dividenden ({formatCur(currentYearDivs)}) blijven onder de belastingvrije limiet van <strong>€833</strong>.</li>
                                    <li>Je hoeft <strong>niets in te vullen</strong> op je belastingbrief voor deze dividenden.</li>
                                    <li><span className="opacity-75">Let op: De buitenlandse bronbelasting (bijv. 15% op US aandelen) ben je definitief kwijt en kun je niet terugvorderen in België.</span></li>
                                </ul>
                            ) : (
                                <ul className="text-xs text-blue-800 space-y-1.5 list-disc pl-4">
                                    <li>Omdat eToro/DeGiro <strong>géén Belgische belasting</strong> inhouden, moet je het deel boven de limiet zélf aangeven.</li>
                                    <li>Vul bij <strong>Code 1444</strong> (of 2444) het volgende bedrag in: <strong className="text-red-600 bg-red-50 px-1 rounded">{formatCur(currentYearDivs - 833)}</strong>.</li>
                                    <li>Op dit bedrag zal de fiscus alsnog de Belgische 30% belasting berekenen.</li>
                                    <li><span className="opacity-75">Tip: Indien je in de toekomst toch een Belgische broker (zoals Bolero) gebruikt die wél de 30% inhoudt, mag je die ingehouden belasting terugvragen via <strong>Code 1437</strong>.</span></li>
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Maandelijks TOB Overzicht */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Te Betalen TOB (Maandelijks Overzicht)</h3>
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
                                                    disabled={updating}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm ${m.allPaid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
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

            {/* Jaarlijks Dividenden Overzicht */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Dividendbelasting per Jaar</h3>
                <p className="text-sm text-gray-500 mb-4">Overzicht van netto ontvangen dividenden. De Belgische belastingvrije som bedraagt €833 per jaar (inkomstenjaar 2024+). Bedragen hierboven dien je aan te geven.</p>
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

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Broker Gebruik & Externe Kosten</h3>
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-gray-600">Betaalde commissies en broker kosten (Fees)</span>
                    <span className="font-bold text-gray-900 privacy-blur">{formatCur(taxData.totalFees)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaxesTab;
