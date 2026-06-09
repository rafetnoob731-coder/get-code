const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = '/tmp/data.json';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_key_2024';
const VERIFICATION_KEY = process.env.VERIFICATION_KEY || 'Nexus';
const SESSION_EXPIRY = 120;
const CODE_EXPIRY = 120;

let memCache = null;

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      memCache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return memCache;
    }
    if (memCache) return memCache;
  } catch (e) { console.error('loadDB error:', e.message); }
  memCache = { users: [], sessions: [], codes: [], logs: [], securityLogs: [], rateLimits: [] };
  return memCache;
}

function saveDB(db) {
  memCache = db;
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) { console.error('saveDB error:', e.message); }
}

function generateToken(len = 32) { return crypto.randomBytes(len).toString('hex'); }
function generateCode() { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let r = ''; for (let i = 0; i < 10; i++) { if (i === 5) r += '-'; r += c[Math.floor(Math.random() * c.length)]; } return r; }
function generateId(pfx) { return pfx + '_' + crypto.randomBytes(12).toString('hex'); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
function genReward() { const r = ['100 Coins','500 Coins','1000 Coins','Premium Access (1 Day)','Premium Access (7 Days)','Exclusive Badge','Double Rewards (24h)','Mystery Box']; return r[Math.floor(Math.random() * r.length)]; }
function now() { return new Date().toISOString(); }
function expires(sec) { return new Date(Date.now() + sec * 1000).toISOString(); }
function isExpired(d) { return new Date(d) < new Date(); }
function getClientIP(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '127.0.0.1'; }

function json(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function redirect(res, url) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/api/, '');
  const q = Object.fromEntries(url.searchParams.entries());

  try {
    if (pathname === '/get_token') {
      if (q.key !== ADMIN_KEY) return json(res, 401, { success: false, error: 'Invalid API key' });
      const db = loadDB();
      const ip = getClientIP(req);
      const deviceId = req.headers['x-device-fingerprint'] || 'default';
      const money = q.money || '0$';
      let user = db.users.find(u => u.device_id === deviceId);
      if (!user) {
        user = { id: db.users.length + 1, user_id: generateId('usr'), device_id: deviceId, ip_address: ip, created_at: now(), last_active: now() };
        db.users.push(user);
      } else { user.last_active = now(); }
      const sessionId = generateId('sess');
      const token = generateToken(32);
      const tokenHash = hashToken(token);
      db.sessions.push({
        id: db.sessions.length + 1, session_id: sessionId, user_id: user.user_id, token: tokenHash,
        status: 'pending', ip_address: ip, device_id: deviceId, created_at: now(),
        expires_at: expires(SESSION_EXPIRY), last_used: null, money
      });
      db.logs.push({ id: db.logs.length + 1, verification_code: null, user_id: user.user_id, session_id: sessionId, action: 'session_pending', status: 'success', ip_address: ip, device_id: deviceId, details: 'Session created (pending callback)', created_at: now() });
      saveDB(db);
      return json(res, 200, { success: true, token, session: sessionId, expires_in: SESSION_EXPIRY, money });
    }

    if (pathname === '/callback') {
      const sid = q.sid;
      if (!sid) return redirect(res, '/?error=missing_session');
      const db = loadDB();
      const session = db.sessions.find(s => s.session_id === sid);
      if (!session) return redirect(res, '/?error=invalid_session');
      if (session.status !== 'pending') {
        if (session.status === 'completed') return redirect(res, `/?session=${sid}&already=1`);
        return redirect(res, '/?error=session_inactive');
      }
      if (new Date(session.expires_at) < new Date()) {
        session.status = 'expired';
        saveDB(db);
        return redirect(res, '/?error=session_expired');
      }
      const ip = getClientIP(req);
      session.status = 'completed';
      session.last_used = now();
      const code = generateCode();
      const reward = genReward();
      db.codes.push({
        id: db.codes.length + 1, user_id: session.user_id, session_id: session.session_id,
        token: session.token, verification_code: code, status: 'active', ip_address: ip,
        device_id: 'callback', reward, created_at: now(), expires_at: expires(CODE_EXPIRY), used_at: null
      });
      db.logs.push({ id: db.logs.length + 1, verification_code: code, user_id: session.user_id, session_id: session.session_id, action: 'callback_processed', status: 'success', ip_address: ip, device_id: 'callback', details: `Shortlink completed, code: ${code}`, created_at: now() });
      saveDB(db);
      return redirect(res, `/?session=${sid}`);
    }

    if (pathname === '/get_code') {
      if (q.key !== ADMIN_KEY) return json(res, 401, { success: false, error: 'Invalid API key' });
      const db = loadDB();
      let session;
      if (q.session) {
        session = db.sessions.find(s => s.session_id === q.session);
        if (!session) return json(res, 401, { success: false, error: 'Invalid session' });
      } else if (q.token) {
        const tokenHash = hashToken(q.token);
        session = db.sessions.find(s => s.token === tokenHash);
        if (!session) return json(res, 401, { success: false, error: 'Invalid token' });
      } else {
        return json(res, 400, { success: false, error: 'Token or session required' });
      }
      if (session.status === 'pending') return json(res, 403, { success: false, error: 'Shortlink completion required' });
      if (session.status !== 'completed') return json(res, 401, { success: false, error: 'Session inactive' });
      if (isExpired(session.expires_at)) {
        session.status = 'expired';
        saveDB(db);
        return json(res, 401, { success: false, error: 'Session expired' });
      }
      const ip = getClientIP(req);
      const deviceId = req.headers['x-device-fingerprint'] || 'default';
      const activeCode = db.codes.find(c => c.session_id === session.session_id && c.status === 'active' && !isExpired(c.expires_at));
      if (!activeCode) return json(res, 404, { success: false, error: 'No active code found. Complete the shortlink again.' });
      session.last_used = now();
      db.logs.push({ id: db.logs.length + 1, verification_code: activeCode.verification_code, user_id: session.user_id, session_id: session.session_id, action: 'code_retrieved', status: 'success', ip_address: ip, device_id: deviceId, details: `Code retrieved: ${activeCode.verification_code}`, created_at: now() });
      saveDB(db);
      const remaining = Math.floor((new Date(activeCode.expires_at) - new Date()) / 1000);
      return json(res, 200, {
        success: true, code: activeCode.verification_code, expires_in: remaining, usage_limit: 1,
        time_remaining: `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`
      });
    }

    if (pathname === '/verify') {
      if (q.key !== VERIFICATION_KEY) return json(res, 401, { success: false, error: 'Invalid API key' });
      if (!q.code) return json(res, 400, { success: false, error: 'Code required' });
      const db = loadDB();
      const ip = getClientIP(req);
      const deviceId = req.headers['x-device-fingerprint'] || 'default';
      const vcode = db.codes.find(c => c.verification_code === q.code);
      if (!vcode) {
        db.logs.push({ id: db.logs.length + 1, verification_code: q.code, user_id: null, session_id: null, action: 'verify_attempt', status: 'failed', ip_address: ip, device_id: deviceId, details: 'Invalid code', created_at: now() });
        saveDB(db);
        return json(res, 400, { success: false, error: 'Invalid code' });
      }
      if (vcode.status === 'used') {
        db.logs.push({ id: db.logs.length + 1, verification_code: q.code, user_id: vcode.user_id, session_id: vcode.session_id, action: 'verify_attempt', status: 'failed', ip_address: ip, device_id: deviceId, details: 'Already used', created_at: now() });
        saveDB(db);
        return json(res, 400, { success: false, error: 'Already used this code' });
      }
      if (vcode.status === 'revoked') return json(res, 400, { success: false, error: 'Code revoked' });
      if (isExpired(vcode.expires_at)) {
        vcode.status = 'expired';
        saveDB(db);
        return json(res, 400, { success: false, error: 'Expired code' });
      }
      vcode.status = 'used';
      vcode.used_at = now();
      const session = db.sessions.find(s => s.session_id === vcode.session_id);
      if (session) session.last_used = now();
      db.logs.push({ id: db.logs.length + 1, verification_code: q.code, user_id: vcode.user_id, session_id: vcode.session_id, action: 'verify_success', status: 'success', ip_address: ip, device_id: deviceId, details: `Verified, reward: ${vcode.reward}`, created_at: now() });
      saveDB(db);
      return json(res, 200, { success: true, message: 'Valid', reward: vcode.reward, verified_at: now(), code_status: 'used', session_status: 'verified', usage: '1/1' });
    }

    if (pathname === '/admin') {
      if (q.key !== ADMIN_KEY) return json(res, 401, { success: false, error: 'Invalid API key' });
      const db = loadDB();
      const action = q.action || 'dashboard';
      if (action === 'dashboard') {
        return json(res, 200, { success: true, data: {
          users: db.users.length, sessions: db.sessions.length,
          codes: { total: db.codes.length, active: db.codes.filter(c => c.status === 'active').length, used: db.codes.filter(c => c.status === 'used').length, expired: db.codes.filter(c => c.status === 'expired').length, revoked: db.codes.filter(c => c.status === 'revoked').length },
          recentLogs: db.logs.slice(-10).reverse(), securityLogs: db.securityLogs.slice(-10).reverse()
        }});
      }
      if (action === 'users') return json(res, 200, { success: true, data: db.users });
      if (action === 'sessions') {
        let sessions = db.sessions;
        if (q.userId) sessions = sessions.filter(s => s.user_id === q.userId);
        if (q.status) sessions = sessions.filter(s => s.status === q.status);
        return json(res, 200, { success: true, data: sessions.slice(-50).reverse() });
      }
      if (action === 'codes') {
        let codes = db.codes;
        if (q.userId) codes = codes.filter(c => c.user_id === q.userId);
        if (q.status) codes = codes.filter(c => c.status === q.status);
        return json(res, 200, { success: true, data: codes.slice(-50).reverse() });
      }
      if (action === 'logs') {
        let logs = db.logs;
        if (q.action) logs = logs.filter(l => l.action === q.action);
        if (q.status) logs = logs.filter(l => l.status === q.status);
        return json(res, 200, { success: true, data: logs.slice(-100).reverse() });
      }
      return json(res, 400, { success: false, error: 'Invalid action' });
    }

    return json(res, 404, { success: false, error: 'Not found' });
  } catch (e) {
    console.error('API error:', e);
    return json(res, 500, { success: false, error: 'Internal server error' });
  }
};
