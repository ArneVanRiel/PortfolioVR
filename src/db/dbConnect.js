const sql = require('mssql');

const config = {
    user: 'portfoliovr-server-admin', // better stored in an app setting such as process.env.DB_USER
    password: 'F0LKYYOYM284LFQ7$', // better stored in an app setting such as process.env.DB_PASSWORD
    server: 'portfoliovr-server.database.windows.net', // better stored in an app setting such as process.env.DB_SERVER
    port: 1433, // optional, defaults to 1433, better stored in an app setting such as process.env.DB_PORT
    database: 'portfoliovr-database', // better stored in an app setting such as process.env.DB_NAME
    authentication: {
        type: 'default'
    },
    options: {
        encrypt: true
    }
}

console.log("Starting...");
dbConnect();

async function dbConnect() {
    try {
        var poolConnection = sql.connect(config);

        console.log("Succesfully connected to Azure SQL database!");
        
        // close connection only when we're certain application is finished
        poolConnection.close();

    } catch (err) {
        console.log("Unable to connect to Azure SQL database!");
      console.error(err.message);
    }
  }

  module.exports = dbConnect();