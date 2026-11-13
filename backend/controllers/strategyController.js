const { sql } = require('../config/database');
const { getEffectiveUserId, isAdminUser } = require('../middleware/authMiddleware');

// 1. Alle beschikbare strategieën ophalen (met beveiliging tegen formule-kopiëren)
const getAllStrategies = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);

    const query = `
      SELECT 
        s.strategy_id,
        s.user_id,
        s.name,
        s.description,
        s.is_public,
        s.is_system_default,
        s.parameters_json,
        s.performance_summary_json,
        s.created_at,
        s.updated_at,
        u.username AS creator_username,
        (SELECT active_strategy_id FROM PF_Users WHERE id = @userId) AS current_active_strategy_id
      FROM PF_Strategies s
      LEFT JOIN PF_Users u ON s.user_id = u.id
      WHERE s.is_public = 1 OR s.user_id = @userId OR @isAdmin = 1
      ORDER BY s.is_system_default DESC, s.created_at DESC
    `;

    const request = new sql.Request();
    request.input('userId', sql.Int, userId);
    request.input('isAdmin', sql.Bit, isAdmin ? 1 : 0);

    const result = await request.query(query);

    const strategies = result.recordset.map(row => {
      const isOwner = row.user_id === userId;
      const canViewDetails = isOwner || isAdmin;

      let performance = null;
      try {
        if (row.performance_summary_json) performance = JSON.parse(row.performance_summary_json);
      } catch (e) {
        // ignore
      }

      let parameters = null;
      if (canViewDetails && row.parameters_json) {
        try {
          parameters = JSON.parse(row.parameters_json);
        } catch (e) {
          // ignore
        }
      }

      return {
        strategy_id: row.strategy_id,
        name: row.name,
        description: row.description,
        creator_username: row.creator_username || 'Onbekend',
        is_owner: isOwner,
        is_system_default: Boolean(row.is_system_default),
        is_public: Boolean(row.is_public),
        is_active_for_me: row.current_active_strategy_id === row.strategy_id || (row.is_system_default && !row.current_active_strategy_id),
        performance_summary: performance,
        // parameters worden UITSLUITEND meegestuurd naar de eigenaar of beheerder
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

// 2. Enkele strategie ophalen
const getStrategyById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);

    const request = new sql.Request();
    request.input('id', sql.Int, id);
    request.input('userId', sql.Int, userId);

    const result = await request.query(`
      SELECT 
        s.*,
        u.username AS creator_username,
        (SELECT active_strategy_id FROM PF_Users WHERE id = @userId) AS current_active_strategy_id
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

    if (!row.is_public && !canViewDetails) {
      return res.status(403).json({ message: 'Geen toegang tot deze privé-strategie.' });
    }

    let performance = null;
    try {
      if (row.performance_summary_json) performance = JSON.parse(row.performance_summary_json);
    } catch (e) {
      // ignore
    }

    let parameters = null;
    if (canViewDetails && row.parameters_json) {
      try {
        parameters = JSON.parse(row.parameters_json);
      } catch (e) {
        // ignore
      }
    }

    res.json({
      strategy_id: row.strategy_id,
      name: row.name,
      description: row.description,
      creator_username: row.creator_username || 'Onbekend',
      is_owner: isOwner,
      is_system_default: Boolean(row.is_system_default),
      is_public: Boolean(row.is_public),
      is_active_for_me: row.current_active_strategy_id === row.strategy_id || (row.is_system_default && !row.current_active_strategy_id),
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

// 3. Nieuwe strategie opslaan (Strategie Builder)
const createStrategy = async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const { name, description, is_public = true, parameters, performance_summary } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Strategienaam is verplicht.' });
    }
    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({ message: 'Geldige strategie parameters zijn verplicht.' });
    }

    const request = new sql.Request();
    request.input('userId', sql.Int, userId);
    request.input('name', sql.NVarChar, name.trim());
    request.input('description', sql.NVarChar, description ? description.trim() : null);
    request.input('isPublic', sql.Bit, is_public ? 1 : 0);
    request.input('params', sql.NVarChar, JSON.stringify(parameters));
    request.input('perf', sql.NVarChar, performance_summary ? JSON.stringify(performance_summary) : null);

    const insertResult = await request.query(`
      INSERT INTO PF_Strategies (user_id, name, description, is_public, is_system_default, parameters_json, performance_summary_json)
      OUTPUT INSERTED.strategy_id
      VALUES (@userId, @name, @description, @isPublic, 0, @params, @perf)
    `);

    const newId = insertResult.recordset[0].strategy_id;

    res.status(201).json({
      message: 'Strategie succesvol opgeslagen!',
      strategy_id: newId
    });
  } catch (err) {
    console.error('Fout bij opslaan strategie:', err);
    res.status(500).json({ message: `Fout bij opslaan strategie: ${err.message}` });
  }
};

// 4. Bestaande strategie bijwerken
const updateStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);

    const checkReq = new sql.Request();
    checkReq.input('id', sql.Int, id);
    const checkRes = await checkReq.query('SELECT strategy_id, user_id, is_system_default FROM PF_Strategies WHERE strategy_id = @id');
    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = checkRes.recordset[0];
    if (strat.user_id !== userId && !isAdmin) {
      return res.status(403).json({ message: 'U heeft geen toestemming om deze strategie aan te passen.' });
    }

    const { name, description, is_public, parameters, performance_summary } = req.body;

    const updateReq = new sql.Request();
    updateReq.input('id', sql.Int, id);
    updateReq.input('name', sql.NVarChar, name ? name.trim() : strat.name);
    updateReq.input('description', sql.NVarChar, description !== undefined ? (description ? description.trim() : null) : null);
    updateReq.input('isPublic', sql.Bit, is_public !== undefined ? (is_public ? 1 : 0) : 1);
    updateReq.input('params', sql.NVarChar, parameters ? JSON.stringify(parameters) : null);
    updateReq.input('perf', sql.NVarChar, performance_summary ? JSON.stringify(performance_summary) : null);

    let query = `
      UPDATE PF_Strategies 
      SET 
        name = COALESCE(@name, name),
        description = @description,
        is_public = @isPublic,
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

    res.json({ message: 'Strategie succesvol bijgewerkt.' });
  } catch (err) {
    console.error('Fout bij bijwerken strategie:', err);
    res.status(500).json({ message: `Fout bij bijwerken strategie: ${err.message}` });
  }
};

// 5. Strategie verwijderen
const deleteStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getEffectiveUserId(req);
    const isAdmin = isAdminUser(req);

    const checkReq = new sql.Request();
    checkReq.input('id', sql.Int, id);
    const checkRes = await checkReq.query('SELECT strategy_id, user_id, is_system_default FROM PF_Strategies WHERE strategy_id = @id');
    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = checkRes.recordset[0];
    if (strat.is_system_default) {
      return res.status(400).json({ message: 'De standaard systeemstrategie kan niet worden verwijderd.' });
    }

    if (strat.user_id !== userId && !isAdmin) {
      return res.status(403).json({ message: 'U heeft geen toestemming om deze strategie te verwijderen.' });
    }

    await checkReq.query('DELETE FROM PF_Strategies WHERE strategy_id = @id');

    // Als gebruikers deze strategie actief hadden, reset naar NULL (systeemstandaard)
    await checkReq.query('UPDATE PF_Users SET active_strategy_id = NULL WHERE active_strategy_id = @id');

    res.json({ message: 'Strategie succesvol verwijderd.' });
  } catch (err) {
    console.error('Fout bij verwijderen strategie:', err);
    res.status(500).json({ message: `Fout bij verwijderen strategie: ${err.message}` });
  }
};

// 6. Strategie activeren voor huidige gebruiker (Strategie Assistent koppeling)
const activateStrategyForUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getEffectiveUserId(req);

    const checkReq = new sql.Request();
    checkReq.input('id', sql.Int, id);
    const checkRes = await checkReq.query('SELECT strategy_id, name, is_system_default, is_public, user_id FROM PF_Strategies WHERE strategy_id = @id');
    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ message: 'Strategie niet gevonden.' });
    }

    const strat = checkRes.recordset[0];
    if (!strat.is_public && strat.user_id !== userId && Number(userId) !== 1) {
      return res.status(403).json({ message: 'Deze strategie is privé.' });
    }

    const updateReq = new sql.Request();
    updateReq.input('userId', sql.Int, userId);
    updateReq.input('stratId', sql.Int, id);

    await updateReq.query('UPDATE PF_Users SET active_strategy_id = @stratId WHERE id = @userId');

    res.json({
      message: `Strategie "${strat.name}" is nu actief voor jouw portefeuille en Strategie Assistent!`,
      active_strategy_id: strat.strategy_id,
      strategy_name: strat.name
    });
  } catch (err) {
    console.error('Fout bij activeren strategie:', err);
    res.status(500).json({ message: `Fout bij activeren strategie: ${err.message}` });
  }
};

module.exports = {
  getAllStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  activateStrategyForUser
};
