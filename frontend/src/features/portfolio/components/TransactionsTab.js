import React from 'react';
import { useNavigate } from 'react-router-dom';

const TransactionsTab = ({
  transTypeFilter,
  setTransTypeFilter,
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4 sm:mb-0">Transactie Historiek</h3>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={transTypeFilter}
              onChange={(e) => setTransTypeFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alle Types</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
              <option value="DEPOSIT">DEPOSIT</option>
              <option value="WITHDRAWAL">WITHDRAWAL</option>
            </select>
            <div className="relative flex-grow sm:flex-grow-0">
              <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input 
                type="text" 
                placeholder="Zoek transactie..." 
                value={transSearch} 
                onChange={(e) => setTransSearch(e.target.value)} 
                className="pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('purchase_time')}>Datum{getSortIcon(transSort, 'purchase_time')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('transaction_type')}>Type{getSortIcon(transSort, 'transaction_type')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('ticker_symbol')}>Asset{getSortIcon(transSort, 'ticker_symbol')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('quantity')}>Aantal{getSortIcon(transSort, 'quantity')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('price')}>Prijs{getSortIcon(transSort, 'price')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('total_value')}>Totaal{getSortIcon(transSort, 'total_value')}</th>
                  {!isDemo && <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Acties</th>}
                </tr>
              </thead>
              <tbody>
                {currentTransactions.map((t, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">{new Date(t.purchase_time).toLocaleDateString('nl-BE')}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-md ${
                        t.transaction_type === 'BUY' ? 'bg-emerald-50 text-emerald-600' :
                        t.transaction_type === 'SELL' ? 'bg-rose-50 text-rose-600' :
                        t.transaction_type === 'DEPOSIT' ? 'bg-blue-50 text-blue-600' :
                        t.transaction_type === 'WITHDRAWAL' ? 'bg-purple-50 text-purple-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                      {['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type) ? (
                          <span className="text-gray-400 font-medium">CASH</span>
                      ) : (
                          <span 
                              className="cursor-pointer text-blue-600 hover:text-blue-800 transition-colors hover:underline"
                              onClick={() => navigate(`/analysis?ticker=${t.ticker_symbol}`)}
                              title="Bekijk analyse voor dit aandeel"
                          >
                              {t.ticker_symbol || `ID: ${t.aandeel_id}`}
                          </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600 text-right privacy-blur">{isIncognito ? '••••••' : t.quantity}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600 text-right privacy-blur">{formatCurrency(t.price)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800 text-right privacy-blur">{formatCurrency(t.quantity * t.price)}</td>
                    {!isDemo && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => { setTransactionToEdit(t); setIsEditModalOpen(true); }} className="text-gray-400 hover:text-blue-600 transition-colors focus:outline-none mr-3" title="Bewerken">
                          <i className="ph-fill ph-pencil-simple text-lg"></i>
                        </button>
                        <button onClick={() => setTransactionToDelete(t)} className="text-gray-400 hover:text-rose-600 transition-colors focus:outline-none" title="Verwijderen">
                          <i className="ph-fill ph-trash text-lg"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {processedTransactions.length === 0 && (
                  <tr><td colSpan="7" className="px-6 py-8 text-center text-sm text-gray-500">Geen transacties gevonden voor de huidige filter.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginatie Navigatie */}
        {!loading && processedTransactions.length > 0 && (
          <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-gray-50 text-sm text-gray-500 font-medium">
            <div>
              Toont {(transCurrentPage - 1) * transPerPage + 1} tot {Math.min(transCurrentPage * transPerPage, processedTransactions.length)} van de {processedTransactions.length} transacties
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={() => setTransCurrentPage(p => Math.max(1, p - 1))} 
                disabled={transCurrentPage === 1}
                className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
              >Vorige</button>
              <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md">P {transCurrentPage} / {totalTransPages}</span>
              <button 
                onClick={() => setTransCurrentPage(p => Math.min(totalTransPages, p + 1))} 
                disabled={transCurrentPage === totalTransPages}
                className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
              >Volgende</button>
            </div>
          </div>
        )}
      </div>

      {/* Mogelijke Duplicaten Sectie */}
      {!loading && potentialDuplicates.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 p-6 rounded-lg shadow-sm overflow-x-auto mt-6">
          <h3 className="text-lg font-bold text-orange-800 mb-2 flex items-center">
            <i className="ph-fill ph-warning-circle mr-2 text-xl"></i>
            Mogelijke Duplicaten Gevonden
          </h3>
          <p className="text-sm text-orange-700 mb-4">De onderstaande transacties lijken sterk op elkaar (zelfde datum, aandeel en totale inlegwaarde). Dit kan wijzen op een per ongeluk dubbel ingevoerde transactie of een <strong>Stock Split</strong>. Controleer en verwijder de onjuiste/oude rij.</p>
          
          <table className="min-w-full divide-y divide-orange-200 bg-white rounded-md shadow-sm">
            <thead className="bg-orange-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Datum</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Aandeel</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Aantal / Prijs</th>
                {!isDemo && <th className="px-4 py-2 text-right text-xs font-semibold text-orange-800 uppercase">Acties</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {potentialDuplicates.map((t, idx) => (
                <tr key={idx} className="hover:bg-orange-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{new Date(t.purchase_time).toLocaleDateString('nl-BE')} {new Date(t.purchase_time).toLocaleTimeString('nl-BE', {hour: '2-digit', minute:'2-digit'})}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">{['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type) ? 'Cash' : t.ticker_symbol}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-700">{t.transaction_type}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    <span className="privacy-blur">{isIncognito ? '••••••' : t.quantity}</span> <span className="text-gray-400 mx-1">@</span> <span className="privacy-blur">{formatCurrency(t.price)}</span>
                    {t._hasVariance && !t._isPossibleSplit && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-600" title="Prijs wijkt af van de andere duplicaten in deze groep">
                        Δ {formatCurrency(t._varianceAmount)}
                      </span>
                    )}
                    {t._isPossibleSplit && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700" title="Let op: Dit lijkt op een dubbele boeking door een stock split! Verwijder de transactie met de oude (hoge) prijs.">
                        Mogelijke Stock Split
                      </span>
                    )}
                  </td>
                  {!isDemo && (
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <button onClick={() => setTransactionToDelete(t)} className="text-red-500 hover:text-red-700 focus:outline-none bg-red-50 px-3 py-1 rounded" title="Verwijderen">Verwijderen</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransactionsTab;
