import requests
import pandas as pd
import pyodbc

# 🔹 Azure SQL Database Configuratie
SERVER = 'portfoliovr-server.database.windows.net'
DATABASE = 'portfoliovr-database'
USERNAME = 'portfoliovr-server-admin'
PASSWORD = 'F0LKYYOYM284LFQ7$'

# 🔹 Headers voor SEC API Requests
HEADERS = {'User-Agent': "arne.van.riel@hotmail.be"}

# 🔹 Data mapping met fallback keys
FIELDS_TO_CHECK = {
    "AssetsCurrent": ["AssetsCurrent"],
    "Assets": ["Assets"],
    "LiabilitiesCurrent": [
        "LiabilitiesCurrent", 
        ("EmployeeRelatedLiabilitiesCurrentAndNoncurrent - AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent", 
         ["EmployeeRelatedLiabilitiesCurrentAndNoncurrent", "AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent"]),
        ("UnearnedPremiums + LiabilityForClaimsAndClaimsAdjustmentExpense + AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent", 
         ["UnearnedPremiums", "LiabilityForClaimsAndClaimsAdjustmentExpense", "AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent"])
    ],
    "Liabilities": ["Liabilities"],
    "StockholdersEquity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "NetIncomeLoss": ["NetIncome"],
    "NetCashProvidedByUsedInOperatingActivities": [
        "NetCashProvidedByUsedInOperatingActivities", 
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "NetCashProvidedByUsedInInvestingActivities": ["NetCashProvidedByUsedInInvestingActivities"],
    "NetCashProvidedByUsedInFinancingActivities": ["NetCashProvidedByUsedInFinancingActivities"],
    "PurchasesOfPropertyAndEquipment": ["PurchasesOfPropertyAndEquipment"],
    "Revenues": ["Revenues"],
    "WeightedAverageNumberOfDilutedSharesOutstanding": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "Dividend": ["PaymentsOfDividends", "CommonStockDividendsPerShareDeclared"]
}

# Velden zonder startdatum
NO_START_FIELDS = {"AssetsCurrent", "Assets", "LiabilitiesCurrent", "Liabilities", "StockholdersEquity"}

# 🔹 Ophalen van CIK-code
def get_cik(ticker):
    response = requests.get("https://www.sec.gov/files/company_tickers.json", headers=HEADERS)
    company_data = pd.DataFrame.from_dict(response.json(), orient='index')
    company_data['cik_str'] = company_data['cik_str'].astype(str).str.zfill(10)
    result = company_data.loc[company_data['ticker'] == ticker, 'cik_str']
    return result.iloc[0] if not result.empty else None

# 🔹 Ophalen van financiële data van SEC API
def get_financial_data(cik):
    url = f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json'
    response = requests.get(url, headers=HEADERS)
    return response.json().get('facts', {}).get('us-gaap', {})

# 🔹 Verwerken van financiële data
def process_financial_data(financial_data, ticker):
    df_list = []
    
    for column_name, possible_api_keys in FIELDS_TO_CHECK.items():
        for key in possible_api_keys:
            # Controleer of de key (of de berekening) beschikbaar is
            if isinstance(key, tuple):
                # Voor samengestelde velden laten we de berekening uitvoeren.
                formula, required_keys = key
                # Voor samengestelde velden gaan we ervan uit dat er geen startdatum filtering nodig is.
                # (Je kunt hier eventueel extra logica toevoegen als dat gewenst is.)
                values = {}
                period_dates = set()
                for req_key in required_keys:
                    if req_key in financial_data and "USD" in financial_data[req_key]['units']:
                        entry = financial_data[req_key]['units']["USD"][0]
                        values[req_key] = entry['val']
                        period_dates.add(entry['end'])
                if len(values) == len(required_keys) and len(period_dates) == 1:
                    period_end_date = period_dates.pop()
                    # Gebruik de berekende waarde en noteer de gebruikte keys in how_added.
                    computed_value = eval(formula, {}, values)
                    df_list.append({
                        'period_end_date': period_end_date,
                        'value': computed_value,
                        'metric': column_name,
                        'how_added': f"Computed: {formula}",
                        'fy': None,   # Bij berekeningen kun je eventueel geen fy/fp/form hebben; hier laat je ze leeg of bepaal je ze uit één van de componenten.
                        'fp': None,
                        'form': None,
                        'period_start_date': period_end_date,  # Voor berekeningen nemen we als startdatum hetzelfde aan
                        'ticker': ticker
                    })
                    break
            else:
                if key in financial_data and "USD" in financial_data[key]['units']:
                    data_entries = financial_data[key]['units']["USD"]
                    for entry in data_entries:
                        # Controleer of alle benodigde velden aanwezig zijn
                        if not all(k in entry for k in ["end", "val", "fy", "fp", "form"]):
                            continue
                        # Bepaal period_start_date:
                        if "start" in entry:
                            # Voor velden die wel een startdatum hebben, filter de juiste waarde
                            if column_name not in NO_START_FIELDS:
                                offset = 0
                                if entry["fp"] == "Q1":
                                    offset = 3
                                elif entry["fp"] == "Q2":
                                    offset = 6
                                elif entry["fp"] == "Q3":
                                    offset = 9
                                elif entry["fp"] == "FY":
                                    offset = 12
                                # Controleer de voorwaarde: start < end - offset maanden + 30 dagen
                                if pd.to_datetime(entry["start"]) < pd.to_datetime(entry["end"]) - pd.DateOffset(months=offset) + pd.DateOffset(days=30):
                                    period_start_date = entry["start"]
                                else:
                                    continue  # Deze entry voldoet niet aan de voorwaarde
                            else:
                                # Voor de velden zonder startdatum
                                period_start_date = entry["end"]
                        else:
                            period_start_date = entry["end"]
                            
                        df_list.append({
                            'period_start_date': period_start_date,
                            'period_end_date': entry["end"],
                            'value': entry["val"],
                            'metric': column_name,
                            'how_added': f"SEC API - {key}",
                            'fy': entry["fy"],
                            'fp': entry["fp"],
                            'form': entry["form"],
                            'ticker': ticker
                        })
                    break  # Stop na de eerste gevonden waarde voor deze metric
    
    return pd.DataFrame(df_list) if df_list else None

# 🔹 Ophalen van stock_id vanuit Stocks
def get_stock_id(ticker, cursor):
    cursor.execute("SELECT aandeel_id FROM Stocks WHERE ticker_symbol = ?", ticker)
    result = cursor.fetchone()
    return result[0] if result else None

# 🔹 Ophalen van fp_id vanuit FiscalPeriods
def get_fp_id(fp, cursor):
    cursor.execute("SELECT fp_id FROM FiscalPeriods WHERE fp = ?", fp)
    result = cursor.fetchone()
    return result[0] if result else None

# 🔹 Ophalen van form_id vanuit Forms
def get_form_id(form, cursor):
    cursor.execute("SELECT form_id FROM Forms WHERE form = ?", form)
    result = cursor.fetchone()
    return result[0] if result else None

# 🔹 Data opslaan in Azure SQL Database
def store_data_in_db(df):
    if df is None or df.empty:
        print("❌ Geen gegevens om op te slaan.")
        return
    
    with pyodbc.connect(f'DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={SERVER};DATABASE={DATABASE};UID={USERNAME};PWD={PASSWORD}') as cnxn:
        cursor = cnxn.cursor()

        for _, row in df.iterrows():
            stock_id = get_stock_id(row['ticker'], cursor)
            if not stock_id:
                print(f"❌ Stock ID niet gevonden voor {row['ticker']}")
                continue

            period_end_date = row['period_end_date']
            fy = row['fy']
            fp = row['fp']
            form = row['form']

            # Haal de IDs op uit de database; als fy, fp, of form leeg zijn (bij berekende waarden), kun je standaardwaarden toepassen of overslaan.
            fp_id = get_fp_id(fp, cursor) if fp is not None else None
            form_id = get_form_id(form, cursor) if form is not None else None

            if (fp is not None and fp_id is None) or (form is not None and form_id is None):
                print(f"❌ fp_id of form_id niet gevonden voor {fp}, {form}")
                continue
            
            # Check of data al bestaat
            cursor.execute(
                """SELECT value FROM fundamental_data 
                   WHERE stock_id = ? AND period_end_date = ? AND data_type = ?""",
                stock_id, period_end_date, row['metric']
            )
            existing_row = cursor.fetchone()

            if existing_row:
                existing_value = existing_row[0]
                if existing_value != row['value']:  # Alleen updaten als de waarde verschilt
                    cursor.execute(
                        """UPDATE fundamental_data
                           SET period_start_date = ?, value = ?, how_added = ?, fy = ?, fp_id = ?, form_id = ?, updated_at = SYSDATETIME()
                           WHERE stock_id = ? AND period_end_date = ? AND data_type = ?""",
                        row['period_start_date'], row['value'], row['how_added'], fy, fp_id, form_id, stock_id, period_end_date, row['metric']
                    )
                    print(f"🔄 Geüpdatet: {row['ticker']} {period_end_date} {row['metric']} = {row['value']} (was {existing_value})")
                else:
                    print(f"✅ Geen update nodig: {row['ticker']} {period_end_date} {row['metric']} = {row['value']} (ongewijzigd)")
            else:
                cursor.execute(
                    """INSERT INTO fundamental_data 
                       (period_start_date, period_end_date, fy, fp_id, form_id, stock_id, data_type, value, how_added, created_at, updated_at) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, SYSDATETIME(), SYSDATETIME())""",
                    row['period_start_date'], period_end_date, fy, fp_id, form_id, stock_id, row['metric'], row['value'], row['how_added']
                )
                print(f"✅ Ingevoegd: {row['ticker']} {period_end_date} {row['metric']} = {row['value']}")
        cnxn.commit()

# 🔹 Hoofdfunctie
def main(ticker):
    cik = get_cik(ticker)
    if not cik:
        print(f"❌ CIK niet gevonden voor {ticker}")
        return
    
    financial_data = get_financial_data(cik)
    df = process_financial_data(financial_data, ticker)
    store_data_in_db(df)

# 🚀 Start de functie voor een voorbeeldticker
main("PG")
