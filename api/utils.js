const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch {}
  return { users: [], sessions: [], codes: [], logs: [], securityLogs: [], rateLimits: [] };
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {}
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

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_key_2024';
const VERIFICATION_KEY = process.env.VERIFICATION_KEY || 'Nexus';
const SESSION_EXPIRY = 120;
const CODE_EXPIRY = 120;

module.exports = { loadDB, saveDB, generateToken, generateCode, generateId, hashToken, genReward, now, expires, isExpired, getClientIP, ADMIN_KEY, VERIFICATION_KEY, SESSION_EXPIRY, CODE_EXPIRY };
