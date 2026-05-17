const router  = require('express').Router();
const db      = require('../db');
const fs      = require('fs');
const path    = require('path');
const auth    = require('../middleware/auth');
const { generateCertificatePDF, generateManifesto } = require('../utils/pdfGenerator');
const archiver = require('archiver');

// Pasta onde os PDFs ficam guardados no servidor
const STORAGE_DIR = path.join(__dirname, '../../data/certificados');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────
//  POST /api/signature/:token
//  Recebe a assinatura do colaborador, gera os PDFs,
//  SALVA no servidor e responde apenas com confirmação.
//  O colaborador NÃO recebe nenhum arquivo — só vê a mensagem de sucesso.
// ─────────────────────────────────────────────────────────────
router.post('/:token', async (req, res) => {
  const { signatureData, cpf } = req.body;

  const colab = db.prepare('SELECT * FROM colaboradores WHERE token = ?').get(req.params.token);
  if (!colab) return res.status(404).json({ error: 'Token inválido' });

  // Bloqueia reenvio se já assinou
  if (colab.status === 'signed') {
    return res.status(409).json({ error: 'Você já assinou seus certificados anteriormente.' });
  }

  // Verifica CPF
  const cpfEnviado = (cpf || '').replace(/\D/g, '');
  const cpfDB      = (colab.cpf || '').replace(/\D/g, '');
  if (cpfEnviado !== cpfDB) return res.status(401).json({ error: 'CPF inválido' });

  if (!signatureData) return res.status(400).json({ error: 'Assinatura não recebida' });

  const ip       = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';
  const signedAt = new Date().toISOString();
  const certs    = getCertList(colab);
  const nomeSlug = colab.nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');

  // Pasta individual por colaborador: data/certificados/<id>_<nome>/
  const colabDir = path.join(STORAGE_DIR, `${colab.id}_${nomeSlug}`);
  if (!fs.existsSync(colabDir)) fs.mkdirSync(colabDir, { recursive: true });

  const savedFiles = [];

  // Gera e salva cada certificado
  for (const cert of certs) {
    try {
      const pdfBytes = await generateCertificatePDF(colab, cert, signatureData);
      const filename  = `${nomeSlug}_${cert}.pdf`;
      const filepath  = path.join(colabDir, filename);
      fs.writeFileSync(filepath, Buffer.from(pdfBytes));
      savedFiles.push(filename);
    } catch (e) {
      console.error(`Erro ao gerar ${cert}:`, e.message);
    }
  }

  // Gera e salva o Manifesto Jurídico
  try {
    const manifestoBytes = await generateManifesto(colab, certs, ip, signedAt, signatureData);
    const manifestoFile  = `${nomeSlug}_MANIFESTO_DIGITAL.pdf`;
    fs.writeFileSync(path.join(colabDir, manifestoFile), Buffer.from(manifestoBytes));
    savedFiles.push(manifestoFile);
  } catch (e) {
    console.error('Erro ao gerar manifesto:', e.message);
  }

  // Atualiza banco: status, data, IP, caminho da pasta
  db.prepare(`
    UPDATE colaboradores
    SET status='signed', signed_at=?, signature_data=?, ip_address=?, pdf_path=?
    WHERE token=?
  `).run(signedAt, signatureData, ip, colabDir, req.params.token);

  // Atualiza contagem de assinados no lote
  db.prepare(`
    UPDATE batches
    SET signed = (SELECT COUNT(*) FROM colaboradores WHERE batch_id=? AND status='signed')
    WHERE id=?
  `).run(colab.batch_id, colab.batch_id);

  db.prepare('INSERT INTO logs (action, details) VALUES (?, ?)').run(
    'SIGNATURE',
    `Colaborador ID ${colab.id} (${colab.nome}) assinou de ${ip}. ${savedFiles.length} arquivos salvos.`
  );

  // ✅ Resposta para o colaborador: só confirmação, sem arquivo
  res.json({
    ok: true,
    message: `Assinatura registrada com sucesso! Seus certificados foram enviados para o RH.`,
    nome: colab.nome,
    total: savedFiles.length,
    signed_at: signedAt,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/signature/admin/download/:colaboradorId
//  Admin baixa o ZIP de um colaborador específico
// ─────────────────────────────────────────────────────────────
router.get('/admin/download/:colaboradorId', auth, (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.colaboradorId);
  if (!colab)           return res.status(404).json({ error: 'Colaborador não encontrado' });
  if (!colab.pdf_path)  return res.status(404).json({ error: 'Nenhum PDF salvo para este colaborador' });
  if (!fs.existsSync(colab.pdf_path)) return res.status(404).json({ error: 'Pasta de arquivos não encontrada no servidor' });

  const nomeSlug = colab.nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeSlug}_certificados.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);
  archive.directory(colab.pdf_path, false);
  archive.finalize();
});

// ─────────────────────────────────────────────────────────────
//  GET /api/signature/admin/download-batch/:batchId
//  Admin baixa ZIP com TODOS os certificados assinados de um lote
// ─────────────────────────────────────────────────────────────
router.get('/admin/download-batch/:batchId', auth, (req, res) => {
  const colabs = db.prepare(
    "SELECT * FROM colaboradores WHERE batch_id=? AND status='signed' AND pdf_path IS NOT NULL"
  ).all(req.params.batchId);

  if (!colabs.length) return res.status(404).json({ error: 'Nenhum certificado assinado neste lote ainda' });

  const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(req.params.batchId);
  const batchSlug = (batch?.name || `lote_${req.params.batchId}`).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${batchSlug}_assinados.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const colab of colabs) {
    if (fs.existsSync(colab.pdf_path)) {
      const nomeSlug = colab.nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
      // Cada colaborador fica numa subpasta com o nome dele dentro do ZIP
      archive.directory(colab.pdf_path, nomeSlug);
    }
  }

  archive.finalize();
});

// ─────────────────────────────────────────────────────────────
//  GET /api/signature/admin/list/:batchId
//  Lista colaboradores assinados com seus arquivos disponíveis
// ─────────────────────────────────────────────────────────────
router.get('/admin/list/:batchId', auth, (req, res) => {
  const colabs = db.prepare(
    "SELECT id, nome, cpf, status, signed_at, ip_address, pdf_path FROM colaboradores WHERE batch_id=?"
  ).all(req.params.batchId);

  const result = colabs.map(c => {
    let files = [];
    if (c.pdf_path && fs.existsSync(c.pdf_path)) {
      files = fs.readdirSync(c.pdf_path).filter(f => f.endsWith('.pdf'));
    }
    return { ...c, files };
  });

  res.json(result);
});

// ─────────────────────────────────────────────────────────────
//  GET /api/signature/admin/file/:colaboradorId/:filename
//  Admin abre/baixa um PDF individual específico
// ─────────────────────────────────────────────────────────────
router.get('/admin/file/:colaboradorId/:filename', auth, (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradores WHERE id=?').get(req.params.colaboradorId);
  if (!colab || !colab.pdf_path) return res.status(404).json({ error: 'Não encontrado' });

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(req.params.filename);
  const filepath  = path.join(colab.pdf_path, safeName);

  if (!filepath.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Acesso negado' });
  if (!fs.existsSync(filepath))          return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  fs.createReadStream(filepath).pipe(res);
});

function getCertList(colab) {
  const list = [];
  if (colab.nr06)    list.push('NR06');
  if (colab.nr10)    list.push('NR10');
  if (colab.direcao) list.push('DIRECAO_DEFENSIVA');
  if (colab.nr35)    list.push('NR35');
  if (colab.sga_nr20)list.push('SGA_NR20');
  if (colab.nr33)    list.push('NR33');
  if (colab.nr10sep) list.push('NR10_SEP');
  return list;
}

module.exports = router;
