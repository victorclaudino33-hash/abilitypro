const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const db = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Parse CSV with flexible column detection
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(';').map(h => h.trim().toUpperCase().replace(/"/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 2 || !cols[0]) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function mapRow(row) {
  // Support flexible column names
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(r => r.replace(/[\s.]/g, '').toUpperCase() === k.toUpperCase());
      if (found) return row[found];
    }
    return '0';
  };

  return {
    nome:    get('NOME') || '',
    cpf:     get('CPF') || '',
    nr06:    parseInt(get('NR06')) || 0,
    nr10:    parseInt(get('NR10')) || 0,
    direcao: parseInt(get('DIRECAO', 'DIREÇÃO')) || 0,
    nr35:    parseInt(get('NR35')) || 0,
    sga_nr20:parseInt(get('SGANR20', 'SGA.NR20', 'SGANR20')) || 0,
    nr33:    parseInt(get('NR33')) || 0,
    nr10sep: parseInt(get('NR10SEP', 'NR10_SEP')) || 0,
  };
}

// POST /api/admin/upload-csv
router.post('/upload-csv', auth, upload.single('csv'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não encontrado' });

    const text = req.file.buffer.toString('latin1'); // support accents
    const csvRows = parseCSV(text);

    if (csvRows.length === 0) return res.status(400).json({ error: 'CSV vazio ou formato inválido' });

    const batchName = req.body.batchName || `Lote ${new Date().toLocaleDateString('pt-BR')}`;
    const batchId = db.prepare(
      'INSERT INTO batches (name, total, status, data_json) VALUES (?, ?, ?, ?)'
    ).run(batchName, csvRows.length, 'active', JSON.stringify(csvRows)).lastInsertRowid;

    const insertColab = db.prepare(`
      INSERT INTO colaboradores (batch_id, nome, cpf, nr06, nr10, direcao, nr35, sga_nr20, nr33, nr10sep, token, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const colabs = [];
    const insertMany = db.transaction(() => {
      for (const row of csvRows) {
        const mapped = mapRow(row);
        if (!mapped.nome || !mapped.cpf) continue;
        const token = crypto.randomBytes(16).toString('hex');
        insertColab.run(batchId, mapped.nome, mapped.cpf, mapped.nr06, mapped.nr10, mapped.direcao, mapped.nr35, mapped.sga_nr20, mapped.nr33, mapped.nr10sep, token);
        colabs.push({ ...mapped, token });
      }
    });
    insertMany();

    db.prepare('INSERT INTO logs (action, details) VALUES (?, ?)').run('UPLOAD_CSV', `Batch ${batchId}: ${csvRows.length} registros`);

    res.json({ success: true, batchId, total: csvRows.length, batchName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/batches
router.get('/batches', auth, (req, res) => {
  const batches = db.prepare('SELECT * FROM batches ORDER BY created_at DESC').all();
  res.json(batches);
});

// GET /api/admin/batch/:id
router.get('/batch/:id', auth, (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado' });

  const colaboradores = db.prepare('SELECT * FROM colaboradores WHERE batch_id = ?').all(req.params.id);
  res.json({ batch, colaboradores });
});

// GET /api/admin/colaborador/:id
router.get('/colaborador/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  res.json(c);
});

// GET /api/admin/stats
router.get('/stats', auth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM colaboradores').get().n;
  const signed = db.prepare("SELECT COUNT(*) as n FROM colaboradores WHERE status = 'signed'").get().n;
  const pending = db.prepare("SELECT COUNT(*) as n FROM colaboradores WHERE status = 'pending'").get().n;
  const batches = db.prepare('SELECT COUNT(*) as n FROM batches').get().n;
  res.json({ total, signed, pending, batches });
});

module.exports = router;
