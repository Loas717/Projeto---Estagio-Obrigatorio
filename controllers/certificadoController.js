const { registrarCertificado, consultarCertificado, registrarCertificadoIPFS } = require('../services/registrar');
const { consultarIPFS_CID, consultarIPFS_RA, consultarCertificadoPorRA } = require('../services/consultar');
const axios = require('axios');
const { uploadToIPFS } = require('../services/ipfsService');
const { gerarVerifiableCredential, signVerifiableCredential } = require('../services/eip712Service');
const { revogarCertificadoNaBlockchain } = require('../services/revogar');
const { enviarCertificadoPorEmail } = require('../services/emailService');
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

        const raNormalizado = String(ra || '').trim();

        if (!nome || !curso || !raNormalizado || !arquivo) {
            if (arquivo) fs.unlinkSync(arquivo.path);
            return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
        }

        const { User } = require('../models');
        const usuarioExiste = await User.findOne({ where: { ra: raNormalizado } });

        if (!usuarioExiste) {
            if (arquivo) fs.unlinkSync(arquivo.path);
            return res.status(400).json({
                error: `RA ${raNormalizado} não está cadastrado como aluno. Cadastre o aluno antes de emitir o certificado.`
            });
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

        const ipfsLink = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;
        const emailResultado = await enviarCertificadoPorEmail({
            to: usuarioExiste.email,
            nomeAluno: nome,
            curso,
            ra: raNormalizado,
            ipfsLink,
            credential: vcJSON,
        });

        fs.unlinkSync(arquivo.path);

        res.status(201).json({
          message: 'Certificado criptografado e registrado com sucesso!',
          blockchain: resultadoBlockchain,
          ipfsLink,
          credential: vcJSON,
          email: emailResultado
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

async function registrarCertificadosLote(req, res) {
    try {
        const { loteId, certificados } = req.body;

        if (!loteId || !certificados || !Array.isArray(certificados) || certificados.length === 0) {
            return res.status(400).json({
                error: 'Campos obrigatórios: loteId (número) e certificados (array não vazio)'
            });
        }

        // Validar estrutura de cada certificado
        for (const cert of certificados) {
            if (!cert.studentName || !cert.courseName || !cert.ra || !cert.documentHash) {
                return res.status(400).json({
                    error: 'Cada certificado deve ter: studentName, courseName, ra e documentHash'
                });
            }
        }

        const { registrarCertificadosEmLote } = require('../services/registrarLote');
        const resultado = await registrarCertificadosEmLote(loteId, certificados);

        res.status(201).json({
            message: 'Lote de certificados registrado com sucesso',
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao registrar lote:', error);
        res.status(500).json({
            error: 'Erro interno ao registrar lote de certificados',
            details: error.message
        });
    }
}

async function verificarDiplomaMerkle(req, res) {
    try {
        const { loteId, documentHash, merkleProof } = req.body;

        if (!loteId || !documentHash || !merkleProof || !Array.isArray(merkleProof)) {
            return res.status(400).json({
                error: 'Campos obrigatórios: loteId, documentHash e merkleProof (array)'
            });
        }

        const { verificarDiplomaMerkle: verificarDiploma } = require('../services/registrarLote');
        const isValido = await verificarDiploma(loteId, documentHash, merkleProof);

        res.status(200).json({
            valid: isValido,
            message: isValido ? 'Diploma válido' : 'Diploma inválido',
            loteId,
            documentHash
        });

    } catch (error) {
        console.error('Erro ao verificar diploma:', error);
        res.status(500).json({
            error: 'Erro ao verificar diploma',
            details: error.message
        });
    }
}

async function revogarCertificadoLote(req, res) {
    try {
        const { documentHash } = req.body;

        if (!documentHash) {
            return res.status(400).json({
                error: 'Campo obrigatório: documentHash'
            });
        }

        const { revogarCertificadoMerkle } = require('../services/registrarLote');
        const resultado = await revogarCertificadoMerkle(documentHash);

        res.status(200).json({
            message: 'Certificado revogado com sucesso',
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao revogar certificado de lote:', error);
        res.status(500).json({
            error: 'Erro ao revogar certificado',
            details: error.message
        });
    }
}

async function consultarCertificadoLote(req, res) {
    try {
        const { loteId, documentHash } = req.query;

        if (!loteId || !documentHash) {
            return res.status(400).json({
                error: 'Parâmetros obrigatórios: loteId e documentHash'
            });
        }

        const { consultarCertificadoLote: consultar } = require('../services/registrarLote');
        const certificado = await consultar(loteId, documentHash);

        if (!certificado) {
            return res.status(404).json({
                error: 'Certificado não encontrado'
            });
        }

        res.status(200).json({
            message: 'Certificado encontrado',
            data: certificado
        });

    } catch (error) {
        console.error('Erro ao consultar certificado de lote:', error);
        res.status(500).json({
            error: 'Erro ao consultar certificado',
            details: error.message
        });
    }
}

async function listarCertificadosLote(req, res) {
    try {
        const { loteId } = req.params;

        if (!loteId) {
            return res.status(400).json({
                error: 'Parâmetro obrigatório: loteId'
            });
        }

        const { listarCertificadosLote: listar } = require('../services/registrarLote');
        const certificados = await listar(loteId);

        res.status(200).json({
            message: 'Certificados do lote',
            loteId,
            total: certificados.length,
            data: certificados
        });

    } catch (error) {
        console.error('Erro ao listar certificados de lote:', error);
        res.status(500).json({
            error: 'Erro ao listar certificados',
            details: error.message
        });
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
    revogarCertificado,
    registrarCertificadosLote,
    verificarDiplomaMerkle,
    revogarCertificadoLote,
    consultarCertificadoLote,
    listarCertificadosLote
};
