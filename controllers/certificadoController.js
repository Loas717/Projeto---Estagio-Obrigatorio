const { registrarCertificado, consultarCertificado } = require('../services/registrar');
const crypto = require('crypto');
const fs = require('fs');

function gerarHashDoArquivo(caminhoArquivo) {
    const fileBuffer = fs.readFileSync(caminhoArquivo);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return '0x' + hashSum.digest('hex');
}

async function registrar(req, res) {
    try {
        const { nome, curso, ra } = req.body;
        const arquivo = req.file;

        if (!nome || !curso || !ra || !arquivo) {
            return res.status(400).json({
                error: 'Todos os campos são obrigatórios: nome, curso, RA e arquivo'
            });
        }

        const hashDoArquivo = gerarHashDoArquivo(arquivo.path);

        const resultado = await registrarCertificado(nome, curso, hashDoArquivo, ra);

        fs.unlinkSync(arquivo.path);

        res.status(201).json({
            message: 'Certificado registrado com sucesso',
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao registrar certificado:', error);
        
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Erro ao remover arquivo temporário:', unlinkError);
            }
        }
        
        res.status(500).json({
            error: 'Erro interno do servidor ao registrar certificado',
            details: error.message
        });
    }
}

async function consultar(req, res) {
    try {
        const { ra } = req.query;

        if (!ra) {
            return res.status(400).json({
                error: 'O campo RA é obrigatório para consulta'
            });
        }

        const resultado = await consultarCertificado(ra);

        if (!resultado) {
            return res.status(404).json({
                error: 'Certificado não encontrado para o RA fornecido'
            });
        }

        res.status(200).json({
            message: 'Consulta realizada com sucesso',
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao consultar certificado:', error);
        res.status(500).json({
            error: 'Erro interno do servidor ao consultar certificado',
            details: error.message
        });
    }
}

module.exports = {
    registrar,
    consultar
};
