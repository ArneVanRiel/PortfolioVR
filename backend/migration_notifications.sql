-- Voer dit uit in Azure Data Studio, SSMS of de Azure Portal Query Editor om de meldingen-tabel aan te maken:

CREATE TABLE PF_Notifications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    stock_id INT NOT NULL,
    ticker NVARCHAR(10) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    is_read BIT DEFAULT 0,
    new_quarter NVARCHAR(10) NULL, -- bijv. '10-Q' of '10-K'
    new_year INT NULL,
    FOREIGN KEY (stock_id) REFERENCES Stocks(aandeel_id) ON DELETE CASCADE
);
