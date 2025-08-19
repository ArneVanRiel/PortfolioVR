/*const express = require('express'); // for building rest API's
const app = express();
//const bodyParser = require('body-parser');
const cors = require('cors'); // provides Express middleware to enable CORS with various options.
app.use(cors());


var mysql = require('mysql');

var con = mysql.createConnection({
  host: "portfoliovr-server.database.windows.net",
  user: "youruportfoliovr-server-adminsername",
  password: "F0LKYYOYM284LFQ7$",
});

con.connect(function(err) {
  //if (err) throw err;
  console.log("Connected!");
});
function dbData(callback){
  con.query("SELECT ticker FROM aandelen_data_", function (err, result, fields) {
    //if (err) throw err;
    callback(result);
  });
}
app.get('/', (req, res)=>{
  dbData(data => {
      console.log(data);
  }); 
});

// set port, listen for requests
const PORT = process.env.PORT || 3000;
//require("./routes/tutorial.routes.js")(app);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
*/

// Import necessary packages
/*import React, { useEffect, useState } from 'react';
import sql from 'mssql';

// Define your config
const config = {
    user: 'youruportfoliovr-server-adminsername',
    password: 'F0LKYYOYM284LFQ7$',
    server: 'portfoliovr-server.database.windows.net', 
    database: 'portfoliovr-database',
    options: {
        encrypt: true,
        enableArithAbort: true
    }
};*/

const http = require('http');
const sql = require('mssql');

const config = {
    user: 'portfoliovr-server-admin',
    password: 'F0LKYYOYM284LFQ7$',
    server: 'portfoliovr-server.database.windows.net',
    port: 1433,
    database: 'portfoliovr-database',
    authentication: { type: 'default' },
    options: { encrypt: true }
};

async function connectAndQuery() {
    try {
        const poolConnection = await sql.connect(config);
        console.log('Connected to the database.');

        const resultSet = await poolConnection.request().query(`SELECT DISTINCT ticker FROM aandelen_data_`);

        // Create a simple HTTP server to send the results to the browser
        http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resultSet.recordset));

            /*res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write('<html><body>');
            res.write('<h1>Product Categories</h1>');
            res.write('<ul>');
            resultSet.recordset.forEach(row => {
                res.write(`<li>${row.ticker}</li>`);
            });
            res.write('</ul>');
            res.write('</body></html>');
            res.end();*/
        }).listen(8080);

        console.log('Server running at http://localhost:8080/');
    } catch (error) {
        console.error('Error connecting to the database:', error);
    }
}

connectAndQuery();