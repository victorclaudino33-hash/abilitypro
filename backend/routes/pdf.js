const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { generateCertificatePDF, generateManifesto } = require('../utils/pdfGenerator');
const archiver = require('archiver');

// POST /api/pdf/batch/:batchId — gera todos PDFs e retorna ZIP
router.post('/batch/:batchId', auth, async (req, res) => {
  const colaboradores = db.prepare('SELECT * FROM colaboradores WHERE batch_id = ?').all(req.params.batchId);
  if (!colaboradores.length) return res.status(404).json({ error: 'Lote vazio' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="AbilityPro_Lote_${req.params.batchId}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const colab of colaboradores) {
    const certs = getCertList(colab);
    for (const cert of certs) {
      try {
        const pdfBytes = await generateCertificatePDF(colab, cert, null);
        const filename = `${colab.nome.replace(/\s+/g, '_')}_${cert.replace(/\s+/g, '_')}.pdf`;
        archive.append(Buffer.from(pdfBytes), { name: filename });
      } catch (e) {
        console.error(`Erro gerando PDF ${cert} para ${colab.nome}:`, e.message);
      }
    }
  }

  archive.finalize();
});

// POST /api/pdf/individual/:colaboradorId — gera PDFs de um colaborador
router.post('/individual/:colaboradorId', auth, async (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.colaboradorId);
  if (!colab) return res.status(404).json({ error: 'Colaborador não encontrado' });

  const certs = getCertList(colab);
  if (certs.length === 0) return res.status(400).json({ error: 'Nenhum certificado selecionado' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${colab.nome.replace(/\s+/g, '_')}_certificados.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const cert of certs) {
    const pdfBytes = await generateCertificatePDF(colab, cert, null);
    archive.append(Buffer.from(pdfBytes), { name: `${cert.replace(/\s+/g, '_')}.pdf` });
  }

  archive.finalize();
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
