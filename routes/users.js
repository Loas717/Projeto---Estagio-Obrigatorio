const express = require('express');
const router = express.Router();
const {getUsersAlunos} = require('../controllers/userController');
const { verificarToken, apenasAdmin } = require('../middlewares/authMiddleware');

router.get('/get-alunos', verificarToken, getUsersAlunos);

module.exports = router;