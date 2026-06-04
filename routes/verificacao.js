const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verificarJSON } = require('../controllers/verificacaoController');

const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 //10MB
    }
});

router.post('/verificacao-json', upload.single('arquivo'), verificarJSON);


module.exports = router;