import React, { useState, useMemo } from 'react';

const BROKER_PRESETS = [
  { id: 'degiro', name: 'DEGIRO (Kernselectie / Standaard)', feePerOrderEur: 1.0, autoTob: true },
  { id: 'etoro', name: 'eToro (0€ commissie • Zelf TOB aangeven)', feePerOrderEur: 0.0, autoTob: false },
  { id: 'bolero', name: 'Bolero (KBC België • Auto TOB)', feePerOrderEur: 7.5, autoTob: true },
  { id: 'saxo', name: 'Saxo Bank België (Auto TOB)', feePerOrderEur: 2.0, autoTob: true },
  { id: 'traderepublic', name: 'Trade Republic (€1/order • Zelf TOB)', feePerOrderEur: 1.0, autoTob: false }
];

// Bereken alle Belgische belastingen & kosten over N jaar vasthouden (1j, 5j, 10j)
export function calculateHoldingPeriodTaxAndCosts({
  investmentEur = 5000,
  annualGrowthPct = 8.0,
  years = 5,
  tobRatePct = 0.12,
  tobMaxCapEur = 1300,
  terPct = 0.20,
  dividendYieldPct = 0,
  withholdingTaxPct = 30,
  brokerFeeEur = 1.0
}) {
  const cap = Number(investmentEur) || 0;
  const rGrowth = (Number(annualGrowthPct) || 0) / 100;
  const rTer = (Number(terPct) || 0) / 100;
  const rDiv = (Number(dividendYieldPct) || 0) / 100;
  const rRv = (Number(withholdingTaxPct) || 0) / 100;
  const rTob = (Number(tobRatePct) || 0) / 100;
  const maxTob = Number(tobMaxCapEur) || 1300;
  const fee = Number(brokerFeeEur) || 0;

  // 1. Instapkosten (TOB bij aankoop + broker fee)
  const buyTobEur = rTob > 0 ? Math.min(maxTob, cap * rTob) : 0;
  const buyBrokerFeeEur = fee;

  // Simulatie jaar per jaar over N jaar
  let grossVal = cap;
  let netVal = Math.max(0, cap - buyTobEur - buyBrokerFeeEur);
  let totalTerCostEur = 0;
  let totalDividendTaxEur = 0;
  let totalNetDividendsReceivedEur = 0;

  // Voor een distribuerend fonds is een deel van het totaalrendement (rGrowth) afkomstig uit dividend (rDiv),
  // en de rest is koersgroei (rPriceGrowth). Bij een accumulerend fonds (rDiv = 0) zit alles in koersgroei.
  const rPriceGrowth = Math.max(0, rGrowth - rDiv);

  for (let y = 1; y <= years; y++) {
    grossVal = grossVal * (1 + rGrowth);

    const startYearVal = netVal;
    // Jaarlijkse TER fondskosten
    const yearTer = startYearVal * rTer;
    totalTerCostEur += yearTer;

    // Bruto dividend dat dit jaar wordt uitgekeerd (indien distribuerend)
    const grossDiv = startYearVal * rDiv;
    const divTax = grossDiv * rRv; // 30% Belgische roerende voorheffing
    const netDiv = grossDiv - divTax;

    totalDividendTaxEur += divTax;
    totalNetDividendsReceivedEur += netDiv;

    // Eindwaarde na koersgroei + herbelegd netto dividend min TER
    netVal = startYearVal * (1 + rPriceGrowth) - yearTer + netDiv;
  }

  // 2. Uitstapkosten bij verkoop na N jaar (TOB op de gegroeide verkoopwaarde!)
  const sellTobEur = rTob > 0 ? Math.min(maxTob, netVal * rTob) : 0;
  const sellBrokerFeeEur = fee;
  const finalNetValueAfterSell = Math.max(0, netVal - sellTobEur - sellBrokerFeeEur);

  const totalTobEur = buyTobEur + sellTobEur;
  const totalBrokerFeesEur = buyBrokerFeeEur + sellBrokerFeeEur;
  const totalDirectCostsAndTaxesEur = totalTobEur + totalTerCostEur + totalDividendTaxEur + totalBrokerFeesEur;
  const opportunityCostDragEur = Math.max(0, (grossVal - finalNetValueAfterSell));
  const costAsPctOfInitial = cap > 0 ? (totalDirectCostsAndTaxesEur / cap) * 100 : 0;

  return {
    years,
    initialInvestmentEur: cap,
    grossEndValueEur: grossVal,
    netEndValueEur: finalNetValueAfterSell,
    buyTobEur,
    sellTobEur,
    totalTobEur,
    totalTerCostEur,
    totalDividendTaxEur,
    totalBrokerFeesEur,
    totalDirectCostsAndTaxesEur,
    opportunityCostDragEur,
    costAsPctOfInitial
  };
}

const AnalysisTaxAndCostTab = ({
  selectedStock = null,
  curvoEtfCatalog = [],
  allMarketItems = [],
  onSelectStock = null
}) => {
  const [investmentEur, setInvestmentEur] = useState(5000);
  const [annualGrowthPct, setAnnualGrowthPct] = useState(8.0);
  const [selectedBrokerId, setSelectedBrokerId] = useState('degiro');
  const [etfSearchQuery, setEtfSearchQuery] = useState('');
  const [tobFilter, setTobFilter] = useState('ALL'); // 'ALL' | '0.12' | '0.35' | '1.32' | 'ACC' | 'DIST'
  const [horizonView, setHorizonView] = useState(10); // 1 | 5 | 10 voor de vergelijkingstabel
  const [customCheckerAnswer, setCustomCheckerAnswer] = useState({
    instrumentType: 'ETF', // 'ETF' | 'STOCK' | 'ETC' | 'CRYPTO'
    dividendType: 'ACC',   // 'ACC' | 'DIST'
    registeredEea: 'YES',  // 'YES' | 'NO'
    registeredFsma: 'NO'   // 'YES' | 'NO'
  });

  const activeBroker = useMemo(
    () => BROKER_PRESETS.find(b => b.id === selectedBrokerId) || BROKER_PRESETS[0],
    [selectedBrokerId]
  );

  const formatEur = (val) =>
    new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);

  // Interactieve Curvo Beurstaks Beslisboom berekening
  const customCheckerResult = useMemo(() => {
    const { instrumentType, dividendType, registeredEea, registeredFsma } = customCheckerAnswer;
    if (instrumentType === 'CRYPTO') {
      return {
        rate: '0,00%',
        cap: '€ 0 (Vrijgesteld)',
        color: 'emerald',
        explanation: 'Zuivere cryptomunten (zoals Bitcoin, Ethereum, Solana) worden door de FOD Financiën niet beschouwd als roerende financiële instrumenten voor de TOB. Je betaalt dus 0% beurstaks.'
      };
    }
    if (instrumentType === 'STOCK') {
      return {
        rate: '0,35%',
        cap: 'Max. € 1.600 per order',
        color: 'blue',
        explanation: 'Individuele aandelen (zowel Belgische, Europese als Amerikaanse aandelen) vallen in België altijd onder het standaardtarief van 0,35% bij zowel aankoop als verkoop.'
      };
    }
    if (instrumentType === 'ETC') {
      return {
        rate: '0,35%',
        cap: 'Max. € 1.600 per order',
        color: 'blue',
        explanation: 'ETC\'s (Exchange Traded Commodities, zoals fysiek goud) en ETN\'s zijn juridisch gezien schuldbewijzen (obligaties/certificaten) en geen beleggingsfondsen. Ze vallen onder 0,35% TOB.'
      };
    }
    // ETF (Trackers)
    if (registeredEea === 'NO') {
      return {
        rate: '0,35%',
        cap: 'Max. € 1.600 per order',
        color: 'amber',
        explanation: 'Een ETF die buiten de Europese Economische Ruimte (EER) is geregistreerd (bijv. in de VS), valt onder het tarief van 0,35%.'
      };
    }
    if (dividendType === 'DIST') {
      return {
        rate: '0,12%',
        cap: 'Max. € 1.300 per order',
        color: 'emerald',
        explanation: 'Uitkerende (distribuerende) ETF\'s die in de EER (bijv. Ierland of Luxemburg) zijn geregistreerd, vallen altijd onder het lage tarief van 0,12% TOB. Let wel op: op elk uitgekeerd dividend betaal je in België 30% roerende voorheffing!'
      };
    }
    // Accumulerend + EER
    if (registeredFsma === 'YES') {
      return {
        rate: '1,32%',
        cap: 'Max. € 4.000 per order',
        color: 'rose',
        explanation: 'Accumulerende (kapitalisatie) ETF waarvan het compartiment — of een ander compartiment van dezelfde koepel-bevek (zoals bij VWCE of VUAA) — geregistreerd staat op de lijst van de Belgische FSMA: 1,32% TOB bij aankoop én 1,32% bij verkoop!'
      };
    }
    return {
      rate: '0,12%',
      cap: 'Max. € 1.300 per order',
      color: 'emerald',
      explanation: 'De fiscaal meest voordelige categorie in België! Een accumulerende EER-ETF die NIET in België bij de FSMA is geregistreerd (zoals IWDA, SWRD, EMIM, CSPX, SPYM): slechts 0,12% TOB én 0% dividendbelasting omdat dividenden intern belastingvrij worden herbelegd.'
    };
  }, [customCheckerAnswer]);

  // ============================================================================
  // MODUS 1: SPECIFIEK AANDEEL OF ETF GESELECTEERD (1 Jaar / 5 Jaar / 10 Jaar)
  // ============================================================================
  const selectedTaxProfile = useMemo(() => {
    if (!selectedStock) return null;
    if (selectedStock.taxProfile) return selectedStock.taxProfile;
    const isEtf = String(selectedStock.asset_type_name || '').toUpperCase().includes('ETF');
    return {
      assetCategory: isEtf ? 'ETF' : 'STOCK',
      tobRatePct: isEtf ? 0.12 : 0.35,
      tobMaxCapEur: isEtf ? 1300 : 1600,
      tobBadge: isEtf ? '0,12% TOB (max. €1.300)' : '0,35% TOB (max. €1.600)',
      dividendPolicy: isEtf ? 'DISTRIBUTING' : 'STOCK_OPTIONAL_DIV',
      dividendYieldPct: isEtf ? 1.5 : 0.8,
      terPct: isEtf ? 0.20 : 0,
      withholdingTaxPct: 30,
      domicile: isEtf ? 'Ierland (EER)' : 'Beursnotering',
      tobReason: isEtf
        ? 'EER-geregistreerde ETF: 0,12% TOB bij aan- en verkoop.'
        : 'Individueel aandeel: 0,35% TOB bij aan- en verkoop in België.'
    };
  }, [selectedStock]);

  const singleStockHorizons = useMemo(() => {
    if (!selectedTaxProfile) return [];
    return [1, 5, 10].map(yrs =>
      calculateHoldingPeriodTaxAndCosts({
        investmentEur,
        annualGrowthPct,
        years: yrs,
        tobRatePct: selectedTaxProfile.tobRatePct,
        tobMaxCapEur: selectedTaxProfile.tobMaxCapEur,
        terPct: selectedTaxProfile.terPct,
        dividendYieldPct: selectedTaxProfile.dividendYieldPct,
        withholdingTaxPct: selectedTaxProfile.withholdingTaxPct,
        brokerFeeEur: activeBroker.feePerOrderEur
      })
    );
  }, [selectedTaxProfile, investmentEur, annualGrowthPct, activeBroker]);

  // ============================================================================
  // MODUS 2: CURVO ETF & AANDELEN BEURSTAKS VERGELIJKER (ALLE ETF'S & AANDELEN)
  // ============================================================================
  const enrichedCatalogRows = useMemo(() => {
    const baseList = curvoEtfCatalog.length > 0 ? curvoEtfCatalog : [];
    const stocksAsTaxItems = (allMarketItems || [])
      .filter(i => i.asset_type_name === 'STOCK')
      .map(s => ({
        ...(s.taxProfile || {}),
        assetCategory: 'STOCK',
        ticker: s.ticker,
        cleanTicker: s.ticker,
        name: s.name,
        isin: s.isin || '-',
        stock_id: s.stock_id,
        inDatabase: true,
        currentPrice: s.currentPrice
      }));

    const combined = [...baseList, ...stocksAsTaxItems];

    return combined
      .filter(item => {
        if (etfSearchQuery.trim()) {
          const q = etfSearchQuery.toLowerCase().trim();
          const match =
            String(item.ticker || '').toLowerCase().includes(q) ||
            String(item.name || '').toLowerCase().includes(q) ||
            String(item.isin || '').toLowerCase().includes(q) ||
            String(item.indexName || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        if (tobFilter === 'ETF_ONLY') return item.assetCategory === 'ETF';
        if (tobFilter === 'STOCK_ONLY') return item.assetCategory === 'STOCK';
        if (tobFilter === '0.12') return Number(item.tobRatePct) === 0.12;
        if (tobFilter === '0.35') return Number(item.tobRatePct) === 0.35;
        if (tobFilter === '1.32') return Number(item.tobRatePct) === 1.32;
        if (tobFilter === 'ACC') return item.dividendPolicy === 'ACCUMULATING';
        if (tobFilter === 'DIST') return item.dividendPolicy === 'DISTRIBUTING';
        return true;
      })
      .map(item => {
        const sim1y = calculateHoldingPeriodTaxAndCosts({
          investmentEur,
          annualGrowthPct,
          years: 1,
          tobRatePct: item.tobRatePct,
          tobMaxCapEur: item.tobMaxCapEur,
          terPct: item.terPct,
          dividendYieldPct: item.dividendYieldPct,
          withholdingTaxPct: item.withholdingTaxPct,
          brokerFeeEur: activeBroker.feePerOrderEur
        });
        const sim5y = calculateHoldingPeriodTaxAndCosts({
          investmentEur,
          annualGrowthPct,
          years: 5,
          tobRatePct: item.tobRatePct,
          tobMaxCapEur: item.tobMaxCapEur,
          terPct: item.terPct,
          dividendYieldPct: item.dividendYieldPct,
          withholdingTaxPct: item.withholdingTaxPct,
          brokerFeeEur: activeBroker.feePerOrderEur
        });
        const sim10y = calculateHoldingPeriodTaxAndCosts({
          investmentEur,
          annualGrowthPct,
          years: 10,
          tobRatePct: item.tobRatePct,
          tobMaxCapEur: item.tobMaxCapEur,
          terPct: item.terPct,
          dividendYieldPct: item.dividendYieldPct,
          withholdingTaxPct: item.withholdingTaxPct,
          brokerFeeEur: activeBroker.feePerOrderEur
        });
        return {
          ...item,
          sim1y,
          sim5y,
          sim10y,
          activeSim: horizonView === 1 ? sim1y : horizonView === 5 ? sim5y : sim10y
        };
      })
      .sort((a, b) => {
        // Sorteer ETF's eerst, daarna op laagste kosten over de gekozen horizon
        if (a.assetCategory !== b.assetCategory) return a.assetCategory === 'ETF' ? -1 : 1;
        return a.activeSim.totalDirectCostsAndTaxesEur - b.activeSim.totalDirectCostsAndTaxesEur;
      });
  }, [curvoEtfCatalog, allMarketItems, etfSearchQuery, tobFilter, investmentEur, annualGrowthPct, activeBroker, horizonView]);

  return (
    <div className="space-y-6">
      {/* 1. Simulator Instellingen Balk (Inlegbedrag, Verwachte Groei & Broker) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                🇧🇪 Belgische Fiscus &amp; TOB
              </span>
              <span className="text-xs font-bold text-gray-400">Curvo Beurstaks &amp; Kosten Simulator</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-gray-900 mt-0.5">
              {selectedStock
                ? `Belastingen & Kosten voor ${selectedStock.ticker} (1 jaar, 5 jaar & 10 jaar vasthouden)`
                : 'Belgische ETF & Aandelen Beurstaks (TOB) Checker & 1j / 5j / 10j Kostenvergelijker'}
            </h2>
          </div>

          {/* Snelkeuze Inlegbedragen */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase mr-1">Snel Inleg:</span>
            {[1000, 2500, 5000, 10000, 25000].map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => setInvestmentEur(amt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all border ${
                  Number(investmentEur) === amt
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                € {amt.toLocaleString('nl-BE')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-extrabold text-gray-700 mb-1">Investeringsbedrag (€):</label>
            <input
              type="number"
              min="100"
              step="500"
              value={investmentEur}
              onChange={(e) => setInvestmentEur(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-black text-sm text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-extrabold text-gray-700 mb-1">Verwacht Bruto Rendement (% / jaar):</label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={annualGrowthPct}
              onChange={(e) => setAnnualGrowthPct(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-black text-sm text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-extrabold text-gray-700 mb-1">Jouw Broker (Commissie &amp; TOB-inhouding):</label>
            <select
              value={selectedBrokerId}
              onChange={(e) => setSelectedBrokerId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
            >
              {BROKER_PRESETS.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================
          WEERGAVE A: DETAIL VOOR HET GESELECTEERDE AANDEEL OF ETF (1j / 5j / 10j)
         ======================================================================== */}
      {selectedStock && selectedTaxProfile && (
        <div className="space-y-5">
          {/* Fiscaal Paspoort van dit Aandeel / ETF */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                  <span>🏛️ Belgisch Fiscaal Paspoort: {selectedStock.name} ({selectedStock.ticker})</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedTaxProfile.tobReason}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-xl text-xs font-black border shrink-0 ${
                selectedTaxProfile.tobRatePct === 0.12
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : selectedTaxProfile.tobRatePct === 1.32
                  ? 'bg-rose-50 text-rose-900 border-rose-300'
                  : 'bg-blue-50 text-blue-900 border-blue-300'
              }`}>
                {selectedTaxProfile.tobBadge}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Beurstaks (TOB)</span>
                <span className="text-sm font-black text-gray-900 block">
                  {selectedTaxProfile.tobRatePct.toFixed(2).replace('.', ',')}% (bij koop &amp; verkoop)
                </span>
                <span className="text-[11px] text-gray-500">Plafond: € {selectedTaxProfile.tobMaxCapEur}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Dividendbeleid &amp; RV</span>
                <span className="text-sm font-black text-gray-900 block">
                  {selectedTaxProfile.dividendPolicy === 'ACCUMULATING'
                    ? '🟢 Accumulerend (0% RV)'
                    : selectedTaxProfile.dividendPolicy === 'DISTRIBUTING'
                    ? '🟠 Uitkerend (30% RV)'
                    : '📊 Aandeel (30% RV op div.)'}
                </span>
                <span className="text-[11px] text-gray-500">
                  Geschat div.: {selectedTaxProfile.dividendYieldPct}% / jaar
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Lopende Fondskosten (TER)</span>
                <span className="text-sm font-black text-gray-900 block">
                  {selectedTaxProfile.terPct > 0 ? `${selectedTaxProfile.terPct.toFixed(2).replace('.', ',')}% / jaar` : '0,00% (Geen fondskosten)'}
                </span>
                <span className="text-[11px] text-gray-500">
                  {selectedTaxProfile.assetCategory === 'ETF' ? 'Jaarlijks ingehouden in koers' : 'Los aandeel heeft geen TER'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">TOB Aangifte bij {activeBroker.name.split(' ')[0]}</span>
                <span className={`text-sm font-black block ${activeBroker.autoTob ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {activeBroker.autoTob ? '✅ Automatisch ingehouden' : '⚠️ Zelf aangeven (Div 106)'}
                </span>
                <span className="text-[11px] text-gray-500">
                  {activeBroker.autoTob ? 'Broker stort door aan fiscus' : 'Uiterlijk eind 2e maand na trade'}
                </span>
              </div>
            </div>
          </div>

          {/* 3 Kolommen: 1 Jaar vs. 5 Jaar vs. 10 Jaar Vasthouden */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {singleStockHorizons.map(sim => (
              <div
                key={sim.years}
                className={`bg-white rounded-2xl p-5 border shadow-2xs flex flex-col justify-between space-y-4 ${
                  sim.years === 10 ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                        Horizon: {sim.years} {sim.years === 1 ? 'Jaar' : 'Jaren'}
                      </span>
                      <h4 className="text-base font-black text-gray-900">
                        {sim.years} Jaar Vasthouden
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-black">
                      -{formatEur(sim.totalDirectCostsAndTaxesEur)} kosten
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-gray-600">
                      <span>1. Instap-TOB bij aankoop ({selectedTaxProfile.tobRatePct}%):</span>
                      <span className="font-bold text-gray-900">{formatEur(sim.buyTobEur)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600">
                      <span>2. Uitstap-TOB bij verkoop na {sim.years}j:</span>
                      <span className="font-bold text-gray-900">{formatEur(sim.sellTobEur)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600">
                      <span>3. Lopende kosten (TER over {sim.years}j):</span>
                      <span className="font-bold text-gray-900">{formatEur(sim.totalTerCostEur)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600">
                      <span>4. Belgische dividendbelasting (30% RV):</span>
                      <span className="font-bold text-gray-900">{formatEur(sim.totalDividendTaxEur)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600">
                      <span>5. Broker commissie (koop + verkoop):</span>
                      <span className="font-bold text-gray-900">{formatEur(sim.totalBrokerFeesEur)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500">Totaal Belastingen &amp; Kosten:</span>
                    <span className="font-black text-rose-600 text-sm">
                      {formatEur(sim.totalDirectCostsAndTaxesEur)} ({sim.costAsPctOfInitial.toFixed(2)}% v. inleg)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500">Bruto Eindwaarde (zonder kosten):</span>
                    <span className="font-semibold text-gray-600">{formatEur(sim.grossEndValueEur)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-black text-gray-900">Netto Eindwaarde na verkoop:</span>
                    <span className="font-black text-emerald-700 text-base">{formatEur(sim.netEndValueEur)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================
          WEERGAVE B: CURVO BEURSTAKS ETF CHECKER & VERGELIJKINGSTABEL
         ======================================================================== */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                <span>🔍 Curvo Beurstaks ETF &amp; Aandelen Vergelijker</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                  {enrichedCatalogRows.length} Instrumenten
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Vergelijk direct de Belgische TOB (0,12% vs. 0,35% vs. 1,32%), dividendbelasting (30% RV) en totale kosten over 1, 5 en 10 jaar.
              </p>
            </div>

            {/* Horizon switcher voor de tabel */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
                {[1, 5, 10].map(yr => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setHorizonView(yr)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      horizonView === yr ? 'bg-white text-indigo-800 shadow-2xs font-black' : 'text-gray-600'
                    }`}
                  >
                    {yr} Jaar Vasthouden
                  </button>
                ))}
              </div>

              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Zoek ETF, ISIN (bv. IE00...) of ticker..."
                  value={etfSearchQuery}
                  onChange={(e) => setEtfSearchQuery(e.target.value)}
                  className="w-56 sm:w-64 pl-8 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                />
                {etfSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEtfSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL', label: 'Alles (ETF\'s & Aandelen)' },
              { id: 'ETF_ONLY', label: '📈 Enkel ETF\'s' },
              { id: '0.12', label: '🟢 0,12% TOB (Laagste)' },
              { id: '0.35', label: '🔵 0,35% TOB (Aandelen / Niet-EER)' },
              { id: '1.32', label: '🔴 1,32% TOB (FSMA Acc. zoals VWCE)' },
              { id: 'ACC', label: '🔄 Accumulerend (0% Dividendbelasting)' },
              { id: 'DIST', label: '💵 Distribuerend (30% RV op dividend)' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTobFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 border ${
                  tobFilter === f.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-gray-50/80 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="py-3 px-4">Ticker &amp; ISIN</th>
                <th className="py-3 px-3">🇧🇪 Belgische TOB</th>
                <th className="py-3 px-3">Dividend &amp; RV</th>
                <th className="py-3 px-3 text-right">TER / Jaar</th>
                <th className="py-3 px-3 text-right">Kosten 1 Jaar</th>
                <th className="py-3 px-3 text-right">Kosten 5 Jaar</th>
                <th className="py-3 px-4 text-right bg-indigo-50/50 text-indigo-950">Kosten 10 Jaar (op {formatEur(investmentEur)})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enrichedCatalogRows.map((item, idx) => {
                const isEtf = item.assetCategory === 'ETF';
                return (
                  <tr
                    key={`${item.ticker}-${idx}`}
                    onClick={() => {
                      if (item.inDatabase && onSelectStock) {
                        const found = allMarketItems.find(m => m.stock_id === item.stock_id || m.ticker === item.ticker);
                        if (found) onSelectStock(found);
                      }
                    }}
                    className={`transition-colors ${item.inDatabase && onSelectStock ? 'hover:bg-blue-50/50 cursor-pointer' : 'hover:bg-gray-50/60'}`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900">{item.cleanTicker || item.ticker}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                          isEtf ? 'bg-emerald-100 text-emerald-900' : 'bg-blue-100 text-blue-900'
                        }`}>
                          {isEtf ? 'ETF' : 'Aandeel'}
                        </span>
                        {!item.inDatabase && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-gray-100 text-gray-600">
                            Curvo Ref
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500 block truncate max-w-[230px]" title={item.name}>
                        {item.name}
                      </span>
                      {item.isin && item.isin !== '-' && (
                        <span className="text-[10px] font-mono text-gray-400 block">ISIN: {item.isin}</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                        item.tobRatePct === 0.12
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : item.tobRatePct === 1.32
                          ? 'bg-rose-50 text-rose-900 border-rose-300'
                          : 'bg-blue-50 text-blue-900 border-blue-200'
                      }`}>
                        {item.tobRatePct.toFixed(2).replace('.', ',')}% (max €{item.tobMaxCapEur})
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-0.5 max-w-[220px] truncate" title={item.tobReason}>
                        {item.domicile}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                        item.dividendPolicy === 'ACCUMULATING'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border-amber-200'
                      }`}>
                        {item.dividendPolicy === 'ACCUMULATING'
                          ? '🔄 Acc (0% RV)'
                          : item.dividendPolicy === 'DISTRIBUTING'
                          ? `💵 Dist (30% RV op ~${item.dividendYieldPct}%)`
                          : '📊 30% RV op dividend'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-gray-700">
                      {item.terPct > 0 ? `${item.terPct.toFixed(2).replace('.', ',')}%` : '0,00%'}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className="font-black text-gray-900 block">{formatEur(item.sim1y.totalDirectCostsAndTaxesEur)}</span>
                      <span className="text-[10px] text-gray-400">({item.sim1y.costAsPctOfInitial.toFixed(2)}%)</span>
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className="font-black text-gray-900 block">{formatEur(item.sim5y.totalDirectCostsAndTaxesEur)}</span>
                      <span className="text-[10px] text-gray-400">
                        TOB: {formatEur(item.sim5y.totalTobEur)} • TER/RV: {formatEur(item.sim5y.totalTerCostEur + item.sim5y.totalDividendTaxEur)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap bg-indigo-50/20">
                      <span className="font-black text-indigo-950 text-sm block">
                        {formatEur(item.sim10y.totalDirectCostsAndTaxesEur)}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 block">
                        Netto na 10j: {formatEur(item.sim10y.netEndValueEur)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================
          WEERGAVE C: INTERACTIEVE CURVO BESLISBOOM & BELGISCHE TOB-AANGIFTE GIDS
         ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Linker kaart: Interactieve Beurstaks Checker voor een willekeurige nieuwe ETF */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs space-y-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
              Interactieve Beslisboom
            </span>
            <h3 className="text-base font-black text-gray-900">
              🧮 Curvo Beurstaks Checker (Bereken TOB voor elk fonds)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Twijfel je over het Belgische TOB-tarief van een nieuwe ETF? Beantwoord deze 4 vragen:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">1. Type Instrument:</label>
              <select
                value={customCheckerAnswer.instrumentType}
                onChange={(e) => setCustomCheckerAnswer(prev => ({ ...prev, instrumentType: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
              >
                <option value="ETF">📈 ETF / Index Tracker (Bevek/SICAV)</option>
                <option value="STOCK">💎 Individueel Aandeel</option>
                <option value="ETC">🥇 ETC / ETN (Fysiek Goud / Grondstof)</option>
                <option value="CRYPTO">🪙 Cryptomunt (BTC / ETH / SOL)</option>
              </select>
            </div>

            {customCheckerAnswer.instrumentType === 'ETF' && (
              <>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">2. Dividendbeleid:</label>
                  <select
                    value={customCheckerAnswer.dividendType}
                    onChange={(e) => setCustomCheckerAnswer(prev => ({ ...prev, dividendType: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                  >
                    <option value="ACC">🔄 Accumulerend (Herbeleggend / Acc)</option>
                    <option value="DIST">💵 Distribuerend (Uitkerend / Dist)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">3. Geregistreerd in de EER (IE / LU / DE / FR)?</label>
                  <select
                    value={customCheckerAnswer.registeredEea}
                    onChange={(e) => setCustomCheckerAnswer(prev => ({ ...prev, registeredEea: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                  >
                    <option value="YES">✅ Ja, UCITS ETF in EER (bv. IE00... of LU00...)</option>
                    <option value="NO">🌍 Nee, buiten EER (bv. VS US00...)</option>
                  </select>
                </div>

                {customCheckerAnswer.dividendType === 'ACC' && customCheckerAnswer.registeredEea === 'YES' && (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">4. Fonds of subfonds bij FSMA in België geregistreerd?</label>
                    <select
                      value={customCheckerAnswer.registeredFsma}
                      onChange={(e) => setCustomCheckerAnswer(prev => ({ ...prev, registeredFsma: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                    >
                      <option value="NO">🟢 Nee, niet op FSMA-lijst (bv. IWDA, SWRD, CSPX)</option>
                      <option value="YES">🔴 Ja, fonds of zuster-compartiment op FSMA-lijst (bv. VWCE, VUAA)</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`p-4 rounded-2xl border space-y-1.5 ${
            customCheckerResult.color === 'emerald'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : customCheckerResult.color === 'rose'
              ? 'bg-rose-50 border-rose-200 text-rose-950'
              : 'bg-blue-50 border-blue-200 text-blue-950'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider">Toepasselijk Belgisch TOB-tarief:</span>
              <span className="text-lg font-black">{customCheckerResult.rate} ({customCheckerResult.cap})</span>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{customCheckerResult.explanation}</p>
          </div>
        </div>

        {/* Rechter kaart: Belgische TOB-Aangifte Regels (Curvo TOB-aangifte overzicht) */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs space-y-3.5 text-xs">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">
              FOD Financiën Richtlijnen
            </span>
            <h3 className="text-base font-black text-gray-900">
              📋 Belangrijke Regels rond de Belgische TOB-Aangifte
            </h3>
          </div>

          <div className="space-y-2.5 text-gray-700 leading-relaxed">
            <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
              <strong className="text-gray-900 block mb-0.5">1. Wanneer moet je zelf TOB aangeven en betalen?</strong>
              Belgische brokers (<em>Bolero, Saxo, Keytrade, Re=Bel</em>) en <em>DEGIRO</em> houden de TOB automatisch in. Gebruik je een buitenlandse broker die dit niet doet (zoals <strong>eToro, Trade Republic, Interactive Brokers of Trading 212</strong>), dan ben je wettelijk verplicht zelf aangifte te doen.
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
              <strong className="text-gray-900 block mb-0.5">2. Wat is de uiterste aangifte- en betaaltermijn?</strong>
              Uiterlijk op de <strong>laatste werkdag van de tweede maand</strong> volgend op de maand van de transactie (zowel bij aankoop als bij verkoop!). <em>Voorbeeld:</em> alle trades uit januari moeten uiterlijk op de laatste werkdag van maart aangegeven én betaald zijn.
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
              <strong className="text-gray-900 block mb-0.5">3. Hoe reken je USD-transacties (bv. op eToro) om naar EUR?</strong>
              Transacties in vreemde valuta moeten worden omgerekend naar euro tegen de officiële <strong>ECB-referentiewisselkoers van de transactiedag</strong>. (Jouw tabblad <em>Portfolio ➔ Taxes</em> berekent dit al automatisch per maand voor je eToro-transacties!).
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
              <strong className="text-gray-900 block mb-0.5">4. Waarom rekenen sommige brokers 1,32% en andere 0,12% op dezelfde ETF?</strong>
              Sommige koepel-beveks (zoals <em>Vanguard Funds plc</em> bij VWCE/VUAA) hebben hun uitkerende compartiment (VGWL/VUSA) wél geregistreerd bij de Belgische FSMA, maar het accumulerende compartiment niet. De Belgische fiscus en Belgische brokers beschouwen de hele bevek dan als geregistreerd in België (<strong>1,32% TOB</strong>), terwijl sommige buitenlandse brokers enkel naar het specifieke ISIN-subfonds kijken (0,12%).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisTaxAndCostTab;
