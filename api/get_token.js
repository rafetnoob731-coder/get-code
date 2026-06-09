const { loadDB, saveDB, generateToken, generateId, hashToken, now, expires, getClientIP, ADMIN_KEY, SESSION_EXPIRY } = require('./utils');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const db = loadDB();
    const ip = getClientIP(req);
    const deviceId = req.headers['x-device-fingerprint'] || 'default';
    const money = req.query.money || '0$';

    let user = db.users.find(u => u.device_id === deviceId);
    if (!user) {
      user = { id: db.users.length + 1, user_id: generateId('usr'), device_id: deviceId, ip_address: ip, created_at: now(), last_active: now() };
      db.users.push(user);
    } else {
      user.last_active = now();
    }

    const sessionId = generateId('sess');
    const token = generateToken(32);
    const tokenHash = hashToken(token);

    const session = {
      id: db.sessions.length + 1,
      session_id: sessionId,
      user_id: user.user_id,
      token: tokenHash,
      status: 'pending',
      ip_address: ip,
      device_id: deviceId,
      created_at: now(),
      expires_at: expires(SESSION_EXPIRY),
      last_used: null,
      money
    };
    db.sessions.push(session);

    db.logs.push({
      id: db.logs.length + 1,
      verification_code: null,
      user_id: user.user_id,
      session_id: sessionId,
      action: 'session_pending',
      status: 'success',
      ip_address: ip,
      device_id: deviceId,
      details: 'Session created (pending callback)',
      created_at: now()
    });

    saveDB(db);

    res.json({ success: true, token, session: sessionId, expires_in: SESSION_EXPIRY, money });
  } catch (e) {
    console.error('get_token error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
