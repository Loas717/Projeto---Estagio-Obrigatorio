'use strict'

const { User, InstitutionStudent } = require('../models');

async function getUsersAlunos (req, res) {
    try {
        if (!req.usuarioLogado) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        if (req.usuarioLogado.role !== 'instituicao') {
            return res.status(403).json({ error: 'Acesso negado. Apenas instituições podem listar alunos.' });
        }

        let institutionId = req.usuarioLogado.institutionId ?? null;

        if (!institutionId && req.usuarioLogado.id) {
            const usuario = await User.findByPk(req.usuarioLogado.id, {
                attributes: ['institutionId'],
            });
            institutionId = usuario?.institutionId ?? null;
        }

        if (!institutionId) {
            return res.status(200).json([]);
        }

        const links = await InstitutionStudent.findAll({
            where: { institutionId },
            include: [{
                model: User,
                as: 'student',
                where: { role: 'aluno', isActive: true },
                attributes: ['id', 'fullName', 'email', 'role', 'ra', 'isActive'],
            }],
        });

        const alunos = links
            .map((link) => link.student)
            .filter(Boolean)
            .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

        return res.status(200).json(alunos);
    } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        return res.status(500).json({ error: 'Erro ao buscar alunos.' });
    }
}

module.exports = { getUsersAlunos };