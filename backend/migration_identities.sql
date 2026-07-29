-- Voer dit uit in Azure Data Studio, SSMS of de Azure Portal Query Editor om de database in orde te maken voor Google & Microsoft koppelingen:

ALTER TABLE PF_Users ADD preferred_login_method NVARCHAR(50) DEFAULT 'password';
ALTER TABLE PF_Users ADD last_login NVARCHAR(100) NULL;

CREATE TABLE PF_User_Identities (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    provider_name NVARCHAR(50) NOT NULL, -- 'google' of 'microsoft'
    provider_key NVARCHAR(255) NOT NULL, -- Externe ID van de provider
    FOREIGN KEY (user_id) REFERENCES PF_Users(id) ON DELETE CASCADE,
    CONSTRAINT UQ_provider UNIQUE (provider_name, provider_key)
);
