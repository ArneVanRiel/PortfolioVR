// config/database.js
const sql = require('mssql');

const config = {
  user: 'portfoliovr-server-admin',
  password: 'F0LKYYOYM284LFQ7$',
  server: 'portfoliovr-server.database.windows.net',
  database: 'portfoliovr-database',
  options: {
    encrypt: true,
  },
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
