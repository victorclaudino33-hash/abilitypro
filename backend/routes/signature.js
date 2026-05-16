const router = require('express').Router();
const db = require('../db');
const { generateCertificatePDF, generateManifesto } = require('../utils/pdfGenerator');
const archiver = require('archiver');

// POST /api/signature/:token  — recebe assinatura do aluno
router.post('/:token', async (req, res) => {
  const { signatureData, cpf } = req.body;

  const colab = db.prepare('SELECT * FROM colaboradores WHERE token = ?').get(req.params.token);
  if (!colab) return res.status(404).json({ error: 'Token inválido' });

  // Verifica CPF
  const cpfEnviado = (cpf || '').replace(/\D/g, '');
  const cpfDB      = (colab.cpf || '').replace(/\D/g, '');
  if (cpfEnviado !== cpfDB) return res.status(401).json({ error: 'CPF inválido' });

  if (!signatureData) return res.status(400).json({ error: 'Assinatura não recebida' });

  // Monta IP e timestamp
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';
  const signedAt = new Date().toISOString();

  // Salva no DB
  db.prepare(`
    UPDATE colaboradores
    SET status='signed', signed_at=?, signature_data=?, ip_address=?
    WHERE token=?
  `).run(signedAt, signatureData, ip, req.params.token);

  db.prepare('INSERT INTO logs (action, details) VALUES (?, ?)').run(
    'SIGNATURE', `Colaborador ID ${colab.id} (${colab.nome}) assinou de ${ip}`
  );

  // Gera PDFs com assinatura + manifesto
  const certs = getCertList(colab);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${colab.nome.replace(/\s+/g, '_')}_certificados_assinados.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const cert of certs) {
    try {
      const pdfBytes = await generateCertificatePDF(colab, cert, signatureData);
      archive.append(Buffer.from(pdfBytes), { name: `${colab.nome.replace(/\s+/g, '_')}_${cert}.pdf` });
    } catch (e) {
      console.error('Erro PDF:', e.message);
    }
  }

  // Manifesto jurídico
  try {
    const manifestoBytes = await generateManifesto(colab, certs, ip, signedAt, signatureData);
    archive.append(Buffer.from(manifestoBytes), { name: `${colab.nome.replace(/\s+/g, '_')}_MANIFESTO_DIGITAL.pdf` });
  } catch(e) {
    console.error('Erro manifesto:', e.message);
  }

  archive.finalize();
});

// POST /api/signature/preview/:token — retorna PDF preview sem salvar
router.get('/preview/:token/:cert', async (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradores WHERE token = ?').get(req.params.token);
  if (!colab) return res.status(404).json({ error: 'Token inválido' });

  try {
    const pdfBytes = await generateCertificatePDF(colab, req.params.cert, null);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBytes));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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
