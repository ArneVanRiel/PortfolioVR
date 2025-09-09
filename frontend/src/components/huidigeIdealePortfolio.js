// DataDisplay.js
import React, { useState, useEffect } from 'react';
import { Pie } from 'react-chartjs-2'
import axios from 'axios';
import FinancialDataTable from './tables/alphaVantageTest';
import TradingViewStrategy from './functions/TradingViewStrategy';
import WatchlistPortfolioTable from './tables/WatchlistPortfolioTable'
import AvailableBalance from './AvailableBalance';
import IdealPortfolioSettingsComponent from './IdealPortfolioSettingsComponent';

function IdealePortfolio() {
  return (
    <>
    <IdealPortfolioSettingsComponent/>
    <WatchlistPortfolioTable/>
    </>
  );
}

export default IdealePortfolio;
