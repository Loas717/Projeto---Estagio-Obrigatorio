const { registrarCertificado, consultarCertificado, registrarCertificadoIPFS } = require('../services/registrar');
const {uploadToIPFS} = require('../services/ipfsService')
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

async function verificarHashArquivo(req, res) {
    try {
        const arquivo = req.file;

        if (!arquivo) {
            return res.status(400).json({
                error: 'O campo arquivo é obrigatório'
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

function gerarCertificadoJSON(nome, curso, ra, hashArquivo) {
    return {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "UniversityDegree"],
        "issuer": "did:pucminas:12345",
        "issuanceDate": new Date().toISOString(),
        "credentialSubject": {
            "id": `did:aluno:${ra}`,
            "name": nome,
            "degree": curso,
            "fileHash": hashArquivo 
        },
        "proof": {
            "type": "EthereumEip712Signature2021",
            "proofPurpose": "assertionMethod",
            "verificationMethod": process.env.CONTRACT_ADDRESS
        }
    };
}

async function registrarIPFS(req, res) {
    try {
        const { nome, curso, ra } = req.body;
        const arquivo = req.file;

        if (!nome || !curso || !ra || !arquivo) {
            if (arquivo) fs.unlinkSync(arquivo.path);
            return res.status(400).json({ error: 'Campos obrigatórios: nome, curso, RA e arquivo' });
        }

        const hashDoArquivoPDF = gerarHashDoArquivo(arquivo.path);

        const vcJSON = gerarCertificadoJSON(nome, curso, ra, hashDoArquivoPDF);

        const ipfsCID = await uploadToIPFS(vcJSON);

        const resultadoBlockchain = await registrarCertificadoIPFS(nome, curso, ipfsCID, ra);

        fs.unlinkSync(arquivo.path);

        res.status(201).json({
            message: 'Certificado registrado com sucesso (Padrão MIT/IPFS)',
            blockchain: resultadoBlockchain,
            ipfsLink: `https://gateway.pinata.cloud/ipfs/${ipfsCID}`,
            credential: vcJSON
        });

    } catch (error) {
        console.error('Erro no fluxo de registro:', error);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
}

module.exports = {
    registrar,
    consultar,
    verificarHashArquivo,
    gerarCertificadoJSON,
    registrarIPFS
};
