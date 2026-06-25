import React from 'react';
import { Doughnut } from 'react-chartjs-2';

const DiversificationTab = ({
  filteredHoldings,
  donutData,
  donutOptions,
  isIncognito,
  formatCurrency,
  loading
}) => {
  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center h-[550px]">
      <div className="lg:col-span-2 relative h-full w-full min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredHoldings.length > 0 ? (
          <Doughnut data={donutData} options={donutOptions} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
             <i className="ph-fill ph-chart-donut text-4xl mb-2 opacity-30"></i> Geen allocatiedata
          </div>
        )}
      </div>
      <div className="lg:col-span-1 h-full overflow-y-auto hide-scrollbar pl-4 border-l border-gray-100">
         <h3 className="text-base font-bold text-gray-900 mb-6">Allocatie Verdeling</h3>
         {loading ? (
           <div className="flex justify-center items-center py-12">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
           </div>
         ) : filteredHoldings.length > 0 && donutData.labels.map((label, idx) => {
           const val = donutData.datasets[0].data[idx];
           const pct = ((val / donutData.datasets[0].data.reduce((a,b)=>a+b,0))*100).toFixed(1);
           return (
             <div key={label} className="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: donutData.datasets[0].backgroundColor[idx]}}></span>
                  <span className="font-bold text-gray-800">{label}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-semibold text-gray-900">{pct}%</span>
                  <span className="text-xs text-gray-400 privacy-blur">{formatCurrency(val)}</span>
                </div>
             </div>
           );
         })}
      </div>
    </div>
  );
};

export default DiversificationTab;
