require('dotenv').config();
const { sql, config } = require('./config/database');

(async () => {
  const pool = await sql.connect(config);
  const res = await pool.request().query(`
    SELECT 
      ISNULL(b.name, 'Onbekend') as broker_name, 
      t.currency, 
      t.transaction_type, 
      SUM(t.quantity * t.price) as total_val, 
      SUM(t.quantity) as total_qty,
      COUNT(*) as count
    FROM PF_transactions t 
    LEFT JOIN Brokers b ON t.broker_id = b.broker_id 
    GROUP BY b.name, t.currency, t.transaction_type
  `);
  console.log(res.recordset);

  const brokerSettings = await pool.request().query("SELECT * FROM UserBrokerCredentials");
  console.log('UserBrokerCredentials:', brokerSettings.recordset);

  process.exit(0);
})();
