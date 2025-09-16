import React, { useState } from 'react';
import axios from 'axios';

function PortfolioManager() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const updatePortfolioValues = async () => {
        try {
            setLoading(true);
            setMessage('');
            
            const userId = 1; // Pas dit aan op basis van de ingelogde gebruiker
            const response = await axios.post('/api/calculatePortfolioValues', { userId });

            setMessage(response.data.message);
        } catch (error) {
            console.error('Fout bij het updaten van portfolio waarden:', error);
            setMessage('Er is iets misgegaan bij het updaten van portfolio waarden.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button onClick={updatePortfolioValues} disabled={loading}>
                {loading ? 'Bezig met updaten...' : 'Update Portfolio Waarden'}
            </button>
            {message && <p>{message}</p>}
        </div>
    );
}

export default PortfolioManager;
