import React from 'react';

const SearchModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 w-1/2">
        <h2 className="text-2xl font-bold mb-4">Search</h2>
        <input
          type="text"
          placeholder="Search for anything..."
          className="w-full p-2 border border-gray-300 rounded-lg mb-4"
        />
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;