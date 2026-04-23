const express = require('express');
const router = express.Router();
const multer = require('multer');
const { registrar, consultar, verificarHashArquivo, registrarIPFS } = require('../controllers/certificadoController');

const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 //10MB
    }
});

router.post('/registrar', upload.single('arquivo'), registrar);
router.post('/registrarIPFS', upload.single('arquivo'), registrarIPFS);
router.get('/consultar', consultar);
router.get('/verificar-arquivo', verificarHashArquivo);

module.exports = router;
