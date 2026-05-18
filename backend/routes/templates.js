const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');

const positionsPath = path.join(__dirname, '../../data/template_positions.json');

// Garante que o arquivo existe
if (!fs.existsSync(positionsPath)) {
    fs.writeFileSync(positionsPath, JSON.stringify({}), 'utf8');
}

// Buscar posições salvas
router.get('/positions', authMiddleware, (req, res) => {
    try {
        const data = fs.readFileSync(positionsPath, 'utf8');
        return res.json(JSON.parse(data));
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao ler posições dos templates.' });
    }
});

// Salvar novas posições
router.post('/positions', authMiddleware, (req, res) => {
    try {
        const { curso, positions } = req.body;
        if (!curso || !positions) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        const data = fs.readFileSync(positionsPath, 'utf8');
        const allPositions = JSON.parse(data);

        allPositions[curso] = positions;

        fs.writeFileSync(positionsPath, JSON.stringify(allPositions, null, 2), 'utf8');
        return res.json({ success: true, message: 'Posições salvas com sucesso!' });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao salvar posições.' });
    }
});

module.exports = router;