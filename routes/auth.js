const express = require('express');
const router = express.Router();
const { register, login, getProfile, getInstitutions } = require('../controllers/authController');
const { verificarToken, apenasAdmin } = require('../middlewares/authMiddleware');

router.post('/register', register);
router.post('/registrar', register);
router.post('/login', login);
router.get('/institutions', getInstitutions);

router.get('/profile', verificarToken, getProfile)

module.exports = router;
