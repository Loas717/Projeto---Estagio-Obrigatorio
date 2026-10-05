const express = require('express');
const router = express.Router();
const { verificarToken, apenasInstituicao } = require('../middlewares/authMiddleware');
const {
    getInstitutionProfile,
    compileContract,
    saveInstitutionContract,
} = require('../controllers/institutionController');

router.get('/me', verificarToken, apenasInstituicao, getInstitutionProfile);
router.get('/contract-artifact', verificarToken, apenasInstituicao, compileContract);
router.post('/contract-address', verificarToken, apenasInstituicao, saveInstitutionContract);

module.exports = router;
