const jwt = require('jsonwebtoken');

const DEFAULT_PERMISSIONS_BY_MODE = {
  portfolio_only: {
    canViewDashboard: false,
    canViewPortfolio: true,
    canUseStockStrategy: false,
    canUseEtfStrategy: false,
    canViewStrategyBuilder: false,
    canViewAnalysis: false,
    canViewScreener: false,
    canViewFormulas: false,
    canEditSystemData: false,
    canReceiveStrategyAlerts: false,
  },
  arne_advies: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canUseStockStrategy: true,
    canUseEtfStrategy: true,
    canViewStrategyBuilder: true,
    canViewAnalysis: true,
    canViewScreener: false,
    canViewFormulas: false,
    canEditSystemData: false,
    canReceiveStrategyAlerts: true,
  },
  full_access: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canUseStockStrategy: true,
    canUseEtfStrategy: true,
    canViewStrategyBuilder: true,
    canViewAnalysis: true,
    canViewScreener: true,
    canViewFormulas: true,
    canEditSystemData: true,
    canReceiveStrategyAlerts: true,
  },
};

const buildUserPermissions = (roleOrUserObj, strategyMode = 'portfolio_only', rawPermissionsJson = null, userId = null) => {
  let role = roleOrUserObj;
  let mode = strategyMode;
  let rawPerms = rawPermissionsJson;
  let uid = userId;

  if (roleOrUserObj && typeof roleOrUserObj === 'object') {
    uid = roleOrUserObj.id || roleOrUserObj.userID || null;
    role = Number(uid) === 1 ? 'admin' : (roleOrUserObj.role || 'starter');
    mode = Number(uid) === 1 ? 'full_access' : (roleOrUserObj.strategy_mode || (role === 'starter' || role === 'user' ? 'portfolio_only' : 'arne_advies'));
    rawPerms = roleOrUserObj.permissions || null;
  }

  // User 1 (ArneVR) en admins hebben altijd 100% toegang tot alles
  if (Number(uid) === 1 || role === 'admin') {
    return { ...DEFAULT_PERMISSIONS_BY_MODE.full_access };
  }

  let baseMode = DEFAULT_PERMISSIONS_BY_MODE[mode];
  if (!baseMode) {
    if (role === 'starter' || role === 'portfolio_only') {
      baseMode = DEFAULT_PERMISSIONS_BY_MODE.portfolio_only;
    } else if (role === 'pro' || role === 'arne_advies') {
      baseMode = DEFAULT_PERMISSIONS_BY_MODE.arne_advies;
    } else {
      baseMode = DEFAULT_PERMISSIONS_BY_MODE.portfolio_only;
    }
  }

  let custom = {};
  if (rawPerms) {
    if (typeof rawPerms === 'string') {
      try {
        custom = JSON.parse(rawPerms);
      } catch (e) {
        custom = {};
      }
    } else if (typeof rawPerms === 'object') {
      custom = rawPerms;
    }
  }

  const merged = {
    ...baseMode,
    ...custom,
  };

  if (merged.canViewStrategyBuilder === undefined) {
    merged.canViewStrategyBuilder = Boolean(merged.canUseStockStrategy || merged.canUseEtfStrategy || merged.canViewScreener);
  }

  return merged;
};

const isAdminUser = (reqOrUser) => {
  if (!reqOrUser) return false;
  const u = reqOrUser.user || reqOrUser;
  return Number(u.userID || u.id) === 1 || u.role === 'admin';
};

/**
 * Geeft de veilige user_id terug voor database-queries:
 * - ALTIJD de geverifieerde userID uit het JWT-token (of 1 voor demo-account).
 * - Query/body parameters zoals ?userId=... worden NOOIT gebruikt om een ander portfolio op te halen.
 *   Hierdoor kan niemand (zelfs niet door een karakter of ID in de URL aan te passen) in het portfolio van een andere gebruiker terechtkomen.
 */
const getEffectiveUserId = (req) => {
  if (!req || !req.user) return 1;
  const tokenUserId = Number(req.user.userID || req.user.id);
  if (req.user.role === 'demo') return 1;
  return tokenUserId || 1;
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Geen token voorzien. Toegang geweigerd.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (Number(decoded.userID) === 1) {
      decoded.role = 'admin';
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Ongeldige of verlopen token. Log opnieuw in.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ message: 'Alleen de beheerder (Arne) heeft toegang tot deze actie.' });
  }
  next();
};

const blockDemoWrites = (req, res, next) => {
  if (req.user?.role === 'demo' && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return res.status(403).json({ message: 'Demo-account kan geen gegevens wijzigen.' });
  }
  next();
};

verifyToken.requireAdmin = requireAdmin;
verifyToken.isAdminUser = isAdminUser;
verifyToken.getEffectiveUserId = getEffectiveUserId;
verifyToken.buildUserPermissions = buildUserPermissions;
verifyToken.DEFAULT_PERMISSIONS_BY_MODE = DEFAULT_PERMISSIONS_BY_MODE;
verifyToken.blockDemoWrites = blockDemoWrites;

module.exports = verifyToken;
