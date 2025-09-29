import pandas as pd
import pyodbc
import yfinance as yf
import numpy as np
import checkForMinData2
from datetime import datetime, timedelta

# Database connectiegegevens
server = 'portfoliovr-server.database.windows.net'
database = 'portfoliovr-database'
username = 'portfoliovr-server-admin'
password = 'F0LKYYOYM284LFQ7$'

def connect_db():
    return pyodbc.connect(f'DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={server};DATABASE={database};UID={username};PWD={password}')

def fetch_tickers():
    with connect_db() as cnxn:
        query = "SELECT DISTINCT s.ticker_symbol FROM [dbo].[Stocks] s ORDER BY s.ticker_symbol ASC"
        return pd.read_sql(query, cnxn)['ticker_symbol'].tolist()

def fetch_data_for_ticker(ticker):
    with connect_db() as cnxn:
        query = ("SELECT fd.period_end_date, fp.fp, s.ticker_symbol AS ticker, "
                 "fd.data_type, fd.value "
                 "FROM [dbo].[fundamental_data] fd "
                 "JOIN [dbo].[Stocks] s ON fd.stock_id = s.aandeel_id "
                 "JOIN [dbo].[FiscalPeriods] fp ON fd.fp_id = fp.fp_id "
                 f"WHERE s.ticker_symbol='{ticker}' ORDER BY fd.period_end_date DESC")
        data = pd.read_sql(query, cnxn)
        data['period_end_date'] = pd.to_datetime(data['period_end_date'])
        return data.pivot(index=['period_end_date', 'fp', 'ticker'], columns='data_type', values='value').reset_index()

def calculate_criteria(data):
    """ Bereken selectiecriteria en waardefactoren """
    data['FCF'] = data['NetCashProvidedByUsedInOperatingActivities'] - data['PurchasesOfPropertyAndEquipment']
    data['FCF_groei'] = data['FCF'].pct_change().fillna(0) > 0
    data['ROE'] = (data['NetIncomeLoss'] / data['StockholdersEquity']).fillna(0)
    data['gem_ROE_10Y'] = data['ROE'].rolling(10, min_periods=1).mean() > 0.15
    data['ROE_waardefactor'] = data['ROE'] > 0
    data['LTD_equity'] = (data['Liabilities'] - data['LiabilitiesCurrent']) / data['StockholdersEquity']
    data['LTD_waardefactor'] = data['LTD_equity'] < 0.5
    criteria = ['FCF_groei', 'gem_ROE_10Y', 'ROE_waardefactor', 'LTD_waardefactor']
    data['selectiecriteria'] = data[criteria].sum(axis=1)
    return data

def calculate_intrinsieke_waarde(data, gewenst_rendement=0.15):
    """ Bereken de intrinsieke waarde """
    data['toekomstige_FCF'] = [data['StockholdersEquity'] * (1 + data['FCF_groei']) ** i for i in range(1, 11)]
    data['onderneming_10Y_FCF'] = sum([data['toekomstige_FCF'][i] / (1 + gewenst_rendement) ** (i + 1) for i in range(10)])
    data['intrinsieke_waarde'] = (data['StockholdersEquity'] + data['onderneming_10Y_FCF']) / data['WeightedAverageNumberOfDilutedSharesOutstanding']
    return data

def main():
    tickers = fetch_tickers()
    tickersWithFullData = checkForMinData2.OntbrekendeData()[2]
    results = []
    
    for ticker in tickersWithFullData:
        df = fetch_data_for_ticker(ticker)
        if df.empty:
            continue
        df = calculate_criteria(df)
        df = calculate_intrinsieke_waarde(df)
        df_filtered = df[df['selectiecriteria'] == 5]
        if not df_filtered.empty:
            df_filtered = df_filtered.sort_values(by='period_end_date', ascending=False).head(1)
            results.append(df_filtered)
    
    if results:
        portfolio = pd.concat(results)
        portfolio.to_excel('ideale_portfolio.xlsx', index=False)
        print(portfolio[['period_end_date', 'ticker', 'selectiecriteria', 'intrinsieke_waarde']])
    else:
        print("Geen geschikte tickers gevonden.")

if __name__ == "__main__":
    main()
