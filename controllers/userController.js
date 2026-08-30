'use strict'

const { User } = require('../models');

async function getUsersAlunos (req, res) {
    try {
        const alunos = await User.findAll({ where: { role: 'aluno' } });
        res.status(200).json(alunos);
    } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos.' });
    }
}

module.exports = { getUsersAlunos };