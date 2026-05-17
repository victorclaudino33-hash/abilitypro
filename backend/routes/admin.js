const router = require('express').Router();
const multer = require('multer');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const auth   = require('../middleware/auth');
const db     = require('../db');
const XLSX   = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Converte qualquer valor de célula de curso em 0 ou 1 ───────────────────
// Aceita: datas, textos de data, números (ex: 46135), "1", "SIM", etc.
// Vazio/null/0/"0"/"NÃO" = 0. Qualquer outra coisa = 1.
function hasCurso(val) {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).trim().toUpperCase();
  if (s === '0' || s === 'NAO' || s === 'NÃO' || s === 'NO' || s === 'FALSE') return 0;
  return 1;
}

// ─── Lê planilha Excel (.xlsx/.xls) e retorna array de objetos ──────────────
function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  // Normaliza os headers para maiúsculo sem espaços
  return raw.map(row => {
    const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[k.trim().toUpperCase()] = v;
    }
    return normalized;
  });
}

// ─── Lê CSV com separador ; ──────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(';').map(h => h.trim().toUpperCase().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 2 || !cols[0]) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || null; });
    rows.push(row);
  }
  return rows;
}

// ─── Mapeia uma linha (de qualquer formato) para o objeto do banco ───────────
function mapRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(r =>
        r.replace(/[\s.\-_]/g, '').toUpperCase() === k.replace(/[\s.\-_]/g, '').toUpperCase()
      );
      if (found !== undefined) return row[found];
    }
    return null;
  };

  // CPF: remove tudo que não é dígito e garante string
  const cpfRaw = String(get('CPF') || '').replace(/\D/g, '').padStart(11, '0');

  return {
    nome:     String(get('NOME') || '').trim(),
    cpf:      cpfRaw,
    nr06:     hasCurso(get('NR06')),
    nr10:     hasCurso(get('NR10')),
    direcao:  hasCurso(get('DIRECAO', 'DIREÇÃO', 'DIRECAODEFENSIVA')),
    nr35:     hasCurso(get('NR35')),
    sga_nr20: hasCurso(get('SGANR20', 'SGA.NR20', 'SGANR20', 'NR20')),
    nr33:     hasCurso(get('NR33')),
    nr10sep:  hasCurso(get('NR10SEP', 'NR10_SEP', 'NR10 SEP')),
  };
}

// ─── POST /api/admin/upload-csv ──────────────────────────────────────────────
// Aceita .xlsx, .xls e .csv — detecta automaticamente pelo mimetype/extensão
router.post('/upload-csv', auth, upload.single('csv'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const originalName = (req.file.originalname || '').toLowerCase();
    const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') ||
                    req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    req.file.mimetype === 'application/vnd.ms-excel';

    let rows;
    if (isExcel) {
      rows = parseXLSX(req.file.buffer);
    } else {
      // CSV — tenta UTF-8 primeiro, depois latin1
      let text = req.file.buffer.toString('utf-8');
      if (text.includes('�')) text = req.file.buffer.toString('latin1');
      rows = parseCSV(text);
    }

    if (!rows.length) return res.status(400).json({ error: 'Planilha vazia ou formato inválido' });

    const batchName = req.body.batchName || `Lote ${new Date().toLocaleDateString('pt-BR')}`;
    const batchId = db.prepare(
      'INSERT INTO batches (name, total, status, data_json) VALUES (?, ?, ?, ?)'
    ).run(batchName, rows.length, 'active', JSON.stringify(rows)).lastInsertRowid;

    const insertColab = db.prepare(`
      INSERT INTO colaboradores
        (batch_id, nome, cpf, nr06, nr10, direcao, nr35, sga_nr20, nr33, nr10sep, token, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    let inserted = 0;
    const insertMany = db.transaction(() => {
      for (const row of rows) {
        const mapped = mapRow(row);
        if (!mapped.nome || !mapped.cpf || mapped.cpf === '00000000000') continue;
        const token = crypto.randomBytes(16).toString('hex');
        insertColab.run(
          batchId, mapped.nome, mapped.cpf,
          mapped.nr06, mapped.nr10, mapped.direcao, mapped.nr35,
          mapped.sga_nr20, mapped.nr33, mapped.nr10sep,
          token
        );
        inserted++;
      }
    });
    insertMany();

    db.prepare('INSERT INTO logs (action, details) VALUES (?, ?)').run(
      'UPLOAD', `Batch ${batchId} "${batchName}": ${inserted} colaboradores (${isExcel ? 'Excel' : 'CSV'})`
    );

    res.json({ success: true, batchId, total: inserted, batchName });
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
  const total   = db.prepare('SELECT COUNT(*) as n FROM colaboradores').get().n;
  const signed  = db.prepare("SELECT COUNT(*) as n FROM colaboradores WHERE status = 'signed'").get().n;
  const pending = db.prepare("SELECT COUNT(*) as n FROM colaboradores WHERE status = 'pending'").get().n;
  const batches = db.prepare('SELECT COUNT(*) as n FROM batches').get().n;
  res.json({ total, signed, pending, batches });
});

// GET /api/admin/signed — todos que já assinaram, com lista de arquivos
router.get('/signed', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.nome, c.cpf, c.signed_at, c.ip_address, c.pdf_path,
           b.name as batch_name, b.id as batch_id
    FROM colaboradores c
    LEFT JOIN batches b ON b.id = c.batch_id
    WHERE c.status = 'signed'
    ORDER BY c.signed_at DESC
  `).all();

  const result = rows.map(r => {
    let files = [];
    if (r.pdf_path && fs.existsSync(r.pdf_path)) {
      files = fs.readdirSync(r.pdf_path).filter(f => f.endsWith('.pdf'));
    }
    return { ...r, files };
  });

  res.json(result);
});

module.exports = router;
