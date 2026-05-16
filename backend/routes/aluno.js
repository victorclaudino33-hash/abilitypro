const router = require('express').Router();
const db = require('../db');

// GET /api/aluno/:token  — verifica token e retorna dados
router.get('/:token', (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE token = ?').get(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido ou expirado' });

  // List which certificates this person has
  const certs = [];
  if (c.nr06)    certs.push('NR06');
  if (c.nr10)    certs.push('NR10');
  if (c.direcao) certs.push('DIREÇÃO DEFENSIVA');
  if (c.nr35)    certs.push('NR35');
  if (c.sga_nr20)certs.push('SGA NR20');
  if (c.nr33)    certs.push('NR33');
  if (c.nr10sep) certs.push('NR10 SEP');

  res.json({
    id: c.id,
    nome: c.nome,
    cpf: c.cpf,
    status: c.status,
    certificados: certs,
    signed_at: c.signed_at
  });
});

// POST /api/aluno/:token/verificar-cpf
router.post('/:token/verificar-cpf', (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE token = ?').get(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });

  const cpfEnviado = (req.body.cpf || '').replace(/\D/g, '');
  const cpfDB      = (c.cpf || '').replace(/\D/g, '');

  if (cpfEnviado !== cpfDB) return res.status(401).json({ error: 'CPF incorreto' });

  res.json({ ok: true, nome: c.nome });
});

module.exports = router;
