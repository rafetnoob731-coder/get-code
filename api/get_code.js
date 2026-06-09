const { loadDB, saveDB, hashToken, now, getClientIP, ADMIN_KEY } = require('./utils');

function isExpired(d) { return new Date(d) < new Date(); }

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const db = loadDB();
    let session;

    if (req.query.session) {
      session = db.sessions.find(s => s.session_id === req.query.session);
      if (!session) return res.status(401).json({ success: false, error: 'Invalid session' });
    } else if (req.query.token) {
      const tokenHash = hashToken(req.query.token);
      session = db.sessions.find(s => s.token === tokenHash);
      if (!session) return res.status(401).json({ success: false, error: 'Invalid token' });
    } else {
      return res.status(400).json({ success: false, error: 'Token or session required' });
    }

    if (session.status === 'pending') {
      return res.status(403).json({ success: false, error: 'Shortlink completion required' });
    }

    if (session.status !== 'completed') {
      return res.status(401).json({ success: false, error: 'Session inactive' });
    }

    if (isExpired(session.expires_at)) {
      session.status = 'expired';
      saveDB(db);
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    const ip = getClientIP(req);
    const deviceId = req.headers['x-device-fingerprint'] || 'default';

    const activeCode = db.codes.find(c => c.session_id === session.session_id && c.status === 'active' && !isExpired(c.expires_at));
    if (!activeCode) {
      return res.status(404).json({ success: false, error: 'No active code found. Complete the shortlink again.' });
    }

    session.last_used = now();

    db.logs.push({
      id: db.logs.length + 1,
      verification_code: activeCode.verification_code,
      user_id: session.user_id,
      session_id: session.session_id,
      action: 'code_retrieved',
      status: 'success',
      ip_address: ip,
      device_id: deviceId,
      details: `Code retrieved: ${activeCode.verification_code}`,
      created_at: now()
    });

    saveDB(db);

    const remaining = Math.floor((new Date(activeCode.expires_at) - new Date()) / 1000);
    res.json({
      success: true,
      code: activeCode.verification_code,
      expires_in: remaining,
      usage_limit: 1,
      time_remaining: `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`
    });
  } catch (e) {
    console.error('get_code error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
