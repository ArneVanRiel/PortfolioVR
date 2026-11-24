const { sql, config } = require('../config/database');
const { getEffectiveUserId, isAdminUser } = require('../middleware/authMiddleware');

const formatFundingLabel = (mode, budget) => {
  const val = Number(budget || 0);
  if (mode === 'monthly_amount') return `Vast bedrag (€${val > 0 ? val.toFixed(0) : 450}/mnd)`;
  if (mode === 'pct_total_portfolio') return `${val > 0 ? val.toFixed(0) : 50}% van Totale Portefeuillewaarde (Belegd + Cash)`;
  if (mode === 'pct_available_cash') return `${val > 0 ? val.toFixed(0) : 100}% van Beschikbare Vrije Cash`;
  if (mode === 'cash_plus_rotation') return 'Beschikbaar geld + Actieve rotatie';
  return '100% van Beschikbaar vrij geld';
};

const formatSellingLabel = (mode) => {
  if (mode === 'buy_only') return 'Nee, nooit verkopen (100% Buy & Hold)';
  if (mode === 'score_drop_only') return 'Enkel noodverkoop bij Score < 5';
  return 'Ja, volledige verkoop- & snoeiregels';
};

// Hulpfunctie: Hernummer prioriteiten (1, 2, 3...) en synchroniseer de primaire kolommen op PF_Users
async function normalizeAndSyncUserActiveStrategies(pool, userId) {
  const activeRes = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT 
        ua.id, ua.user_id, ua.strategy_id, ua.priority_order,
        ua.funding_mode, ua.monthly_budget, ua.allow_selling, ua.activated_at, ua.updated_at,
        s.name, ISNULL(s.strategy_type, 'STOCKS') AS strategy_type
      FROM PF_UserActiveStrategies ua
      INNER JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
      WHERE ua.user_id = @userId
      ORDER BY ua.priority_order ASC, ua.updated_at DESC, ua.id ASC
    `);

  const rows = activeRes.recordset || [];

  // Hernummer 1..N zodat prioriteiten altijd aaneengesloten zijn
  for (let i = 0; i < rows.length; i++) {
    const newPrio = i + 1;
    if (rows[i].priority_order !== newPrio) {
      rows[i].priority_order = newPrio;
      await pool.request()
        .input('id', sql.Int, rows[i].id)
        .input('prio', sql.Int, newPrio)
        .query('UPDATE PF_UserActiveStrategies SET priority_order = @prio WHERE id = @id');
    }
  }

  // Synchroniseer hoogste prioriteit STOCKS en hoogste prioriteit ETF naar PF_Users (voor backwards compatibility)
  const topStock = rows.find(r => (r.strategy_type || 'STOCKS').toUpperCase() === 'STOCKS') || null;
  const topEtf = rows.find(r => (r.strategy_type || 'STOCKS').toUpperCase() === 'ETF') || null;

  await pool.request()
    .input('userId', sql.Int, userId)
    .input('stockId', sql.Int, topStock ? topStock.strategy_id : null)
    .input('stockFMode', sql.VarChar, topStock ? topStock.funding_mode : 'available_cash')
    .input('stockBudget', sql.Decimal(18, 2), topStock ? Number(topStock.monthly_budget || 500) : 500)
    .input('stockSell', sql.VarChar, topStock ? topStock.allow_selling : 'full_strategy')
    .input('etfId', sql.Int, topEtf ? topEtf.strategy_id : null)
    .input('etfFMode', sql.VarChar, topEtf ? topEtf.funding_mode : 'monthly_amount')
    .input('etfBudget', sql.Decimal(18, 2), topEtf ? Number(topEtf.monthly_budget || 450) : 450)
    .input('etfSell', sql.VarChar, topEtf ? topEtf.allow_selling : 'buy_only')
    .query(`
      UPDATE PF_Users
      SET
        active_strategy_id = @stockId,
        stocks_funding_mode = @stockFMode,
        stocks_monthly_budget = @stockBudget,
        stocks_allow_selling = @stockSell,
        active_etf_strategy_id = @etfId,
        etf_funding_mode = @etfFMode,
        etf_monthly_budget = @etfBudget,
        etf_allow_selling = @etfSell
      WHERE id = @userId
    `);

  return rows;
}

// 1. Alle beschikbare strategieën ophalen (met beveiliging tegen formule-kopiëren)
const getAllStrategies = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);
    const pool = await sql.connect(config);

    const activeRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, strategy_id, priority_order, funding_mode, monthly_budget, allow_selling FROM PF_UserActiveStrategies WHERE user_id = @userId ORDER BY priority_order ASC');
    const activeMap = new Map();
    (activeRes.recordset || []).forEach(a => {
      if (!activeMap.has(a.strategy_id)) activeMap.set(a.strategy_id, a);
    });

    const query = `
      SELECT 
        s.strategy_id,
        s.user_id,
        s.name,
        s.description,
        s.is_public,
        s.is_system_default,
        ISNULL(s.strategy_type, 'STOCKS') AS strategy_type,
        s.parameters_json,
        s.performance_summary_json,
        s.created_at,
        s.updated_at,
        u.username AS creator_username
      FROM PF_Strategies s
      LEFT JOIN PF_Users u ON s.user_id = u.id
      WHERE s.is_public = 1 OR s.user_id = @userId OR @isAdmin = 1
      ORDER BY s.is_system_default DESC, s.created_at DESC
    `;

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('isAdmin', sql.Bit, isAdmin ? 1 : 0)
      .query(query);

    const strategies = result.recordset.map(row => {
      const isOwner = row.user_id === userId;
      const canViewDetails = isAdmin;
      const sType = (row.strategy_type || 'STOCKS').toUpperCase();
      const activeEntry = activeMap.get(row.strategy_id) || null;

      let performance = null;
      try {
        if (row.performance_summary_json) performance = JSON.parse(row.performance_summary_json);
      } catch (e) {}

      let parameters = null;
      if (canViewDetails && row.parameters_json) {
        try {
          parameters = JSON.parse(row.parameters_json);
        } catch (e) {}
      }

      return {
        strategy_id: row.strategy_id,
        name: row.name,
        description: row.description,
        strategy_type: sType,
        creator_username: row.creator_username || 'Onbekend',
        is_owner: isOwner,
        is_system_default: Boolean(row.is_system_default),
        is_public: Boolean(row.is_public),
        is_active_for_me: Boolean(activeEntry),
        priority_order: activeEntry ? activeEntry.priority_order : null,
        active_entry_id: activeEntry ? activeEntry.id : null,
        performance_summary: performance,
        can_view_details: canViewDetails,
        parameters: parameters,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    res.json(strategies);
  } catch (err) {
    console.error('Fout bij ophalen strategieën:', err);
    res.status(500).json({ message: `Fout bij ophalen strategieën: ${err.message}` });
  }
};

// 2. Persoonlijke strategie-configuratie (flexibele lijst met prioriteit) + wijzigingshistoriek ophalen
const getUserStrategyConfigAndHistory = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const pool = await sql.connect(config);

    const userRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, username, role, strategy_mode FROM PF_Users WHERE id = @userId');
    const u = userRes.recordset[0] || {};

    const activeRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          ua.id AS active_entry_id,
          ua.user_id,
          ua.strategy_id,
          ua.priority_order,
          ua.funding_mode,
          ua.monthly_budget,
          ua.allow_selling,
          ua.activated_at,
          ua.updated_at,
          s.name,
          s.description,
          ISNULL(s.strategy_type, 'STOCKS') AS strategy_type,
          s.is_system_default,
          s.parameters_json,
          s.performance_summary_json
        FROM PF_UserActiveStrategies ua
        INNER JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
        WHERE ua.user_id = @userId
        ORDER BY ua.priority_order ASC, ua.id ASC
      `);

    const parseJsonSafe = (str) => {
      if (!str) return null;
      try { return JSON.parse(str); } catch { return null; }
    };

    const activeStrategies = (activeRes.recordset || []).map(row => ({
      active_entry_id: row.active_entry_id,
      strategy_id: row.strategy_id,
      name: row.name,
      description: row.description,
      strategy_type: (row.strategy_type || 'STOCKS').toUpperCase(),
      priority_order: row.priority_order,
      funding_mode: row.funding_mode || 'available_cash',
      funding_label: formatFundingLabel(row.funding_mode, row.monthly_budget),
      monthly_budget: Number(row.monthly_budget || 450),
      allow_selling: row.allow_selling || 'full_strategy',
      selling_label: formatSellingLabel(row.allow_selling),
      activated_at: row.activated_at,
      updated_at: row.updated_at,
      parameters: parseJsonSafe(row.parameters_json),
      performance_summary: parseJsonSafe(row.performance_summary_json)
    }));

    const activeStockStrategy = activeStrategies.find(s => s.strategy_type === 'STOCKS') || null;
    const activeEtfStrategy = activeStrategies.find(s => s.strategy_type === 'ETF') || null;

    const histRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 50
          history_id, user_id, strategy_type,
          old_strategy_id, old_strategy_name,
          new_strategy_id, new_strategy_name,
          funding_mode, monthly_budget, allow_selling,
          changed_at, notes
        FROM PF_UserStrategyHistory
        WHERE user_id = @userId
        ORDER BY changed_at DESC, history_id DESC
      `);

    res.json({
      user_id: userId,
      username: u.username || 'Gebruiker',
      activeStrategies,
      activeStockStrategy,
      activeEtfStrategy,
      strategyHistory: (histRes.recordset || []).map(h => ({
        ...h,
        funding_label: formatFundingLabel(h.funding_mode, h.monthly_budget),
        selling_label: formatSellingLabel(h.allow_selling)
      }))
    });
  } catch (err) {
    console.error('Fout bij ophalen gebruikers-strategieconfiguratie:', err);
    res.status(500).json({ message: `Fout bij ophalen strategieconfiguratie: ${err.message}` });
  }
};

// 3. Enkele strategie ophalen
const getStrategyById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          s.*,
          u.username AS creator_username,
          (SELECT TOP 1 priority_order FROM PF_UserActiveStrategies WHERE user_id = @userId AND strategy_id = s.strategy_id) AS my_priority_order
        FROM PF_Strategies s
        LEFT JOIN PF_Users u ON s.user_id = u.id
        WHERE s.strategy_id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const row = result.recordset[0];
    const isOwner = row.user_id === userId;
    const canViewDetails = isOwner || isAdmin;
    const sType = (row.strategy_type || 'STOCKS').toUpperCase();

    if (!row.is_public && !canViewDetails) {
      return res.status(403).json({ message: 'Geen toegang tot deze privé-strategie.' });
    }

    let performance = null;
    try {
      if (row.performance_summary_json) performance = JSON.parse(row.performance_summary_json);
    } catch (e) {}

    let parameters = null;
    if (canViewDetails && row.parameters_json) {
      try {
        parameters = JSON.parse(row.parameters_json);
      } catch (e) {}
    }

    res.json({
      strategy_id: row.strategy_id,
      name: row.name,
      description: row.description,
      strategy_type: sType,
      creator_username: row.creator_username || 'Onbekend',
      is_owner: isOwner,
      is_system_default: Boolean(row.is_system_default),
      is_public: Boolean(row.is_public),
      is_active_for_me: row.my_priority_order !== null && row.my_priority_order !== undefined,
      priority_order: row.my_priority_order,
      performance_summary: performance,
      can_view_details: canViewDetails,
      parameters: parameters,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  } catch (err) {
    console.error('Fout bij ophalen strategie detail:', err);
    res.status(500).json({ message: `Fout bij ophalen strategie: ${err.message}` });
  }
};

// 4. Nieuwe strategie opslaan (Strategie Builder - ENKEL BEHEERDER)
const createStrategy = async (req, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Alleen de beheerder kan nieuwe strategieën aanmaken in de Strategie Builder.' });
    }
    const userId = getEffectiveUserId(req);
    const { name, description, is_public = true, strategy_type, parameters, performance_summary } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Strategienaam is verplicht.' });
    }
    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({ message: 'Geldige strategie parameters zijn verplicht.' });
    }

    const effectiveType = (strategy_type || parameters.strategyType || 'STOCKS').toUpperCase() === 'ETF' ? 'ETF' : 'STOCKS';
    const enrichedParams = { ...parameters, strategyType: effectiveType };

    const request = new sql.Request();
    request.input('userId', sql.Int, userId);
    request.input('name', sql.NVarChar, name.trim());
    request.input('description', sql.NVarChar, description ? description.trim() : null);
    request.input('isPublic', sql.Bit, is_public ? 1 : 0);
    request.input('sType', sql.VarChar, effectiveType);
    request.input('params', sql.NVarChar, JSON.stringify(enrichedParams));
    request.input('perf', sql.NVarChar, performance_summary ? JSON.stringify(performance_summary) : null);

    const insertResult = await request.query(`
      INSERT INTO PF_Strategies (user_id, name, description, is_public, is_system_default, strategy_type, parameters_json, performance_summary_json)
      OUTPUT INSERTED.strategy_id
      VALUES (@userId, @name, @description, @isPublic, 0, @sType, @params, @perf)
    `);

    const newId = insertResult.recordset[0].strategy_id;

    res.status(201).json({
      message: 'Strategie succesvol opgeslagen!',
      strategy_id: newId,
      strategy_type: effectiveType
    });
  } catch (err) {
    console.error('Fout bij opslaan strategie:', err);
    res.status(500).json({ message: `Fout bij opslaan strategie: ${err.message}` });
  }
};

// 5. Bestaande strategie bijwerken (ENKEL BEHEERDER)
const updateStrategy = async (req, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Alleen de beheerder kan strategieën bewerken in de Strategie Builder.' });
    }
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);

    const checkReq = new sql.Request();
    checkReq.input('id', sql.Int, id);
    const checkRes = await checkReq.query('SELECT strategy_id, user_id, name, is_system_default, strategy_type FROM PF_Strategies WHERE strategy_id = @id');
    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = checkRes.recordset[0];
    if (strat.user_id !== userId && !isAdmin) {
      return res.status(403).json({ message: 'U heeft geen toestemming om deze strategie aan te passen.' });
    }

    const { name, description, is_public, strategy_type, parameters, performance_summary } = req.body;
    const effectiveType = (strategy_type || parameters?.strategyType || strat.strategy_type || 'STOCKS').toUpperCase() === 'ETF' ? 'ETF' : 'STOCKS';

    const updateReq = new sql.Request();
    updateReq.input('id', sql.Int, id);
    updateReq.input('name', sql.NVarChar, name ? name.trim() : strat.name);
    updateReq.input('description', sql.NVarChar, description !== undefined ? (description ? description.trim() : null) : null);
    updateReq.input('isPublic', sql.Bit, is_public !== undefined ? (is_public ? 1 : 0) : 1);
    updateReq.input('sType', sql.VarChar, effectiveType);
    updateReq.input('params', sql.NVarChar, parameters ? JSON.stringify({ ...parameters, strategyType: effectiveType }) : null);
    updateReq.input('perf', sql.NVarChar, performance_summary ? JSON.stringify(performance_summary) : null);

    let query = `
      UPDATE PF_Strategies 
      SET 
        name = COALESCE(@name, name),
        description = @description,
        is_public = @isPublic,
        strategy_type = @sType,
        updated_at = GETDATE()
    `;

    if (parameters) {
      query += `, parameters_json = @params`;
    }
    if (performance_summary) {
      query += `, performance_summary_json = @perf`;
    }

    query += ` WHERE strategy_id = @id`;

    await updateReq.query(query);

    try {
      const { clearAdvisorCache } = require('./portfolioController');
      clearAdvisorCache();
    } catch (e) {}

    res.json({ message: `Strategie "${name || strat.name}" succesvol bijgewerkt.` });
  } catch (err) {
    console.error('Fout bij bijwerken strategie:', err);
    res.status(500).json({ message: `Fout bij bijwerken strategie: ${err.message}` });
  }
};

// 6. Strategie verwijderen uit de Bibliotheek (ENKEL BEHEERDER)
const deleteStrategy = async (req, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Alleen de beheerder kan strategieën uit de bibliotheek verwijderen.' });
    }
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);
    const pool = await sql.connect(config);

    const checkRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT strategy_id, user_id, name, is_system_default FROM PF_Strategies WHERE strategy_id = @id');
    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = checkRes.recordset[0];
    if (strat.is_system_default) {
      return res.status(400).json({ message: 'Een standaard systeemstrategie kan niet definitief uit de bibliotheek worden verwijderd (je kunt deze wel uit je actieve strategieën verwijderen).' });
    }

    if (strat.user_id !== userId && !isAdmin) {
      return res.status(403).json({ message: 'U heeft geen toestemming om deze strategie te verwijderen.' });
    }

    await pool.request().input('id', sql.Int, id).query('DELETE FROM PF_UserActiveStrategies WHERE strategy_id = @id');
    await pool.request().input('id', sql.Int, id).query('DELETE FROM PF_Strategies WHERE strategy_id = @id');
    await normalizeAndSyncUserActiveStrategies(pool, userId);

    res.json({ message: `Strategie "${strat.name}" succesvol verwijderd.` });
  } catch (err) {
    console.error('Fout bij verwijderen strategie:', err);
    res.status(500).json({ message: `Fout bij verwijderen strategie: ${err.message}` });
  }
};

// 7. Actieve strategie toevoegen of bijwerken in PF_UserActiveStrategies (flexibel aantal + prioriteit)
const addOrUpdateActiveStrategy = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const pool = await sql.connect(config);

    const {
      active_entry_id,
      strategy_id,
      replace_entry_id,
      priority_order,
      funding_mode,
      monthly_budget,
      allow_selling,
      notes
    } = req.body;

    const targetStratId = Number(strategy_id || req.params.id);
    if (!targetStratId) {
      return res.status(400).json({ message: 'Selecteer een geldige strategie.' });
    }

    const stratRes = await pool.request()
      .input('id', sql.Int, targetStratId)
      .query('SELECT strategy_id, name, ISNULL(strategy_type, \'STOCKS\') AS strategy_type, is_public, user_id, parameters_json FROM PF_Strategies WHERE strategy_id = @id');
    if (stratRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = stratRes.recordset[0];
    if (!strat.is_public && strat.user_id !== userId && Number(userId) !== 1) {
      return res.status(403).json({ message: 'Deze strategie is privé.' });
    }

    let stratParams = {};
    try {
      if (strat.parameters_json) stratParams = JSON.parse(strat.parameters_json);
    } catch (e) {}

    const sType = (strat.strategy_type || stratParams.strategyType || 'STOCKS').toUpperCase();
    const normalizedType = sType === 'ETF' ? 'ETF' : sType === 'CRYPTO' ? 'CRYPTO' : 'STOCKS';

    const effFundingMode = funding_mode || stratParams.fundingMode || (normalizedType === 'ETF' ? 'monthly_amount' : 'available_cash');
    let effMonthlyBudget = monthly_budget !== undefined
      ? Number(monthly_budget)
      : Number(stratParams.monthlyBudget || (effFundingMode === 'pct_total_portfolio' ? 50 : effFundingMode === 'pct_available_cash' ? 100 : normalizedType === 'ETF' ? 450 : 500));

    if (effFundingMode === 'pct_total_portfolio' || effFundingMode === 'pct_available_cash') {
      if (isNaN(effMonthlyBudget) || effMonthlyBudget <= 0) effMonthlyBudget = 50;
      if (effMonthlyBudget > 100) {
        return res.status(400).json({ message: 'Een percentage kan niet hoger zijn dan 100%.' });
      }
    }

    const effAllowSelling = allow_selling || stratParams.allowSelling || (normalizedType === 'ETF' ? 'buy_only' : 'full_strategy');

    const entryIdToEdit = active_entry_id || replace_entry_id || null;
    let oldStratId = null;
    let oldStratName = null;

    // Check of we een bestaande actieve rij bewerken of dat deze strategy_id al actief is voor de gebruiker
    let existingEntry = null;
    if (entryIdToEdit) {
      const exRes = await pool.request()
        .input('entryId', sql.Int, Number(entryIdToEdit))
        .input('userId', sql.Int, userId)
        .query(`
          SELECT ua.*, s.name AS old_name
          FROM PF_UserActiveStrategies ua
          LEFT JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
          WHERE ua.id = @entryId AND ua.user_id = @userId
        `);
      existingEntry = exRes.recordset[0] || null;
    } else {
      const sameStratRes = await pool.request()
        .input('stratId', sql.Int, targetStratId)
        .input('userId', sql.Int, userId)
        .query(`
          SELECT ua.*, s.name AS old_name
          FROM PF_UserActiveStrategies ua
          LEFT JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
          WHERE ua.strategy_id = @stratId AND ua.user_id = @userId
        `);
      existingEntry = sameStratRes.recordset[0] || null;
    }

    // Validatie: Zorg dat gecombineerde percentages over meerdere strategieën NOOIT boven 100% van de totale portefeuille uitkomen!
    if (effFundingMode === 'pct_total_portfolio') {
      const otherPctRes = await pool.request()
        .input('userId', sql.Int, userId)
        .input('excludeId', sql.Int, existingEntry ? existingEntry.id : -1)
        .query(`
          SELECT ISNULL(SUM(monthly_budget), 0) AS used_pct
          FROM PF_UserActiveStrategies
          WHERE user_id = @userId AND id != @excludeId AND funding_mode = 'pct_total_portfolio'
        `);
      const usedPct = Number(otherPctRes.recordset[0]?.used_pct || 0);
      if (usedPct + effMonthlyBudget > 100.01) {
        const remainingPct = Math.max(0, 100 - usedPct);
        return res.status(400).json({
          message: `Je andere actieve strategieën gebruiken al ${usedPct.toFixed(0)}% van je totale portefeuillewaarde. Er is nog maximaal ${remainingPct.toFixed(0)}% beschikbaar (totaal mag niet boven 100% uitkomen).`
        });
      }
    }

    let effPriority = priority_order ? Number(priority_order) : null;
    if (!effPriority) {
      if (existingEntry) {
        effPriority = existingEntry.priority_order;
      } else {
        const maxPrioRes = await pool.request()
          .input('userId', sql.Int, userId)
          .query('SELECT ISNULL(MAX(priority_order), 0) AS max_prio FROM PF_UserActiveStrategies WHERE user_id = @userId');
        effPriority = (maxPrioRes.recordset[0]?.max_prio || 0) + 1;
      }
    }

    // Als een specifieke prioriteit is gekozen die botst met andere rijen, schuif rijen >= effPriority 1 plek op
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('prio', sql.Int, effPriority)
      .input('excludeId', sql.Int, existingEntry ? existingEntry.id : -1)
      .query(`
        UPDATE PF_UserActiveStrategies
        SET priority_order = priority_order + 1
        WHERE user_id = @userId AND priority_order >= @prio AND id != @excludeId
      `);

    if (existingEntry) {
      oldStratId = existingEntry.strategy_id;
      oldStratName = existingEntry.old_name;

      await pool.request()
        .input('entryId', sql.Int, existingEntry.id)
        .input('stratId', sql.Int, strat.strategy_id)
        .input('prio', sql.Int, effPriority)
        .input('fMode', sql.VarChar, effFundingMode)
        .input('mBudget', sql.Decimal(18, 2), effMonthlyBudget)
        .input('aSell', sql.VarChar, effAllowSelling)
        .query(`
          UPDATE PF_UserActiveStrategies
          SET
            strategy_id = @stratId,
            priority_order = @prio,
            funding_mode = @fMode,
            monthly_budget = @mBudget,
            allow_selling = @aSell,
            updated_at = GETDATE()
          WHERE id = @entryId
        `);
    } else {
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('stratId', sql.Int, strat.strategy_id)
        .input('prio', sql.Int, effPriority)
        .input('fMode', sql.VarChar, effFundingMode)
        .input('mBudget', sql.Decimal(18, 2), effMonthlyBudget)
        .input('aSell', sql.VarChar, effAllowSelling)
        .query(`
          INSERT INTO PF_UserActiveStrategies
          (user_id, strategy_id, priority_order, funding_mode, monthly_budget, allow_selling, activated_at, updated_at)
          VALUES
          (@userId, @stratId, @prio, @fMode, @mBudget, @aSell, GETDATE(), GETDATE())
        `);
    }

    const updatedActiveList = await normalizeAndSyncUserActiveStrategies(pool, userId);
    const currentItem = updatedActiveList.find(r => r.strategy_id === strat.strategy_id) || { priority_order: effPriority };

    const fundingDesc = formatFundingLabel(effFundingMode, effMonthlyBudget);
    const sellingDesc = formatSellingLabel(effAllowSelling);

    let actionSummaryText = '';
    if (oldStratId && oldStratId !== strat.strategy_id) {
      actionSummaryText = `Strategie gewisseld van "${oldStratName}" naar "${strat.name}" (Prioriteit #${currentItem.priority_order}). Inleg: ${fundingDesc} • Verkopen: ${sellingDesc}. Meldingen van "${oldStratName}" blijven bewaard.`;
    } else if (existingEntry) {
      actionSummaryText = `Instellingen bijgewerkt voor "${strat.name}" (Prioriteit #${currentItem.priority_order}). Inleg: ${fundingDesc} • Verkopen: ${sellingDesc}.`;
    } else {
      actionSummaryText = `Nieuwe actieve strategie toegevoegd: "${strat.name}" op Prioriteit #${currentItem.priority_order}. Inleg: ${fundingDesc} • Verkopen: ${sellingDesc}.`;
    }

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('sType', sql.VarChar, sType)
      .input('oldId', sql.Int, oldStratId || null)
      .input('oldName', sql.NVarChar, oldStratName || null)
      .input('newId', sql.Int, strat.strategy_id)
      .input('newName', sql.NVarChar, strat.name)
      .input('fMode', sql.VarChar, effFundingMode)
      .input('mBudget', sql.Decimal(18, 2), effMonthlyBudget)
      .input('aSell', sql.VarChar, effAllowSelling)
      .input('notes', sql.NVarChar, notes || actionSummaryText)
      .query(`
        INSERT INTO PF_UserStrategyHistory 
        (user_id, strategy_type, old_strategy_id, old_strategy_name, new_strategy_id, new_strategy_name, funding_mode, monthly_budget, allow_selling, changed_at, notes)
        VALUES 
        (@userId, @sType, @oldId, @oldName, @newId, @newName, @fMode, @mBudget, @aSell, GETDATE(), @notes)
      `);

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('ticker', sql.NVarChar, sType === 'ETF' ? 'ETF-STRAT' : 'AANDELEN-STRAT')
      .input('message', sql.NVarChar, actionSummaryText)
      .input('actionTitle', sql.NVarChar, `🔄 Strategie Instelling (Prio #${currentItem.priority_order}): ${strat.name}`)
      .input('stratId', sql.Int, strat.strategy_id)
      .input('stratName', sql.NVarChar, strat.name)
      .input('stratType', sql.VarChar, sType)
      .query(`
        INSERT INTO PF_Notifications
        (user_id, stock_id, ticker, message, is_read, action_required, action_type, action_shares, action_pct, action_title, strategy_id, strategy_name, strategy_type, created_at)
        VALUES
        (@userId, NULL, @ticker, @message, 0, 0, 'STRATEGY_SWITCH', 0, 0, @actionTitle, @stratId, @stratName, @stratType, GETDATE())
      `);

    try {
      const { clearAdvisorCache } = require('./portfolioController');
      clearAdvisorCache();
      const { syncActiveStrategyAlerts } = require('./notificationController');
      await syncActiveStrategyAlerts(pool, userId, { force: true });
    } catch (syncErr) {
      console.warn('Kon meldingen niet direct synchroniseren:', syncErr.message);
    }

    res.json({
      message: actionSummaryText,
      activeStrategies: updatedActiveList
    });
  } catch (err) {
    console.error('Fout bij toevoegen/bijwerken actieve strategie:', err);
    res.status(500).json({ message: `Fout bij opslaan actieve strategie: ${err.message}` });
  }
};

// Backwards-compatible wrapper voor POST /strategies/:id/activate en PUT /strategies/my-config
const activateStrategyForUser = async (req, res) => {
  req.body = { ...(req.body || {}), strategy_id: Number(req.params.id || req.body?.strategy_id) };
  return addOrUpdateActiveStrategy(req, res);
};

const updateUserStrategyPreferences = async (req, res) => {
  return addOrUpdateActiveStrategy(req, res);
};

// 8. Prioriteit van een actieve strategie wijzigen (bijv. omhoog/omlaag)
const changeActiveStrategyPriority = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const { entryId } = req.params;
    const { direction, new_priority } = req.body; // direction: 'UP' | 'DOWN' of expliciete new_priority
    const pool = await sql.connect(config);

    const listRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT ua.id, ua.strategy_id, ua.priority_order, ua.funding_mode, ua.monthly_budget, ua.allow_selling,
               s.name, ISNULL(s.strategy_type, 'STOCKS') AS strategy_type
        FROM PF_UserActiveStrategies ua
        INNER JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
        WHERE ua.user_id = @userId
        ORDER BY ua.priority_order ASC, ua.id ASC
      `);
    const list = listRes.recordset || [];
    const idx = list.findIndex(item => item.id === Number(entryId));
    if (idx === -1) {
      return res.status(404).json({ message: 'Actieve strategie niet gevonden.' });
    }

    const targetItem = list[idx];
    const oldPrio = idx + 1;
    let newIdx = idx;

    if (direction === 'UP' && idx > 0) {
      newIdx = idx - 1;
    } else if (direction === 'DOWN' && idx < list.length - 1) {
      newIdx = idx + 1;
    } else if (new_priority !== undefined) {
      newIdx = Math.max(0, Math.min(list.length - 1, Number(new_priority) - 1));
    }

    if (newIdx !== idx) {
      const [moved] = list.splice(idx, 1);
      list.splice(newIdx, 0, moved);

      for (let i = 0; i < list.length; i++) {
        await pool.request()
          .input('id', sql.Int, list[i].id)
          .input('prio', sql.Int, i + 1)
          .query('UPDATE PF_UserActiveStrategies SET priority_order = @prio, updated_at = GETDATE() WHERE id = @id');
      }
    }

    const updatedActiveList = await normalizeAndSyncUserActiveStrategies(pool, userId);
    const newPrio = newIdx + 1;

    const noteText = `Prioriteit van "${targetItem.name}" gewijzigd van #${oldPrio} naar #${newPrio}. Volgorde: ${updatedActiveList.map(a => `#${a.priority_order} ${a.name}`).join(' ➔ ')}.`;

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('sType', sql.VarChar, (targetItem.strategy_type || 'STOCKS').toUpperCase())
      .input('oldId', sql.Int, targetItem.strategy_id)
      .input('oldName', sql.NVarChar, `${targetItem.name} (Prio #${oldPrio})`)
      .input('newId', sql.Int, targetItem.strategy_id)
      .input('newName', sql.NVarChar, `${targetItem.name} (Prio #${newPrio})`)
      .input('fMode', sql.VarChar, targetItem.funding_mode)
      .input('mBudget', sql.Decimal(18, 2), Number(targetItem.monthly_budget || 0))
      .input('aSell', sql.VarChar, targetItem.allow_selling)
      .input('notes', sql.NVarChar, noteText)
      .query(`
        INSERT INTO PF_UserStrategyHistory 
        (user_id, strategy_type, old_strategy_id, old_strategy_name, new_strategy_id, new_strategy_name, funding_mode, monthly_budget, allow_selling, changed_at, notes)
        VALUES 
        (@userId, @sType, @oldId, @oldName, @newId, @newName, @fMode, @mBudget, @aSell, GETDATE(), @notes)
      `);

    try {
      const { clearAdvisorCache } = require('./portfolioController');
      clearAdvisorCache();
    } catch (e) {}

    res.json({
      message: noteText,
      activeStrategies: updatedActiveList
    });
  } catch (err) {
    console.error('Fout bij wijzigen prioriteit:', err);
    res.status(500).json({ message: `Fout bij wijzigen prioriteit: ${err.message}` });
  }
};

// 9. Actieve strategie verwijderen / stopzetten voor de gebruiker (met behoud van historische meldingen!)
const removeActiveStrategyForUser = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const { entryId } = req.params;
    const pool = await sql.connect(config);

    const exRes = await pool.request()
      .input('entryId', sql.Int, Number(entryId))
      .input('userId', sql.Int, userId)
      .query(`
        SELECT ua.*, s.name, ISNULL(s.strategy_type, 'STOCKS') AS strategy_type
        FROM PF_UserActiveStrategies ua
        LEFT JOIN PF_Strategies s ON ua.strategy_id = s.strategy_id
        WHERE ua.id = @entryId AND ua.user_id = @userId
      `);

    if (exRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Actieve strategie niet gevonden.' });
    }

    const removed = exRes.recordset[0];
    const sType = (removed.strategy_type || 'STOCKS').toUpperCase();

    await pool.request()
      .input('entryId', sql.Int, Number(entryId))
      .input('userId', sql.Int, userId)
      .query('DELETE FROM PF_UserActiveStrategies WHERE id = @entryId AND user_id = @userId');

    const updatedActiveList = await normalizeAndSyncUserActiveStrategies(pool, userId);

    const noteText = `Actieve strategie "${removed.name}" (was Prioriteit #${removed.priority_order}) is stopgezet/verwijderd uit je actieve opvolging. Alle eerdere meldingen van "${removed.name}" blijven bewaard in je historie.`;

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('sType', sql.VarChar, sType)
      .input('oldId', sql.Int, removed.strategy_id)
      .input('oldName', sql.NVarChar, removed.name)
      .input('newId', sql.Int, 0)
      .input('newName', sql.NVarChar, 'Stopgezet / Verwijderd uit actieve lijst')
      .input('fMode', sql.VarChar, removed.funding_mode)
      .input('mBudget', sql.Decimal(18, 2), Number(removed.monthly_budget || 0))
      .input('aSell', sql.VarChar, removed.allow_selling)
      .input('notes', sql.NVarChar, noteText)
      .query(`
        INSERT INTO PF_UserStrategyHistory 
        (user_id, strategy_type, old_strategy_id, old_strategy_name, new_strategy_id, new_strategy_name, funding_mode, monthly_budget, allow_selling, changed_at, notes)
        VALUES 
        (@userId, @sType, @oldId, @oldName, @newId, @newName, @fMode, @mBudget, @aSell, GETDATE(), @notes)
      `);

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('ticker', sql.NVarChar, sType === 'ETF' ? 'ETF-STRAT' : 'AANDELEN-STRAT')
      .input('message', sql.NVarChar, noteText)
      .input('actionTitle', sql.NVarChar, `🗑️ Strategie Stopgezet: ${removed.name}`)
      .input('stratId', sql.Int, removed.strategy_id)
      .input('stratName', sql.NVarChar, removed.name)
      .input('stratType', sql.VarChar, sType)
      .query(`
        INSERT INTO PF_Notifications
        (user_id, stock_id, ticker, message, is_read, action_required, action_type, action_shares, action_pct, action_title, strategy_id, strategy_name, strategy_type, created_at)
        VALUES
        (@userId, NULL, @ticker, @message, 0, 0, 'STRATEGY_SWITCH', 0, 0, @actionTitle, @stratId, @stratName, @stratType, GETDATE())
      `);

    try {
      const { clearAdvisorCache } = require('./portfolioController');
      clearAdvisorCache();
    } catch (e) {}

    res.json({
      message: noteText,
      activeStrategies: updatedActiveList
    });
  } catch (err) {
    console.error('Fout bij verwijderen actieve strategie:', err);
    res.status(500).json({ message: `Fout bij stopzetten strategie: ${err.message}` });
  }
};

module.exports = {
  getAllStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  activateStrategyForUser,
  getUserStrategyConfigAndHistory,
  updateUserStrategyPreferences,
  addOrUpdateActiveStrategy,
  changeActiveStrategyPriority,
  removeActiveStrategyForUser
};
