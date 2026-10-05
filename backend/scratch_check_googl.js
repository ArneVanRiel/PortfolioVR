require('dotenv').config();
const { sql, config } = require('./config/database');

async function test() {
  try {
    const pool = await sql.connect(config);
    const calcs = await pool.request().query(`
      SELECT period_end_date, waarde_verdeling, selectiecriteria, intrinsieke_waarde
      FROM stock_calculations
      WHERE stock_id = 4
      ORDER BY period_end_date DESC
    `);
    console.log('GOOGL calculations (top 10):');
    calcs.recordset.slice(0, 10).forEach(r => {
      console.log(r.period_end_date.toISOString().split('T')[0], 'Score:', r.selectiecriteria, 'Waardeverdeling:', r.waarde_verdeling, 'Intrinsiek:', r.intrinsieke_waarde);
    });
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

test();
