import React, { useState } from 'react';
import axios from 'axios';

const SearchSecFields = () => {
    const [ticker, setTicker] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filterText, setFilterText] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!ticker) return;

        setLoading(true);
        setError('');
        setResult(null);
        setFilterText('');

        try {
            // Pas de URL aan als je route prefix anders is in server.js
            const response = await axios.get(`http://localhost:5000/api/sec-fields/${ticker}`);
            setResult(response.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Fout bij ophalen data.');
        } finally {
            setLoading(false);
        }
    };

    // Filter de resultaten client-side
    const filteredFields = result?.fields.filter(field => 
        field.key.toLowerCase().includes(filterText.toLowerCase()) ||
        field.label.toLowerCase().includes(filterText.toLowerCase())
    ) || [];

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">SEC XBRL Fields Explorer</h2>
            <p className="text-sm text-gray-600 mb-4">
                Zoek op een ticker om alle beschikbare US-GAAP tags te zien die dit bedrijf rapporteert.
                Dit helpt bij het bepalen van de juiste velden voor import.
            </p>

            <form onSubmit={handleSearch} className="flex gap-4 mb-6">
                <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="Ticker (bv. AAPL)"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Zoeken...' : 'Haal Velden Op'}
                </button>
            </form>

            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                    {error}
                </div>
            )}

            {result && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-lg">
                            Resultaten voor {result.ticker} (CIK: {result.cik})
                        </h3>
                        <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {result.fields.length} velden gevonden
                        </span>
                    </div>

                    <div className="mb-4">
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Filter resultaten (bv. 'Assets' of 'Profit')..."
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                        />
                    </div>

                    <div className="overflow-x-auto border rounded-lg max-h-[600px] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key (API Veld)</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datapunten</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Beschrijving</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredFields.length > 0 ? (
                                    filteredFields.map((field) => (
                                        <tr key={field.key} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-sm font-medium text-blue-600 select-all">
                                                {field.key}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-800">
                                                {field.label}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 text-center">
                                                {field.count}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500 max-w-md truncate hover:whitespace-normal hover:overflow-visible hover:bg-white hover:z-10 hover:shadow-lg transition-all">
                                                {field.description}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                                            Geen velden gevonden die matchen met "{filterText}".
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchSecFields;