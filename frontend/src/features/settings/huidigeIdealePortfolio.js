// DataDisplay.js
import React, { useState, useEffect } from 'react';
import { Pie } from 'react-chartjs-2'
import axios from 'axios';
import FinancialDataTable from '../../components/tables/alphaVantageTest';
import TradingViewStrategy from '../analysis/TradingViewStrategy';
import WatchlistPortfolioTable from '../dashboard/WatchlistPortfolioTable';
import AvailableBalance from '../dashboard/AvailableBalance';
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
