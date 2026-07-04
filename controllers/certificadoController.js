const { registrarCertificado, consultarCertificado, registrarCertificadoIPFS } = require('../services/registrar');
const { consultarIPFS_CID, consultarIPFS_RA, consultarCertificadoPorRA } = require('../services/consultar');
const axios = require('axios');
const { uploadToIPFS } = require('../services/ipfsService');
const { gerarVerifiableCredential, signVerifiableCredential } = require('../services/eip712Service');
const { revogarCertificadoNaBlockchain } = require('../services/revogar');
const crypto = require('crypto');
const fs = require('fs');
const { ethers } = require('ethers');
require('dotenv').config();

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
            return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
        }

        const hashDoArquivoPDF = gerarHashDoArquivo(arquivo.path);

        const algoritmo = 'aes-256-gcm';
        const chaveSecreta = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        const pdfPuroBytes = fs.readFileSync(arquivo.path);

        const cipher = crypto.createCipheriv(algoritmo, chaveSecreta, iv);
        
        const pdfCriptografadoBytes = Buffer.concat([
            cipher.update(pdfPuroBytes),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();

        const ipfsCID = await uploadToIPFS(pdfCriptografadoBytes);

        const vcJSON = gerarVerifiableCredential(nome, curso, ra, hashDoArquivoPDF);
        
        vcJSON.credentialSubject.keys = {
            cipherKey: chaveSecreta.toString('hex'),
            cipherIv: iv.toString('hex'),
            cipherTag: authTag.toString('hex')
        };

        const proofValue = await signVerifiableCredential(vcJSON);
        vcJSON.proof.proofValue = proofValue;
        
        const jsonstring = JSON.stringify(vcJSON);
        const hashDoArquivoJSON = ethers.id(jsonstring);
        const hashDoRA = ethers.id(`${process.env.SALT_KEY}` + ra);

        const resultadoBlockchain = await registrarCertificadoIPFS(hashDoArquivoJSON, ipfsCID, hashDoRA, nome, curso, ra);

        fs.unlinkSync(arquivo.path);

        res.status(201).json({
          message: 'Certificado criptografado e registrado com sucesso!',
          blockchain: resultadoBlockchain,
          ipfsLink: `https://gateway.pinata.cloud/ipfs/${ipfsCID}`,
          credential: vcJSON 
        });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error(error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}

async function verificarIPFS(req, res) {
    try {
        const { ra } = req.body;
        const arquivoRecebido = req.file;

        const registro = await consultarCertificado(ra); 
        const cidNaBlockchain = registro.ipfsCID;

        const hashPDFRecebido = gerarHashDoArquivo(arquivoRecebido.path);

        const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${cidNaBlockchain}`);
        const vcOriginal = response.data;

        const ehValido = (hashPDFRecebido === vcOriginal.credentialSubject.fileHash);

        fs.unlinkSync(arquivoRecebido.path);

        res.status(200).json({
            autentico: ehValido,
            dadosOriginais: vcOriginal.credentialSubject,
            timestampEmissao: vcOriginal.issuanceDate
        });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Falha na verificação' });
    }
}

async function consultarRA(req, res) {
    try {
        const { ra } = req.params;
        const resultado = await consultarIPFS_RA(ra);
        res.status(200).json(resultado);
    } catch (error) {
        console.error('Erro ao consultar RA:', error);
        throw error;
    }
}

async function obterPorRA(req, res) {
    try {
        const { ra } = req.params || req.query;

        if (!ra) {
            return res.status(400).json({
                success: false,
                error: 'O campo RA é obrigatório para consulta'
            });
        }

        const resultado = await consultarCertificadoPorRA(ra);

        if (!resultado.success) {
            return res.status(404).json(resultado);
        }

        return res.status(200).json(resultado);

    } catch (error) {
        console.error('Erro ao obter certificado por RA:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor ao obter certificado',
            details: error.message
        });
    }
}

async function revogarCertificado(req, res) {
    try {
        const { ra, cid } = req.body;

        if (!ra || !cid) {
            return res.status(400).json({
                error: 'Campos obrigatórios: RA e CID do certificado a ser revogado'
            });
        }

        const resultado = await revogarCertificadoNaBlockchain(ra, cid);

        res.status(200).json({
            success: resultado.success,
            message: 'Certificado revogado com sucesso',
            blockchain: resultado
        });

    } catch (error) {
        console.error('Erro ao revogar certificado:', error);
        res.status(500).json({ error: 'Erro interno ao revogar certificado', details: error.message });
    }
}

module.exports = {
    registrar,
    consultar,
    verificarHashArquivo,
    gerarCertificadoJSON,
    verificarIPFS,
    registrarIPFS,
    consultarRA,
    obterPorRA,
    revogarCertificado
};
