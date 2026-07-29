-- ============================================================
-- PortfolioVR - Azure SQL Schema
-- Generated on 2026-07-29T12:21:35.915Z
-- ============================================================

-- ============================================================
-- AANDELEN_DATA
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'aandelen_data')
CREATE TABLE aandelen_data (
    ticker_symbol varchar(MAX),
    datum_laatste_dag_kwartaal varchar(50),
    kwartaal_tov_jaarverslag varchar(5),
    current_liabilities real,
    total_liabilities real,
    Shareholder_Equity real,
    net_income real,
    net_cash_provided_by_operating_activities real,
    purchases_of_property_and_equipment real,
    Total_revenues real,
    uitstaande_aandelen_diluted decimal,
    dividend_share real
);

-- ============================================================
-- AANDELEN_DATA_
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'aandelen_data_')
CREATE TABLE aandelen_data_ (
    period_start_date varchar(20),
    period_end_date varchar(20),
    fy real,
    fp varchar(20),
    form varchar(20),
    ticker varchar(20),
    AssetsCurrent decimal,
    Assets decimal,
    LiabilitiesCurrent decimal,
    Liabilities decimal,
    StockholdersEquity decimal,
    NetIncomeLoss decimal,
    NetCashProvidedByUsedInOperatingActivities decimal,
    NetCashProvidedByUsedInInvestingActivities decimal,
    NetCashProvidedByUsedInFinancingActivities decimal,
    PurchasesOfPropertyAndEquipment decimal,
    Revenues decimal,
    WeightedAverageNumberOfDilutedSharesOutstanding decimal,
    Dividend decimal
);

-- ============================================================
-- AANDELEN_DATA_CALC
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'aandelen_data_calc')
CREATE TABLE aandelen_data_calc (
    datum_laatste_dag_kwartaal varchar(50),
    ticker_symbol varchar(50),
    kwartaal_tov_jaarverslag varchar(50),
    standaard_deviatie_FCF real,
    gem_groeipercentage_FCF real,
    waardefactor_FCF real,
    standaard_deviatie_ROE real,
    Gemiddelde_stijging_ROE_10_Y real,
    waardefactor_ROE real,
    non_curr_liabilities real,
    LTD_s_equity real,
    waardefactor_LTD_equity real,
    standaard_deviatie_winstmarge real,
    Gemiddelde_winstmarge real,
    waardefactor_winstmarge real,
    Gemiddelde_stijging_dividend_10_Y real,
    standaard_deviatie_dividend_10_Y real,
    waardefactor_dividend real,
    intrinsieke_waarde real,
    selectiecriteria real,
    waarde_verdeling1 real,
    waarde_verdeling_tov_min1 real,
    waarde_verdeling_stdev real,
    waarde_verdeling_mean real,
    waarde_verdeling real
);

-- ============================================================
-- AANDELEN_DATA_CALC_
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'aandelen_data_calc_')
CREATE TABLE aandelen_data_calc_ (
    period_start_date varchar(20),
    period_end_date varchar(20),
    fy real,
    fp varchar(20),
    form varchar(20),
    ticker varchar(20),
    standaard_deviatie_FCF real,
    gem_groeipercentage_FCF real,
    waardefactor_FCF real,
    standaard_deviatie_ROE real,
    Gemiddelde_stijging_ROE_10_Y real,
    waardefactor_ROE real,
    non_curr_liabilities real,
    LTD_s_equity real,
    waardefactor_LTD_equity real,
    standaard_deviatie_winstmarge real,
    Gemiddelde_winstmarge real,
    waardefactor_winstmarge real,
    Gemiddelde_stijging_dividend_10_Y real,
    standaard_deviatie_dividend_10_Y real,
    waardefactor_dividend real,
    intrinsieke_waarde real,
    selectiecriteria real,
    waarde_verdeling1 real,
    waarde_verdeling_tov_min1 real,
    waarde_verdeling_stdev real,
    waarde_verdeling_mean real,
    waarde_verdeling real
);

-- ============================================================
-- ALONCO_CLASSES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ALONCO_classes')
CREATE TABLE ALONCO_classes (
    id uniqueidentifier PRIMARY KEY DEFAULT (newid()),
    class_name nvarchar(50) NOT NULL,
    is_alonco_class bit NOT NULL
);

-- ============================================================
-- ALONCO_PROJECT_CLASSES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ALONCO_project_classes')
CREATE TABLE ALONCO_project_classes (
    project_id uniqueidentifier PRIMARY KEY,
    class_id uniqueidentifier PRIMARY KEY,
    FOREIGN KEY (class_id) REFERENCES ALONCO_classes(id),
    FOREIGN KEY (project_id) REFERENCES ALONCO_projects(id)
);

-- ============================================================
-- ALONCO_PROJECTS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ALONCO_projects')
CREATE TABLE ALONCO_projects (
    id uniqueidentifier PRIMARY KEY DEFAULT (newid()),
    omschrijving nvarchar(MAX) NOT NULL,
    bouwheer nvarchar(255),
    location_project nvarchar(255),
    adres nvarchar(255),
    publicatie_date date,
    deadline date,
    deadlinetime datetime,
    project_link nvarchar(MAX),
    meets_alonco_classes bit NOT NULL DEFAULT ((0)),
    user_id nvarchar(255) NOT NULL,
    created_at datetime DEFAULT (getdate()),
    updated_at datetime DEFAULT (getdate())
);

-- ============================================================
-- ASSETTYPES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AssetTypes')
CREATE TABLE AssetTypes (
    asset_type_id int IDENTITY(1,1) PRIMARY KEY,
    type_name nvarchar(50) NOT NULL
);

-- ============================================================
-- AVAILABLEBALANCES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AvailableBalances')
CREATE TABLE AvailableBalances (
    balance_id int IDENTITY(1,1) PRIMARY KEY,
    balance_type_id int NOT NULL,
    amount decimal NOT NULL,
    update_date date NOT NULL DEFAULT (getdate()),
    FOREIGN KEY (balance_type_id) REFERENCES AvailableBalanceTypes(balance_type_id)
);

-- ============================================================
-- AVAILABLEBALANCETYPES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AvailableBalanceTypes')
CREATE TABLE AvailableBalanceTypes (
    balance_type_id int IDENTITY(1,1) PRIMARY KEY,
    type_name nvarchar(50) NOT NULL
);

-- ============================================================
-- BROKERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Brokers')
CREATE TABLE Brokers (
    broker_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(100) NOT NULL
);

-- ============================================================
-- DAILYCLOSINGPRICES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DailyClosingPrices')
CREATE TABLE DailyClosingPrices (
    aandeel_id int PRIMARY KEY,
    closing_price decimal NOT NULL,
    date date PRIMARY KEY,
    last_updated_at datetime DEFAULT (NULL),
    FOREIGN KEY (aandeel_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- DAILYEXCHANGERATES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DailyExchangeRates')
CREATE TABLE DailyExchangeRates (
    date date PRIMARY KEY,
    currency_pair varchar(10) PRIMARY KEY,
    rate decimal NOT NULL,
    last_updated_at datetime DEFAULT (getdate())
);

-- ============================================================
-- DAILYPORTFOLIOVALUE
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DailyPortfolioValue')
CREATE TABLE DailyPortfolioValue (
    id int IDENTITY(1,1) PRIMARY KEY,
    user_id int NOT NULL,
    date date NOT NULL,
    total_value decimal NOT NULL,
    asset_xirr decimal,
    account_xirr decimal,
    net_invested decimal DEFAULT ((0)),
    cumulative_dividends decimal DEFAULT ((0))
);

-- ============================================================
-- EARNINGSCALENDER
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'earningsCalender')
CREATE TABLE earningsCalender (
    id int IDENTITY(1,1) PRIMARY KEY,
    ticker varchar(20) NOT NULL,
    reportDate date NOT NULL,
    fiscalDateEnding date NOT NULL,
    updated_at datetime DEFAULT (getdate())
);

-- ============================================================
-- ETP_CLAIMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_Claims')
CREATE TABLE ETP_Claims (
    id nvarchar(50) PRIMARY KEY,
    riderShareId nvarchar(50) NOT NULL,
    claimerId nvarchar(50),
    claimTimestamp datetime NOT NULL,
    status nvarchar(50) NOT NULL,
    FOREIGN KEY (riderShareId) REFERENCES ETP_Shares(id)
);

-- ============================================================
-- ETP_GAMESETTINGS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_GameSettings')
CREATE TABLE ETP_GameSettings (
    id nvarchar(50) PRIMARY KEY,
    currentSeasonBudgetPerTeam decimal NOT NULL,
    totalRiderPointsAllRiders decimal NOT NULL,
    maxVirtualTeams int NOT NULL,
    nextShareCreationIndex int NOT NULL,
    initialClaimPhaseActive bit DEFAULT ((0))
);

-- ============================================================
-- ETP_PLAYERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_Players')
CREATE TABLE ETP_Players (
    id nvarchar(50) PRIMARY KEY,
    name nvarchar(100) NOT NULL,
    currentBudget decimal NOT NULL,
    teamRiders nvarchar(MAX),
    totalPoints decimal NOT NULL
);

-- ============================================================
-- ETP_RIDERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_Riders')
CREATE TABLE ETP_Riders (
    id nvarchar(50) PRIMARY KEY,
    name nvarchar(100) NOT NULL,
    currentPoints decimal NOT NULL,
    baseValue decimal NOT NULL,
    sharesAvailable int NOT NULL,
    totalSharesCreated int NOT NULL
);

-- ============================================================
-- ETP_SHARES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_Shares')
CREATE TABLE ETP_Shares (
    id nvarchar(50) PRIMARY KEY,
    riderId nvarchar(50) NOT NULL,
    ownerId nvarchar(50) NOT NULL,
    currentValue decimal NOT NULL,
    FOREIGN KEY (riderId) REFERENCES ETP_Riders(id)
);

-- ============================================================
-- ETP_USERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ETP_Users')
CREATE TABLE ETP_Users (
    id nvarchar(50) PRIMARY KEY,
    username nvarchar(100) NOT NULL,
    password nvarchar(255) NOT NULL,
    isAdmin bit DEFAULT ((0))
);

-- ============================================================
-- FISCALPERIODS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FiscalPeriods')
CREATE TABLE FiscalPeriods (
    fp_id int IDENTITY(1,1) PRIMARY KEY,
    fp varchar(10) NOT NULL
);

-- ============================================================
-- FORMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Forms')
CREATE TABLE Forms (
    form_id int IDENTITY(1,1) PRIMARY KEY,
    form varchar(10) NOT NULL
);

-- ============================================================
-- FUNDAMENTAL_DATA
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'fundamental_data')
CREATE TABLE fundamental_data (
    id int IDENTITY(1,1) PRIMARY KEY,
    period_start_date date NOT NULL,
    period_end_date date NOT NULL,
    fy int NOT NULL,
    fp_id int NOT NULL,
    form_id int NOT NULL,
    stock_id int NOT NULL,
    data_type varchar(100) NOT NULL,
    value decimal,
    how_added varchar(100) NOT NULL,
    created_at datetime2 DEFAULT (sysdatetime()),
    updated_at datetime2 DEFAULT (sysdatetime()),
    report_date date,
    FOREIGN KEY (fp_id) REFERENCES FiscalPeriods(fp_id),
    FOREIGN KEY (form_id) REFERENCES Forms(form_id),
    FOREIGN KEY (stock_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- GEBRUIKERSETPVOORLOPIG
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GebruikersETPVoorlopig')
CREATE TABLE GebruikersETPVoorlopig (
    GebruikerID int IDENTITY(1,1) PRIMARY KEY,
    Naam varchar(255),
    Email varchar(255),
    Password varchar(255)
);

-- ============================================================
-- IDEALPORTFOLIOSETTINGS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'IdealPortfolioSettings')
CREATE TABLE IdealPortfolioSettings (
    id int IDENTITY(1,1) PRIMARY KEY,
    gewenst_rendement decimal NOT NULL,
    terminal_rate decimal NOT NULL
);

-- ============================================================
-- MACDALERTS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MACDAlerts')
CREATE TABLE MACDAlerts (
    alert_id int IDENTITY(1,1) PRIMARY KEY,
    aandeel_id int NOT NULL,
    date date NOT NULL,
    type_melding varchar(50) NOT NULL,
    status varchar(20) NOT NULL,
    prijs_op_moment decimal NOT NULL,
    signal_line_value decimal,
    trade_amount decimal,
    FOREIGN KEY (aandeel_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- MACDVALUES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MACDValues')
CREATE TABLE MACDValues (
    id int IDENTITY(1,1) PRIMARY KEY,
    aandeel_id int NOT NULL,
    date date NOT NULL,
    macdLine decimal,
    signalLine decimal,
    last_updated_at datetime NOT NULL,
    FOREIGN KEY (aandeel_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- MONTHLYCLOSINGPRICES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MonthlyClosingPrices')
CREATE TABLE MonthlyClosingPrices (
    id int IDENTITY(1,1) PRIMARY KEY,
    aandeel_id int NOT NULL,
    closing_price decimal NOT NULL,
    month_ending date NOT NULL,
    FOREIGN KEY (aandeel_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- PF_PORTFOLIO
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PF_portfolio')
CREATE TABLE PF_portfolio (
    user_id int PRIMARY KEY,
    stock_symbol varchar(10) PRIMARY KEY,
    quantity decimal NOT NULL,
    average_price decimal NOT NULL,
    created_at datetime DEFAULT (getdate()),
    updated_at datetime DEFAULT (getdate()),
    currency varchar(10) DEFAULT ('USD'),
    platform varchar(50)
);

-- ============================================================
-- PF_STOCKSPLITS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PF_StockSplits')
CREATE TABLE PF_StockSplits (
    id int IDENTITY(1,1) PRIMARY KEY,
    aandeel_id int NOT NULL,
    split_date date NOT NULL,
    split_ratio decimal NOT NULL,
    applied_at datetime DEFAULT (getdate())
);

-- ============================================================
-- PF_TRANSACTIONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PF_transactions')
CREATE TABLE PF_transactions (
    id int IDENTITY(1,1) PRIMARY KEY,
    user_id int NOT NULL,
    quantity decimal NOT NULL,
    price decimal NOT NULL,
    purchase_time datetime NOT NULL,
    transaction_type varchar(20),
    created_at datetime DEFAULT (getdate()),
    updated_at datetime DEFAULT (getdate()),
    currency varchar(10) DEFAULT ('USD'),
    total_quantity decimal,
    aandeel_id int,
    broker_id int,
    fees decimal DEFAULT ((0)),
    taxes decimal DEFAULT ((0)),
    exchange_rate decimal DEFAULT ((1)),
    tob_paid bit DEFAULT ((0))
);

-- ============================================================
-- PF_USERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PF_Users')
CREATE TABLE PF_Users (
    id int IDENTITY(1,1) PRIMARY KEY,
    username nvarchar(50) NOT NULL,
    email nvarchar(100) NOT NULL,
    password nvarchar(255) NOT NULL,
    role nvarchar(50) DEFAULT ('user'),
    created_at datetime DEFAULT (getdate()),
    default_currency nvarchar(10) DEFAULT ('EUR'),
    manual_exchange_rate decimal DEFAULT ((1.0)),
    last_login datetime
);

-- ============================================================
-- POINTS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Points')
CREATE TABLE Points (
    PointsID int IDENTITY(1,1) PRIMARY KEY,
    Positie int,
    PointScaleID int,
    Points decimal,
    Year int,
    FOREIGN KEY (PointScaleID) REFERENCES PointScale(PointScaleID)
);

-- ============================================================
-- POINTSCALE
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PointScale')
CREATE TABLE PointScale (
    PointScaleID int PRIMARY KEY,
    PointScale nvarchar(255)
);

-- ============================================================
-- POINTTRANSACTIONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PointTransactions')
CREATE TABLE PointTransactions (
    TransactionID int IDENTITY(1,1) PRIMARY KEY,
    UserID int,
    RaceID int,
    DatumTijd datetime,
    Details nvarchar(255),
    Bedrag decimal,
    Saldo decimal,
    FOREIGN KEY (RaceID) REFERENCES Races(RaceID),
    FOREIGN KEY (UserID) REFERENCES Users(id)
);

-- ============================================================
-- RACES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Races')
CREATE TABLE Races (
    RaceID int IDENTITY(1,1) PRIMARY KEY,
    Name nvarchar(255),
    Year int,
    Niveau nvarchar(255),
    Type varchar(255),
    Date date,
    Deadline datetime,
    Kost decimal,
    PointScale varchar(255),
    CountryCode varchar(2),
    Stage varchar(255),
    PointScaleID int
);

-- ============================================================
-- RENNERSVOORLOPIG
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RennersVoorlopig')
CREATE TABLE RennersVoorlopig (
    RennerID int IDENTITY(1,1) PRIMARY KEY,
    Achternaam nvarchar(MAX),
    Voornaam nvarchar(255),
    Team nvarchar(255),
    Nationaliteit nvarchar(2)
);

-- ============================================================
-- STOCK_CALCULATIONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'stock_calculations')
CREATE TABLE stock_calculations (
    id int IDENTITY(1,1) PRIMARY KEY,
    stock_id int NOT NULL,
    calculation_date datetime NOT NULL,
    period_end_date date NOT NULL,
    gem_groeipercentage_FCF decimal,
    standaard_deviatie_FCF decimal,
    waardefactor_FCF decimal,
    gemiddelde_stijging_ROE_10_Y decimal,
    standaard_deviatie_ROE decimal,
    waardefactor_ROE decimal,
    waardefactor_LTD_equity decimal,
    intrinsieke_waarde decimal,
    selectiecriteria int,
    waarde_verdeling decimal,
    koopmarge decimal,
    created_at datetime DEFAULT (getdate()),
    updated_at datetime DEFAULT (getdate()),
    ltd_equity_mean decimal,
    latest_fcf_yearly_ttm decimal,
    dcf_sum decimal,
    discounted_terminal_value decimal,
    total_value decimal,
    latest_shares_outstanding decimal,
    FOREIGN KEY (stock_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- STOCKEXCHANGE
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockExchange')
CREATE TABLE StockExchange (
    stock_exchange_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(100) NOT NULL
);

-- ============================================================
-- STOCKS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Stocks')
CREATE TABLE Stocks (
    aandeel_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(100) NOT NULL,
    ticker_symbol nvarchar(10) NOT NULL,
    stock_exchange_id int NOT NULL,
    inWatchlist bit,
    inIdealePortfolio bit,
    asset_type_id int,
    isin varchar(255),
    tob_rate decimal DEFAULT ((0.0035)),
    dividend_tax_rate decimal DEFAULT ((0.3000)),
    FOREIGN KEY (asset_type_id) REFERENCES AssetTypes(asset_type_id)
);

-- ============================================================
-- TEAMRIDERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TeamRiders')
CREATE TABLE TeamRiders (
    TeamRennerID int IDENTITY(1,1) PRIMARY KEY,
    TeamID int,
    RennerID int,
    FOREIGN KEY (RennerID) REFERENCES RennersVoorlopig(RennerID),
    FOREIGN KEY (TeamID) REFERENCES Teams(TeamID)
);

-- ============================================================
-- TEAMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Teams')
CREATE TABLE Teams (
    TeamID int IDENTITY(1,1) PRIMARY KEY,
    UserID int,
    RaceID int,
    Teamnaam nvarchar(255),
    Pricemoney float,
    Points decimal,
    FOREIGN KEY (RaceID) REFERENCES Races(RaceID),
    FOREIGN KEY (UserID) REFERENCES Users(id)
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Transactions')
CREATE TABLE Transactions (
    TransactionID int IDENTITY(1,1) PRIMARY KEY,
    UserID int,
    RaceID int,
    DatumTijd datetime,
    Details nvarchar(255),
    Bedrag decimal,
    Saldo decimal,
    currency varchar(10) DEFAULT ('USD'),
    platform varchar(50),
    FOREIGN KEY (RaceID) REFERENCES Races(RaceID),
    FOREIGN KEY (UserID) REFERENCES Users(id)
);

-- ============================================================
-- UITSLAGEN
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Uitslagen')
CREATE TABLE Uitslagen (
    UitslagID int IDENTITY(1,1) PRIMARY KEY,
    RaceID int,
    Positie int,
    RennerID int,
    MaxPricemoney decimal,
    MaxPoints decimal,
    FOREIGN KEY (RaceID) REFERENCES Races(RaceID),
    FOREIGN KEY (RennerID) REFERENCES RennersVoorlopig(RennerID)
);

-- ============================================================
-- USERCASHENTRIES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserCashEntries')
CREATE TABLE UserCashEntries (
    id int IDENTITY(1,1) PRIMARY KEY,
    userID int NOT NULL,
    name nvarchar(100) NOT NULL,
    value decimal NOT NULL,
    date date NOT NULL
);

-- ============================================================
-- USERDATA
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'userData')
CREATE TABLE userData (
    userID float,
    userName varchar(50),
    userStreet varchar(1),
    userStreetNr int,
    userPostalCode decimal,
    userCity varchar(1),
    userEmail varchar(1),
    userID1 float,
    gebruikerId int
);

-- ============================================================
-- USERDATA_CANCHANGEDAILY
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Userdata_canChangeDaily')
CREATE TABLE Userdata_canChangeDaily (
    id int IDENTITY(1,1) PRIMARY KEY,
    userID int NOT NULL,
    availableCash decimal NOT NULL,
    date date NOT NULL
);

-- ============================================================
-- USERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
CREATE TABLE Users (
    id int IDENTITY(1,1) PRIMARY KEY,
    username nvarchar(80) NOT NULL,
    password nvarchar(120) NOT NULL,
    Saldo real,
    Roles int,
    email nvarchar(320),
    Nationaliteit varchar(10),
    inviteCode nvarchar(255),
    invitedBy int
);

-- ============================================================
-- WEDSTRIJDEN
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Wedstrijden')
CREATE TABLE Wedstrijden (
    Naam nvarchar(255),
    Year int,
    Niveau nvarchar(255),
    Type varchar(255),
    Date date,
    Deadline datetime,
    Kost decimal
);

-- ============================================================
-- WEDSTRIJDENVOORLOPIG
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WedstrijdenVoorlopig')
CREATE TABLE WedstrijdenVoorlopig (
    WedstrijdID int IDENTITY(1,1) PRIMARY KEY,
    Naam varchar(255),
    Niveau varchar(255),
    Datum date,
    Deadline datetime,
    PcsWedstrijdUrl varchar(255)
);

-- ============================================================
-- WEEKLYCLOSINGPRICES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WeeklyClosingPrices')
CREATE TABLE WeeklyClosingPrices (
    id int IDENTITY(1,1) PRIMARY KEY,
    aandeel_id int NOT NULL,
    closing_price decimal NOT NULL,
    week_ending date NOT NULL,
    FOREIGN KEY (aandeel_id) REFERENCES Stocks(aandeel_id)
);

-- ============================================================
-- WM_DEV_INITIAL_CLAIMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_initial_claims')
CREATE TABLE WM_dev_initial_claims (
    claim_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int NOT NULL,
    rider_id int NOT NULL,
    season_id int NOT NULL,
    claim_time datetime2 DEFAULT (sysutcdatetime()),
    FOREIGN KEY (rider_id) REFERENCES WM_dev_riders(rider_id),
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id),
    FOREIGN KEY (user_id) REFERENCES WM_dev_users(user_id)
);

-- ============================================================
-- WM_DEV_PHASES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_phases')
CREATE TABLE WM_dev_phases (
    phase_id int IDENTITY(1,1) PRIMARY KEY,
    season_id int NOT NULL,
    phase_name nvarchar(100) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id)
);

-- ============================================================
-- WM_DEV_RACE_RESULTS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_race_results')
CREATE TABLE WM_dev_race_results (
    result_id int IDENTITY(1,1) PRIMARY KEY,
    rider_id int NOT NULL,
    points int NOT NULL,
    race_id int NOT NULL,
    position int,
    FOREIGN KEY (rider_id) REFERENCES WM_dev_riders(rider_id),
    FOREIGN KEY (race_id) REFERENCES WM_dev_races(race_id)
);

-- ============================================================
-- WM_DEV_RACES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_races')
CREATE TABLE WM_dev_races (
    race_id int IDENTITY(1,1) PRIMARY KEY,
    parent_race_id int,
    name nvarchar(255) NOT NULL,
    country nvarchar(100),
    start_date datetime2,
    end_date datetime2,
    FOREIGN KEY (parent_race_id) REFERENCES WM_dev_races(race_id)
);

-- ============================================================
-- WM_DEV_RIDER_VALUES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_rider_values')
CREATE TABLE WM_dev_rider_values (
    value_id int IDENTITY(1,1) PRIMARY KEY,
    rider_id int NOT NULL,
    season_id int NOT NULL,
    points_last_54_weeks int NOT NULL,
    value_eur decimal NOT NULL,
    updated_at datetime2 DEFAULT (sysutcdatetime()),
    FOREIGN KEY (rider_id) REFERENCES WM_dev_riders(rider_id),
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id)
);

-- ============================================================
-- WM_DEV_RIDERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_riders')
CREATE TABLE WM_dev_riders (
    rider_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(150) NOT NULL,
    nationality nvarchar(50),
    birthdate date
);

-- ============================================================
-- WM_DEV_SEASON_RACES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_season_races')
CREATE TABLE WM_dev_season_races (
    season_race_id int IDENTITY(1,1) PRIMARY KEY,
    season_id int NOT NULL,
    race_id int NOT NULL,
    FOREIGN KEY (race_id) REFERENCES WM_dev_races(race_id),
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id)
);

-- ============================================================
-- WM_DEV_SEASONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_seasons')
CREATE TABLE WM_dev_seasons (
    season_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(255) NOT NULL,
    claim_start_date datetime2 NOT NULL,
    claim_end_date datetime2 NOT NULL,
    status nvarchar(50) NOT NULL DEFAULT ('pending'),
    created_at datetime2 DEFAULT (getdate())
);

-- ============================================================
-- WM_DEV_SHARES
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_shares')
CREATE TABLE WM_dev_shares (
    share_id int IDENTITY(1,1) PRIMARY KEY,
    rider_id int NOT NULL,
    season_id int NOT NULL,
    created_from_share_id int,
    owner_type nvarchar(10) NOT NULL,
    owner_id int,
    created_at datetime2 DEFAULT (sysutcdatetime()),
    FOREIGN KEY (rider_id) REFERENCES WM_dev_riders(rider_id),
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id)
);

-- ============================================================
-- WM_DEV_TEAM_POINTS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_team_points')
CREATE TABLE WM_dev_team_points (
    team_points_id int IDENTITY(1,1) PRIMARY KEY,
    team_id int NOT NULL,
    date date NOT NULL,
    points_total int NOT NULL,
    valid bit DEFAULT ((1)),
    FOREIGN KEY (team_id) REFERENCES WM_dev_teams(team_id)
);

-- ============================================================
-- WM_DEV_TEAMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_teams')
CREATE TABLE WM_dev_teams (
    team_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int NOT NULL,
    season_id int NOT NULL,
    team_name nvarchar(150) NOT NULL,
    budget_total decimal NOT NULL,
    budget_available decimal NOT NULL,
    created_at datetime2 DEFAULT (sysutcdatetime()),
    FOREIGN KEY (season_id) REFERENCES WM_dev_seasons(season_id),
    FOREIGN KEY (user_id) REFERENCES WM_dev_users(user_id)
);

-- ============================================================
-- WM_DEV_TRANSACTIONS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_transactions')
CREATE TABLE WM_dev_transactions (
    transaction_id int IDENTITY(1,1) PRIMARY KEY,
    share_id int NOT NULL,
    seller_type nvarchar(10) NOT NULL,
    seller_id int,
    buyer_type nvarchar(10) NOT NULL,
    buyer_id int,
    price_eur decimal NOT NULL,
    created_at datetime2 DEFAULT (sysutcdatetime()),
    transaction_type nvarchar(20) NOT NULL,
    FOREIGN KEY (share_id) REFERENCES WM_dev_shares(share_id)
);

-- ============================================================
-- WM_DEV_TRANSFER_CLAIMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_transfer_claims')
CREATE TABLE WM_dev_transfer_claims (
    claim_id int IDENTITY(1,1) PRIMARY KEY,
    transfer_id int NOT NULL,
    team_id int NOT NULL,
    claim_time datetime2 DEFAULT (sysutcdatetime()),
    valid_at_end bit DEFAULT ((0)),
    FOREIGN KEY (transfer_id) REFERENCES WM_dev_transfer_list(transfer_id),
    FOREIGN KEY (team_id) REFERENCES WM_dev_teams(team_id)
);

-- ============================================================
-- WM_DEV_TRANSFER_LIST
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_transfer_list')
CREATE TABLE WM_dev_transfer_list (
    transfer_id int IDENTITY(1,1) PRIMARY KEY,
    share_id int NOT NULL,
    seller_team_id int NOT NULL,
    start_time datetime2 NOT NULL DEFAULT (sysutcdatetime()),
    end_time datetime2 NOT NULL,
    status nvarchar(10) NOT NULL,
    FOREIGN KEY (share_id) REFERENCES WM_dev_shares(share_id),
    FOREIGN KEY (seller_team_id) REFERENCES WM_dev_teams(team_id)
);

-- ============================================================
-- WM_DEV_USERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WM_dev_users')
CREATE TABLE WM_dev_users (
    user_id int IDENTITY(1,1) PRIMARY KEY,
    username nvarchar(100) NOT NULL,
    email nvarchar(255) NOT NULL,
    password_hash nvarchar(255) NOT NULL,
    role nvarchar(20) NOT NULL DEFAULT ('user'),
    created_at datetime2 DEFAULT (sysutcdatetime()),
    last_login datetime2
);

