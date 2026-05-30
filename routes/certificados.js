const express = require('express');
const router = express.Router();
const multer = require('multer');
const { registrar, consultar, verificarHashArquivo, registrarIPFS, verificarIPFS, consultarRA } = require('../controllers/certificadoController');
const { verificarToken, apenasAdmin } = require('../middlewares/authMiddleware');

const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 //10MB
    }
});

router.post('/registrar', upload.single('arquivo'), verificarToken, registrar);
router.post('/registrarIPFS', upload.single('arquivo'), verificarToken, registrarIPFS);
router.get('/consultar', verificarToken, consultar);
router.get('/verificar-arquivo', verificarToken, verificarHashArquivo);
router.get('/verificar-por-ra/:ra', verificarToken, consultarRA);

module.exports = router;