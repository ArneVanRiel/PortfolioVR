import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import StrategyBuilderTab from '../analysis/StrategyBuilderTab';
import StrategyBacktestTab from '../analysis/StrategyBacktestTab';

const StrategyStudioPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('builder'); // 'builder' | 'backtest'
  const [strategyToEdit, setStrategyToEdit] = useState(null);

  useEffect(() => {
    if (location.state?.strategyToEdit) {
      setStrategyToEdit(location.state.strategyToEdit);
      setActiveTab('builder');
    } else if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  return (
    <div className="space-y-8 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-12">
      {/* 1. Hero Header & Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 pb-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                  Strategie Hub
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                  <i className="ph-fill ph-crown text-amber-500"></i>
                  Data-Driven Alpha
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight">
                Strategie Builder &amp; Studio
              </h1>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                Ontwerp en personaliseer jouw eigen kwartaal- en momentumstrategieën. Bepaal hoeveel kapitaal je toewijst, bekijk concrete kooporders en valideer het historisch rendement via de 10-jarige backtest.
              </p>
            </div>
          </div>

          {/* Tab Navigatie */}
          <nav className="flex space-x-6 overflow-x-auto hide-scrollbar border-t border-gray-100" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('builder')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'builder'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-sliders-horizontal text-lg"></i>
              <span>Strategie Studio &amp; Actie-Screener</span>
            </button>

            <button
              onClick={() => setActiveTab('backtest')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'backtest'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-chart-line-up text-lg"></i>
              <span>Strategie Backtest &amp; Simulator</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                👑 Premium
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* 2. Tab Content */}
      <div>
        {activeTab === 'builder' ? (
          <StrategyBuilderTab
            initialStrategyToEdit={strategyToEdit}
            onOpenBacktest={() => setActiveTab('backtest')}
          />
        ) : (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 shadow-sm">
                    👑 Premium Backtest Engine
                  </span>
                  <span className="text-xs text-indigo-300">10-Jarige Data-Gedreven Simulatie</span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Valideer kwartaalscores, verkoopregels, deelaandelen en de Belgische meerwaardebelasting over meer dan 2.500 beursdagen en benchmark direct tegen de S&amp;P 500 en MSCI World.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('builder')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              >
                <i className="ph-bold ph-sliders-horizontal"></i>
                <span>Naar Strategie Studio</span>
              </button>
            </div>

            <StrategyBacktestTab />
          </div>
        )}
      </div>
    </div>
  );
};

export default StrategyStudioPage;

