import React from 'react';
import { useNavigate } from 'react-router-dom';

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
  loading
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Search and Filters Header Bar */}
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
              placeholder="Zoek transactie..." 
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

      {/* Main Transactions List */}
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
                    className="px-6 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('purchase_time')}
                  >
                    Datum{getSortIcon(transSort, 'purchase_time')}
                  </th>
                  <th 
                    className="px-6 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('transaction_type')}
                  >
                    Type{getSortIcon(transSort, 'transaction_type')}
                  </th>
                  <th 
                    className="px-6 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('ticker_symbol')}
                  >
                    Asset{getSortIcon(transSort, 'ticker_symbol')}
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider select-none">
                    Platform
                  </th>
                  <th 
                    className="px-6 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('quantity')}
                  >
                    Aantal{getSortIcon(transSort, 'quantity')}
                  </th>
                  <th 
                    className="px-6 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('price')}
                  >
                    Prijs{getSortIcon(transSort, 'price')}
                  </th>
                  <th 
                    className="px-6 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" 
                    onClick={() => handleTransSort('total_value')}
                  >
                    Totaal{getSortIcon(transSort, 'total_value')}
                  </th>
                  {!isDemo && <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Acties</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentTransactions.map((t, idx) => {
                  const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type);
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-all">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-gray-500">
                        {new Date(t.purchase_time).toLocaleDateString('nl-BE')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-600">
                        {t.broker_name || <span className="text-gray-300 font-medium">Onbekend</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-gray-600 text-right privacy-blur">
                        {isIncognito ? '••••••' : isCash ? '-' : t.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-gray-600 text-right privacy-blur">
                        {isCash ? '-' : formatCurrency(t.price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-900 text-right privacy-blur">
                        {formatCurrency(t.quantity * t.price)}
                      </td>
                      {!isDemo && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => { setTransactionToEdit(t); setIsEditModalOpen(true); }} 
                              className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-gray-50 transition-all" 
                              title="Bewerken"
                            >
                              <i className="ph-fill ph-pencil-simple text-base"></i>
                            </button>
                            <button 
                              onClick={() => setTransactionToDelete(t)} 
                              className="text-gray-400 hover:text-rose-600 p-1 rounded hover:bg-gray-50 transition-all" 
                              title="Verwijderen"
                            >
                              <i className="ph-fill ph-trash text-base"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {processedTransactions.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-xs font-bold text-gray-400">
                      Geen transacties gevonden voor de huidige filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar redesign */}
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

      {/* Potential Duplicates Section redesigned */}
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
