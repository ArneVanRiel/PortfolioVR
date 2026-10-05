require('dotenv').config();
const { sql, config } = require('./config/database');

async function test() {
  try {
    const pool = await sql.connect(config);
    const stock = await pool.request().query("SELECT aandeel_id, ticker_symbol, name, inWatchlist, inIdealePortfolio FROM Stocks WHERE ticker_symbol LIKE '%GOOG%'");
    console.log('Stock:', JSON.stringify(stock.recordset, null, 2));
    if (stock.recordset.length > 0) {
      const aid = stock.recordset[0].aandeel_id;
      const calcs = await pool.request().query(`SELECT period_end_date, waarde_verdeling, selectiecriteria, intrinsieke_waarde FROM stock_calculations WHERE stock_id = ${aid} ORDER BY period_end_date DESC`);
      console.log('Calcs top 8:', JSON.stringify(calcs.recordset.slice(0, 8), null, 2));
      const tx = await pool.request().query(`SELECT * FROM PF_transactions WHERE aandeel_id = ${aid}`);
      console.log('User transactions for GOOGL:', JSON.stringify(tx.recordset, null, 2));
    }
    const allHoldings = await pool.request().query(`
      SELECT t.aandeel_id, s.ticker_symbol, SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) as qty
      FROM PF_transactions t
      JOIN Stocks s ON t.aandeel_id = s.aandeel_id
      GROUP BY t.aandeel_id, s.ticker_symbol
      HAVING SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) > 0.0001
    `);
    console.log('All current portfolio holdings:', JSON.stringify(allHoldings.recordset, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

test();
