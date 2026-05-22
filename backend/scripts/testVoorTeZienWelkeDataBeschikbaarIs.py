#IMPORT MODULES
import requests
import pandas as pd
import numpy as np
import datetime
import pyodbc
import json

#INPUTS
ticker = 'MSFT'
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


cik = companyData['cik_str'][0]

# get company facts data
companyFacts = requests.get(
    f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
    headers=headers
    )

viewCompanyFacts = companyFacts.json()['facts']['us-gaap']
print(companyFacts.json()['facts']['us-gaap'].keys())
#print(companyFacts.json()['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']['units']['USD'])
#print(viewCompanyFacts.keys())
print(pd.DataFrame(companyFacts.json()['facts']['us-gaap']['WeightedAverageNumberOfDilutedSharesOutstanding']['units']['shares']).sort_values(['end', 'start'], ascending=[True, True]).drop_duplicates(subset='end'))
#SELECTING THE VALUES
#select ticker

ticker = companyData['ticker'][0]
print('ticker: ' + ticker)
