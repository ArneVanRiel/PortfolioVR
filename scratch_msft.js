const sql = require('mssql');
const { dbConfig } = require('./backend/config/db');

async function test() {
  try {
    const pool = await sql.connect(dbConfig);
    const msft = await pool.request().query("SELECT stock_id, ticker, name FROM stocks WHERE ticker = 'MSFT'");
    console.log('MSFT stock info:', msft.recordset);
    const stockId = msft.recordset[0].stock_id;

    const calcs = await pool.request()
      .input('stockId', sql.Int, stockId)
      .query("SELECT TOP 10 id, period_end_date, calculation_date, intrinsieke_waarde, waarde_verdeling, selectiecriteria, gem_groeipercentage_FCF, standaard_deviatie_FCF, waardefactor_FCF, waardefactor_ROE, waardefactor_LTD_equity FROM stock_calculations WHERE stock_id = @stockId ORDER BY period_end_date DESC");
    console.log('Calculations for MSFT:');
    console.table(calcs.recordset);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
test();

