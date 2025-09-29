
CREATE TABLE stock_calculations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    stock_id INT NOT NULL,
    calculation_date DATETIME NOT NULL,
    period_end_date DATE NOT NULL,
    gem_groeipercentage_FCF DECIMAL(18, 4),
    standaard_deviatie_FCF DECIMAL(18, 4),
    waardefactor_FCF DECIMAL(18, 4),
    gemiddelde_stijging_ROE_10_Y DECIMAL(18, 4),
    standaard_deviatie_ROE DECIMAL(18, 4),
    waardefactor_ROE DECIMAL(18, 4),
    waardefactor_LTD_equity DECIMAL(18, 4),
    intrinsieke_waarde DECIMAL(18, 4),
    selectiecriteria INT,
    waarde_verdeling DECIMAL(18, 4),
    koopmarge DECIMAL(18, 4),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_stock_calculations_stock_id FOREIGN KEY (stock_id) REFERENCES stocks(aandeel_id)
);
