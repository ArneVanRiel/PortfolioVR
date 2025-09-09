import pyodbc
#voorbeeld
#sqlcmd -S portfoliovr-server.database.windows.net -U portfoliovr-server-admin -P F0LKYYOYM284LFQ7$ -d portfoliovr-database -Q "CREATE TABLE Employees (Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY, Name NVARCHAR(50), Location NVARCHAR(50));"
#sqlcmd -S portfoliovr-server.database.windows.net -U portfoliovr-server-admin -P F0LKYYOYM284LFQ7$ -d portfoliovr-database -Q "INSERT INTO Employees (Name, Location) VALUES (N'Jared', N'Australia'), (N'Nikita', N'India'), (N'Tom', N'Germany');"
server = 'portfoliovr-server.database.windows.net'
database = 'portfoliovr-database'	
username = 'portfoliovr-server-admin'
password = 'F0LKYYOYM284LFQ7$'
cnxn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+server+';DATABASE='+database+';UID='+username+';PWD='+ password)
cursor = cnxn.cursor()

#CREATE table
"""cursor.execute("CREATE TABLE aandelen_data_(period_start_date VARCHAR(20), period_end_date VARCHAR(20), fy REAL, fp VARCHAR(20), form VARCHAR(20), ticker VARCHAR(20), AssetsCurrent REAL, Assets REAL, LiabilitiesCurrent REAL, Liabilities REAL, StockholdersEquity REAL, NetIncomeLoss REAL, NetCashProvidedByUsedInOperatingActivities REAL, NetCashProvidedByUsedInInvestingActivities REAL, NetCashProvidedByUsedInFinancingActivities REAL, PurchasesOfPropertyAndEquipment REAL, Revenues REAL, WeightedAverageNumberOfDilutedSharesOutstanding REAL, Dividend REAL)")"""
"""cursor.execute("CREATE TABLE aandelen_data_calc_(period_start_date VARCHAR(20), period_end_date VARCHAR(20), fy REAL, fp VARCHAR(20), form VARCHAR(20), ticker VARCHAR(20), standaard_deviatie_FCF REAL, gem_groeipercentage_FCF REAL, waardefactor_FCF REAL, standaard_deviatie_ROE REAL, Gemiddelde_stijging_ROE_10_Y REAL, waardefactor_ROE REAL, non_curr_liabilities REAL, LTD_s_equity REAL, waardefactor_LTD_equity REAL, standaard_deviatie_winstmarge REAL, Gemiddelde_winstmarge REAL, waardefactor_winstmarge REAL, Gemiddelde_stijging_dividend_10_Y REAL, standaard_deviatie_dividend_10_Y REAL, waardefactor_dividend REAL, intrinsieke_waarde REAL, selectiecriteria REAL, waarde_verdeling1 REAL, waarde_verdeling_tov_min1 REAL, waarde_verdeling_stdev REAL, waarde_verdeling_mean REAL, waarde_verdeling REAL)")"""
"""cursor.execute("CREATE TABLE Users (id INT IDENTITY(1,1) PRIMARY KEY, username NVARCHAR(80) NOT NULL UNIQUE,password NVARCHAR(120) NOT NULL)")


cnxn.commit()
cnxn.close()
print ('Successfully created!')"""


# CREATE column
"""print ('Inserting a new column into table')
tsql = "ALTER TABLE aandelen_data_ ADD Test varchar(10)"
with cursor.execute(tsql):
    print ('Successfully added new column!')"""

# change data type of column
"""ALTER TABLE [dbo].[aandelen_data_]
ALTER COLUMN Assets DECIMAL(38,0)"""

# DELETE column
"""print ('Delete a new column into table')
tsql = "ALTER TABLE aandelen_data_ DROP COLUMN Test"
with cursor.execute(tsql):
    print ('Successfully deleted new column!')"""

# RENAME column
"""print ('Rename a column')
tsql = "ALTER TABLE aandelen_data_ CHANGE [COLUMN] Dividend CommonStockDividendsPerShareDeclared"
with cursor.execute(tsql):
    print ('Successfully renamed new column!')"""

#Insert Query
"""print ('Inserting a new row into table')
query = "INSERT INTO aandelen_data_ (period_start_date, period_end_date, fy, fp, form,  ticker) VALUES (?,?,?,?,?,?)"
cursor.execute(query, '2023-12-02', '2024-03-01', 2024, 'Q1', '10-Q','ADBE')
cnxn.commit()

print ('Successfully Inserted!')"""

#Update Query
('Updating Location for Nikita')
tsql = "UPDATE aandelen_data_ SET Dividend = 0 WHERE ticker = 'SNPS'"
with cursor.execute(tsql):
    print ('Successfully Updated!')

#update 
"""print ('Updating Location for Nikita')
tsql = "UPDATE aandelen_data_ SET Dividend = 1.88 WHERE ticker = 'UNH' AND period_end_date = '2024-03-31'"
with cursor.execute(tsql):
    print ('Successfully Updated!')"""

#Delete table
"""print("Deleting table")
cursor.execute("DROP TABLE Employees")
cnxn.commit()
cnxn.close()
print ('Successfully Deleted!')"""

#Delete Query
"""print ('Deleting all data')
tsql = "DELETE FROM aandelen_data_calc_"
with cursor.execute(tsql):
    print ('Successfully Deleted!')"""

#Delete cell
#tsql = "UPDATE aandelen_data_ SET WeightedAverageNumberOfDilutedSharesOutstanding = NULL WHERE ticker = 'GOOGL' AND period_end_date = '2023-06-30'"
"""tsql = "UPDATE aandelen_data_ SET Dividend = 0 WHERE ticker = 'MNST'"

with cursor.execute(tsql):
    print ('Successfully Deleted!')"""

#Select Query
"""print ('Reading data from table')
tsql = "SELECT Name, Location FROM Employees;"
with cursor.execute(tsql):
    row = cursor.fetchone()
    while row:
        print (str(row[0]) + " " + str(row[1]))
        row = cursor.fetchone()"""