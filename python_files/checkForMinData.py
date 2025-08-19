def OntbrekendeData():
    #DOEL - alleen de aandelen berekenen die geen ontbrekende data hebben
    import pandas as pd
    import pyodbc
    from datetime import datetime

    server = 'portfoliovr-server.database.windows.net'
    database = 'portfoliovr-database'	
    username = 'portfoliovr-server-admin'
    password = 'F0LKYYOYM284LFQ7$'


    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query1 = "SELECT DISTINCT ticker FROM aandelen_data_"
    aandelen_data_tickers = pd.read_sql(query1, cnxn)['ticker'].tolist()

    #SNELLE TEST OF AANDELEN VOLDOEN AAN CRITERIA EN OF ER VERDER ONDERZOCHT MOET WORDEN
    period_end_date = '2012-01-01'
    fp = 'FY'
    #Selecteert aandelen die niet voldoen aan de selectiecriterie na een snelle check
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query2 = "SELECT DISTINCT ticker FROM aandelen_data_ WHERE period_end_date > '"+period_end_date+"' and fp = '"+fp+"' and (NetCashProvidedByUsedInOperatingActivities < 0 or NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment < 0 or NetIncomeLoss < 0)"
    aandelen_data_tickers_unwanted = pd.read_sql(query2, cnxn)['ticker'].tolist()
    aandelen_data_tickers = [i for i in aandelen_data_tickers if i not in aandelen_data_tickers_unwanted]
    totalMissingDataCombo = pd.DataFrame(columns=['period_end_date', 'ticker', 'ontbrekende data'])
    tickersWithFullData = []
    cnxn.commit()

    for data in aandelen_data_tickers:
        cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
        query = "SELECT * FROM aandelen_data_ WHERE ticker='"+data+"' ORDER BY period_end_date DESC"
        aandelen_data = pd.read_sql(query, cnxn)
        cnxn.commit()
        last_period_end_date = datetime.strptime(aandelen_data['period_end_date'][0],'%Y-%m-%d')
        ticker = aandelen_data['ticker'][0]

        StockholdersEquityNecessaryData = last_period_end_date - pd.DateOffset(months=45*3) + pd.DateOffset(days=30)
        WeightedAverageNumberOfDilutedSharesOutstandingNecessaryData = last_period_end_date - pd.DateOffset(months=1*3) + pd.DateOffset(days=30)
        NetCashProvidedByUsedInOperatingActivitiesNecessaryData = last_period_end_date - pd.DateOffset(months=44*3) + pd.DateOffset(days=30)
        PurchasesOfPropertyAndEquipmentNecessaryData = last_period_end_date - pd.DateOffset(months=44*3) + pd.DateOffset(days=30)
        LiabilitiesCurrentNecessaryData = last_period_end_date - pd.DateOffset(months=8*3) + pd.DateOffset(days=30)
        LiabilitiesNecessaryData = last_period_end_date - pd.DateOffset(months=8*3) + pd.DateOffset(days=30)
        RevenuesNecessaryData = last_period_end_date - pd.DateOffset(months=44*3) + pd.DateOffset(days=30)
        DividendNecessaryData = last_period_end_date - pd.DateOffset(months=44*3) + pd.DateOffset(days=30)
        NetIncomeLossNecessaryData = last_period_end_date - pd.DateOffset(months=49*3) + pd.DateOffset(days=30)
        period_end_dateNecessaryData = last_period_end_date - pd.DateOffset(months=52*3) + pd.DateOffset(days=30)


        period_end_date_11Y = last_period_end_date - pd.DateOffset(years=11) + pd.DateOffset(days=30)


        totalMissingData = 0

        #CHECK 1Y
        checkLiabilitiesCurrentNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > LiabilitiesCurrentNecessaryData.strftime('%Y-%m-%d'))]

        if checkLiabilitiesCurrentNecessaryData['LiabilitiesCurrent'].count() == 8:
            ontbrekendeLiabilitiesCurrentData = pd.DataFrame()
            #print("check 1: " + str(4 - check1YearPeriod['LiabilitiesCurrent'].count()) + " ontbrekende LiabilitiesCurrent, " + str(check1YearPeriod['LiabilitiesCurrent'].count() / 4 * 100) + " %")
        else:
            #print("check 1: " + str(4 - check1YearPeriod['LiabilitiesCurrent'].count()) + " ontbrekende LiabilitiesCurrent, " + str(check1YearPeriod['LiabilitiesCurrent'].count() / 4 * 100) + " %")
            ontbrekendeLiabilitiesCurrentData = checkLiabilitiesCurrentNecessaryData[checkLiabilitiesCurrentNecessaryData['LiabilitiesCurrent'].isna()][['period_end_date', 'ticker']]
            ontbrekendeLiabilitiesCurrentData['ontbrekende data'] = 'LiabilitiesCurrent'

        checkLiabilitiesNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > LiabilitiesNecessaryData.strftime('%Y-%m-%d'))]
        if checkLiabilitiesNecessaryData['Liabilities'].count() == 8:
            ontbrekendeLiabilitiesData = pd.DataFrame()
            #print("check 2: " + str(4 - check1YearPeriod['Liabilities'].count()) + " ontbrekende Liabilities, " + str(check1YearPeriod['Liabilities'].count() / 4 * 100) + " %")
        else:
            #print("check 2: " + str(4 - check1YearPeriod['Liabilities'].count()) + " ontbrekende Liabilities, " + str(check1YearPeriod['Liabilities'].count() / 4 * 100) + " %")
            ontbrekendeLiabilitiesData = checkLiabilitiesNecessaryData[checkLiabilitiesNecessaryData['Liabilities'].isna()][['period_end_date', 'ticker']]
            ontbrekendeLiabilitiesData['ontbrekende data'] = 'Liabilities'

        checkWeightedAverageNumberOfDilutedSharesOutstandingNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > WeightedAverageNumberOfDilutedSharesOutstandingNecessaryData.strftime('%Y-%m-%d'))]
        if checkWeightedAverageNumberOfDilutedSharesOutstandingNecessaryData['WeightedAverageNumberOfDilutedSharesOutstanding'].count() == 1:
            ontbrekendeWeightedAverageNumberOfDilutedSharesOutstandingData = pd.DataFrame()
            #print("check 3: " + str(4 - check1YearPeriod['WeightedAverageNumberOfDilutedSharesOutstanding'].count()) + " ontbrekende WeightedAverageNumberOfDilutedSharesOutstanding, " + str(check1YearPeriod['WeightedAverageNumberOfDilutedSharesOutstanding'].count() / 4 * 100) + " %")
        else:
            #print("check 3: " + str(4 - check1YearPeriod['WeightedAverageNumberOfDilutedSharesOutstanding'].count()) + " ontbrekende WeightedAverageNumberOfDilutedSharesOutstanding, " + str(check1YearPeriod['WeightedAverageNumberOfDilutedSharesOutstanding'].count() / 4 * 100) + " %")
            ontbrekendeWeightedAverageNumberOfDilutedSharesOutstandingData = checkWeightedAverageNumberOfDilutedSharesOutstandingNecessaryData[checkWeightedAverageNumberOfDilutedSharesOutstandingNecessaryData['WeightedAverageNumberOfDilutedSharesOutstanding'].isna()][['period_end_date', 'ticker']]
            ontbrekendeWeightedAverageNumberOfDilutedSharesOutstandingData['ontbrekende data'] = 'WeightedAverageNumberOfDilutedSharesOutstanding'


        #CHECK 11Y
        check11YearPeriod = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > period_end_date_11Y.strftime('%Y-%m-%d'))]

        checkperiod_end_dateNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > period_end_dateNecessaryData.strftime('%Y-%m-%d'))]
        if checkperiod_end_dateNecessaryData['period_end_date'].count() == 52:
            print(ticker + ' Alle kwartalen gevonden')
            #print("check 4: " + str(44 - check11YearPeriod['period_end_date'].count()) + " ontbrekende period_end_date, " + str(check11YearPeriod['period_end_date'].count() / 44 * 100) + " %")
        else:
            print(ticker + " check 4: " + str(52 - check11YearPeriod['period_end_date'].count()) + " ontbrekende period_end_date, " + str(check11YearPeriod['period_end_date'].count() / 52 * 100) + " %")
            print(ticker + ' nog uit te zoeken')

        checkStockholdersEquityNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > StockholdersEquityNecessaryData.strftime('%Y-%m-%d'))]
        if checkStockholdersEquityNecessaryData['StockholdersEquity'].count() == 45:
            ontbrekendeStockholdersEquityData = pd.DataFrame()
            #print("check 5: " + str(44 - check11YearPeriod['StockholdersEquity'].count()) + " ontbrekende StockholdersEquity, " + str(check11YearPeriod['StockholdersEquity'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (45 - checkStockholdersEquityNecessaryData['StockholdersEquity'].count())
            #print("check 5: " + str(44 - check11YearPeriod['StockholdersEquity'].count()) + " ontbrekende StockholdersEquity, " + str(check11YearPeriod['StockholdersEquity'].count() / 44 * 100) + " %")
            ontbrekendeStockholdersEquityData = checkStockholdersEquityNecessaryData[checkStockholdersEquityNecessaryData['StockholdersEquity'].isna()][['period_end_date', 'ticker']]
            ontbrekendeStockholdersEquityData['ontbrekende data'] = 'StockholdersEquity'

        checkNetIncomeLossNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > NetIncomeLossNecessaryData.strftime('%Y-%m-%d'))]
        if checkNetIncomeLossNecessaryData['NetIncomeLoss'].count() == 49:
            ontbrekendeNetIncomeLossData = pd.DataFrame()
            #print("check 6: " + str(44 - check11YearPeriod['NetIncomeLoss'].count()) + " ontbrekende NetIncomeLoss, " + str(check11YearPeriod['NetIncomeLoss'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (49 - checkNetIncomeLossNecessaryData['NetIncomeLoss'].count())
            #print("check 6: " + str(44 - check11YearPeriod['NetIncomeLoss'].count()) + " ontbrekende NetIncomeLoss, " + str(check11YearPeriod['NetIncomeLoss'].count() / 44 * 100) + " %")
            ontbrekendeNetIncomeLossData = checkNetIncomeLossNecessaryData[checkNetIncomeLossNecessaryData['NetIncomeLoss'].isna()][['period_end_date', 'ticker']]
            ontbrekendeNetIncomeLossData['ontbrekende data'] = 'NetIncomeLoss'

        checkNetCashProvidedByUsedInOperatingActivitiesNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > NetCashProvidedByUsedInOperatingActivitiesNecessaryData.strftime('%Y-%m-%d'))]
        if checkNetCashProvidedByUsedInOperatingActivitiesNecessaryData['NetCashProvidedByUsedInOperatingActivities'].count() == 44:
            ontbrekendeNetCashProvidedByUsedInOperatingActivitiesData = pd.DataFrame()
            #print("check 7: " + str(44 - check11YearPeriod['NetCashProvidedByUsedInOperatingActivities'].count()) + " ontbrekende NetCashProvidedByUsedInOperatingActivities, " + str(check11YearPeriod['NetCashProvidedByUsedInOperatingActivities'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (44 - checkNetCashProvidedByUsedInOperatingActivitiesNecessaryData['NetCashProvidedByUsedInOperatingActivities'].count())
            #print("check 7: " + str(44 - check11YearPeriod['NetCashProvidedByUsedInOperatingActivities'].count()) + " ontbrekende NetCashProvidedByUsedInOperatingActivities, " + str(check11YearPeriod['NetCashProvidedByUsedInOperatingActivities'].count() / 44 * 100) + " %")
            ontbrekendeNetCashProvidedByUsedInOperatingActivitiesData = checkNetCashProvidedByUsedInOperatingActivitiesNecessaryData[checkNetCashProvidedByUsedInOperatingActivitiesNecessaryData['NetCashProvidedByUsedInOperatingActivities'].isna()][['period_end_date', 'ticker']]
            ontbrekendeNetCashProvidedByUsedInOperatingActivitiesData['ontbrekende data'] = 'NetCashProvidedByUsedInOperatingActivities'

        checkPurchasesOfPropertyAndEquipmentNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > PurchasesOfPropertyAndEquipmentNecessaryData.strftime('%Y-%m-%d'))]
        if check11YearPeriod['PurchasesOfPropertyAndEquipment'].count() == 44:
            ontbrekendePurchasesOfPropertyAndEquipmentData = pd.DataFrame()
            #print("check 8: " + str(44 - check11YearPeriod['PurchasesOfPropertyAndEquipment'].count()) + " ontbrekende PurchasesOfPropertyAndEquipment, " + str(check11YearPeriod['PurchasesOfPropertyAndEquipment'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (44 - checkPurchasesOfPropertyAndEquipmentNecessaryData['PurchasesOfPropertyAndEquipment'].count())
            #print("check 8: " + str(44 - check11YearPeriod['PurchasesOfPropertyAndEquipment'].count()) + " ontbrekende PurchasesOfPropertyAndEquipment, " + str(check11YearPeriod['PurchasesOfPropertyAndEquipment'].count() / 44 * 100) + " %")
            ontbrekendePurchasesOfPropertyAndEquipmentData = checkPurchasesOfPropertyAndEquipmentNecessaryData[checkPurchasesOfPropertyAndEquipmentNecessaryData['PurchasesOfPropertyAndEquipment'].isna()][['period_end_date', 'ticker']]
            ontbrekendePurchasesOfPropertyAndEquipmentData['ontbrekende data'] = 'PurchasesOfPropertyAndEquipment'

        checkRevenuesNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > RevenuesNecessaryData.strftime('%Y-%m-%d'))]
        if check11YearPeriod['Revenues'].count() == 44:
            ontbrekendeRevenueData = pd.DataFrame()
            #print("check 9: " + str(44 - check11YearPeriod['Revenues'].count()) + " ontbrekende Revenues, " + str(check11YearPeriod['Revenues'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (44 - checkRevenuesNecessaryData['Revenues'].count())
            #print("check 9: " + str(44 - check11YearPeriod['Revenues'].count()) + " ontbrekende Revenues, " + str(check11YearPeriod['Revenues'].count() / 44 * 100) + " %")
            ontbrekendeRevenueData = checkRevenuesNecessaryData[checkRevenuesNecessaryData['Revenues'].isna()][['period_end_date', 'ticker']]
            ontbrekendeRevenueData['ontbrekende data'] = 'Revenues'
        
        checkDividendNecessaryData = aandelen_data[(aandelen_data['period_end_date'] <= last_period_end_date.strftime('%Y-%m-%d')) & (aandelen_data['period_end_date'] > DividendNecessaryData.strftime('%Y-%m-%d'))]
        if check11YearPeriod['Dividend'].count() == 44:
            ontbrekendeDividendData = pd.DataFrame()
            #print("check 10: " + str(44 - check11YearPeriod['Dividend'].count()) + " ontbrekende Dividend, " + str(check11YearPeriod['Dividend'].count() / 44 * 100) + " %")
        else:
            totalMissingData = totalMissingData + (44 - checkDividendNecessaryData['Dividend'].count())
            #print("check 10: " + str(44 - check11YearPeriod['Dividend'].count()) + " ontbrekende Dividend, " + str(check11YearPeriod['Dividend'].count() / 44 * 100) + " %")
            ontbrekendeDividendData = checkDividendNecessaryData[checkDividendNecessaryData['Dividend'].isna()][['period_end_date', 'ticker']]
            ontbrekendeDividendData['ontbrekende data'] = 'Dividend'


        if totalMissingData == 0:
            tickersWithFullData.append(ticker)
            print(ticker + ' is added')
        else: 
            print(ticker + ' is not added: totaal ontbrekende data: ' + str(totalMissingData) + " van 320, " + str((364 - totalMissingData) / 364 * 100) + " %" + " compleet")


        totalMissingDataCombo = pd.concat([totalMissingDataCombo, ontbrekendeLiabilitiesCurrentData, ontbrekendeLiabilitiesData, ontbrekendeWeightedAverageNumberOfDilutedSharesOutstandingData, ontbrekendeStockholdersEquityData, ontbrekendeNetIncomeLossData, ontbrekendeNetCashProvidedByUsedInOperatingActivitiesData, ontbrekendePurchasesOfPropertyAndEquipmentData, ontbrekendeRevenueData, ontbrekendeDividendData])


    totalMissingDataGroup = totalMissingDataCombo.groupby('ticker')['ontbrekende data'].count().reset_index()
    totalMissingDataGroup['%'] = (totalMissingDataGroup['ontbrekende data'] / 364).round(2)
    totalMissingDataCombo['add_Update_Data'] = ""
    totalMissingDataCombo.sort_values(['ticker', 'period_end_date'], ascending=[True, False])
    #totalMissingDataCombo.sort_values(['ticker', 'period_end_date'], ascending=[True, False]).to_excel("OntbrekendeData.xlsx", columns = ['period_end_date', 'ticker', 'ontbrekende data', 'add_Update_Data'])

    totalMissingDataCombo = totalMissingDataCombo.values.tolist()

    totalMissingDataGroup=totalMissingDataGroup.values.tolist()

    #print(totalMissingDataCombo, totalMissingDataGroup)

    cnxn.close()

    return totalMissingDataCombo, totalMissingDataGroup


OntbrekendeData()