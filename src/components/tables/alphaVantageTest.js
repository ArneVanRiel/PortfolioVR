import React, { useEffect, useState } from 'react';

// API Key voor Alpha Vantage
const API_KEY = 'YWM2OL44X0N1NOXWG';
const SYMBOL = 'CRM';

const FinancialDataTable = () => {
    const [financialData, setFinancialData] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchFinancialData = async () => {
            try {
                // Fetch voor Income Statement
                const incomeResponse = await fetch(
                    `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${SYMBOL}&apikey=${API_KEY}`
                );
                const incomeData = await incomeResponse.json();

                // Fetch voor Balance Sheet
                const balanceResponse = await fetch(
                    `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${SYMBOL}&apikey=${API_KEY}`
                );
                const balanceData = await balanceResponse.json();

                // Combineer en formatteer de data
                const combinedData = mergeFinancialData(incomeData, balanceData);
                setFinancialData(combinedData);
            } catch (err) {
                setError('Fout bij het ophalen van de data.');
                console.error(err);
            }
        };

        fetchFinancialData();
    }, []);

    // Functie om de data van de twee API's te combineren
    const mergeFinancialData = (incomeData, balanceData) => {
        const merged = [];
        const quarterlyIncome = incomeData?.quarterlyReports || [];
        const quarterlyBalance = balanceData?.quarterlyReports || [];

        quarterlyIncome.forEach((incomeReport, index) => {
            const balanceReport = quarterlyBalance[index] || {};

            merged.push({
                period: incomeReport.fiscalDateEnding,
                currentAssets: balanceReport.currentAssets || 'N/A',
                totalAssets: balanceReport.totalAssets || 'N/A',
                currentLiabilities: balanceReport.currentLiabilities || 'N/A',
                totalLiabilities: balanceReport.totalLiabilities || 'N/A',
                stockholdersEquity: balanceReport.totalShareholderEquity || 'N/A',
                netIncome: incomeReport.netIncome || 'N/A',
                netCashOperating: incomeReport.netCashProvidedByOperatingActivities || 'N/A',
                purchasesOfProperty: incomeReport.capitalExpenditures || 'N/A',
                revenue: incomeReport.totalRevenue || 'N/A',
                dilutedShares: incomeReport.commonStockSharesOutstanding || 'N/A',
            });
        });

        return merged;
    };

    return (
        <div>
            <h2>Financiële Data voor {SYMBOL}</h2>
            {error && <p>{error}</p>}
            <table border="1" cellPadding="10" style={{ margin: '20px auto', borderCollapse: 'collapse', textAlign: 'center' }}>
                <thead>
                    <tr>
                        <th>Periode</th>
                        <th>Current Assets</th>
                        <th>Total Assets</th>
                        <th>Current Liabilities</th>
                        <th>Total Liabilities</th>
                        <th>Stockholder Equity</th>
                        <th>Net Income</th>
                        <th>Net Cash Operating</th>
                        <th>Purchases of Property</th>
                        <th>Revenue</th>
                        <th>Avg. Diluted Shares</th>
                    </tr>
                </thead>
                <tbody>
                    {financialData.length > 0 ? (
                        financialData.map((row, index) => (
                            <tr key={index}>
                                <td>{row.period}</td>
                                <td>{row.currentAssets}</td>
                                <td>{row.totalAssets}</td>
                                <td>{row.currentLiabilities}</td>
                                <td>{row.totalLiabilities}</td>
                                <td>{row.stockholdersEquity}</td>
                                <td>{row.netIncome}</td>
                                <td>{row.netCashOperating}</td>
                                <td>{row.purchasesOfProperty}</td>
                                <td>{row.revenue}</td>
                                <td>{row.dilutedShares}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="11">Bezig met laden...</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default FinancialDataTable;
