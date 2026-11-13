import React, { useState, useEffect, useMemo } from 'react';
import http from '../../http-common';

const StrategyExplorerTab = ({ onSelectStrategyForBuilder }) => {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'official' | 'my'
  const [activatingId, setActivatingId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchStrategies = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await http.get('/strategies');
      setStrategies(res.data || []);
    } catch (err) {
      console.error('Fout bij ophalen strategieën:', err);
      setError('Kon strategieën niet ophalen. Probeer het later opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const handleActivateStrategy = async (strategy) => {
    setActivatingId(strategy.strategy_id);
    setSuccessMessage('');
    try {
      const res = await http.post(`/strategies/${strategy.strategy_id}/activate`);
      setSuccessMessage(res.data.message || `Strategie "${strategy.name}" is nu actief voor jouw portefeuille!`);
      // Update local state
      setStrategies(prev => prev.map(s => ({
        ...s,
        is_active_for_me: s.strategy_id === strategy.strategy_id
      })));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Fout bij activeren strategie:', err);
      setError(err.response?.data?.message || 'Kon strategie niet activeren.');
    } finally {
      setActivatingId(null);
    }
  };

  const filteredStrategies = useMemo(() => {
    return strategies.filter(strat => {
      const matchesSearch = 
        (strat.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (strat.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (strat.creator_username || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === 'official') return strat.is_system_default;
      if (activeFilter === 'my') return strat.is_owner;
      return true;
    });
  }, [strategies, searchQuery, activeFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Zoekbalk */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <i className="ph-fill ph-compass text-2xl"></i>
              </span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Strategie Bibliotheek &amp; Zoeken</h2>
                <p className="text-sm text-gray-500">
                  Verken gevalideerde handelsstrategieën, bekijk historische prestaties en activeer ze voor jouw live signalen.
                </p>
              </div>
            </div>
          </div>

          {/* Zoekbalk */}
          <div className="w-full md:w-80 relative">
            <i className="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              type="text"
              placeholder="Zoek op naam, trefwoord of maker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 pt-4 flex-wrap">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Alle Strategieën ({strategies.length})
          </button>
          <button
            onClick={() => setActiveFilter('official')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'official'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className="ph-fill ph-star text-amber-300"></i>
            Officiële Live Strategieën ({strategies.filter(s => s.is_system_default).length})
          </button>
          <button
            onClick={() => setActiveFilter('my')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'my'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className="ph-fill ph-user"></i>
            Door Mij Gemaakt ({strategies.filter(s => s.is_owner).length})
          </button>
        </div>
      </div>

      {/* Notificaties */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-center gap-3 animate-fade-in shadow-xs">
          <i className="ph-fill ph-check-circle text-xl text-emerald-600 flex-shrink-0"></i>
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-center gap-3 shadow-xs">
          <i className="ph-fill ph-warning-circle text-xl flex-shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {/* 2. Grid met Strategieën */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm">
          <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-600 mb-3"></i>
          <p className="text-sm font-semibold text-gray-600">Strategieën ophalen...</p>
        </div>
      ) : filteredStrategies.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm space-y-3">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400 text-2xl">
            <i className="ph ph-folder-notch-open"></i>
          </div>
          <h3 className="text-base font-bold text-gray-900">Geen strategieën gevonden</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {searchQuery 
              ? `Er zijn geen strategieën die overeenkomen met "${searchQuery}".` 
              : 'Er zijn nog geen strategieën aangemaakt in deze weergave.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredStrategies.map((strat) => {
            const perf = strat.performance_summary || {};
            const isReturnPositive = (perf.totalReturnPct || 0) >= 0;

            return (
              <div 
                key={strat.strategy_id} 
                className={`bg-white rounded-2xl p-6 border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                  strat.is_active_for_me 
                    ? 'border-emerald-400 ring-2 ring-emerald-500/20' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  {/* Bovenste badges */}
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {strat.is_system_default ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <i className="ph-fill ph-star text-amber-500 text-xs"></i>
                          Officiële Live Strategie
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          <i className="ph-fill ph-lightbulb"></i>
                          Aangepaste Strategie
                        </span>
                      )}

                      {strat.is_public ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                          🌐 Publiek
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          🔒 Privé
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                      <i className="ph-fill ph-user-circle text-gray-400 text-sm"></i>
                      Door <strong className="text-gray-900">{strat.creator_username}</strong>
                    </span>
                  </div>

                  {/* Strategienaam & Omschrijving */}
                  <h3 className="text-lg font-extrabold text-gray-900 mb-2">
                    {strat.name}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed mb-5 min-h-[36px]">
                    {strat.description || 'Geen uitgebreide beschrijving opgegeven.'}
                  </p>

                  {/* Prestatie Kaartjes (Geen formules, enkel resultaten!) */}
                  <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-gray-50/80 rounded-xl border border-gray-200 mb-5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">10-Jaars Rendement</div>
                      <div className={`text-base font-black mt-0.5 ${isReturnPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {perf.totalReturnPct != null ? `${perf.totalReturnPct >= 0 ? '+' : ''}${perf.totalReturnPct.toFixed(1)}%` : 'N.v.t.'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Win Rate</div>
                      <div className="text-base font-black text-gray-800 mt-0.5">
                        {perf.winRate != null ? `${perf.winRate.toFixed(0)}%` : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Max Drawdown</div>
                      <div className="text-base font-black text-rose-600 mt-0.5">
                        {perf.maxDrawdownPct != null ? `-${perf.maxDrawdownPct.toFixed(1)}%` : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actiebalk */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  {/* Intellectueel Eigendom Bescherming Label */}
                  {!strat.can_view_details && (
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <i className="ph ph-lock text-xs"></i>
                      Formules &amp; parameters beschermd
                    </span>
                  )}

                  {/* Knoppen */}
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Bewerkknop enkel voor eigenaar of beheerder */}
                    {strat.can_view_details && (
                      <button
                        onClick={() => onSelectStrategyForBuilder && onSelectStrategyForBuilder(strat)}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                        title="Open en bewerk deze strategie in de Strategie Builder"
                      >
                        <i className="ph-bold ph-pencil-simple"></i>
                        <span>Bewerken</span>
                      </button>
                    )}

                    {/* Activeringsknop voor Portfolio Assistent */}
                    {strat.is_active_for_me ? (
                      <span className="px-3.5 py-2 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                        <i className="ph-fill ph-check-circle text-emerald-600 text-sm"></i>
                        Actief voor Jou
                      </span>
                    ) : (
                      <button
                        onClick={() => handleActivateStrategy(strat)}
                        disabled={activatingId === strat.strategy_id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {activatingId === strat.strategy_id ? (
                          <>
                            <i className="ph-bold ph-spinner animate-spin"></i>
                            Activeren...
                          </>
                        ) : (
                          <>
                            <i className="ph-bold ph-lightning"></i>
                            Volg Strategie
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrategyExplorerTab;

