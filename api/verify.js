const { loadDB, saveDB, now, getClientIP, VERIFICATION_KEY } = require('./utils');

function isExpired(d) { return new Date(d) < new Date(); }

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = req.query.key;
    if (key !== VERIFICATION_KEY) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const code = req.query.code;
    if (!code) return res.status(400).json({ success: false, error: 'Code required' });

    const db = loadDB();
    const ip = getClientIP(req);
    const deviceId = req.headers['x-device-fingerprint'] || 'default';

    const vcode = db.codes.find(c => c.verification_code === code);
    if (!vcode) {
      db.logs.push({ id: db.logs.length + 1, verification_code: code, user_id: null, session_id: null, action: 'verify_attempt', status: 'failed', ip_address: ip, device_id: deviceId, details: 'Invalid code', created_at: now() });
      saveDB(db);
      return res.status(400).json({ success: false, error: 'Invalid code' });
    }

    if (vcode.status === 'used') {
      db.logs.push({ id: db.logs.length + 1, verification_code: code, user_id: vcode.user_id, session_id: vcode.session_id, action: 'verify_attempt', status: 'failed', ip_address: ip, device_id: deviceId, details: 'Already used', created_at: now() });
      saveDB(db);
      return res.status(400).json({ success: false, error: 'Already used this code' });
    }

    if (vcode.status === 'revoked') {
      return res.status(400).json({ success: false, error: 'Code revoked' });
    }

    if (isExpired(vcode.expires_at)) {
      vcode.status = 'expired';
      saveDB(db);
      return res.status(400).json({ success: false, error: 'Expired code' });
    }

    vcode.status = 'used';
    vcode.used_at = now();

    const session = db.sessions.find(s => s.session_id === vcode.session_id);
    if (session) session.last_used = now();

    db.logs.push({ id: db.logs.length + 1, verification_code: code, user_id: vcode.user_id, session_id: vcode.session_id, action: 'verify_success', status: 'success', ip_address: ip, device_id: deviceId, details: `Verified, reward: ${vcode.reward}`, created_at: now() });

    saveDB(db);
    res.json({ success: true, message: 'Valid', reward: vcode.reward, verified_at: now(), code_status: 'used', session_status: 'verified', usage: '1/1' });
  } catch (e) {
    console.error('verify error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
