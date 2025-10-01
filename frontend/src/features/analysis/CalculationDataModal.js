import React from 'react';
import Modal from '../../components/ui/modal';

const CalculationDataModal = ({ isOpen, onClose, data, error }) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Fundamental Data Used in Calculation</h3>
        {error && <div className="text-red-500">{error}</div>}
        {data ? (
          <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">{new Date(item.period_end_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{item.data_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Loading data...</p>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CalculationDataModal;
