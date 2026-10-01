import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../../http-common';

const TransactionsTab = ({
  transTypeFilter,
  setTransTypeFilter,
  transPlatformFilter,
  setTransPlatformFilter,
  availablePlatforms,
  transSearch,
  setTransSearch,
  transSort,
  handleTransSort,
  getSortIcon,
  currentTransactions,
  processedTransactions,
  transCurrentPage,
  setTransCurrentPage,
  totalTransPages,
  transPerPage,
  potentialDuplicates,
  handleDismissDuplicate,
  setTransactionToDelete,
  setTransactionToEdit,
  setIsEditModalOpen,
  isIncognito,
  formatCurrency,
  isDemo,
  loading,
  onOpenBrokerSync,
  onOpenAddModal
}) => {
  const navigate = useNavigate();
  const [ledgerMeta, setLedgerMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [showMeldingen, setShowMeldingen] = useState(true);
  const [showOpbouw, setShowOpbouw] = useState(false);

  const uid = localStorage.getItem('userID') || 1;

  const fetchLedgerMeta = async () => {
    try {
      setMetaLoading(true);
      const res = await http.get(`/brokers/ledger-metadata?userId=${uid}`);
      setLedgerMeta(res.data);
    } catch (err) {
      console.error('Fout bij ophalen grootboek metadata:', err);
    } finally {
      setMetaLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerMeta();
  }, [processedTransactions.length]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Nog niet gesynchroniseerd';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : `${d.toLocaleDateString('nl-BE')} om ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Bereken herkomst statistieken over de huidige dataset
  const manualRowsCount = ledgerMeta?.manual_count ?? processedTransactions.filter(t => !t.import_source || t.import_source === 'manual').length;
  const manualBuyCount = ledgerMeta?.manual_buy_count ?? processedTransactions.filter(t => (!t.import_source || t.import_source === 'manual') && t.transaction_type === 'BUY').length;
  const manualSellCount = ledgerMeta?.manual_sell_count ?? processedTransactions.filter(t => (!t.import_source || t.import_source === 'manual') && t.transaction_type === 'SELL').length;
  const manualOtherCount = ledgerMeta?.manual_other_count ?? processedTransactions.filter(t => (!t.import_source || t.import_source === 'manual') && !['BUY', 'SELL'].includes(t.transaction_type)).length;

  return (
    <div className="space-y-6">
      
      {/* 1. GROOTBOEK HEADER MET SYNC STATUS BANNER (De Belegger stijl) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 md:p-6 rounded-2xl shadow-lg border border-slate-700/50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-lg text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
              <i className="ph-fill ph-book-bookmark text-sm"></i>
              Grootboek
            </span>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-white flex items-center gap-2">
              Transacties & Boekhouding
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Het grootboek is de ultieme bron van waarheid. Alle rendementen, posities en rapportages worden op deze historie gebaseerd.
          </p>
        </div>

        {/* Sync Status Pills & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* eToro Sync pill */}
          <div className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs flex items-center gap-2 shadow-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${ledgerMeta?.last_etoro_sync ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">eToro API</div>
              <div className="text-xs font-semibold text-slate-200">
                {ledgerMeta?.last_etoro_sync ? formatDate(ledgerMeta.last_etoro_sync) : 'Niet gesynchroniseerd'}
              </div>
            </div>
          </div>

          {/* DeGiro Upload pill */}
          <div className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs flex items-center gap-2 shadow-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${ledgerMeta?.last_degiro_upload ? 'bg-blue-400' : 'bg-slate-500'}`}></span>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">DeGiro Upload</div>
              <div className="text-xs font-semibold text-slate-200">
                {ledgerMeta?.last_degiro_upload ? formatDate(ledgerMeta.last_degiro_upload) : 'Geen bestand geüpload'}
              </div>
            </div>
          </div>

          {/* Actieknoppen */}
          <div className="flex items-center gap-2 ml-auto lg:ml-2">
            {onOpenBrokerSync && (
              <button
                onClick={onOpenBrokerSync}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                title="Koppel broker API of upload rekeningoverzicht"
              >
                <i className="ph-bold ph-arrows-clockwise text-sm"></i>
                Brokers & Sync
              </button>
            )}
            {onOpenAddModal && (
              <button
                onClick={onOpenAddModal}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                title="Voeg handmatig een transactie toe"
              >
                <i className="ph-bold ph-plus text-sm"></i>
                Toevoegen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. ACCORDION: MELDINGEN BIJ DIT GROOTBOEK (De Belegger stijl) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowMeldingen(!showMeldingen)}
          className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-gray-800 hover:bg-gray-50/80 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-sm font-extrabold text-gray-900">
            <span className={`transform transition-transform duration-200 ${showMeldingen ? 'rotate-180' : ''}`}>
              ▼
            </span>
            <span>Meldingen bij dit grootboek</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">
              3 meldingen
            </span>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {showMeldingen ? 'inklappen' : 'uitklappen'}
          </span>
        </button>

        {showMeldingen && (
          <div className="px-6 pb-5 pt-1 space-y-3 border-t border-gray-100 bg-slate-50/40">
            {/* Melding 1: Handmatige grootboekregels */}
            <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm text-xs">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[11px] whitespace-nowrap">
                meegerekend
              </span>
              <div className="text-gray-700 font-medium leading-relaxed">
                <strong>{manualRowsCount} handmatige grootboekregels</strong> meegerekend ({manualBuyCount} koop, {manualSellCount} verkoop, {manualOtherCount} overig) — handmatige mutaties blijven altijd bewerkbaar.
              </div>
            </div>

            {/* Melding 2: Broker imports en datazuiverheid */}
            <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm text-xs">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold rounded text-[11px] whitespace-nowrap">
                melding
              </span>
              <div className="text-gray-700 font-medium leading-relaxed">
                <strong>eToro API & DeGiro rekeningoverzichten</strong> geven transacties, posities, aankoopkoersen en gerealiseerde winst direct door. Deze geïmporteerde regels worden vergrendeld (🔒) zodat externe data niet per ongeluk corrupt raakt.
              </div>
            </div>

            {/* Melding 3: Grootboek is de waarheid */}
            <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm text-xs">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold rounded text-[11px] whitespace-nowrap">
                grootboek
              </span>
              <div className="text-gray-700 font-medium leading-relaxed">
                <strong>Het grootboek is de waarheid</strong> — alle meldingen en berekeningen zijn gebaseerd op deze zuivere historie. Klopt er iets niet? Boek een correctie via <strong>+ Toevoegen</strong> of laad een recenter overzicht op. De app past je historie nooit stilzwijgend aan.
              </div>
            </div>

            {/* Subtitle footer notice */}
            <div className="text-[11px] text-gray-500 pt-1 leading-relaxed">
              Laatste handmatige mutatie: <strong>{ledgerMeta?.last_manual_edit ? formatDate(ledgerMeta.last_manual_edit) : 'Nog geen handmatige mutaties'}</strong>.
            </div>
          </div>
        )}
      </div>

      {/* 3. ACCORDION: ZO IS JE GROOTBOEK OPGEBOUWD (De Belegger stijl) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowOpbouw(!showOpbouw)}
          className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-gray-800 hover:bg-gray-50/80 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-sm font-extrabold text-gray-900">
            <span className={`transform transition-transform duration-200 ${showOpbouw ? 'rotate-180' : ''}`}>
              ▼
            </span>
            <span>Zo is je grootboek opgebouwd ({ledgerMeta?.total_transactions || processedTransactions.length} punten)</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {showOpbouw ? 'inklappen' : 'uitklappen'}
          </span>
        </button>

        {showOpbouw && (
          <div className="px-6 pb-5 pt-1 space-y-2 border-t border-gray-100 bg-slate-50/40 text-xs text-gray-700 font-medium leading-relaxed">
            <ol className="list-decimal list-inside space-y-1.5 pl-1">
              <li>
                <strong>Totaal geregistreerde transacties:</strong> {ledgerMeta?.total_transactions || processedTransactions.length} regels in het grootboek.
              </li>
              <li>
                <strong>Aandelen- en ETF orders:</strong> {ledgerMeta?.buy_count || 0} aankopen en {ledgerMeta?.sell_count || 0} verkopen verwerkt.
              </li>
              <li>
                <strong>Dividenden:</strong> {ledgerMeta?.dividend_count || 0} dividendboekingen geregistreerd.
              </li>
              <li>
                <strong>Stortingen & Opnames:</strong> {ledgerMeta?.deposit_count || 0} stortingen en {ledgerMeta?.withdrawal_count || 0} opnames verwerkt.
              </li>
              <li>
                <strong>Automatisch gesynchroniseerd / geïmporteerd:</strong> {ledgerMeta?.imported_count || 0} regels via broker API of rekeningoverzicht (onveranderlijk beveiligd).
              </li>
              <li>
                <strong>Zelf geboekt (handmatig):</strong> {manualRowsCount} handmatig ingevoerde regels (volledig bewerkbaar en te corrigeren).
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* 4. SEARCH & FILTERS BAR */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <h3 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <i className="ph-bold ph-list-dashes text-lg text-blue-600"></i>
          Transactiehistorie
        </h3>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search bar */}
          <div className="relative min-w-[200px]">
            <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text" 
              placeholder="Zoek aandeel of ISIN..." 
              value={transSearch} 
              onChange={(e) => {
                setTransSearch(e.target.value);
                setTransCurrentPage(1);
              }} 
              className="pl-9 pr-4 py-2 w-full bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Type Filter */}
          <select
            value={transTypeFilter}
            onChange={(e) => {
              setTransTypeFilter(e.target.value);
              setTransCurrentPage(1);
            }}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
          >
            <option value="">Alle Types</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="DIVIDEND">DIVIDEND</option>
            <option value="DEPOSIT">DEPOSIT</option>
            <option value="WITHDRAWAL">WITHDRAWAL</option>
          </select>

          {/* Platform Filter */}
          <select
            value={transPlatformFilter}
            onChange={(e) => {
              setTransPlatformFilter(e.target.value);
              setTransCurrentPage(1);
            }}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
          >
            <option value="">Alle Platforms</option>
            {availablePlatforms.map(plat => (
              <option key={plat} value={plat}>{plat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 5. MAIN TRANSACTIONS TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-100 border-t-blue-600"></div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-200">
                  <th 
                    className="px-5 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('purchase_time')}
                  >
                    Datum{getSortIcon(transSort, 'purchase_time')}
                  </th>
                  <th 
                    className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('transaction_type')}
                  >
                    Type{getSortIcon(transSort, 'transaction_type')}
                  </th>
                  <th 
                    className="px-5 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('ticker_symbol')}
                  >
                    Asset{getSortIcon(transSort, 'ticker_symbol')}
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider select-none">
                    Herkomst / Bron
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider select-none">
                    Platform
                  </th>
                  <th 
                    className="px-4 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('quantity')}
                  >
                    Aantal{getSortIcon(transSort, 'quantity')}
                  </th>
                  <th 
                    className="px-4 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('price')}
                  >
                    Prijs{getSortIcon(transSort, 'price')}
                  </th>
                  <th 
                    className="px-5 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('total_value')}
                  >
                    Totaal{getSortIcon(transSort, 'total_value')}
                  </th>
                  {!isDemo && <th className="px-5 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Acties</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentTransactions.map((t, idx) => {
                  const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type);
                  const isImported = t.import_source && t.import_source !== 'manual';
                  const isEtoro = t.import_source === 'etoro_api' || (t.broker_name && t.broker_name.toLowerCase().includes('etoro') && isImported);
                  const isDegiro = t.import_source === 'degiro_upload' || (t.broker_name && t.broker_name.toLowerCase().includes('degiro') && isImported);

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-all">
                      {/* Datum */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs font-semibold text-gray-500">
                        <div>{new Date(t.purchase_time).toLocaleDateString('nl-BE')}</div>
                        {t.updated_at && (
                          <div className="text-[10px] text-gray-400 font-normal">
                            bijgewerkt {new Date(t.updated_at).toLocaleDateString('nl-BE')}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded ${
                          t.transaction_type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          t.transaction_type === 'SELL' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          t.transaction_type === 'DEPOSIT' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          t.transaction_type === 'WITHDRAWAL' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                          t.transaction_type === 'DIVIDEND' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-gray-50 text-gray-600 border border-gray-100'
                        }`}>
                          {t.transaction_type}
                        </span>
                      </td>

                      {/* Asset */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {isCash ? (
                          <span className="text-xs text-gray-400 font-semibold">CASH BALANCE</span>
                        ) : (
                          <div className="flex flex-col">
                            <span 
                              className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                              onClick={() => navigate(`/analysis?ticker=${t.ticker_symbol}`)}
                            >
                              {t.ticker_symbol || `ID: ${t.aandeel_id}`}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium max-w-[150px] truncate">{t.stock_name}</span>
                          </div>
                        )}
                      </td>

                      {/* Herkomst / Bron Badge (De Belegger stijl) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEtoro ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md w-fit">
                              <i className="ph-bold ph-arrows-clockwise text-xs"></i>
                              eToro API
                            </span>
                            <span className="text-[10px] text-emerald-600/80 font-medium mt-0.5">
                              via API koppeling
                            </span>
                          </div>
                        ) : isDegiro ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md w-fit">
                              <i className="ph-bold ph-file-csv text-xs"></i>
                              DeGiro
                            </span>
                            <span className="text-[10px] text-blue-600/80 font-medium mt-0.5">
                              uit rekeningoverzicht
                            </span>
                          </div>
                        ) : isImported ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md w-fit">
                              <i className="ph-bold ph-upload-simple text-xs"></i>
                              Import
                            </span>
                            <span className="text-[10px] text-indigo-600/80 font-medium mt-0.5">
                              uit bestandsupload
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md w-fit">
                              <i className="ph-bold ph-pencil-simple text-xs"></i>
                              Handmatig
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                              zelf geboekt
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Platform */}
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-bold text-gray-600">
                        {t.broker_name || <span className="text-gray-300 font-medium">Onbekend</span>}
                      </td>

                      {/* Aantal */}
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-gray-600 text-right privacy-blur">
                        {isIncognito ? '••••••' : isCash ? '-' : t.quantity}
                      </td>

                      {/* Prijs */}
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-gray-600 text-right privacy-blur">
                        {isCash ? '-' : formatCurrency(t.price)}
                      </td>

                      {/* Totaal */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs font-bold text-gray-900 text-right privacy-blur">
                        {formatCurrency(t.quantity * t.price)}
                      </td>

                      {/* Acties & Vergrendeling */}
                      {!isDemo && (
                        <td className="px-5 py-4 whitespace-nowrap text-right text-xs">
                          {isImported ? (
                            <div className="flex items-center justify-end">
                              <span 
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100/80 border border-gray-200 px-2 py-1 rounded cursor-help"
                                title="Geïmporteerd via broker / API. Kan niet direct gewijzigd worden om het grootboek zuiver te houden. Boek eventueel een correctie via + Toevoegen."
                              >
                                <i className="ph-fill ph-lock-simple text-xs text-gray-500"></i>
                                Vergrendeld
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => { setTransactionToEdit(t); setIsEditModalOpen(true); }} 
                                className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-all" 
                                title="Bewerken"
                              >
                                <i className="ph-fill ph-pencil-simple text-base"></i>
                              </button>
                              <button 
                                onClick={() => setTransactionToDelete(t)} 
                                className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all" 
                                title="Verwijderen"
                              >
                                <i className="ph-fill ph-trash text-base"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {processedTransactions.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-xs font-bold text-gray-400">
                      Geen transacties gevonden voor de huidige filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {!loading && processedTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50/70 text-xs text-gray-500 font-bold gap-3">
            <div>
              Toont {(transCurrentPage - 1) * transPerPage + 1} tot {Math.min(transCurrentPage * transPerPage, processedTransactions.length)} van de {processedTransactions.length} transacties
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setTransCurrentPage(p => Math.max(1, p - 1))} 
                disabled={transCurrentPage === 1}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-600 font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Vorige
              </button>
              <span className="px-3 py-2 bg-gray-200/60 text-gray-700 rounded-lg">
                Pagina {transCurrentPage} van {totalTransPages}
              </span>
              <button 
                onClick={() => setTransCurrentPage(p => Math.min(totalTransPages, p + 1))} 
                disabled={transCurrentPage === totalTransPages}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-600 font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Volgende
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. POTENTIAL DUPLICATES SECTION */}
      {!loading && potentialDuplicates.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-200/70 p-6 rounded-xl shadow-sm">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-1.5 mb-1">
            <i className="ph-fill ph-warning-circle text-lg"></i>
            Mogelijke duplicaten gevonden
          </h3>
          <p className="text-xs text-amber-700/80 font-semibold mb-4 leading-relaxed max-w-4xl">
            De onderstaande transacties lijken sterk op elkaar (zelfde datum, aandeel en totale inlegwaarde). Dit kan wijzen op een per ongeluk dubbel ingevoerde transactie of een <strong>Stock Split</strong>. Controleer en verwijder de onjuiste rij of markeer deze als geen duplicaat.
          </p>
          
          <div className="overflow-x-auto rounded-lg border border-amber-100 shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-amber-50/50 border-b border-amber-100">
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Datum</th>
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Aandeel</th>
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Herkomst</th>
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Platform</th>
                  <th className="px-4 py-3 text-xs font-bold text-amber-800 uppercase tracking-wider">Aantal / Prijs</th>
                  {!isDemo && <th className="px-4 py-3 text-right text-xs font-bold text-amber-800 uppercase tracking-wider">Acties</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {potentialDuplicates.map((t, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/20 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-500">
                      {new Date(t.purchase_time).toLocaleDateString('nl-BE')} {new Date(t.purchase_time).toLocaleTimeString('nl-BE', {hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-bold text-gray-800">
                      {['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type) ? 'Cash' : t.ticker_symbol}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 inline-flex text-[9px] font-bold rounded ${
                        t.transaction_type === 'BUY' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-gray-500">
                      {t.import_source && t.import_source !== 'manual' ? 'Geïmporteerd' : 'Zelf geboekt'}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-bold text-gray-600">
                      {t.broker_name || <span className="text-gray-300 font-medium">Onbekend</span>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-600">
                      <span className="privacy-blur">{isIncognito ? '••••••' : t.quantity}</span> <span className="text-gray-400 mx-0.5">@</span> <span className="privacy-blur">{formatCurrency(t.price)}</span>
                      {t._hasVariance && !t._isPossibleSplit && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-600" title="Prijs wijkt af van de andere duplicaten in deze groep">
                          Δ {formatCurrency(t._varianceAmount)}
                        </span>
                      )}
                      {t._isPossibleSplit && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700" title="Let op: Dit lijkt op een dubbele boeking door een stock split! Verwijder de transactie met de oude (hoge) prijs.">
                          Mogelijke Stock Split
                        </span>
                      )}
                    </td>
                    {!isDemo && (
                      <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleDismissDuplicate(t.id)} 
                            className="bg-white border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 px-2.5 py-1 rounded transition-all font-bold shadow-sm flex items-center gap-1"
                            title="Markeer als geen duplicaat"
                          >
                            <i className="ph ph-check-circle text-sm"></i>
                            Geen duplicaat
                          </button>
                          <button 
                            onClick={() => setTransactionToDelete(t)} 
                            className="bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 px-2.5 py-1 rounded transition-all font-bold" 
                            title="Verwijderen"
                          >
                            Verwijderen
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsTab;
