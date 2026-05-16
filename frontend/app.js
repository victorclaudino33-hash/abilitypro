// ============================================================
//  ABILITY PRO v3 — app.js
//  ⚙️  ALTERE APENAS ESTA LINHA com a URL do seu Railway:
// ============================================================
const BACKEND_URL = 'COLE_AQUI_A_URL_DO_RAILWAY';
// Exemplo: const BACKEND_URL = 'https://abilitypro-production.up.railway.app';
// ============================================================

// Auth helpers
const Auth = {
  token: () => localStorage.getItem('ap_token'),
  user:  () => localStorage.getItem('ap_user'),
  logout() {
    localStorage.removeItem('ap_token');
    localStorage.removeItem('ap_user');
    window.location.href = 'index.html';
  },
  requireAuth() {
    if (!this.token()) window.location.href = 'index.html';
  },
  headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token()}`,
    };
  },
};

// Fetch helper with auth
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...opts,
    headers: { ...(Auth.headers()), ...(opts.headers || {}) },
  });
  if (res.status === 401) { Auth.logout(); return; }
  return res;
}

// Format CPF
function formatCPF(v) {
  const d = (v || '').replace(/\D/g, '');
  if (d.length !== 11) return v;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// Cert badges
function certBadges(colab) {
  const certs = [
    { key: 'nr06',    label: 'NR06' },
    { key: 'nr10',    label: 'NR10' },
    { key: 'direcao', label: 'DIR.' },
    { key: 'nr35',    label: 'NR35' },
    { key: 'sga_nr20',label: 'NR20' },
    { key: 'nr33',    label: 'NR33' },
    { key: 'nr10sep', label: 'NR10S' },
  ];
  return certs
    .filter(c => colab[c.key])
    .map(c => `<span class="badge">${c.label}</span>`)
    .join('');
}

// Status label
function statusLabel(status) {
  const map = {
    pending: '<span class="status pending">Pendente</span>',
    signed:  '<span class="status signed">Assinado</span>',
    sent:    '<span class="status sent">Enviado</span>',
  };
  return map[status] || status;
}

// Trigger file download from blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Copy text to clipboard
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Link copiado!'));
}

// Toast notification
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.ap-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `ap-toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}
