import React, { useState, useEffect } from "react";
import axios from "axios";
import AddAvailableCash from "../settings/addAvailableCash";
import AddTransaction from "../portfolio/AddTransaction";
import TransactionTable from "../portfolio/TransactionTable";
import TransactionForm from "../portfolio/TransactionForm";
import TransactionChart from "../portfolio/charts/transactionchart";
import UserCash from "../settings/userCash";
import UpdateTotalQuantityButton from "../portfolio/UpdateTotalQuantityButton";
import UpdatePortfolioValueButton from "../portfolio/UpdatePortfolioValueButton";


function TransactiesTab() {
    const [transactions, setTransactions] = useState([]);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const userID = 1; // Voorbeeld userID (voorlopig op mezelf)


    // Paginatie instellingen
    const [currentPage, setCurrentPage] = useState(1);
    const transactionsPerPage = 10;

    const [selectedFilter, setSelectedFilter] = useState('All');
    const [stockSymbolFilter, setStockSymbolFilter] = useState('');

    const handleFilterClick = (period) => {
        setSelectedFilter(period);
        fetchTransactions(period);  // Roep fetchTransactions aan met het geselecteerde filter
    };

    const fetchTransactions = async (period = "All", stockSymbol = '') => {
        try {
            const response = await axios.get(`/api/transactions?period=${period}&stockSymbol=${stockSymbol}`);
            setTransactions(response.data);
        } catch (error) {
            console.error('Fout bij het ophalen van transacties:', error);
        }
    };
    

        // Automatisch transacties ophalen wanneer de component laadt
        useEffect(() => {
            fetchTransactions(selectedFilter, stockSymbolFilter);
        }, [selectedFilter, stockSymbolFilter]); 
        

    // Bereken de huidige transacties voor de geselecteerde pagina
    const indexOfLastTransaction = currentPage * transactionsPerPage;
    const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
    const currentTransactions = transactions.slice(indexOfFirstTransaction, indexOfLastTransaction);

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
    };

    // Bereken het totale aantal pagina's
    const totalPages = Math.ceil(transactions.length / transactionsPerPage);
    

    const clearEditing = () => {
        setEditingTransaction(null);
    };

    return (
        <div className="content">
            <div className='row'>
                <div className="col-12">
                    <div className="content-block">
                        <div className="toolbar">
                            <button id="openEnterTradeModal" className="button">Enter trade</button>
                            <p>sinds:</p>
                            <input className="input-field-toolbar" value={"datum"}></input>
                            {['1M', '3M', '6M', '1Y', '2Y', '5Y', 'All'].map((period) => (
                                <button
                                    key={period}
                                    className={`filter-button ${selectedFilter === period ? 'active' : ''}`}
                                    onClick={() => handleFilterClick(period)}
                                >
                                    {period}
                                </button>
                            ))}
                            <input 
                                className="input-field-toolbar" 
                                placeholder="Filter op stocksymbol"
                                value={stockSymbolFilter}
                                onChange={(e) => setStockSymbolFilter(e.target.value)}
                            />
                        </div>
                        <TransactionTable transactions={currentTransactions} fetchTransactions={fetchTransactions} />
                        {/* Paginatieknoppen */}
                        <div className="pagination">
                            {Array.from({ length: totalPages }, (_, index) => (
                                <button 
                                    key={index + 1} 
                                    onClick={() => handlePageChange(index + 1)} 
                                    className={currentPage === index + 1 ? "active" : ""}
                                >
                                    {index + 1}
                                </button>
                            ))}
                        </div>
                        <UpdateTotalQuantityButton fetchTransactions={fetchTransactions}/>
                        <TransactionChart transactions={transactions} selectedFilter={selectedFilter} stockSymbolFilter={stockSymbolFilter} />

                        <p>grafiek met de transacties, groene balk voor een buy, rode balk voor een sell, een lijn voor de totale waardes</p>
                        <TransactionForm fetchTransactions={fetchTransactions} editingTransaction={editingTransaction} clearEditing={clearEditing} />
                    </div>
                </div>
                {/*<AddTransaction/>*/}
            </div> 
        </div>
    )
}

export default TransactiesTab;
