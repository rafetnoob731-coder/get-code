const { loadDB, saveDB, generateCode, genReward, now, expires, getClientIP } = require('./utils');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sid = req.query.sid;
    if (!sid) return res.redirect('/?error=missing_session');

    const db = loadDB();
    const session = db.sessions.find(s => s.session_id === sid);

    if (!session) return res.redirect('/?error=invalid_session');

    if (session.status !== 'pending') {
      if (session.status === 'completed') return res.redirect(`/?session=${sid}&already=1`);
      return res.redirect('/?error=session_inactive');
    }

    if (new Date(session.expires_at) < new Date()) {
      session.status = 'expired';
      saveDB(db);
      return res.redirect('/?error=session_expired');
    }

    const ip = getClientIP(req);

    session.status = 'completed';
    session.last_used = now();

    const code = generateCode();
    const reward = genReward();

    db.codes.push({
      id: db.codes.length + 1,
      user_id: session.user_id,
      session_id: session.session_id,
      token: session.token,
      verification_code: code,
      status: 'active',
      ip_address: ip,
      device_id: 'callback',
      reward,
      created_at: now(),
      expires_at: expires(120),
      used_at: null
    });

    db.logs.push({
      id: db.logs.length + 1,
      verification_code: code,
      user_id: session.user_id,
      session_id: session.session_id,
      action: 'callback_processed',
      status: 'success',
      ip_address: ip,
      device_id: 'callback',
      details: `Shortlink completed, code: ${code}`,
      created_at: now()
    });

    saveDB(db);

    return res.redirect(`/?session=${sid}`);
  } catch (e) {
    console.error('callback error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
