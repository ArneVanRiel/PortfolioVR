import React, { useEffect } from 'react';

export default function MicrosoftCallback() {
    useEffect(() => {
        // Extraheer het token uit de URL hash (Microsoft stuurt dit als #access_token=...)
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1)); // Verwijder de '#'
        const accessToken = params.get('access_token');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (accessToken) {
            // Stuur het token terug naar het hoofdvenster dat de popup opende
            window.opener.postMessage(
                { type: 'microsoft-token', token: accessToken },
                window.location.origin
            );
            window.close();
        } else if (error) {
            console.error('Microsoft login fout:', error, errorDescription);
            window.opener.postMessage(
                { type: 'microsoft-error', error, description: errorDescription },
                window.location.origin
            );
            window.close();
        } else {
            // Sluit het venster na een time-out als er niets wordt gevonden
            const timeout = setTimeout(() => {
                window.close();
            }, 3000);
            return () => clearTimeout(timeout);
        }
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-700 font-sans p-6 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mb-4"></div>
            <h2 className="text-lg font-bold">Verbinding maken met Microsoft...</h2>
            <p className="text-sm text-gray-500 mt-1">Dit venster sluit automatisch zodra de koppeling is voltooid.</p>
        </div>
    );
}
