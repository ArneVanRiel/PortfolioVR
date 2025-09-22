import React, { useState } from 'react';

const SecImporter = () => {
    const [ticker, setTicker] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [output, setOutput] = useState('');
    const [totalItems, setTotalItems] = useState(0);
    const [processedItems, setProcessedItems] = useState(0);
    const [progress, setProgress] = useState(0);

    const handleImport = async () => {
        if (!ticker) {
            setOutput('Please enter a ticker symbol.');
            return;
        }

        setIsLoading(true);
        setOutput(`Starting import for ${ticker}...
`);
        setTotalItems(0);
        setProcessedItems(0);
        setProgress(0);

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
                const chunk = decoder.decode(value, { stream: true });
                setOutput(prevOutput => prevOutput + chunk);

                // Check for special messages
                if (chunk.startsWith('TOTAL_ITEMS:')) {
                    const total = parseInt(chunk.split(':')[1]);
                    setTotalItems(total);
                } else if (totalItems > 0 && (chunk.startsWith('✅ Inserted:') || chunk.startsWith('🔄 Updated:') || chunk.startsWith('✅ No update needed:'))) {
                    setProcessedItems(prev => {
                        const newProcessed = prev + 1;
                        setProgress(Math.round((newProcessed / totalItems) * 100));
                        return newProcessed;
                    });
                }

                read(); // Continue reading
            };

            read();

        } catch (error) {
            console.error('Failed to import SEC data:', error);
            setOutput(prevOutput => prevOutput + `
--- ERROR ---
${error.message}`);
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

            {isLoading && totalItems > 0 && (
                <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{processedItems} / {totalItems} items processed ({progress}%)</p>
                </div>
            )}

            {output && (
                <div className="mt-4 p-3 bg-gray-800 text-white font-mono text-sm rounded-md overflow-x-auto h-64">
                    <pre>{output}</pre>
                </div>
            )}
        </div>
    );
};

export default SecImporter;