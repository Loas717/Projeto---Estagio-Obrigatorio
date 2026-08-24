const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    try {
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        
        req.usuarioLogado = decodificado; 
        
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
}

function apenasAdmin(req, res, next) {
    if (req.usuarioLogado && req.usuarioLogado.role === 'instituicao') {
        next();
    } else {
        return res.status(403).json({ error: 'Acesso negado. Esta operação exige nível de Instituição.' });
    }
}

function apenasInstituicao(req, res, next) {
    if (req.usuarioLogado && req.usuarioLogado.role === 'instituicao') {
        next();
    } else {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de instituição.' });
    }
}

function apenasAluno(req, res, next) {
    if (req.usuarioLogado && req.usuarioLogado.role === 'aluno') {
        next();
    } else {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de aluno.' });
    }
}

module.exports = { verificarToken, apenasAdmin, apenasInstituicao, apenasAluno };