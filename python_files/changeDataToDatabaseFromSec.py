def GetSec(ticker):

    #IMPORT MODULES
    import requests
    import pandas as pd
    import numpy as np
    import datetime
    import pyodbc
    import json
    from decimal import Decimal


    #INPUTS
    #ticker = 'ADBE'
    server = 'portfoliovr-server.database.windows.net'
    database = 'portfoliovr-database'	
    username = 'portfoliovr-server-admin'
    password = 'F0LKYYOYM284LFQ7$'

    #ALGEMEEN
    """
    - ticker (ticker)
    - period_start_date (start)
    - period_end_date (end)
    - fiscal_year (fy)
    - period_focus (fp)
    - form (form)"""

    #BALANCE SHEET
    """
    - AssetsCurrent (AssetsCurrent)
    - Assets (Assets)
    - LiabilitiesCurrent (LiabilitiesCurrent)
    - Liabilities (Liabilities)
    - StockholdersEquity (StockholdersEquity)"""


    #CASH FLOW STATEMENT
    """
    - NetIncome (ProfitLoss, NetIncomeLoss)
    - NetCashProvidedByUsedInOperatingActivities (NetCashProvidedByUsedInOperatingActivities)
    - NetCashProvidedByUsedInInvestingActivities (NetCashProvidedByUsedInInvestingActivities)
    - NetCashProvidedByUsedInFinancingActivities (NetCashProvidedByUsedInFinancingActivities)
    - PurchasesOfPropertyAndEquipment (PaymentsToAcquirePropertyPlantAndEquipment)"""

    #INCOME STATEMENT
    """
    - Revenues (Revenues)
    - WeightedAverageNumberOfDilutedSharesOutstanding (WeightedAverageNumberOfDilutedSharesOutstanding)
    - Dividend
    """

# create request header
    headers = {'User-Agent': "arne.van.riel@hotmail.be"}

# get all companies data
    companyTickers = requests.get(
        "https://www.sec.gov/files/company_tickers.json",
        headers=headers
        )

    # review response / keys
    companyTickers.json().keys()

    # parse CIK // without leading zeros
    directCik = companyTickers.json()['0']['cik_str']

    # dictionary to dataframe
    companyData = pd.DataFrame.from_dict(companyTickers.json(),
                                        orient='index')

    # add leading zeros to CIK
    companyData['cik_str'] = companyData['cik_str'].astype(
                            str).str.zfill(10)

    # review data
    companyData = companyData.loc[companyData['ticker'] == ticker]


    cik = companyData['cik_str'].iloc[0]

    # get company facts data
    companyFacts = requests.get(
        f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
        headers=headers
        )

    viewCompanyFacts = companyFacts.json()['facts']['us-gaap']
    #print(companyFacts.json()['facts']['us-gaap']['LiabilitiesCurrent']['units']['USD'].drop_duplicates(subset='end'))
    #print(viewCompanyFacts.keys())
    #print(pd.DataFrame(companyFacts.json()['facts']['us-gaap']['CommonStockDividendsPerShareDeclared']['units']['USD/shares']).sort_values(['end', 'start'], ascending=[True, True]).drop_duplicates(subset='end'))
    #SELECTING THE VALUES
    #select ticker
    df = pd.DataFrame()

    ticker = companyData['ticker'].iloc[0]
    print('ticker: ' + ticker)

    """test = companyFacts.json()['facts']['us-gaap']['SalesRevenueServicesNet']['units']['USD']
    #test = pd.DataFrame(test).drop_duplicates(subset='end')
    print(test)"""

    try:
        AssetsCurrent = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['AssetsCurrent']['units']['USD']).drop_duplicates(subset='end')
        AssetsCurrent.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        AssetsCurrent['ticker'] = ticker
        AssetsCurrent['fundamental_name'] = "AssetsCurrent"
        df = pd.concat([df, AssetsCurrent])
    except KeyError:
        print('Assets current data not found')

    try:
        Assets = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Assets']['units']['USD']).drop_duplicates(subset='end')
        Assets.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Assets['ticker'] = ticker
        Assets['fundamental_name'] = "Assets"
        df = pd.concat([df, Assets])
    except KeyError:
        print(' Assets data not found')

    try:
        LiabilitiesCurrent = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['LiabilitiesCurrent']['units']['USD']).drop_duplicates(subset='end')
        LiabilitiesCurrent.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        LiabilitiesCurrent['ticker'] = ticker
        LiabilitiesCurrent['fundamental_name'] = "LiabilitiesCurrent"
        df = pd.concat([df, LiabilitiesCurrent])
    except KeyError:
        print('LiabilitiesCurrent data not found')

#LIABILITIES
    try:
        Liabilities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Liabilities']['units']['USD']).drop_duplicates(subset='end')
        Liabilities.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Liabilities['ticker'] = ticker
        Liabilities['fundamental_name'] = "Liabilities"
        df = pd.concat([df, Liabilities])
    except KeyError:
        print('Liabilities data not found')
    try:
        LiabilitiesAndStockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['LiabilitiesAndStockholdersEquity']['units']['USD']).drop_duplicates(subset='end')
        LiabilitiesAndStockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'LiabilitiesAndStockholdersEquity'}, inplace = True)
        StockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquity']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'StockholdersEquity'}, inplace = True)
        Liabilities= pd.merge(LiabilitiesAndStockholdersEquity, StockholdersEquity, on='period_end_date')
        Liabilities['fundamental_value'] = Liabilities['LiabilitiesAndStockholdersEquity'] - Liabilities['StockholdersEquity']
        Liabilities['ticker'] = ticker
        Liabilities['fundamental_name'] = "Liabilities"
        df = pd.concat([df, Liabilities[['period_end_date', 'ticker', 'fundamental_name', 'fundamental_value']]])
    except KeyError:
        print('Liabilities data not found')
    try:
        LiabilitiesAndStockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['LiabilitiesAndStockholdersEquity']['units']['USD']).drop_duplicates(subset='end')
        LiabilitiesAndStockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'LiabilitiesAndStockholdersEquity'}, inplace = True)
        StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.rename(columns = {'end':'period_end_date', 'val':'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'}, inplace = True)
        Liabilities= pd.merge(LiabilitiesAndStockholdersEquity, StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest, on='period_end_date')
        Liabilities['fundamental_value'] = Liabilities['LiabilitiesAndStockholdersEquity'] - Liabilities['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']
        Liabilities['ticker'] = ticker
        Liabilities['fundamental_name'] = "Liabilities"
        df = pd.concat([df, Liabilities[['period_end_date', 'ticker', 'fundamental_name', 'fundamental_value']]])
    except KeyError:
        print('Liabilities data not found')


    StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest
#STOCKHOLDERS EQUITY    
    try:
        StockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquity']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        StockholdersEquity['ticker'] = ticker
        StockholdersEquity['fundamental_name'] = "StockholdersEquity"
        df = pd.concat([df, StockholdersEquity])
    except KeyError:
        print('StockholdersEquity data not found')
    try:
        StockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        StockholdersEquity['ticker'] = ticker
        StockholdersEquity['fundamental_name'] = "StockholdersEquity"
        df = pd.concat([df, StockholdersEquity])
    except KeyError:
        print('StockholdersEquity data not found')

#NETINCOME
    try:
        NetIncomeLoss = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetIncomeLoss']['units']['USD'])
        NetIncomeLossQ1 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q1')]
        NetIncomeLossQ2 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q2')]
        NetIncomeLossQ3 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q3')]
        NetIncomeLossFY = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'FY')]
        NetIncomeLoss = pd.concat([NetIncomeLossQ1, NetIncomeLossQ2, NetIncomeLossQ3, NetIncomeLossFY]).sort_values('end').drop_duplicates(subset='end')
        NetIncomeLoss.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        NetIncomeLoss['ticker'] = ticker
        NetIncomeLoss['fundamental_name'] = "NetIncomeLoss"
        df = pd.concat([df, NetIncomeLoss])
    except KeyError:
        print('NetIncomeLoss data not found')
    try:
        NetIncomeLoss = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['ProfitLoss']['units']['USD'])
        NetIncomeLossQ1 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q1')]
        NetIncomeLossQ2 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q2')]
        NetIncomeLossQ3 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q3')]
        NetIncomeLossFY = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'FY')]
        NetIncomeLoss = pd.concat([NetIncomeLossQ1, NetIncomeLossQ2, NetIncomeLossQ3, NetIncomeLossFY]).sort_values('end').drop_duplicates(subset='end')
        NetIncomeLoss.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        NetIncomeLoss['ticker'] = ticker
        NetIncomeLoss['fundamental_name'] = "NetIncomeLoss"
        df = pd.concat([df, NetIncomeLoss])
    except KeyError:
        print('NetIncomeLoss data not found')

    try:
        NetCashProvidedByUsedInOperatingActivities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivities']['units']['USD'])
        NetCashProvidedByUsedInOperatingActivitiesQ1 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q1')]
        NetCashProvidedByUsedInOperatingActivitiesQ2 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q2')]
        NetCashProvidedByUsedInOperatingActivitiesQ3 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q3')]
        NetCashProvidedByUsedInOperatingActivitiesFY = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'FY')]
        NetCashProvidedByUsedInOperatingActivities = pd.concat([NetCashProvidedByUsedInOperatingActivitiesQ1, NetCashProvidedByUsedInOperatingActivitiesQ2, NetCashProvidedByUsedInOperatingActivitiesQ3, NetCashProvidedByUsedInOperatingActivitiesFY]).sort_values('end').drop_duplicates(subset='end')
        NetCashProvidedByUsedInOperatingActivities.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        NetCashProvidedByUsedInOperatingActivities['ticker'] = ticker
        NetCashProvidedByUsedInOperatingActivities['fundamental_name'] = "NetCashProvidedByUsedInOperatingActivities"
        df = pd.concat([df, NetCashProvidedByUsedInOperatingActivities])
    except KeyError:
        print('NetCashProvidedByUsedInOperatingActivities data not found')
    try:
        NetCashProvidedByUsedInOperatingActivities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']['units']['USD'])
        NetCashProvidedByUsedInOperatingActivitiesQ1 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q1')]
        NetCashProvidedByUsedInOperatingActivitiesQ2 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q2')]
        NetCashProvidedByUsedInOperatingActivitiesQ3 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q3')]
        NetCashProvidedByUsedInOperatingActivitiesFY = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'FY')]
        NetCashProvidedByUsedInOperatingActivities = pd.concat([NetCashProvidedByUsedInOperatingActivitiesQ1, NetCashProvidedByUsedInOperatingActivitiesQ2, NetCashProvidedByUsedInOperatingActivitiesQ3, NetCashProvidedByUsedInOperatingActivitiesFY]).sort_values('end').drop_duplicates(subset='end')
        NetCashProvidedByUsedInOperatingActivities.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        NetCashProvidedByUsedInOperatingActivities['ticker'] = ticker
        NetCashProvidedByUsedInOperatingActivities['fundamental_name'] = "NetCashProvidedByUsedInOperatingActivities"
        df = pd.concat([df, NetCashProvidedByUsedInOperatingActivities])
    except KeyError:
        print('NetCashProvidedByUsedInOperatingActivities data not found')

    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PurchasesOfPropertyAndEquipment']['units']['USD'])
        PurchasesOfPropertyAndEquipmentQ1 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q1')]
        PurchasesOfPropertyAndEquipmentQ2 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q2')]
        PurchasesOfPropertyAndEquipmentQ3 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q3')]
        PurchasesOfPropertyAndEquipmentFY = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'FY')]
        PurchasesOfPropertyAndEquipment = pd.concat([PurchasesOfPropertyAndEquipmentQ1, PurchasesOfPropertyAndEquipmentQ2, PurchasesOfPropertyAndEquipmentQ3, PurchasesOfPropertyAndEquipmentFY]).sort_values('end').drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker
        PurchasesOfPropertyAndEquipment['fundamental_name'] = "PurchasesOfPropertyAndEquipment"
        df = pd.concat([df, PurchasesOfPropertyAndEquipment])
    except KeyError:
        print('PurchasesOfPropertyAndEquipment data not found')
    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PaymentsToAcquirePropertyPlantAndEquipment']['units']['USD']).drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker
        PurchasesOfPropertyAndEquipment['fundamental_name'] = "PurchasesOfPropertyAndEquipment"
        df = pd.concat([df, PurchasesOfPropertyAndEquipment])
    except KeyError:
        print('PurchasesOfPropertyAndEquipment data not found')
    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PaymentsToAcquireProductiveAssets']['units']['USD']).drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker
        PurchasesOfPropertyAndEquipment['fundamental_name'] = "PurchasesOfPropertyAndEquipment"
        df = pd.concat([df, PurchasesOfPropertyAndEquipment])
    except KeyError:
        print('PurchasesOfPropertyAndEquipment data not found')


    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Revenues']['units']['USD'])
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Revenues['ticker'] = ticker
        Revenues['fundamental_name'] = "Revenues"
        df = pd.concat([df, Revenues])
    except KeyError:
        print('Revenues data not found')
    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax']['units']['USD'])
        print('Revenues2 found')
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Revenues['ticker'] = ticker
        Revenues['fundamental_name'] = "Revenues"
        df = pd.concat([df, Revenues])
    except KeyError:
        print('Revenues data not found')
    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['SalesRevenueNet']['units']['USD'])
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Revenues['ticker'] = ticker
        Revenues['fundamental_name'] = "Revenues"
        df = pd.concat([df, Revenues])
        print('Revenues data not found')
    except KeyError:
        print('Revenues data not found')
    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['SalesRevenueGoodsNet']['units']['USD'])
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Revenues['ticker'] = ticker
        Revenues['fundamental_name'] = "Revenues"
        df = pd.concat([df, Revenues])
    except KeyError:
        print('Revenues data not found')
    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['SalesRevenueServicesNet']['units']['USD'])
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        Revenues['ticker'] = ticker
        Revenues['fundamental_name'] = "Revenues"
        df = pd.concat([df, Revenues])
    except KeyError:
        print('Revenues data not found')
        

    try:
        WeightedAverageNumberOfDilutedSharesOutstanding = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['WeightedAverageNumberOfDilutedSharesOutstanding']['units']['shares']).drop_duplicates(subset='end')
        WeightedAverageNumberOfDilutedSharesOutstanding.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        WeightedAverageNumberOfDilutedSharesOutstanding['ticker'] = ticker
        WeightedAverageNumberOfDilutedSharesOutstanding['fundamental_name'] = "WeightedAverageNumberOfDilutedSharesOutstanding"
        df = pd.concat([df, WeightedAverageNumberOfDilutedSharesOutstanding])
    except KeyError:
        print('WeightedAverageNumberOfDilutedSharesOutstanding data not found')
#CommonStockSharesOutstanding
    try:
        CommonStockDividendsPerShareDeclared = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['CommonStockDividendsPerShareDeclared']['units']['USD/shares']).drop_duplicates(subset='end')
        CommonStockDividendsPerShareDeclared.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        CommonStockDividendsPerShareDeclared['ticker'] = ticker
        CommonStockDividendsPerShareDeclared['fundamental_name'] = "Dividend"
        df = pd.concat([df, CommonStockDividendsPerShareDeclared])
    except KeyError:
        print('Dividend data not found')
    try:
        CommonStockDividendsPerShareDeclared = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['CommonStockDividendsPerShareCashPaid']['units']['USD/shares']).drop_duplicates(subset='end')
        CommonStockDividendsPerShareDeclared.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        CommonStockDividendsPerShareDeclared['ticker'] = ticker
        CommonStockDividendsPerShareDeclared['fundamental_name'] = "Dividend"
        df = pd.concat([df, CommonStockDividendsPerShareDeclared])
    except KeyError:
        print('Dividend data not found')

    #print(df)

    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query = "SELECT * FROM aandelen_data_ WHERE ticker='"+ticker+"' ORDER BY period_end_date DESC"
    AssetsCurrent_data = pd.read_sql(query, cnxn)
    #AssetsCurrent_data['AssetsCurrent'] = Decimal(1.333e+18)
    cnxn.commit()
    cnxn.close()
    #print(AssetsCurrent_data)
    #print(AssetsCurrent)
    AssetsCurrent = df[['period_end_date', 'ticker', 'fundamental_name', 'fundamental_value']].merge(AssetsCurrent_data[['period_end_date', 'AssetsCurrent', 'Assets', 'LiabilitiesCurrent', 'Liabilities', 'StockholdersEquity', 'NetIncomeLoss', 'NetCashProvidedByUsedInOperatingActivities', 'PurchasesOfPropertyAndEquipment', 'Revenues', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'Dividend']], on='period_end_date', how='left').fillna("NaN")
    pd.options.display.float_format = '{:.2f}'.format

    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "Assets"), 'fundamental_value_db'] = AssetsCurrent['Assets']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "AssetsCurrent"), 'fundamental_value_db'] = AssetsCurrent['AssetsCurrent']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "LiabilitiesCurrent"), 'fundamental_value_db'] = AssetsCurrent['LiabilitiesCurrent']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "Liabilities"), 'fundamental_value_db'] = AssetsCurrent['Liabilities']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "StockholdersEquity"), 'fundamental_value_db'] = AssetsCurrent['StockholdersEquity']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "NetIncomeLoss"), 'fundamental_value_db'] = AssetsCurrent['NetIncomeLoss']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "NetCashProvidedByUsedInOperatingActivities"), 'fundamental_value_db'] = AssetsCurrent['NetCashProvidedByUsedInOperatingActivities']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "PurchasesOfPropertyAndEquipment"), 'fundamental_value_db'] = AssetsCurrent['PurchasesOfPropertyAndEquipment']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "Revenues"), 'fundamental_value_db'] = AssetsCurrent['Revenues']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "WeightedAverageNumberOfDilutedSharesOutstanding"), 'fundamental_value_db'] = AssetsCurrent['WeightedAverageNumberOfDilutedSharesOutstanding']
    AssetsCurrent.loc[(AssetsCurrent['fundamental_name'] == "Dividend"), 'fundamental_value_db'] = AssetsCurrent['Dividend']

    AssetsCurrent.loc[AssetsCurrent['fundamental_value'] == AssetsCurrent['fundamental_value_db'], 'in_database?'] = "True"
    AssetsCurrent.loc[AssetsCurrent['fundamental_value'] != AssetsCurrent['fundamental_value_db'], 'in_database?'] = "False"

    AssetsCurrent = AssetsCurrent[['period_end_date', 'ticker', 'fundamental_name', 'fundamental_value', 'fundamental_value_db', 'in_database?']]
    print(AssetsCurrent.loc[AssetsCurrent['fundamental_name'] == 'Revenues'])
    # Aan het einde van je script, vervang de huidige print-functie door deze regels:
    output = AssetsCurrent.to_dict(orient='records')  # Converteer de dataframe naar een lijst van dictionaries
    json_output = json.dumps(output)  # Converteer de lijst van dictionaries naar een JSON-string
    print(json_output)  # Print de JSON-string naar stdout

GetSec('MA')

def TestGetSec(ticker):
    import requests
    import pandas as pd

    # create request header
    headers = {'User-Agent': "arne.van.riel@hotmail.be"}
    # get all companies data
    companyTickers = requests.get("https://www.sec.gov/files/company_tickers.json",headers=headers)
    # dictionary to dataframe
    companyData = pd.DataFrame.from_dict(companyTickers.json(), orient='index')

    # add leading zeros to CIK
    companyData['cik_str'] = companyData['cik_str'].astype(str).str.zfill(10)
    # review data
    companyData = companyData.loc[companyData['ticker'] == ticker]
    cik = companyData['cik_str'].iloc[0]
    # get company facts data
    companyFacts = requests.get(
        f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
        headers=headers
        )
    try:
        LiabilitiesCurrent = companyFacts.json()['facts']['us-gaap'].keys()
        print(LiabilitiesCurrent)
        """LiabilitiesCurrent.rename(columns = {'end':'period_end_date', 'val':'fundamental_value'}, inplace = True)
        LiabilitiesCurrent['ticker'] = ticker
        LiabilitiesCurrent['fundamental_name'] = "LiabilitiesCurrent"
        print(LiabilitiesCurrent[['period_end_date', 'ticker', 'fundamental_name', 'fundamental_value']])"""
        
    except KeyError:
        print('cur liab data not found')


TestGetSec("AFL")



"""Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Revenues']['units']['USD'])
RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
print(Revenues)
Revenues1 = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax']['units']['USD'])
RevenuesQ1 = Revenues1.loc[(pd.to_datetime(Revenues1['start']) < pd.to_datetime(Revenues1['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues1['fp'] == 'Q1')]
RevenuesQ2 = Revenues1.loc[(pd.to_datetime(Revenues1['start']) < pd.to_datetime(Revenues1['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues1['fp'] == 'Q2')]
RevenuesQ3 = Revenues1.loc[(pd.to_datetime(Revenues1['start']) < pd.to_datetime(Revenues1['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues1['fp'] == 'Q3')]
RevenuesFY = Revenues1.loc[(pd.to_datetime(Revenues1['start']) < pd.to_datetime(Revenues1['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues1['fp'] == 'FY')]
Revenues1 = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
print(Revenues1)"""


"""
#---BALANCE SHEET---
def AssetsCurrent():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorAssetsCurrent = cnxn.cursor()
    cursorAssetsCurrent2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        AssetsCurrent = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['AssetsCurrent']['units']['USD']).drop_duplicates(subset='end')
        AssetsCurrent.rename(columns = {'end':'period_end_date', 'val':'AssetsCurrent'}, inplace = True)
        AssetsCurrent['ticker'] = ticker

        for index, row in AssetsCurrent.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            AssetsCurrent = row['AssetsCurrent']
            cursorAssetsCurrent.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorAssetsCurrent.fetchall()
            cursorAssetsCurrent2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND AssetsCurrent = ? AND period_end_date = '"+period_end_date+"'", row['AssetsCurrent'])
            entry2 = cursorAssetsCurrent2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, AssetsCurrent) VALUES (?,?,?,?,?,?)"
                cursorAssetsCurrent.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['AssetsCurrent'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['AssetsCurrent'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, AssetsCurrent = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorAssetsCurrent2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['AssetsCurrent'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['AssetsCurrent'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['AssetsCurrent'], 'Data zit al in database')

    except KeyError:
        print('data not found')

    cnxn.close()

AssetsCurrent()

def Assets():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorAssets = cnxn.cursor()
    cursorAssets2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        Assets = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Assets']['units']['USD']).drop_duplicates(subset='end')
        Assets.rename(columns = {'end':'period_end_date', 'val':'Assets'}, inplace = True)
        Assets['ticker'] = ticker

        for index, row in Assets.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            Assets = row['Assets']
            cursorAssets.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorAssets.fetchall()
            cursorAssets2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND Assets = ? AND period_end_date = '"+period_end_date+"'", Assets)
            entry2 = cursorAssets2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, Assets) VALUES (?,?,?,?,?,?)"
                cursorAssets.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Assets'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Assets'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, Assets = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorAssets2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Assets'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Assets'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['Assets'], 'Data zit al in database')

    except KeyError:
        print('data not found')

    cnxn.close()
    
Assets()

def LiabilitiesCurrent():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorLiabilitiesCurrent = cnxn.cursor()
    cursorLiabilitiesCurrent2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        LiabilitiesCurrent = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['LiabilitiesCurrent']['units']['USD']).drop_duplicates(subset='end')
        LiabilitiesCurrent.rename(columns = {'end':'period_end_date', 'val':'LiabilitiesCurrent'}, inplace = True)
        LiabilitiesCurrent['ticker'] = ticker

        for index, row in LiabilitiesCurrent.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            LiabilitiesCurrent = row['LiabilitiesCurrent']
            cursorLiabilitiesCurrent.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorLiabilitiesCurrent.fetchall()
            cursorLiabilitiesCurrent2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND LiabilitiesCurrent = ? AND period_end_date = '"+period_end_date+"'", row['LiabilitiesCurrent'])
            entry2 = cursorLiabilitiesCurrent2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, LiabilitiesCurrent) VALUES (?,?,?,?,?,?)"
                cursorLiabilitiesCurrent.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['LiabilitiesCurrent'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['LiabilitiesCurrent'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, LiabilitiesCurrent = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorLiabilitiesCurrent2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['LiabilitiesCurrent'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['LiabilitiesCurrent'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['LiabilitiesCurrent'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    cnxn.close()

LiabilitiesCurrent()

def Liabilities():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorLiabilities = cnxn.cursor()
    cursorLiabilities2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        Liabilities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Liabilities']['units']['USD']).drop_duplicates(subset='end')
        Liabilities.rename(columns = {'end':'period_end_date', 'val':'Liabilities'}, inplace = True)
        Liabilities['ticker'] = ticker

        for index, row in Liabilities.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorLiabilities.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorLiabilities.fetchall()
            cursorLiabilities2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND Liabilities = ? AND period_end_date = '"+period_end_date+"'", row['Liabilities'])
            entry2 = cursorLiabilities2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, Liabilities) VALUES (?,?,?,?,?,?)"
                cursorLiabilities.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Liabilities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Liabilities'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, Liabilities = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorLiabilities2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Liabilities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Liabilities'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['Liabilities'], 'Data zit al in database')

    except KeyError:
        print('data not found')

    cnxn.close()

Liabilities()

def StockholdersEquity():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorStockholdersEquity = cnxn.cursor()
    cursorStockholdersEquity2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        StockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquity']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'StockholdersEquity'}, inplace = True)
        StockholdersEquity['ticker'] = ticker

        for index, row in StockholdersEquity.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorStockholdersEquity.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorStockholdersEquity.fetchall()
            cursorStockholdersEquity2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND StockholdersEquity = ? AND period_end_date = '"+period_end_date+"'", row['StockholdersEquity'])
            entry2 = cursorStockholdersEquity2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, StockholdersEquity) VALUES (?,?,?,?,?,?)"
                cursorStockholdersEquity.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['StockholdersEquity'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, StockholdersEquity = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorStockholdersEquity2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['StockholdersEquity'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'Data zit al in database')
    
    except KeyError:
        print('data not found')

    try:
        StockholdersEquity = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']['units']['USD']).drop_duplicates(subset='end')
        StockholdersEquity.rename(columns = {'end':'period_end_date', 'val':'StockholdersEquity'}, inplace = True)
        StockholdersEquity['ticker'] = ticker

        for index, row in StockholdersEquity.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorStockholdersEquity.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorStockholdersEquity.fetchall()
            cursorStockholdersEquity2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND StockholdersEquity = ? AND period_end_date = '"+period_end_date+"'", row['StockholdersEquity'])
            entry2 = cursorStockholdersEquity2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_end_date, fy, fp, form, ticker, StockholdersEquity) VALUES (?,?,?,?,?,?)"
                cursorStockholdersEquity.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['StockholdersEquity'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, StockholdersEquity = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorStockholdersEquity2.execute(query, row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['StockholdersEquity'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['StockholdersEquity'], 'Data zit al in database')
    
    except KeyError:
        print('data not found')

    cnxn.close()

StockholdersEquity()

#---CASH FLOW STATEMENT---
def NetIncomeLoss():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorNetIncomeLoss = cnxn.cursor()
    cursorNetIncomeLoss2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        NetIncomeLoss = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetIncomeLoss']['units']['USD'])
        NetIncomeLossQ1 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q1')]
        NetIncomeLossQ2 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q2')]
        NetIncomeLossQ3 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q3')]
        NetIncomeLossFY = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'FY')]
        NetIncomeLoss = pd.concat([NetIncomeLossQ1, NetIncomeLossQ2, NetIncomeLossQ3, NetIncomeLossFY]).sort_values('end').drop_duplicates(subset='end')
        NetIncomeLoss.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'NetIncomeLoss'}, inplace = True)
        NetIncomeLoss['ticker'] = ticker
        for index, row in NetIncomeLoss.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            NetIncomeLoss = row['NetIncomeLoss']
            cursorNetIncomeLoss.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorNetIncomeLoss.fetchall()
            cursorNetIncomeLoss2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND NetIncomeLoss = ? AND period_end_date = '"+period_end_date+"'", NetIncomeLoss)
            entry2 = cursorNetIncomeLoss2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, NetIncomeLoss) VALUES (?,?,?,?,?,?,?)"
                cursorNetIncomeLoss.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetIncomeLoss'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, NetIncomeLoss = ? WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'"
                cursorNetIncomeLoss2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetIncomeLoss'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'data succesvol geupdate')
            else:
                print (row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    try:
        NetIncomeLoss = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['ProfitLoss']['units']['USD'])
        NetIncomeLossQ1 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q1')]
        NetIncomeLossQ2 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q2')]
        NetIncomeLossQ3 = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'Q3')]
        NetIncomeLossFY = NetIncomeLoss.loc[(pd.to_datetime(NetIncomeLoss['start']) < pd.to_datetime(NetIncomeLoss['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetIncomeLoss['fp'] == 'FY')]
        NetIncomeLoss = pd.concat([NetIncomeLossQ1, NetIncomeLossQ2, NetIncomeLossQ3, NetIncomeLossFY]).sort_values('end').drop_duplicates(subset='end')
        NetIncomeLoss.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'NetIncomeLoss'}, inplace = True)
        NetIncomeLoss['ticker'] = ticker
        for index, row in NetIncomeLoss.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorNetIncomeLoss.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorNetIncomeLoss.fetchall()
            cursorNetIncomeLoss2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND NetIncomeLoss = ? AND period_end_date = '"+period_end_date+"'", row['NetIncomeLoss'])
            entry2 = cursorNetIncomeLoss2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, NetIncomeLoss) VALUES (?,?,?,?,?,?,?)"
                cursorNetIncomeLoss.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetIncomeLoss'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, NetIncomeLoss = ? WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'"
                cursorNetIncomeLoss2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetIncomeLoss'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'data succesvol geupdate')
            else:
                print (row['ticker'], row['period_end_date'], row['NetIncomeLoss'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    cnxn.close()
NetIncomeLoss()
    #ProfitLoss = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['ProfitLoss']['units']['USD'])[['start', 'end', 'fy', 'val']]
    #ProfitLoss.rename(columns = {'val':'NetIncomeLoss'}, inplace = True)
    #print(ProfitLoss)

def NetCashProvidedByUsedInOperatingActivities():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorNetCashProvidedByUsedInOperatingActivities = cnxn.cursor()
    cursorNetCashProvidedByUsedInOperatingActivities2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        NetCashProvidedByUsedInOperatingActivities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivities']['units']['USD'])
        NetCashProvidedByUsedInOperatingActivitiesQ1 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q1')]
        NetCashProvidedByUsedInOperatingActivitiesQ2 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q2')]
        NetCashProvidedByUsedInOperatingActivitiesQ3 = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'Q3')]
        NetCashProvidedByUsedInOperatingActivitiesFY = NetCashProvidedByUsedInOperatingActivities.loc[(pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['start']) < pd.to_datetime(NetCashProvidedByUsedInOperatingActivities['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (NetCashProvidedByUsedInOperatingActivities['fp'] == 'FY')]
        NetCashProvidedByUsedInOperatingActivities = pd.concat([NetCashProvidedByUsedInOperatingActivitiesQ1, NetCashProvidedByUsedInOperatingActivitiesQ2, NetCashProvidedByUsedInOperatingActivitiesQ3, NetCashProvidedByUsedInOperatingActivitiesFY]).sort_values('end').drop_duplicates(subset='end')
        NetCashProvidedByUsedInOperatingActivities.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'NetCashProvidedByUsedInOperatingActivities'}, inplace = True)
        NetCashProvidedByUsedInOperatingActivities['ticker'] = ticker

        for index, row in NetCashProvidedByUsedInOperatingActivities.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorNetCashProvidedByUsedInOperatingActivities.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorNetCashProvidedByUsedInOperatingActivities.fetchall()
            cursorNetCashProvidedByUsedInOperatingActivities2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND NetCashProvidedByUsedInOperatingActivities = ? AND period_end_date = '"+period_end_date+"'", row['NetCashProvidedByUsedInOperatingActivities'])
            entry2 = cursorNetCashProvidedByUsedInOperatingActivities2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, NetCashProvidedByUsedInOperatingActivities) VALUES (?,?,?,?,?,?,?)"
                cursorNetCashProvidedByUsedInOperatingActivities.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInOperatingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInOperatingActivities'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, NetCashProvidedByUsedInOperatingActivities = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorNetCashProvidedByUsedInOperatingActivities2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInOperatingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInOperatingActivities'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInOperatingActivities'], 'Data zit al in database')
    
    except KeyError:
        print('data not found')

    cnxn.close()

NetCashProvidedByUsedInOperatingActivities()

def NetCashProvidedByUsedInInvestingActivities():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorNetCashProvidedByUsedInInvestingActivities = cnxn.cursor()
    cursorNetCashProvidedByUsedInInvestingActivities2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        NetCashProvidedByUsedInInvestingActivities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInInvestingActivities']['units']['USD']).drop_duplicates(subset='end')
        NetCashProvidedByUsedInInvestingActivities.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'NetCashProvidedByUsedInInvestingActivities'}, inplace = True)
        NetCashProvidedByUsedInInvestingActivities['ticker'] = ticker

        for index, row in NetCashProvidedByUsedInInvestingActivities.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorNetCashProvidedByUsedInInvestingActivities.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorNetCashProvidedByUsedInInvestingActivities.fetchall()
            cursorNetCashProvidedByUsedInInvestingActivities2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND NetCashProvidedByUsedInInvestingActivities = ? AND period_end_date = '"+period_end_date+"'", row['NetCashProvidedByUsedInInvestingActivities'])
            entry2 = cursorNetCashProvidedByUsedInInvestingActivities2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, NetCashProvidedByUsedInInvestingActivities) VALUES (?,?,?,?,?,?,?)"
                cursorNetCashProvidedByUsedInInvestingActivities.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInInvestingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInInvestingActivities'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, NetCashProvidedByUsedInInvestingActivities = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorNetCashProvidedByUsedInInvestingActivities2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInInvestingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInInvestingActivities'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInInvestingActivities'], 'Data zit al in database')

    except KeyError:
        print('data not found')

    cnxn.close()

NetCashProvidedByUsedInInvestingActivities()

def NetCashProvidedByUsedInFinancingActivities():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorNetCashProvidedByUsedInFinancingActivities = cnxn.cursor()
    cursorNetCashProvidedByUsedInFinancingActivities2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        NetCashProvidedByUsedInFinancingActivities = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInFinancingActivities']['units']['USD']).drop_duplicates(subset='end')
        NetCashProvidedByUsedInFinancingActivities.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'NetCashProvidedByUsedInFinancingActivities'}, inplace = True)
        NetCashProvidedByUsedInFinancingActivities['ticker'] = ticker

        for index, row in NetCashProvidedByUsedInFinancingActivities.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorNetCashProvidedByUsedInFinancingActivities.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorNetCashProvidedByUsedInFinancingActivities.fetchall()
            cursorNetCashProvidedByUsedInFinancingActivities2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND NetCashProvidedByUsedInFinancingActivities = ? AND period_end_date = '"+period_end_date+"'", row['NetCashProvidedByUsedInFinancingActivities'])
            entry2 = cursorNetCashProvidedByUsedInFinancingActivities2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, NetCashProvidedByUsedInFinancingActivities) VALUES (?,?,?,?,?,?,?)"
                cursorNetCashProvidedByUsedInFinancingActivities.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInFinancingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInFinancingActivities'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, NetCashProvidedByUsedInFinancingActivities = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorNetCashProvidedByUsedInFinancingActivities2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['NetCashProvidedByUsedInFinancingActivities'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInFinancingActivities'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['NetCashProvidedByUsedInFinancingActivities'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    cnxn.close()

NetCashProvidedByUsedInFinancingActivities()

def PurchasesOfPropertyAndEquipment():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorPurchasesOfPropertyAndEquipment = cnxn.cursor()
    cursorPurchasesOfPropertyAndEquipment2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PurchasesOfPropertyAndEquipment']['units']['USD'])
        PurchasesOfPropertyAndEquipmentQ1 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q1')]
        PurchasesOfPropertyAndEquipmentQ2 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q2')]
        PurchasesOfPropertyAndEquipmentQ3 = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'Q3')]
        PurchasesOfPropertyAndEquipmentFY = PurchasesOfPropertyAndEquipment.loc[(pd.to_datetime(PurchasesOfPropertyAndEquipment['start']) < pd.to_datetime(PurchasesOfPropertyAndEquipment['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (PurchasesOfPropertyAndEquipment['fp'] == 'FY')]
        PurchasesOfPropertyAndEquipment = pd.concat([PurchasesOfPropertyAndEquipmentQ1, PurchasesOfPropertyAndEquipmentQ2, PurchasesOfPropertyAndEquipmentQ3, PurchasesOfPropertyAndEquipmentFY]).sort_values('end').drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'PurchasesOfPropertyAndEquipment'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker

        for index, row in PurchasesOfPropertyAndEquipment.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorPurchasesOfPropertyAndEquipment.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorPurchasesOfPropertyAndEquipment.fetchall()
            cursorPurchasesOfPropertyAndEquipment2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND PurchasesOfPropertyAndEquipment = ? AND period_end_date = '"+period_end_date+"'", row['PurchasesOfPropertyAndEquipment'])
            entry2 = cursorPurchasesOfPropertyAndEquipment2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, PurchasesOfPropertyAndEquipment) VALUES (?,?,?,?,?,?,?)"
                cursorPurchasesOfPropertyAndEquipment.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, PurchasesOfPropertyAndEquipment = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorPurchasesOfPropertyAndEquipment2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol geupdate')

        else:
            print (row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PaymentsToAcquirePropertyPlantAndEquipment']['units']['USD']).drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'PurchasesOfPropertyAndEquipment'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker

        for index, row in PurchasesOfPropertyAndEquipment.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorPurchasesOfPropertyAndEquipment.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorPurchasesOfPropertyAndEquipment.fetchall()
            cursorPurchasesOfPropertyAndEquipment2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND PurchasesOfPropertyAndEquipment = ? AND period_end_date = '"+period_end_date+"'", row['PurchasesOfPropertyAndEquipment'])
            entry2 = cursorPurchasesOfPropertyAndEquipment2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, PurchasesOfPropertyAndEquipment) VALUES (?,?,?,?,?,?,?)"
                cursorPurchasesOfPropertyAndEquipment.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, PurchasesOfPropertyAndEquipment = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorPurchasesOfPropertyAndEquipment2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol geupdate')

        else:
            print (row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'Data zit al in database')
    except KeyError:
        print('data not found')

    try:
        PurchasesOfPropertyAndEquipment = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['PurchasesOfPropertyAndEquipmentAndIntangibleAssets']['units']['USD']).drop_duplicates(subset='end')
        PurchasesOfPropertyAndEquipment.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'PurchasesOfPropertyAndEquipment'}, inplace = True)
        PurchasesOfPropertyAndEquipment['ticker'] = ticker

        for index, row in PurchasesOfPropertyAndEquipment.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorPurchasesOfPropertyAndEquipment.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorPurchasesOfPropertyAndEquipment.fetchall()
            cursorPurchasesOfPropertyAndEquipment2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND PurchasesOfPropertyAndEquipment = ? AND period_end_date = '"+period_end_date+"'", row['PurchasesOfPropertyAndEquipment'])
            entry2 = cursorPurchasesOfPropertyAndEquipment2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, PurchasesOfPropertyAndEquipment) VALUES (?,?,?,?,?,?,?)"
                cursorPurchasesOfPropertyAndEquipment.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, PurchasesOfPropertyAndEquipment = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorPurchasesOfPropertyAndEquipment2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['PurchasesOfPropertyAndEquipment'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'data succesvol geupdate')

        else:
            print (row['ticker'], row['period_end_date'], row['PurchasesOfPropertyAndEquipment'], 'Data zit al in database')
    except KeyError:
        print('data not found')
    

    cnxn.close()

PurchasesOfPropertyAndEquipment()

#---INCOME STATEMENT---
def Revenues():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorRevenues = cnxn.cursor()
    cursorRevenues2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['Revenues']['units']['USD'])
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'Revenues'}, inplace = True)
        Revenues['ticker'] = ticker

        for index, row in Revenues.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorRevenues.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorRevenues.fetchall()
            cursorRevenues2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND Revenues = ? AND period_end_date = '"+period_end_date+"'", row['Revenues'])
            entry2 = cursorRevenues2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, Revenues) VALUES (?,?,?,?,?,?,?)"
                cursorRevenues.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Revenues'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Revenues'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, Revenues = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorRevenues2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Revenues'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Revenues'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['Revenues'], 'Data zit al in database')
        print('data found')
    except KeyError:
        print('data not found')

    try:
        Revenues = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax']['units']['USD'])
        print('data found')
        RevenuesQ1 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=3) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q1')]
        RevenuesQ2 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=6) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q2')]
        RevenuesQ3 = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=9) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'Q3')]
        RevenuesFY = Revenues.loc[(pd.to_datetime(Revenues['start']) < pd.to_datetime(Revenues['end'])- pd.DateOffset(months=12) + pd.DateOffset(days=30)) & (Revenues['fp'] == 'FY')]
        Revenues = pd.concat([RevenuesQ1, RevenuesQ2, RevenuesQ3, RevenuesFY]).sort_values('end').drop_duplicates(subset='end')
        Revenues.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'Revenues'}, inplace = True)
        Revenues['ticker'] = ticker

        for index, row in Revenues.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorRevenues.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorRevenues.fetchall()
            cursorRevenues2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND Revenues = ? AND period_end_date = '"+period_end_date+"'", row['Revenues'])
            entry2 = cursorRevenues2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, Revenues) VALUES (?,?,?,?,?,?,?)"
                cursorRevenues.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Revenues'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Revenues'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, Revenues = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorRevenues2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['Revenues'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['Revenues'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['Revenues'], 'Data zit al in database')
        print('data found')
    except KeyError:
        print('data not found')

    cnxn.close()

Revenues()

def WeightedAverageNumberOfDilutedSharesOutstanding():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorWeightedAverageNumberOfDilutedSharesOutstanding = cnxn.cursor()
    cursorWeightedAverageNumberOfDilutedSharesOutstanding2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        WeightedAverageNumberOfDilutedSharesOutstanding = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['WeightedAverageNumberOfDilutedSharesOutstanding']['units']['shares']).drop_duplicates(subset='end')
        WeightedAverageNumberOfDilutedSharesOutstanding.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'WeightedAverageNumberOfDilutedSharesOutstanding'}, inplace = True)
        WeightedAverageNumberOfDilutedSharesOutstanding['ticker'] = ticker

        for index, row in WeightedAverageNumberOfDilutedSharesOutstanding.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorWeightedAverageNumberOfDilutedSharesOutstanding.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorWeightedAverageNumberOfDilutedSharesOutstanding.fetchall()
            cursorWeightedAverageNumberOfDilutedSharesOutstanding2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND WeightedAverageNumberOfDilutedSharesOutstanding = ? AND period_end_date = '"+period_end_date+"'", row['WeightedAverageNumberOfDilutedSharesOutstanding'])
            entry2 = cursorWeightedAverageNumberOfDilutedSharesOutstanding2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, WeightedAverageNumberOfDilutedSharesOutstanding) VALUES (?,?,?,?,?,?,?)"
                cursorWeightedAverageNumberOfDilutedSharesOutstanding.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['WeightedAverageNumberOfDilutedSharesOutstanding'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['WeightedAverageNumberOfDilutedSharesOutstanding'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, WeightedAverageNumberOfDilutedSharesOutstanding = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorWeightedAverageNumberOfDilutedSharesOutstanding2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['WeightedAverageNumberOfDilutedSharesOutstanding'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['WeightedAverageNumberOfDilutedSharesOutstanding'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['WeightedAverageNumberOfDilutedSharesOutstanding'], 'Data zit al in database')
        print('data found')
    except KeyError:
        print('data not found')

    cnxn.close()

WeightedAverageNumberOfDilutedSharesOutstanding()

def CommonStockDividendsPerShareDeclared():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    cursorCommonStockDividendsPerShareDeclared = cnxn.cursor()
    cursorCommonStockDividendsPerShareDeclared2 = cnxn.cursor()
    ticker = companyData['ticker'][0]
    try:
        CommonStockDividendsPerShareDeclared = pd.DataFrame(companyFacts.json()['facts']['us-gaap']['CommonStockDividendsPerShareDeclared']['units']['USD/shares']).drop_duplicates(subset='end')
        CommonStockDividendsPerShareDeclared.rename(columns = {'start':'period_start_date', 'end':'period_end_date', 'val':'CommonStockDividendsPerShareDeclared'}, inplace = True)
        CommonStockDividendsPerShareDeclared['ticker'] = ticker

        for index, row in CommonStockDividendsPerShareDeclared.iterrows():
            aandelen_data_row = pd.DataFrame(row).swapaxes('index', 'columns')
            period_end_date = str(aandelen_data_row.iloc[0]['period_end_date'])
            ticker = aandelen_data_row.iloc[0]['ticker']
            cursorCommonStockDividendsPerShareDeclared.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'")
            entry = cursorCommonStockDividendsPerShareDeclared.fetchall()
            cursorCommonStockDividendsPerShareDeclared2.execute("SELECT * FROM aandelen_data_ WHERE ticker = '"+ticker+"' AND Dividend = ? AND period_end_date = '"+period_end_date+"'", row['CommonStockDividendsPerShareDeclared'])
            entry2 = cursorCommonStockDividendsPerShareDeclared2.fetchall()

            if len(entry) ==0:
                query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker, CommonStockDividendsPerShareDeclared) VALUES (?,?,?,?,?,?,?)"
                cursorCommonStockDividendsPerShareDeclared.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['CommonStockDividendsPerShareDeclared'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['CommonStockDividendsPerShareDeclared'], 'data succesvol toegevoegd')

            elif len(entry2) ==0:
                query = "UPDATE aandelen_data_ SET period_start_date = ?, period_end_date = ?, fy = ?, fp = ?, form = ?, ticker = ?, Dividend = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
                cursorCommonStockDividendsPerShareDeclared2.execute(query, row['period_start_date'], row['period_end_date'], row['fy'], row['fp'], row['form'], row['ticker'], row['CommonStockDividendsPerShareDeclared'])
                cnxn.commit()
                print(row['ticker'], row['period_end_date'], row['CommonStockDividendsPerShareDeclared'], 'data succesvol geupdate')

            else:
                print (row['ticker'], row['period_end_date'], row['CommonStockDividendsPerShareDeclared'], 'Data zit al in database')
        print('data found')
    except KeyError:
        print('data not found')
        

    cnxn.close()

CommonStockDividendsPerShareDeclared()

"""
