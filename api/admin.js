const { loadDB, now, getClientIP, ADMIN_KEY } = require('./utils');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const db = loadDB();
    const action = req.query.action || 'dashboard';

    switch (action) {
      case 'dashboard':
        return res.json({ success: true, data: {
          users: db.users.length,
          sessions: db.sessions.length,
          codes: {
            total: db.codes.length,
            active: db.codes.filter(c => c.status === 'active').length,
            used: db.codes.filter(c => c.status === 'used').length,
            expired: db.codes.filter(c => c.status === 'expired').length,
            revoked: db.codes.filter(c => c.status === 'revoked').length
          },
          recentLogs: db.logs.slice(-10).reverse(),
          securityLogs: db.securityLogs.slice(-10).reverse()
        }});

      case 'users':
        return res.json({ success: true, data: db.users });

      case 'sessions':
        let sessions = db.sessions;
        if (req.query.userId) sessions = sessions.filter(s => s.user_id === req.query.userId);
        if (req.query.status) sessions = sessions.filter(s => s.status === req.query.status);
        return res.json({ success: true, data: sessions.slice(-50).reverse() });

      case 'codes':
        let codes = db.codes;
        if (req.query.userId) codes = codes.filter(c => c.user_id === req.query.userId);
        if (req.query.status) codes = codes.filter(c => c.status === req.query.status);
        return res.json({ success: true, data: codes.slice(-50).reverse() });

      case 'logs':
        let logs = db.logs;
        if (req.query.action) logs = logs.filter(l => l.action === req.query.action);
        if (req.query.status) logs = logs.filter(l => l.status === req.query.status);
        return res.json({ success: true, data: logs.slice(-100).reverse() });

      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (e) {
    console.error('admin error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
