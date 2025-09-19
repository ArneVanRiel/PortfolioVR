import React, { useState } from 'react';

const SecImporter = () => {
    const [ticker, setTicker] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [output, setOutput] = useState('');

    const handleImport = async () => {
        if (!ticker) {
            setOutput('Please enter a ticker symbol.');
            return;
        }

        setIsLoading(true);
        setOutput(`Starting import for ${ticker}...
`);

        try {
            const response = await fetch('http://localhost:5000/api/sec/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ticker }),
            });

            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            const read = async () => {
                const { done, value } = await reader.read();
                if (done) {
                    setIsLoading(false);
                    return;
                }
                setOutput(prevOutput => prevOutput + decoder.decode(value, { stream: true }));
                read(); // Continue reading
            };

            read();

        } catch (error) {
            console.error('Failed to import SEC data:', error);
            setOutput(prevOutput => prevOutput + `\n--- ERROR ---\n${error.message}`);
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 my-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">SEC Data Importer</h2>
            <p className="text-gray-600 mb-4">Enter a stock ticker to fetch its fundamental data from the SEC and save it to the database.</p>
            <div className="flex items-center space-x-2">
                <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="E.g., AAPL"
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                />
                <button
                    onClick={handleImport}
                    disabled={isLoading}
                    className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                >
                    {isLoading ? 'Importing...' : 'Start Import'}
                </button>
            </div>

            {output && (
                <div className="mt-4 p-3 bg-gray-800 text-white font-mono text-sm rounded-md overflow-x-auto h-64">
                    <pre>{output}</pre>
                </div>
            )}
        </div>
    );
};

export default SecImporter;
