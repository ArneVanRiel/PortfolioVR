// config/database.js
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
  },
  connectionTimeout: 30000, // Verhoog naar 30 seconden voor Azure SQL wake-up
  requestTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

const connectToDatabase = async () => {
  try {
    // Verbind met de globale pool. sql.pool wordt dan automatisch ingesteld.
    await sql.connect(config);
    console.log('Database verbonden!');
  } catch (err) {
    console.error('Database connectie fout:', err);
    throw err; // Gooi de error verder zodat de server weet dat de connectie mislukt is
  }
};

// getRequest() is verwijderd omdat requests direct op de transaction of global pool gemaakt moeten worden.
module.exports = { config, connectToDatabase, sql }; // Exporteer sql ook
