const express = require('express'); // for building rest API's
const app = express();
//const bodyParser = require('body-parser');
const cors = require('cors'); // provides Express middleware to enable CORS with various options.
app.use(cors());


var mysql = require('mysql');

var con = mysql.createConnection({
  host: "portfoliovr-server.database.windows.net",
  user: "portfoliovr-server-admin",
  password: "F0LKYYOYM284LFQ7$",
});

con.connect(function(err) {
  //if (err) throw err;
  console.log("Connected!");
});
con.query("SELECT ticker FROM aandelen_data_", function (err, result, fields) {
  //if (err) throw err;
  console.log(result);
  });

app.get('/', (req, res)=>{
  console.log('testtest');
  con.query("SELECT ticker FROM aandelen_data_", (err, results, fields) => {
    //if(err) throw err;
    res.json(results);
  })
});

// set port, listen for requests
const PORT = process.env.PORT || 3000;
//require("./routes/tutorial.routes.js")(app);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
