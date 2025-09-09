
# Filename - server.py
 
# Import flask and datetime module for showing date and time
from flask import Flask, request, jsonify, session
import pyodbc
import numpy as np 
import pandas as pd
from yahoo_fin import stock_info as si
import requests
import bcrypt




#INPUTS
#ticker = 'VECO'
server = 'portfoliovr-server.database.windows.net'
database = 'portfoliovr-database'	
username = 'portfoliovr-server-admin'
password = 'F0LKYYOYM284LFQ7$'
 
conn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)

# Initializing flask app
app = Flask(__name__)
app.secret_key = 'testtesttest'
 
@app.route('/api/tickersInDb')
def get_tickers():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query = "SELECT DISTINCT ticker FROM aandelen_data_ ORDER BY ticker ASC"
    tickers =  pd.read_sql(query, cnxn)['ticker'].tolist()

    # Create an array using numpy 
    print(tickers)
    data = [{"ticker": item[5]} for item in tickers]

    return data

@app.route('/api/data/<tickerUpdated>', methods=['GET'])
def get_data(tickerUpdated):
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query = "SELECT * FROM aandelen_data_ WHERE ticker = '"+tickerUpdated+"' ORDER BY ticker ASC, period_end_date DESC"
    tickers =  pd.read_sql(query, cnxn).fillna("NaN")
    tickers = tickers.values.tolist()
    
    
    #'period_start_date', 
      #      'period_end_date',
       #     'fy',
        #    'fp',
         #   'form',
          ##  'ticker',
            #'LiabilitiesCurrent',
    #        'Liabilities',
     #       'StockholdersEquity',
      #      'NetIncomeLoss',
       #     'NetCashProvidedByUsedInOperatingActivities',
        #    'PurchasesOfPropertyAndEquipment',
         #   'Revenues',
          #  'WeightedAverageNumberOfDilutedSharesOutstanding',
     #       'Dividend',
      #      'toegevoegd_door',
       #     'toevoegingstype',
        #    'wijzigingsdatum'].tolist()"""

    # Create an array using numpy 
    print(tickers)
    data = [{"period_start_date": item[0],"period_end_date": item[1], "fy": item[2], "fp": item[3], "form": item[4], "ticker": item[5], "LiabilitiesCurrent": item[8], "Liabilities": item[9], "StockholdersEquity": item[10], "NetIncomeLoss": item[11], "NetCashProvidedByUsedInOperatingActivities": item[12], "PurchasesOfPropertyAndEquipment": item[15], "Revenues": item[16], "WeightedAverageNumberOfDilutedSharesOutstanding": item[17], "Dividend": item[18]} for item in tickers]

    return data

@app.route('/api/IdealePortfolio/<user_id>', methods=['GET'])
def get_IdealePortfolio(user_id):
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    ideale_portfolio_date='2024-12-31'
    #ideale_portfolio_date = request.args.get('ideale_portfolio_date')
    #ideale_portfolio_date = requests.get('/api/IdealePortfolio/?q=${ideale_portfolio_date}')
    ideale_portfolio1 = []
    query1 = "SELECT ticker FROM aandelen_data_calc_ GROUP BY ticker "
    lijst_geanalyseerde_aandelen = pd.read_sql(query1, cnxn)['ticker'].tolist()

    for aandeel in lijst_geanalyseerde_aandelen:
        query3 = "SELECT TOP 1 ticker, period_end_date, selectiecriteria, waarde_verdeling, intrinsieke_waarde FROM aandelen_data_calc_ WHERE ticker='"+aandeel+"' AND period_end_date <='"+user_id+"' ORDER BY period_end_date DESC"
        aandelen_data = pd.read_sql(query3, cnxn)
        aandelen_data = aandelen_data.values.tolist()
        aandelen_data = [item for sublist in aandelen_data for item in sublist]

        ideale_portfolio1.append(aandelen_data)
    
    ideale_portfolio = pd.DataFrame(ideale_portfolio1, columns=['ticker', 'period_end_date', 'selectiecriteria','waarde_verdeling', 'intrinsieke_waarde']).round(2)
    ideale_portfolio = ideale_portfolio[ideale_portfolio['selectiecriteria'] == 8]
    ideale_portfolio = ideale_portfolio.sort_values(by=['waarde_verdeling'], ascending=False)
    som_waarde_verdeling = ideale_portfolio['waarde_verdeling'].sum()
    ideale_portfolio['ideale_verdeling'] = ideale_portfolio['waarde_verdeling'] / som_waarde_verdeling
    ideale_portfolio['prijs_aandelen_nu'] = [si.get_live_price(ideale_portfolio['ticker'].tolist()[i]) for i in range(len(ideale_portfolio['ticker'].tolist()))]
    ideale_portfolio['koopmarge_nu'] = ideale_portfolio['prijs_aandelen_nu'] / ideale_portfolio['intrinsieke_waarde'] -1

    ideale_portfolio = ideale_portfolio.round(4)
    ideale_portfolio = ideale_portfolio.values.tolist()


    ideale_portfolio = [{"ticker": item[0], "period_end_date": item[1], "selectiecriteria": item[2], "waarde_verdeling": item[3], "intrinsieke_waarde": item[4], "ideale_verdeling": item[5], "prijs_aandelen_nu": item[6], "koopmarge": item[7]} for item in ideale_portfolio]

    return ideale_portfolio

"""@app.route('/api/addOnvolledigeData', methods=['POST'])
def AddOnvolledigeData():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    
    data = request.json
    ticker = data['ticker']
    period_end_date = data['period_end_date']
    dataType = data['dataType']
    value = data['value']


    cursor = cnxn.cursor()
    query = "UPDATE aandelen_data_ SET '"+dataType+"' = ? WHERE ticker = '"+ticker+"' AND period_end_date = '"+period_end_date+"'"
    cursor.execute(query, value)
    cnxn.commit()"""

@app.route('/api/getUsers', methods=['GET'])
def GetUsers():
    cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
    query = "SELECT * FROM userData"
    users =  pd.read_sql(query, cnxn)
    users = users.values.tolist()
    users = [{"userName": item[1]} for item in users]
    return users

@app.route('/api/getOnvolledigeData', methods=['GET'])
def GetOnvolledigeData():
    from python_files.checkForMinData import OntbrekendeData
    totalMissingDataCombo, totalMissingDataGroup = OntbrekendeData()
    onvolledigeData = [{"ticker": row[0], "hoeveelheidOntbrekendeDataCels": row[1], "percOntbrekendeDataCels": row[2], "tickerData": [{"period_end_date": 111, "dataType": "currentLiabilities"},{"period_end_date": 111, "dataType": "currentLiabilities"}]} for row in totalMissingDataGroup] 
    #"period_end_date": row[0], "ticker": row[1], "onvolledigeData": row[2]} for row in totalMissingDataCombo]
    return onvolledigeData

@app.route('/api/getSecData/<ticker>', methods=['GET'])
def GetSecData(ticker):
    from python_files.changeDataToDatabaseFromSec import GetSec
    secData = GetSec(ticker)
    #secData = secData.to_json(orient='records')
    secData = secData.values.tolist()
    secData = [{"period_end_date": item[0], "ticker": item[1], "fundamental_name": item[2], "fundamental_value":item[3], "fundamental_value_db": item[4], "in_database": item[5]} for item in secData]
    return secData

@app.route('/api/updateDataWithSec', methods=['POST'])
def UpdateDataWithSec():
    try:
        data = request.get_json()  # Expecting JSON data with username, useraddress, and useremail
        for row in data:    
            fundamental_name = row['fundamental_name']
            cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
            cursor = cnxn.cursor()
            query = f"UPDATE aandelen_data_ SET {fundamental_name} = ? WHERE ticker = '"+row['ticker']+"' AND period_end_date = '"+row['period_end_date']+"'"
            cursor.execute(query, row['fundamental_value'])
            cnxn.commit()

        return jsonify({'message': 'Userdata updated succesfully!'})

    except Exception as e:
        return jsonify({'error': str(e)})
    
@app.route('/api/addKwartaal', methods=['POST'])
def AddKwartaal():
    data = request.get_json()  # Expecting JSON data
    try:
        cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
        cursor = cnxn.cursor()
        query = f"INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form, ticker) VALUES (?,?,?,?,?,?)"
        cursor.execute(query, data['period_start_date'], data['period_end_date'], data['fy'], data['fp'], data['form'], data['ticker'])
        cnxn.commit()

        return jsonify({'message': 'Userdata added succesfully!'})

    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/api/changeUsers', methods=['POST'])
def ChangeUserData():
    try:
        data = request.get_json()  # Expecting JSON data with username, useraddress, and useremail
        userName = data.get('userName')
        userEmail = data.get('userEmail')
        
        #userName = data['userName']
        #userEmail = data['userEmail']

        # connect to Azure SQL
        cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
        cursor = cnxn.cursor()

        # Insert data into the database
        #query = "UPDATE userData SET userEmail = ? WHERE userName = '"+userName+"'"
        query = "INSERT INTO userData (userName) VALUES (?)"
        cursor.execute(query, userName)
        cnxn.commit()

        return jsonify({'message': userName + 'Userdata saved succesfully!'})
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/dashboard/arnevanriel')
def Huidige_portfolio():
    import pandas as pd
    from yahoo_fin import stock_info as si
    from pathlib import Path
    from forex_python.converter import CurrencyRates


    imput_path_h_portf = Path(__file__).parents[1] / 'input_output/input_huidige_portfolioA.xlsx'


    h_portf_eenheden = pd.read_excel(imput_path_h_portf)

    h_portf2 = h_portf_eenheden.groupby('ticker')[['eenheden', 'currency']].agg('sum').reset_index()


    h_portf2['prijs_aandelen_nu_inUSD'] = [si.get_live_price(h_portf2['ticker'].tolist()[i]) for i in range(len(h_portf2['ticker'].tolist()))]
    #h_portf2.loc[h_portf2['currency'] == 'HKD', 'prijs_aandelen_nu_inUSD'] = CurrencyRates().convert('HKD', 'USD', h_portf2['prijs_aandelen_nu_inUSD'])
    h_portf2['waarde'] = h_portf2['eenheden'] * h_portf2['prijs_aandelen_nu_inUSD']
    h_portf2['verdeling_nu (%)'] = h_portf2['waarde'] / h_portf2['waarde'].sum()
    h_portf2 = h_portf2.sort_values(by='verdeling_nu (%)', ascending = False).round(4).values.tolist()
    #totale_waarde_portfolio = h_portf2['waarde'].sum()

    #print(h_portf2)

    return h_portf2

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    cursor = conn.cursor()

    cursor.execute("SELECT id, username, password FROM Users WHERE username = ?", (data['username']))

    row = cursor.fetchone()
    if row is not None:
        user_input_password = data['password']
        user_input_password_bytes = user_input_password.encode('utf-8')
        stored_hashed_password = row[2].encode('utf-8')

        if row and bcrypt.checkpw(user_input_password_bytes, stored_hashed_password):
            print("Het wachtwoord komt overeen!")
            try:
                session['gebruiker_id'] = row[0]
                session['gebruiker'] = row[1]
                session['logged_in'] = True
                print("sessie is aangemaakt")
                print(session)
            except:
                print("sessie niet gemaakt")
            return jsonify(success=True), 200
        else:
            print("Het wachtwoord komt niet overeen.")
            return jsonify(success=False), 401
    else:
        return jsonify(success=False, message="Gebruikersnaam niet gevonden"), 404
    
@app.route('/checkLogin', methods=['GET'])
def CheckLogin():
    if 'gebruiker_id' in session and 'logged_in' in session:        
        print(session)
        return jsonify(logged_in=True), 200
    else:
        print(session)
        return jsonify(logged_in=False)
    
@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify(success=True), 200
  
# Running app
if __name__ == '__main__':
    app.run(port=5000, debug=True)