import React, { useState } from 'react';

function IntrinsicValueCalculator() {
    const [ticker, setTicker] = useState('');
    const [date, setDate] = useState('');
    const [gewenstRendement, setGewenstRendement] = useState('');
    const [intrinsicValue, setIntrinsicValue] = useState(null);
    const [latestDataDate, setLatestDataDate] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setIntrinsicValue(null);
        setLatestDataDate(null);
        setError('');

        try {
            const response = await fetch('http://localhost:5000/calculate-intrinsic-value', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ticker: ticker.toUpperCase(),
                    date: date,
                    gewenstRendement: parseFloat(gewenstRendement)
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setIntrinsicValue(data.intrinsicValue);
                setLatestDataDate(data.latestDataDate);
            } else {
                setError(data.error || 'Er is een onverwachte fout opgetreden.');
            }
        } catch (error) {
            setError('Er is een probleem met de verbinding naar de server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Intrinsieke Waarde Berekenen</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="ticker">Ticker Symbool:</label>
                    <input
                        type="text"
                        id="ticker"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="date">Datum (YYYY-MM-DD):</label>
                    <input
                        type="date"
                        id="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="gewenstRendement">Gewenst Rendement (%):</label>
                    <input
                        type="number"
                        id="gewenstRendement"
                        value={gewenstRendement}
                        onChange={(e) => setGewenstRendement(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? 'Bezig met berekenen...' : 'Bereken Intrinsieke Waarde'}
                </button>
            </form>

            {error && <p style={{ color: 'red' }}>Fout: {error}</p>}
            {intrinsicValue !== null && (
                <div>
                    <h3>Intrinsieke Waarde:</h3>
                    <p>{intrinsicValue}</p>
                    {latestDataDate && <p>Data van: {new Date(latestDataDate).toLocaleDateString()}</p>}
                </div>
            )}
        </div>
    );
}

export default IntrinsicValueCalculator;