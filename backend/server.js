const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend (for local dev)
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/aluno',     require('./routes/aluno'));
app.use('/api/pdf',       require('./routes/pdf'));
app.use('/api/signature', require('./routes/signature'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, version: '3.0.0' }));

// Fallback: serve frontend index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Ability Pro v3 rodando na porta ${PORT}`);
});
