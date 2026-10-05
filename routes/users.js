const express = require('express');
const router = express.Router();
const {getUsersAlunos} = require('../controllers/userController');
const { verificarToken, apenasInstituicao } = require('../middlewares/authMiddleware');

router.get('/get-alunos', verificarToken, apenasInstituicao, getUsersAlunos);

module.exports = router;