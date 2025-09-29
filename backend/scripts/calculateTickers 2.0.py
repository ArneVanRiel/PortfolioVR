


#BEREKENINGEN
def aandelen_berekeningen():

    from flask import Flask, render_template, request, flash, current_app
    import pandas as pd, pyodbc    
    import yfinance as yf
    import numpy as np
    import checkForMinData2


    from datetime import datetime, date
    import datetime 

    import pyodbc

    server = 'portfoliovr-server.database.windows.net'
    database = 'portfoliovr-database'	
    username = 'portfoliovr-server-admin'
    password = 'F0LKYYOYM284LFQ7$'

    imput_gewenst_rendement = 0.15
    today = pd.to_datetime('today')
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    #cursor = cnxn.cursor()
    #cursor.execute("SELECT DISTINCT ticker FROM aandelen_data")
    query1 = "SELECT DISTINCT ticker FROM aandelen_data_ ORDER BY ticker ASC"
    tickers = pd.read_sql(query1, cnxn)['ticker'].tolist()
    print('tickers die in database zitten:' + str(tickers))
    #OF

    tickersWithFullData = checkForMinData2.OntbrekendeData()[2]
    print('tickers die volledig zijn: ' + str(tickersWithFullData))

    cnxn.commit()
    cnxn.close()

    data = []

    for item in tickersWithFullData:
        cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
        query = "SELECT period_start_date, period_end_date, fy, fp, form, ticker, LiabilitiesCurrent, Liabilities, StockholdersEquity, NetIncomeLoss, NetCashProvidedByUsedInOperatingActivities, PurchasesOfPropertyAndEquipment, WeightedAverageNumberOfDilutedSharesOutstanding FROM aandelen_data_ WHERE ticker='"+item+"' ORDER BY period_end_date DESC"
        # query = "SELECT * FROM aandelen_data_ WHERE ticker='"+item+"' ORDER BY period_end_date DESC"
        aandelen_data = pd.read_sql(query, cnxn)
        cnxn.commit()
        cnxn.close()
        aandelen_data['period_end_date'] = pd.to_datetime(aandelen_data['period_end_date'])
        aandelen_data['jaar'] = aandelen_data['period_end_date'].dt.year
        #aandelen_data['period_end_date_1Y'] = aandelen_data['period_end_date'] - pd.DateOffset(years=1) + pd.DateOffset(days=30)
        #aandelen_data['period_end_date_11Y'] = aandelen_data['period_end_date'] - pd.DateOffset(years=11) + pd.DateOffset(days=30)
        #aandelen_data['period_end_date_43periods'] = aandelen_data['period_end_date'].shift(-43)
        #aandelen_data.loc[aandelen_data['period_end_date_11Y'] < aandelen_data['period_end_date_43periods'], 'ontbrekende_kwartalen'] = round(((aandelen_data['period_end_date_11Y'] - aandelen_data['period_end_date_43periods']).dt.days + 60) / (365.25/4), 0)
        #print(aandelen_data[['period_end_date','period_end_date_11Y', 'period_end_date_43periods', 'ontbrekende_kwartalen']])
        #laatst_aangevulde_kwartaal = aandelen_data['period_end_date'][0]
        #last_11_years = laatst_aangevulde_kwartaal + datetime.timedelta(days=(-365*13))
        #print(laatst_aangevulde_kwartaal, aandelen_data['ticker'][0])
        price = yf.download(aandelen_data['ticker'].tolist())['Close']
        price = pd.DataFrame(price, columns=['Close'])
        aandelen_data = aandelen_data.set_index('period_end_date')

        price_merged = aandelen_data.join(price[['Close']].shift(0), how='left')
        price_merged = price_merged.reset_index()
        price_merged['period_end_date -1'] = price_merged['period_end_date'] - datetime.timedelta(days=1)
        price_merged['datum_laatste_dag_kwartaal -1'] = pd.to_datetime(price_merged['period_end_date -1'])
        price_merged = price_merged.set_index('period_end_date -1')
        price_merged = price_merged.join(price[['Close']], how='left', rsuffix=' -1')
        price_merged['period_end_date -2'] = price_merged['period_end_date'] - datetime.timedelta(days=2)
        price_merged = price_merged.set_index('period_end_date -2')
        price_merged = price_merged.join(price[['Close']], how='left', rsuffix=' -2')
        price_merged['period_end_date -3'] = price_merged['period_end_date'] - datetime.timedelta(days=3)
        price_merged = price_merged.set_index('period_end_date -3')
        price_merged = price_merged.join(price[['Close']], how='left', rsuffix=' -3')
        price_merged['period_end_date -4'] = price_merged['period_end_date'] - datetime.timedelta(days=4)
        price_merged = price_merged.set_index('period_end_date -4')
        price_merged = price_merged.join(price[['Close']], how='left', rsuffix=' -4')
        price_merged['Close'].fillna(0)
        price_merged.loc[np.isnan(price_merged["Close"]), 'Close'] = price_merged['Close -1']
        price_merged.loc[np.isnan(price_merged["Close"]), 'Close'] = price_merged['Close -2']
        price_merged.loc[np.isnan(price_merged["Close"]), 'Close'] = price_merged['Close -3']
        
        price_merged['gemiddelde_prijs/Q'] = (price_merged['Close'] + price_merged['Close'].shift(-1))/2

        price_merged = price_merged.set_index('period_end_date')
        aandelen_data['gemiddelde_prijs/Q'] = price_merged['gemiddelde_prijs/Q']
        aandelen_data = aandelen_data.reset_index()
        #aandelen_data = aandelen_data[(aandelen_data['datum laatste dag kwartaal'] > last_11_years) & (aandelen_data['datum laatste dag kwartaal'] <= laatst_aangevulde_kwartaal)]
        
        aandelen_data['period_end_date_1Q'] = aandelen_data['period_end_date'] - pd.DateOffset(months=6) + pd.DateOffset(days=30)
        aandelen_data['period_end_date_1Y'] = aandelen_data['period_end_date'] - pd.DateOffset(years=1) + pd.DateOffset(days=30)



        # BEREKENINGEN FCF  -- 
        aandelen_data['FCF(3m,6m,9m,12m)'] = aandelen_data['NetCashProvidedByUsedInOperatingActivities'] - aandelen_data['PurchasesOfPropertyAndEquipment']
        aandelen_data.loc[(aandelen_data['fp'] != 'Q1') | (aandelen_data['fp'] != 'HY1'), 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']  - aandelen_data['FCF(3m,6m,9m,12m)'].shift(-1)
        aandelen_data.loc[aandelen_data['fp'] == 'HY1', 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']
        aandelen_data.loc[aandelen_data['fp'] == 'Q1', 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']

        #aandelen_data.loc[aandelen_data['fp'] - aandelen_data['fp'].shift(-1) != 1, 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']
        #aandelen_data.loc[aandelen_data['fp'] - aandelen_data['fp'].shift(-1) != 2, 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']
        #aandelen_data.loc[aandelen_data['fp'] - aandelen_data['fp'].shift(-1) == 1, 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)'] - aandelen_data['FCF(3m,6m,9m,12m)'].shift(-1)
        #aandelen_data.loc[aandelen_data['fp'] - aandelen_data['fp'].shift(-1) == 2, 'FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)'] - aandelen_data['FCF(3m,6m,9m,12m)'].shift(-1)
        """if aandelen_data['fp'] == 1 and aandelen_data['fp'].shift(-1) == 4:
            aandelen_data['FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']
        elif aandelen_data['fp'] == 2 and aandelen_data['fp'].shift(-1) == 4:
            aandelen_data['FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)']
        else:
            aandelen_data['FCF/q'] = aandelen_data['FCF(3m,6m,9m,12m)'] - aandelen_data['FCF(3m,6m,9m,12m)'].shift(-1)
        """
        
        aandelen_data.loc[aandelen_data['fp'].isin(['Q1','Q2' ,'Q3','FY']), 'FCF/yr'] = aandelen_data['FCF/q'] + aandelen_data['FCF/q'].shift(-1) + aandelen_data['FCF/q'].shift(-2) + aandelen_data['FCF/q'].shift(-3)
        aandelen_data.loc[aandelen_data['fp'].isin(['HY1', 'HY2']), 'FCF/yr'] = aandelen_data['FCF/q'] + aandelen_data['FCF/q'].shift(-1) 
        
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            shift_yr = 4
        else:
            shift_yr = 2

        #aandelen_data.loc[aandelen_data['fp'].isin(['Q1','Q2' ,'Q3','FY']), 'shift/yr'] = 4
        #aandelen_data.loc[aandelen_data['fp'].isin(['HY1', 'HY2']), 'shift/yr'] = 2
        #print(aandelen_data[['FCF/q']]  )
        
        #print(aandelen_data[['FCF/yr']]  )


        aandelen_data_FCF = aandelen_data[['FCF/yr']].copy()

        aandelen_data_FCF['gemiddelde stijging FCF/Y -1Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-1)) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -2Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-2))**(1/2) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -3Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-3))**(1/3) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -4Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-4))**(1/4) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -5Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-5))**(1/5) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -6Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-6))**(1/6) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -7Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-7))**(1/7) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -8Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-8))**(1/8) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -9Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-9))**(1/9) -1
        aandelen_data_FCF['gemiddelde stijging FCF/Y -10Y'] = (aandelen_data_FCF['FCF/yr'] / aandelen_data_FCF['FCF/yr'].shift(shift_yr*-10))**(1/10) -1
        aandelen_data_FCF.drop(aandelen_data_FCF.columns[[0]], axis=1, inplace=True) 
        #print(aandelen_data_FCF.columns)
        #print(aandelen_data_FCF.values)
        
        #print(aandelen_data_FCF)

        #aandelen_data_FCF[['stijging -1Y, -1', 'stijging -2Y, -1', 'stijging -3Y, -1', 'stijging -4Y, -1', 'stijging -5Y, -1', 'stijging -6Y, -1', 'stijging -7Y, -1', 'stijging -8Y, -1', 'stijging -9Y, -1', 'stijging -10Y, -1']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y', 'gemiddelde stijging FCF/Y -10Y']].shift(-1).copy()
        #print(aandelen_data_FCF)
        aa = [aandelen_data_FCF['gemiddelde stijging FCF/Y -1Y'].shift(-i).rename(f'stijging -1Y, -{i}') for i in range(1, 40)]
        bb = [aandelen_data_FCF['gemiddelde stijging FCF/Y -2Y'].shift(-i).rename(f'stijging -2Y, -{i}') for i in range(1, 36)]
        cc = [aandelen_data_FCF['gemiddelde stijging FCF/Y -3Y'].shift(-i).rename(f'stijging -3Y, -{i}') for i in range(1, 32)]
        dd = [aandelen_data_FCF['gemiddelde stijging FCF/Y -4Y'].shift(-i).rename(f'stijging -4Y, -{i}') for i in range(1, 28)]
        ee = [aandelen_data_FCF['gemiddelde stijging FCF/Y -5Y'].shift(-i).rename(f'stijging -5Y, -{i}') for i in range(1, 24)]
        ff = [aandelen_data_FCF['gemiddelde stijging FCF/Y -6Y'].shift(-i).rename(f'stijging -6Y, -{i}') for i in range(1, 20)]
        gg = [aandelen_data_FCF['gemiddelde stijging FCF/Y -7Y'].shift(-i).rename(f'stijging -7Y, -{i}') for i in range(1, 16)]
        hh = [aandelen_data_FCF['gemiddelde stijging FCF/Y -8Y'].shift(-i).rename(f'stijging -8Y, -{i}') for i in range(1, 12)]
        ii = [aandelen_data_FCF['gemiddelde stijging FCF/Y -9Y'].shift(-i).rename(f'stijging -9Y, -{i}') for i in range(1, 8)]
        jj = [aandelen_data_FCF['gemiddelde stijging FCF/Y -10Y'].shift(-i).rename(f'stijging -10Y, -{i}') for i in range(1, 4)]

        aandelen_data_FCF = pd.concat([*aa, *bb, *cc, *dd, *ee, *ff, *gg, *hh, *ii, *jj], axis=1)
        #print(aandelen_data_FCF)
        """aandelen_data_FCF[['stijging -1Y, -2', 'stijging -2Y, -2', 'stijging -3Y, -2', 'stijging -4Y, -2', 'stijging -5Y, -2', 'stijging -6Y, -2', 'stijging -7Y, -2', 'stijging -8Y, -2', 'stijging -9Y, -2', 'stijging -10Y, -2']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y', 'gemiddelde stijging FCF/Y -10Y']].shift(-2).copy()
        aandelen_data_FCF[['stijging -1Y, -3', 'stijging -2Y, -3', 'stijging -3Y, -3', 'stijging -4Y, -3', 'stijging -5Y, -3', 'stijging -6Y, -3', 'stijging -7Y, -3', 'stijging -8Y, -3', 'stijging -9Y, -3', 'stijging -10Y, -3']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y', 'gemiddelde stijging FCF/Y -10Y']].shift(-3).copy()
        aandelen_data_FCF[['stijging -1Y, -4', 'stijging -2Y, -4', 'stijging -3Y, -4', 'stijging -4Y, -4', 'stijging -5Y, -4', 'stijging -6Y, -4', 'stijging -7Y, -4', 'stijging -8Y, -4', 'stijging -9Y, -4', 'stijging -10Y, -4']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y', 'gemiddelde stijging FCF/Y -10Y']].shift(-4).copy()
        aandelen_data_FCF[['stijging -1Y, -5', 'stijging -2Y, -5', 'stijging -3Y, -5', 'stijging -4Y, -5', 'stijging -5Y, -5', 'stijging -6Y, -5', 'stijging -7Y, -5', 'stijging -8Y, -5', 'stijging -9Y, -5']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y']].shift(-5).copy()
        aandelen_data_FCF[['stijging -1Y, -6', 'stijging -2Y, -6', 'stijging -3Y, -6', 'stijging -4Y, -6', 'stijging -5Y, -6', 'stijging -6Y, -6', 'stijging -7Y, -6', 'stijging -8Y, -6', 'stijging -9Y, -6']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y']].shift(-6).copy()
        aandelen_data_FCF[['stijging -1Y, -7', 'stijging -2Y, -7', 'stijging -3Y, -7', 'stijging -4Y, -7', 'stijging -5Y, -7', 'stijging -6Y, -7', 'stijging -7Y, -7', 'stijging -8Y, -7', 'stijging -9Y, -7']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y']].shift(-7).copy()
        aandelen_data_FCF[['stijging -1Y, -8', 'stijging -2Y, -8', 'stijging -3Y, -8', 'stijging -4Y, -8', 'stijging -5Y, -8', 'stijging -6Y, -8', 'stijging -7Y, -8', 'stijging -8Y, -8', 'stijging -9Y, -8']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y', 'gemiddelde stijging FCF/Y -9Y']].shift(-8).copy()
        aandelen_data_FCF[['stijging -1Y, -9', 'stijging -2Y, -9', 'stijging -3Y, -9', 'stijging -4Y, -9', 'stijging -5Y, -9', 'stijging -6Y, -9', 'stijging -7Y, -9', 'stijging -8Y, -9']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y']].shift(-9).copy()
        aandelen_data_FCF[['stijging -1Y, -10', 'stijging -2Y, -10', 'stijging -3Y, -10', 'stijging -4Y, -10', 'stijging -5Y, -10', 'stijging -6Y, -10', 'stijging -7Y, -10', 'stijging -8Y, -10']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y']].shift(-10).copy()
        aandelen_data_FCF[['stijging -1Y, -11', 'stijging -2Y, -11', 'stijging -3Y, -11', 'stijging -4Y, -11', 'stijging -5Y, -11', 'stijging -6Y, -11', 'stijging -7Y, -11', 'stijging -8Y, -11']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y']].shift(-11).copy()
        aandelen_data_FCF[['stijging -1Y, -12', 'stijging -2Y, -12', 'stijging -3Y, -12', 'stijging -4Y, -12', 'stijging -5Y, -12', 'stijging -6Y, -12', 'stijging -7Y, -12', 'stijging -8Y, -12']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y', 'gemiddelde stijging FCF/Y -8Y']].shift(-12).copy()
        aandelen_data_FCF[['stijging -1Y, -13', 'stijging -2Y, -13', 'stijging -3Y, -13', 'stijging -4Y, -13', 'stijging -5Y, -13', 'stijging -6Y, -13', 'stijging -7Y, -13']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y']].shift(-13).copy()
        aandelen_data_FCF[['stijging -1Y, -14', 'stijging -2Y, -14', 'stijging -3Y, -14', 'stijging -4Y, -14', 'stijging -5Y, -14', 'stijging -6Y, -14', 'stijging -7Y, -14']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y']].shift(-14).copy()
        aandelen_data_FCF[['stijging -1Y, -15', 'stijging -2Y, -15', 'stijging -3Y, -15', 'stijging -4Y, -15', 'stijging -5Y, -15', 'stijging -6Y, -15', 'stijging -7Y, -15']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y']].shift(-15).copy()
        aandelen_data_FCF[['stijging -1Y, -16', 'stijging -2Y, -16', 'stijging -3Y, -16', 'stijging -4Y, -16', 'stijging -5Y, -16', 'stijging -6Y, -16', 'stijging -7Y, -16']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y', 'gemiddelde stijging FCF/Y -7Y']].shift(-16).copy()
        aandelen_data_FCF[['stijging -1Y, -17', 'stijging -2Y, -17', 'stijging -3Y, -17', 'stijging -4Y, -17', 'stijging -5Y, -17', 'stijging -6Y, -17']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y']].shift(-17).copy()
        aandelen_data_FCF[['stijging -1Y, -18', 'stijging -2Y, -18', 'stijging -3Y, -18', 'stijging -4Y, -18', 'stijging -5Y, -18', 'stijging -6Y, -18']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y']].shift(-18).copy()
        aandelen_data_FCF[['stijging -1Y, -19', 'stijging -2Y, -19', 'stijging -3Y, -19', 'stijging -4Y, -19', 'stijging -5Y, -19', 'stijging -6Y, -19']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y']].shift(-19).copy()
        aandelen_data_FCF[['stijging -1Y, -20', 'stijging -2Y, -20', 'stijging -3Y, -20', 'stijging -4Y, -20', 'stijging -5Y, -20', 'stijging -6Y, -20']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y', 'gemiddelde stijging FCF/Y -6Y']].shift(-20).copy()
        aandelen_data_FCF[['stijging -1Y, -21', 'stijging -2Y, -21', 'stijging -3Y, -21', 'stijging -4Y, -21', 'stijging -5Y, -21']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y']].shift(-21).copy()
        aandelen_data_FCF[['stijging -1Y, -22', 'stijging -2Y, -22', 'stijging -3Y, -22', 'stijging -4Y, -22', 'stijging -5Y, -22']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y']].shift(-22).copy()
        aandelen_data_FCF[['stijging -1Y, -23', 'stijging -2Y, -23', 'stijging -3Y, -23', 'stijging -4Y, -23', 'stijging -5Y, -23']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y']].shift(-23).copy()
        aandelen_data_FCF[['stijging -1Y, -24', 'stijging -2Y, -24', 'stijging -3Y, -24', 'stijging -4Y, -24', 'stijging -5Y, -24']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y', 'gemiddelde stijging FCF/Y -5Y']].shift(-24).copy()
        aandelen_data_FCF[['stijging -1Y, -25', 'stijging -2Y, -25', 'stijging -3Y, -25', 'stijging -4Y, -25']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y']].shift(-25).copy()
        aandelen_data_FCF[['stijging -1Y, -26', 'stijging -2Y, -26', 'stijging -3Y, -26', 'stijging -4Y, -26']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y']].shift(-26).copy()
        aandelen_data_FCF[['stijging -1Y, -27', 'stijging -2Y, -27', 'stijging -3Y, -27', 'stijging -4Y, -27']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y']].shift(-27).copy()
        aandelen_data_FCF[['stijging -1Y, -28', 'stijging -2Y, -28', 'stijging -3Y, -28', 'stijging -4Y, -28']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y', 'gemiddelde stijging FCF/Y -4Y']].shift(-28).copy()
        aandelen_data_FCF[['stijging -1Y, -29', 'stijging -2Y, -29', 'stijging -3Y, -29']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y']].shift(-29).copy()
        aandelen_data_FCF[['stijging -1Y, -30', 'stijging -2Y, -30', 'stijging -3Y, -30']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y']].shift(-30).copy()
        aandelen_data_FCF[['stijging -1Y, -31', 'stijging -2Y, -31', 'stijging -3Y, -31']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y']].shift(-31).copy()
        aandelen_data_FCF[['stijging -1Y, -32', 'stijging -2Y, -32', 'stijging -3Y, -32']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y', 'gemiddelde stijging FCF/Y -3Y']].shift(-32).copy()
        aandelen_data_FCF[['stijging -1Y, -33', 'stijging -2Y, -33']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y']].shift(-33).copy()
        aandelen_data_FCF[['stijging -1Y, -34', 'stijging -2Y, -34']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y']].shift(-34).copy()
        aandelen_data_FCF[['stijging -1Y, -35', 'stijging -2Y, -35']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y']].shift(-35).copy()
        aandelen_data_FCF[['stijging -1Y, -36', 'stijging -2Y, -36']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y', 'gemiddelde stijging FCF/Y -2Y']].shift(-36).copy()
        aandelen_data_FCF[['stijging -1Y, -37']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y']].shift(-37).copy()
        aandelen_data_FCF[['stijging -1Y, -38']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y']].shift(-38).copy()
        aandelen_data_FCF[['stijging -1Y, -39']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y']].shift(-39).copy()
        aandelen_data_FCF[['stijging -1Y, -40']] = aandelen_data_FCF[['gemiddelde stijging FCF/Y -1Y']].shift(-40).copy()"""
        aandelen_data_FCF['standaard_deviatie_FCF'] = aandelen_data_FCF.std(axis=1)
        aandelen_data_FCF['gem_groeipercentage_FCF'] = aandelen_data_FCF.mean(axis=1)
        aandelen_data_FCF = aandelen_data_FCF[['standaard_deviatie_FCF', 'gem_groeipercentage_FCF']]

        aandelen_data = aandelen_data.join(aandelen_data_FCF)
        #aandelen_data['waardefactor_FCF'] = aandelen_data['gem_groeipercentage_FCF'] - aandelen_data['standaard_deviatie_FCF']
        aandelen_data['waardefactor_FCF'] = aandelen_data['gem_groeipercentage_FCF'] / (aandelen_data['standaard_deviatie_FCF'] * aandelen_data['standaard_deviatie_FCF'])


        # BEREKENINGEN ROE

        aandelen_data.loc[(aandelen_data['fp'] != 'Q1') | (aandelen_data['fp'] != 'HY1'), 'NetIncomeLoss/Q'] = aandelen_data['NetIncomeLoss'] - aandelen_data['NetIncomeLoss'].shift(-1)
        aandelen_data.loc[aandelen_data['fp'] == 'HY1', 'NetIncomeLoss/Q'] = aandelen_data['NetIncomeLoss']
        aandelen_data.loc[aandelen_data['fp'] == 'Q1', 'NetIncomeLoss/Q'] = aandelen_data['NetIncomeLoss']
        aandelen_data.loc[aandelen_data['fp'].isin(['Q1','Q2' ,'Q3','FY']), 'NetIncomeLoss/voorbije year'] = aandelen_data['NetIncomeLoss/Q'] + aandelen_data['NetIncomeLoss/Q'].shift(-1) + aandelen_data['NetIncomeLoss/Q'].shift(-2) + aandelen_data['NetIncomeLoss/Q'].shift(-3)
        aandelen_data.loc[aandelen_data['fp'].isin(['HY1', 'HY2']), 'NetIncomeLoss/voorbije year'] = aandelen_data['NetIncomeLoss/Q'] + aandelen_data['NetIncomeLoss/Q'].shift(-1)
        aandelen_data['ROE'] = (aandelen_data['NetIncomeLoss/voorbije year'] / aandelen_data['StockholdersEquity']).fillna(0)
        aandelen_data['gemiddelde_stijging_ROE/Q'] = (aandelen_data['ROE'] / aandelen_data['ROE'].shift(-1) -1).fillna(0)
        #print(aandelen_data[['gemiddelde stijging ROE/Q']])
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['standaard_deviatie_ROE'] = aandelen_data['ROE'].rolling(40).std().shift(-39)
            aandelen_data['Gemiddelde_stijging_ROE_10_Y'] = aandelen_data['ROE'].rolling(40).mean().shift(-39)
        else:
            aandelen_data['standaard_deviatie_ROE'] = aandelen_data['gemiddelde_stijging_ROE/Q'].rolling(20).std().shift(-19)
            aandelen_data['Gemiddelde_stijging_ROE_10_Y'] = aandelen_data['ROE'].rolling(20).mean().shift(-19)
        #aandelen_data.loc[aandelen_data['gemiddelde stijging ROE/Q'].shift(40).isna(), 'standaard deviatie ROE'] = 1
        aandelen_data['waardefactor_ROE'] = aandelen_data['Gemiddelde_stijging_ROE_10_Y'] - aandelen_data['standaard_deviatie_ROE']

        #print(aandelen_data[['fp', 'NetIncomeLoss/Q', 'NetIncomeLoss/voorbije year', 'ROE', 'gemiddelde stijging ROE/Q', 'standaard deviatie ROE', 'Gemiddelde stijging ROE 10 Y', 'waardefactor ROE']])

        # BEREKENINGEN LTD/equity
        aandelen_data['non_curr_liabilities'] = aandelen_data['Liabilities'] - aandelen_data['LiabilitiesCurrent']
        aandelen_data.loc[aandelen_data['StockholdersEquity'] == 0, 'StockholdersEquity'] = None
        aandelen_data['LTD_s_equity'] = aandelen_data['non_curr_liabilities'] / aandelen_data['StockholdersEquity']

        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['waardefactor_LTD_equity'] = aandelen_data['LTD_s_equity'].rolling(4).mean().shift(-3)
        else:
            aandelen_data['waardefactor_LTD_equity'] = (0.5/(0.5+aandelen_data['LTD_s_equity'].rolling(2).mean().shift(-1)))/0.5*2*(0.5/(0.5+aandelen_data['LTD_s_equity'].rolling(2).mean().shift(-1)))        
        #print(aandelen_data[['non_curr_liabilities', 'LTD/s_equity', 'waardefactor LTD/equity']])

        # BEREKENINGEN WINSTMARGE
        """aandelen_data.loc[(aandelen_data['fp'] != 'Q1') | (aandelen_data['fp'] != 'HY1'), 'revenue/Q'] = aandelen_data['Revenues'] - aandelen_data['Revenues'].shift(-1)
        aandelen_data.loc[aandelen_data['fp'] == 'HY1', 'revenue/Q'] = aandelen_data['Revenues']
        aandelen_data.loc[aandelen_data['fp'] == 'Q1', 'revenue/Q'] = aandelen_data['Revenues']
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['revenue/voorbije year'] = aandelen_data['revenue/Q'] + aandelen_data['revenue/Q'].shift(-1) + aandelen_data['revenue/Q'].shift(-2) + aandelen_data['revenue/Q'].shift(-3)
        else:
            aandelen_data['revenue/voorbije year'] = aandelen_data['revenue/Q'] + aandelen_data['revenue/Q'].shift(-1)

        aandelen_data['winstmarge'] = (aandelen_data['NetIncomeLoss/voorbije year'] / aandelen_data['revenue/voorbije year']).fillna(0)
        aandelen_data['gemiddelde stijging winstmarge/Q'] = (aandelen_data['winstmarge'] / aandelen_data['winstmarge'].shift(-1) -1).fillna(0)
        aandelen_data.replace([np.inf, -np.inf], 0, inplace=True)
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['standaard_deviatie_winstmarge'] = aandelen_data['gemiddelde stijging winstmarge/Q'].rolling(40).std().shift(-39)
            aandelen_data['Gemiddelde_winstmarge'] = aandelen_data['winstmarge'].rolling(40).mean().shift(-39)
        else:
            aandelen_data['standaard_deviatie_winstmarge'] = aandelen_data['gemiddelde stijging winstmarge/Q'].rolling(20).std().shift(-19)
            aandelen_data['Gemiddelde_winstmarge'] = aandelen_data['winstmarge'].rolling(20).mean().shift(-19)

        aandelen_data['waardefactor_winstmarge'] = 1+aandelen_data['winstmarge']+aandelen_data['Gemiddelde_winstmarge']*(1-aandelen_data['standaard_deviatie_winstmarge'])

        #print(aandelen_data[['revenue/Q', 'revenue/voorbije year', 'winstmarge', 'gemiddelde stijging winstmarge/Q', 'standaard deviatie winstmarge', 'Gemiddelde winstmarge', 'waardefactor winstmarge']])"""

        # BEREKENINGEN DIVIDEND
     

        """if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['dividend voorbije jaar'] = aandelen_data['Dividend'] + aandelen_data['Dividend'].shift(-1) + aandelen_data['Dividend'].shift(-2) + aandelen_data['Dividend'].shift(-3)
        else:
            aandelen_data['dividend voorbije jaar'] = aandelen_data['Dividend'] + aandelen_data['Dividend'].shift(-1)
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['kolom1'] = aandelen_data['dividend voorbije jaar']/ aandelen_data['gemiddelde_prijs/Q']
        else:
            aandelen_data['kolom1'] = aandelen_data['dividend voorbije jaar']/ aandelen_data['gemiddelde_prijs/Q']

        aandelen_data['gemiddelde stijging dividend/Q'] = aandelen_data['dividend voorbije jaar'] / aandelen_data['dividend voorbije jaar'].shift(-1) -1
        aandelen_data['gemiddelde stijging dividend/Q'] = aandelen_data['gemiddelde stijging dividend/Q'].fillna(0)
        aandelen_data.replace([np.inf, -np.inf], 0, inplace=True)
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['Gemiddelde_stijging_dividend_10_Y'] = aandelen_data['gemiddelde stijging dividend/Q'].rolling(40).mean().shift(-39)
            aandelen_data['standaard_deviatie_dividend_10_Y'] = aandelen_data['gemiddelde stijging dividend/Q'].rolling(40).std().shift(-39)
        else:
            aandelen_data['Gemiddelde_stijging_dividend_10_Y'] = aandelen_data['gemiddelde stijging dividend/Q'].rolling(20).mean().shift(-19)
            aandelen_data['standaard_deviatie_dividend_10_Y'] = aandelen_data['gemiddelde stijging dividend/Q'].rolling(20).std().shift(-19)

        aandelen_data['waardefactor_dividend'] = 1+aandelen_data['kolom1']*10+aandelen_data['Gemiddelde_stijging_dividend_10_Y']*(1-aandelen_data['standaard_deviatie_dividend_10_Y']) 
        #+aandelen_data['gemiddelde stijging dividend/Q']*4

        #print(aandelen_data[['kolom1', 'dividend voorbije jaar', 'gemiddelde stijging dividend/Q', 'Gemiddelde stijging dividend 10 Y', 'standaard deviatie dividend 10 Y', 'waardefactor dividend']])"""

        # BEREKENINGEN INTRINSIEKE WAARDE

        #aandelen_data['toekomstige FCF +1Y'] = aandelen_data['StockholdersEquity'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 1
        aandelen_data['toekomstige FCF +1Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 1
        aandelen_data['toekomstige FCF +2Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 2
        aandelen_data['toekomstige FCF +3Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 3
        aandelen_data['toekomstige FCF +4Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 4
        aandelen_data['toekomstige FCF +5Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 5
        aandelen_data['toekomstige FCF +6Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 6
        aandelen_data['toekomstige FCF +7Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 7
        aandelen_data['toekomstige FCF +8Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 8
        aandelen_data['toekomstige FCF +9Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 9
        aandelen_data['toekomstige FCF +10Y'] = aandelen_data['FCF/yr'] * (1+ aandelen_data['gem_groeipercentage_FCF']) ** 10
        aandelen_data['onderneming_10Y_FCF'] = aandelen_data['toekomstige FCF +1Y']/(1 + imput_gewenst_rendement) ** 1 + aandelen_data['toekomstige FCF +2Y']/(1 + imput_gewenst_rendement) ** 2 + aandelen_data['toekomstige FCF +3Y']/(1 + imput_gewenst_rendement) ** 3 + aandelen_data['toekomstige FCF +4Y']/(1 + imput_gewenst_rendement) ** 4 + aandelen_data['toekomstige FCF +5Y']/(1 + imput_gewenst_rendement) ** 5 + aandelen_data['toekomstige FCF +6Y']/(1 + imput_gewenst_rendement) ** 6 + aandelen_data['toekomstige FCF +7Y']/(1 + imput_gewenst_rendement) ** 7 + aandelen_data['toekomstige FCF +8Y']/(1 + imput_gewenst_rendement) ** 8 + aandelen_data['toekomstige FCF +9Y']/(1 + imput_gewenst_rendement) ** 9 + aandelen_data['toekomstige FCF +10Y']/(1 + imput_gewenst_rendement) ** 10
        aandelen_data['terminal_rate'] = aandelen_data['toekomstige FCF +10Y']*(1+0.02)/(0.15-0.02)/(1+0.15) ** 10
        aandelen_data['intrinsieke_waarde'] = (aandelen_data['onderneming_10Y_FCF'] + aandelen_data['terminal_rate']) / aandelen_data['WeightedAverageNumberOfDilutedSharesOutstanding']
        
        #print(aandelen_data[['gem groeipercentage FCF', 'StockholdersEquity', 'toekomstige FCF +1Y', 'toekomstige FCF +2Y', 'toekomstige FCF +3Y', 'toekomstige FCF +4Y', 'toekomstige FCF +5Y', 'toekomstige FCF +6Y', 'toekomstige FCF +7Y', 'toekomstige FCF +8Y', 'toekomstige FCF +9Y', 'toekomstige FCF +10Y', 'onderneming 10Y FCF', 'intrinsieke waarde']])

        # BEREKENINGEN SELECTIECRITERIA

        aandelen_data.loc[aandelen_data['FCF/yr'] > 0, ['FCF/yr_bool']] = True
        aandelen_data.loc[aandelen_data['FCF/yr'] <= 0, ['FCF/yr_bool']] = False
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['FCF/yr_bool'] = aandelen_data['FCF/yr_bool'].rolling(40).sum().shift(-39)
            aandelen_data.loc[aandelen_data['FCF/yr_bool'] == 40, ['alle FCF (jaar) >0']] = True
            aandelen_data.loc[aandelen_data['FCF/yr_bool'] != 40, ['alle FCF (jaar) >0']] = False
        else:
            aandelen_data['FCF/yr_bool'] = aandelen_data['FCF/yr_bool'].rolling(20).sum().shift(-19)
            aandelen_data.loc[aandelen_data['FCF/yr_bool'] == 20, ['alle FCF (jaar) >0']] = True
            aandelen_data.loc[aandelen_data['FCF/yr_bool'] != 20, ['alle FCF (jaar) >0']] = False


        aandelen_data.loc[aandelen_data['standaard_deviatie_FCF'] <= 0.25, ['FCF sddev <0,25']] = True
        aandelen_data.loc[aandelen_data['standaard_deviatie_FCF'] > 0.25, ['FCF sddev <0,25']] = False

        aandelen_data.loc[aandelen_data['gem_groeipercentage_FCF'] > 0, ['FCF gemiddelde groei >0']] = True
        aandelen_data.loc[aandelen_data['gem_groeipercentage_FCF'] <= 0, ['FCF gemiddelde groei >0']] = False

        aandelen_data.loc[aandelen_data['waardefactor_FCF'] > 0, ['FCF waardefactor >0']] = True
        aandelen_data.loc[aandelen_data['waardefactor_FCF'] <= 0, ['FCF waardefactor >0']] = False

        aandelen_data.loc[aandelen_data['ROE'] > 0, ['ROE_bool']] = True
        aandelen_data.loc[aandelen_data['ROE'] <= 0, ['ROE_bool']] = False
        if aandelen_data['fp'][0] == 'Q1' or aandelen_data['fp'][0] == 'Q2' or aandelen_data['fp'][0] == 'Q3' or aandelen_data['fp'][0] == 'FY' :
            aandelen_data['ROE_bool'] = aandelen_data['ROE_bool'].rolling(40).sum().shift(-39)
            aandelen_data.loc[aandelen_data['ROE_bool'] == 40, ['alle ROE >0']] = True
            aandelen_data.loc[aandelen_data['ROE_bool'] != 40, ['alle ROE >0']] = False
        else:
            aandelen_data['ROE_bool'] = aandelen_data['ROE_bool'].rolling(20).sum().shift(-19)
            aandelen_data.loc[aandelen_data['ROE_bool'] == 20, ['alle ROE >0']] = True
            aandelen_data.loc[aandelen_data['ROE_bool'] != 20, ['alle ROE >0']] = False

        aandelen_data.loc[aandelen_data['Gemiddelde_stijging_ROE_10_Y'] >= 0.15, ['gem ROE (10Y) >15']] = True
        aandelen_data.loc[aandelen_data['Gemiddelde_stijging_ROE_10_Y'] < 0.15, ['gem ROE (10Y) >15']] = False

        aandelen_data.loc[aandelen_data['standaard_deviatie_ROE'] <= 0.25, ['ROE sddev <0,25']] = True
        aandelen_data.loc[aandelen_data['standaard_deviatie_ROE'] > 0.25, ['ROE sddev <0,25']] = False

        aandelen_data.loc[aandelen_data['waardefactor_ROE'] > 0, ['ROE waardefactor >0']] = True
        aandelen_data.loc[aandelen_data['waardefactor_ROE'] <= 0, ['ROE waardefactor >0']] = False

        aandelen_data.loc[aandelen_data['waardefactor_LTD_equity'] <= 1, ['LTD waardefactor <0.5']] = True
        aandelen_data.loc[aandelen_data['waardefactor_LTD_equity'] > 1, ['LTD waardefactor <0.5']] = False

        selectiecriteria = aandelen_data[['alle FCF (jaar) >0', 'FCF gemiddelde groei >0', 'gem ROE (10Y) >15','ROE waardefactor >0', 'LTD waardefactor <0.5']].dropna()
        aandelen_data['selectiecriteria'] = selectiecriteria.sum(axis=1)
        #print(selectiecriteria.sum(axis=1))
        #print(aandelen_data[['alle FCF (jaar) >0', 'FCF sddev <0,25', 'FCF gemiddelde groei >0', 'FCF waardefactor >0', 'alle ROE >0', 'gem ROE (10Y) >15', 'ROE sddev <0,25','ROE waardefactor >0']])

        #Optie 1
        #aandelen_data['waarde_verdeling'] = 1 * aandelen_data['waardefactor_FCF'] * (1+aandelen_data['waardefactor_ROE']) * (1+(1-aandelen_data['waardefactor_LTD_equity']))
        #Optie 2
        aandelen_data['waarde_verdeling'] = 1 * aandelen_data['waardefactor_FCF'] * (1+aandelen_data['waardefactor_ROE']) * (-2*aandelen_data['waardefactor_LTD_equity']+2)
        aandelen_data['waarde_verdeling-1'] = aandelen_data['waarde_verdeling'].shift(-1)
        #print(list(aandelen_data.columns))
        aandelen_data['koopmarge'] = aandelen_data['gemiddelde_prijs/Q'] / aandelen_data['intrinsieke_waarde'] - 1
        #print(aandelen_data[['period_end_date', 'ticker', 'selectiecriteria','waarde_verdeling1', 'waarde_verdeling' , 'gemiddelde_prijs/Q','intrinsieke_waarde', 'koopmarge']][0:42])

        aandelen_data.loc[aandelen_data['period_end_date'].shift(-43) > aandelen_data['period_end_date'] - pd.DateOffset(years=11) + pd.DateOffset(days=30), 'ontbrekende_data'] = (44 - aandelen_data['StockholdersEquity'].rolling(44).count().shift(-43)) + (44 - aandelen_data['NetIncomeLoss'].rolling(44).count().shift(-43)) + (44 - aandelen_data['NetCashProvidedByUsedInOperatingActivities'].rolling(44).count().shift(-43)) + (44 - aandelen_data['PurchasesOfPropertyAndEquipment'].rolling(44).count().shift(-43)) + (4 - aandelen_data['LiabilitiesCurrent'].rolling(4).count().shift(-3)) + (4 - aandelen_data['Liabilities'].rolling(4).count().shift(-3)) + (4 - aandelen_data['WeightedAverageNumberOfDilutedSharesOutstanding'].rolling(4).count().shift(-3))
        aandelen_data = aandelen_data[aandelen_data['ontbrekende_data'] == 0]
        #aandelen_data.drop(['AssetsCurrent', 'Assets', 'NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInFinancingActivities'], axis=1, inplace=True)
        #aandelen_data = aandelen_data.dropna()
        aandelen_data['period_end_date'] = aandelen_data['period_end_date'].dt.strftime('%Y-%m-%d')
        # Eerst sorteren op 'ticker' en 'period_end_date' om ervoor te zorgen dat de nieuwste data bovenaan staat
        aandelen_data = aandelen_data.sort_values(by=['ticker', 'period_end_date'], ascending=[True, False])

        laatste_waardes = aandelen_data[['period_end_date', 'ticker','gem_groeipercentage_FCF', 'standaard_deviatie_FCF','waardefactor_FCF', 'Gemiddelde_stijging_ROE_10_Y','standaard_deviatie_ROE','waardefactor_ROE', 'waardefactor_LTD_equity', 'selectiecriteria','intrinsieke_waarde', 'waarde_verdeling', "waarde_verdeling-1", 'koopmarge']].groupby('ticker').first().reset_index()
        print(laatste_waardes)
        #print(aandelen_data[['period_end_date', 'ticker','waardefactor_FCF', 'Gemiddelde_stijging_ROE_10_Y','standaard_deviatie_ROE','waardefactor_ROE', 'waardefactor_LTD_equity', 'waarde_verdeling']])
        # Converteer de DataFrame naar een lijst van lijsten
        laatste_waardes = laatste_waardes.values.tolist()

        # Voeg elk aandeel toe aan de resultatenlijst
        data.extend(laatste_waardes)
        """ticker = aandelen_data['ticker']
        period_end_date = aandelen_data['period_end_date']
        period_end_date = period_end_date.tolist()
        print(period_end_date)"""

        
        """for index, row in aandelen_data.iterrows():
            print(type(row))
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            print("DATAFRAME")
            print(len(aandelen_data_row))
            print(aandelen_data_row)
            period_end_date = aandelen_data_row.iloc[0]['period_end_date']
            print(period_end_date)
            ticker = aandelen_data_row.iloc[0]['ticker']

            print(ticker)
            
            cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
            cursor = cnxn.cursor()
            #query = "SELECT ticker, period_end_date FROM aandelen_data_calc WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'"
            #cursor.execute("SELECT ticker, period_end_date FROM aandelen_data_calc WHERE ticker = ? AND period_end_date = ?", (ticker, period_end_date) )
            cursor.execute("SELECT ticker, period_end_date FROM aandelen_data_calc_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursor.fetchall()
            print(entry)
            cnxn.commit()
            cnxn.close()
            if len(entry) ==0:

                cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
                cursor = cnxn.cursor()
                cursor.execute("INSERT INTO aandelen_data_calc_ VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['standaard_deviatie_FCF'], row['gem_groeipercentage_FCF'], row['waardefactor_FCF'], row['standaard_deviatie_ROE'], row['Gemiddelde_stijging_ROE_10_Y'], row['waardefactor_ROE'], row['non_curr_liabilities'], row['LTD_s_equity'], row['waardefactor_LTD_equity'], row['standaard_deviatie_winstmarge'], row['Gemiddelde_winstmarge'], row['waardefactor_winstmarge'], row['Gemiddelde_stijging_dividend_10_Y'], row['standaard_deviatie_dividend_10_Y'], row['waardefactor_dividend'], row['intrinsieke_waarde'], row['selectiecriteria'], row['waarde_verdeling1'], row['waarde_verdeling_tov_min1'], row['waarde_verdeling_stdev'], row['waarde_verdeling_mean'], row['waarde_verdeling']))
                
                cnxn.commit()
                cnxn.close()
                print('data succesvol toegevoegd')
                #message = 'data succesvol toegevoegd'
            else:
                print ('Data zit al in database')

                #UPDATE TOEVOEGEN
                cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
                cursor = cnxn.cursor()
                cursor.execute("INSERT INTO aandelen_data_calc_ VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['standaard_deviatie_FCF'], row['gem_groeipercentage_FCF'], row['waardefactor_FCF'], row['standaard_deviatie_ROE'], row['Gemiddelde_stijging_ROE_10_Y'], row['waardefactor_ROE'], row['non_curr_liabilities'], row['LTD_s_equity'], row['waardefactor_LTD_equity'], row['standaard_deviatie_winstmarge'], row['Gemiddelde_winstmarge'], row['waardefactor_winstmarge'], row['Gemiddelde_stijging_dividend_10_Y'], row['standaard_deviatie_dividend_10_Y'], row['waardefactor_dividend'], row['intrinsieke_waarde'], row['selectiecriteria'], row['waarde_verdeling1'], row['waarde_verdeling_tov_min1'], row['waarde_verdeling_stdev'], row['waarde_verdeling_mean'], row['waarde_verdeling']))
                
                cnxn.commit()
                cnxn.close()

                query = "UPDATE aandelen_data_calc_ SET Revenues = ? WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'"
                cursor.execute("UPDATE aandelen_data_calc_ SET (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['standaard_deviatie_FCF'], row['gem_groeipercentage_FCF'], row['waardefactor_FCF'], row['standaard_deviatie_ROE'], row['Gemiddelde_stijging_ROE_10_Y'], row['waardefactor_ROE'], row['non_curr_liabilities'], row['LTD_s_equity'], row['waardefactor_LTD_equity'], row['standaard_deviatie_winstmarge'], row['Gemiddelde_winstmarge'], row['waardefactor_winstmarge'], row['Gemiddelde_stijging_dividend_10_Y'], row['standaard_deviatie_dividend_10_Y'], row['waardefactor_dividend'], row['intrinsieke_waarde'], row['selectiecriteria'], row['waarde_verdeling1'], row['waarde_verdeling_tov_min1'], row['waarde_verdeling_stdev'], row['waarde_verdeling_mean'], row['waarde_verdeling']))

                cursor.execute(query, Revenues)
                cnxn.commit() """    
                #message = 'data is al toegevoegd'
        #print('done')"""


        #aandelen_data.to_sql('aandelen_data_calc', cnxn, if_exists='replace')
    ideale_portfolio = pd.DataFrame(data, columns=['period_end_date', 'ticker','gem_groeipercentage_FCF', 'standaard_deviatie_FCF','waardefactor_FCF', 'Gemiddelde_stijging_ROE_10_Y','standaard_deviatie_ROE','waardefactor_ROE', 'waardefactor_LTD_equity', 'selectiecriteria', 'intrinsieke_waarde', 'waarde_verdeling', "waarde_verdeling-1", 'koopmarge'])
    print(ideale_portfolio[['period_end_date', 'ticker','gem_groeipercentage_FCF', 'standaard_deviatie_FCF','waardefactor_FCF', 'Gemiddelde_stijging_ROE_10_Y','standaard_deviatie_ROE','waardefactor_ROE', 'waardefactor_LTD_equity', 'selectiecriteria', 'intrinsieke_waarde', 'waarde_verdeling']])
    ideale_portfolio.to_excel('ideale_portfolio.xlsx', index=False)
    # Filter het DataFrame op selectiecriteria = 5
    gefilterde_portfolio = ideale_portfolio.loc[ideale_portfolio['selectiecriteria'] == 5]

    # Sorteer op 'waarde_verdeling' in aflopende volgorde (hoog naar laag)
    gefilterde_portfolio = gefilterde_portfolio.sort_values(by='waarde_verdeling', ascending=False)

    # Print het gefilterde en gesorteerde DataFrame
    print(gefilterde_portfolio[['period_end_date', 'ticker','gem_groeipercentage_FCF', 'standaard_deviatie_FCF','waardefactor_FCF', 'Gemiddelde_stijging_ROE_10_Y','standaard_deviatie_ROE','waardefactor_ROE', 'waardefactor_LTD_equity', 'selectiecriteria', 'intrinsieke_waarde', 'waarde_verdeling']])
    gefilterde_portfolio.to_excel('gefilterde_portfolio.xlsx', index=False)

aandelen_berekeningen()
