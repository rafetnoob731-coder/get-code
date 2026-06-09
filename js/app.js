const ADMIN_KEY = 'admin_secret_key_2024';
const API_BASE = '';
const SHORTLINK = 'https://example.com/shortlink';
const CODE_DURATION = 120;

let currentSession = null;
let currentToken = null;
let countdownInterval = null;

const $ = id => document.getElementById(id);

function showCard(id) {
  ['cardVerify','cardLoading','cardCode','cardExpired','cardSuccess'].forEach(c => {
    $(c).classList.toggle('hidden', c !== id);
  });
}

function showToast(msg, type) {
  const container = $('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type || 'info'}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function startCountdown(expiresIn) {
  clearInterval(countdownInterval);
  let sec = Math.max(0, Math.min(expiresIn, CODE_DURATION));

  function tick() {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    $('countdown').textContent = `${m}:${s}`;
    if (sec <= 0) {
      clearInterval(countdownInterval);
      onCodeExpired();
      return;
    }
    sec--;
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function onCodeExpired() {
  clearInterval(countdownInterval);
  showCard('cardExpired');
}

function handleGetCode() {
  const linkParam = new URLSearchParams(window.location.search).get('link');
  const shortlinkBase = linkParam || SHORTLINK;

  showCard('cardLoading');

  fetch(`${API_BASE}/get_token?key=${ADMIN_KEY}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        showCard('cardVerify');
        showToast(data.error || 'Failed to create session', 'error');
        return;
      }
      currentSession = data.session;
      currentToken = data.token;
      const callback = encodeURIComponent(`${window.location.origin}/callback?sid=${data.session}`);
      window.location.href = `${shortlinkBase}?sid=${data.session}&callback=${callback}`;
    })
    .catch(() => {
      showCard('cardVerify');
      showToast('Connection error. Please try again.', 'error');
    });
}

function retrieveCode(sessionId) {
  showCard('cardLoading');
  fetch(`${API_BASE}/get_code?key=${ADMIN_KEY}&session=${sessionId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        if (data.error === 'Session expired' || data.error === 'Shortlink completion required') {
          showCard('cardExpired');
        } else {
          showCard('cardVerify');
          showToast(data.error || 'Failed to retrieve code', 'error');
        }
        return;
      }
      currentSession = sessionId;
      $('codeText').textContent = data.code;
      showCard('cardCode');
      startCountdown(data.expires_in || CODE_DURATION);
    })
    .catch(() => {
      showCard('cardVerify');
      showToast('Connection error. Please try again.', 'error');
    });
}

function copyCode() {
  const code = $('codeText').textContent;
  if (!code || code === 'ABX7K-92LPQ') return;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Code copied to clipboard!', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Code copied to clipboard!', 'success');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  $('btnGetCode').addEventListener('click', handleGetCode);
  $('btnRetry').addEventListener('click', handleGetCode);
  $('btnModalRetry').addEventListener('click', handleGetCode);
  $('btnCopy').addEventListener('click', copyCode);

  const params = new URLSearchParams(window.location.search);
  const sessionFromUrl = params.get('session');

  if (sessionFromUrl) {
    retrieveCode(sessionFromUrl);
  } else {
    showCard('cardVerify');
  }
});
