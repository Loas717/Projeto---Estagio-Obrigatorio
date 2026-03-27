const express = require('express');
const router = express.Router();
const multer = require('multer');
const { registrar } = require('../controllers/certificadoController');

// Configuração do multer para upload de arquivos
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// Rota para registrar um novo certificado
router.post('/registrar', upload.single('arquivo'), registrar);

module.exports = router;
