const { Certificate, User, Institution } = require('../models');
const { ethers } = require('ethers');
const { gerarVerifiableCredential, signVerifiableCredential } = require('./eip712Service');
const { enviarCertificadoPorEmail } = require('./emailService');
require('dotenv').config();
const abi = require('../config/abi.json');

function hashParMerkle(hashA, hashB) {
    const primeiro = hashA.toLowerCase() <= hashB.toLowerCase() ? hashA : hashB;
    const segundo = primeiro === hashA ? hashB : hashA;
    return ethers.keccak256(ethers.concat([
        ethers.getBytes(primeiro),
        ethers.getBytes(segundo)
    ]));
}

function calcularRaizMerkle(hashes) {
    if (hashes.length === 0) {
        throw new Error('Array de hashes não pode estar vazio');
    }

    let nivelAtual = hashes.map(hash => {
        if (typeof hash === 'string' && hash.startsWith('0x')) {
            return hash;
        }
        return '0x' + hash;
    });

    while (nivelAtual.length > 1) {
        const proximoNivel = [];

        for (let i = 0; i < nivelAtual.length; i += 2) {
            const hash1 = nivelAtual[i];
            const hash2 = i + 1 < nivelAtual.length ? nivelAtual[i + 1] : hash1;

            proximoNivel.push(hashParMerkle(hash1, hash2));
        }

        nivelAtual = proximoNivel;
    }

    return nivelAtual[0];
}

function gerarProvaMerkle(hashes, hashAlvo) {
    // Normalizar hashAlvo ANTES de usar
    const hashAlvoNormalizado = typeof hashAlvo === 'string' && hashAlvo.startsWith('0x')
        ? hashAlvo.toLowerCase()
        : ('0x' + hashAlvo).toLowerCase();

    const hashesNormalizados = hashes.map(h => {
        if (typeof h === 'string' && h.startsWith('0x')) {
            return h.toLowerCase();
        }
        return ('0x' + h).toLowerCase();
    });

    // Se há apenas um hash, a prova está vazia
    if (hashesNormalizados.length === 1) {
        return [];
    }

    let nivelAtual = hashesNormalizados.slice();
    const prova = [];
    let hashAtual = hashAlvoNormalizado;
    let encontrado = false;

    while (nivelAtual.length > 1) {
        const proximoNivel = [];
        let hashProximo = null;

        for (let i = 0; i < nivelAtual.length; i += 2) {
            const hash1 = nivelAtual[i];
            const hash2 = i + 1 < nivelAtual.length ? nivelAtual[i + 1] : hash1;

            // Se um dos dois é o hash atual que rastreamos
            if (hash1 === hashAtual) {
                // O hash "irmão" vai para a prova
                prova.push(hash2);
                encontrado = true;
                // O próximo hash será o hash combinado deste par
                hashProximo = hashParMerkle(hash1, hash2);
            } else if (hash2 === hashAtual) {
                // Se hash2 é o alvo e é o segundo do par
                prova.push(hash1);
                encontrado = true;
                hashProximo = hashParMerkle(hash1, hash2);
            } else {
                // Hash normal que não contém nosso alvo, apenas calcula
                proximoNivel.push(hashParMerkle(hash1, hash2));
            }
        }

        if (!encontrado) {
            // Se não encontrou, não há prova válida
            return [];
        }

        if (hashProximo) {
            proximoNivel.push(hashProximo);
        }

        nivelAtual = proximoNivel;
        hashAtual = hashProximo;
    }

    return prova;
}

async function obterContextoBlockchain(institutionId, exigeAssinatura = false) {
    if (!institutionId) {
        throw new Error('A instituição do certificado não foi informada.');
    }

    const institution = await Institution.findByPk(institutionId, {
        attributes: ['id', 'contractAddress', 'walletAddress'],
    });

    if (!institution?.contractAddress || !ethers.isAddress(institution.contractAddress)) {
        throw new Error('A instituição não possui um endereço de contrato válido cadastrado.');
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    let signer = provider;

    if (exigeAssinatura) {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY não configurada para assinar transações.');
        }
        if (!institution.walletAddress || !ethers.isAddress(institution.walletAddress)) {
            throw new Error('A instituição não possui um endereço de carteira válido cadastrado.');
        }

        const carteira = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        if (carteira.address.toLowerCase() !== institution.walletAddress.toLowerCase()) {
            throw new Error('A PRIVATE_KEY do servidor não corresponde à carteira cadastrada para esta instituição.');
        }
        signer = carteira;
    }

    return {
        institution,
        contrato: new ethers.Contract(institution.contractAddress, abi, signer),
    };
}

async function obterInstitutionIdDoCertificado(documentHash, institutionId) {
    if (institutionId) return institutionId;

    const certificado = await Certificate.findOne({
        where: { documentHash },
        attributes: ['institutionId'],
    });

    if (!certificado?.institutionId) {
        throw new Error('Não foi possível identificar a instituição deste certificado.');
    }

    return certificado.institutionId;
}

async function registrarLoteNaBlockchain(loteId, raizMerkle, institutionId) {
    const { contrato } = await obterContextoBlockchain(institutionId, true);

    const tx = await contrato.registrarLote(loteId, raizMerkle);
    console.log(`Lote ${loteId} registrado. Hash da transação:`, tx.hash);
    await tx.wait();

    return tx.hash;
}

async function registrarCertificadosEmLote(loteId, certificados, institutionId) {
    if (!loteId || !certificados || certificados.length === 0) {
        throw new Error('loteId e certificados são obrigatórios');
    }

    // Extrair hashes dos certificados
    const hashes = certificados.map(cert => {
        if (typeof cert.documentHash === 'string' && cert.documentHash.startsWith('0x')) {
            return cert.documentHash;
        }
        return '0x' + cert.documentHash;
    });

    // Calcular raiz de Merkle
    const raizMerkle = calcularRaizMerkle(hashes);
    console.log(`Raiz de Merkle calculada para lote ${loteId}:`, raizMerkle);

    // Registrar lote na blockchain
    const txHash = await registrarLoteNaBlockchain(loteId, raizMerkle, institutionId);
    console.log(`Lote ${loteId} registrado na blockchain. TX:`, txHash);

    // Gerar prova de Merkle para cada certificado
    const certificadosComProva = certificados.map(cert => {
        const hashNormalizado = typeof cert.documentHash === 'string' && cert.documentHash.startsWith('0x')
            ? cert.documentHash
            : '0x' + cert.documentHash;

        const prova = gerarProvaMerkle(hashes, hashNormalizado);
        
        return {
            ...cert,
            merkleProof: prova,
            raizMerkle: raizMerkle
        };
    });

    // Salvar certificados no banco de dados
    const certificadosSalvos = [];

    for (const cert of certificadosComProva) {
        // Validar RA
        const raNormalizado = String(cert.ra || '').trim();
        if (!raNormalizado || raNormalizado === '00000') {
            throw new Error(`RA inválido para aluno ${cert.studentName}`);
        }

        const usuarioExiste = await User.findOne({ where: { ra: raNormalizado } });
        if (!usuarioExiste) {
            throw new Error(`RA ${raNormalizado} não está cadastrado como aluno.`);
        }

        const issueDate = new Date();
        const credential = gerarVerifiableCredential(
            cert.studentName,
            cert.courseName,
            raNormalizado,
            cert.documentHash
        );
        credential.credentialSubject.keys = {
            cipherKey: '',
            cipherIv: '',
            cipherTag: ''
        };
        credential.issuanceDate = issueDate.toISOString();
        credential.proof.proofValue = await signVerifiableCredential(credential);

        const certificadoSalvo = await Certificate.create({
            studentName: cert.studentName,
            courseName: cert.courseName,
            ra: raNormalizado,
            institutionId,
            documentHash: cert.documentHash,
            blockchainTx: txHash,
            loteId: loteId,
            merkleProof: cert.merkleProof,
            raizMerkle: cert.raizMerkle,
            revogadoEmLote: false,
            issueDate
        });

        let emailResultado;
        try {
            emailResultado = await enviarCertificadoPorEmail({
                to: usuarioExiste.email,
                nomeAluno: cert.studentName,
                curso: cert.courseName,
                ra: raNormalizado,
                credential
            });
        } catch (error) {
            console.error(`Erro ao enviar certificado por e-mail para RA ${raNormalizado}:`, error);
            emailResultado = { sent: false, reason: 'EMAIL_SEND_FAILED' };
        }

        console.log(`Certificado para RA ${raNormalizado} registrado e e-mail enviado:`, emailResultado);

        certificadosSalvos.push({
            ...certificadoSalvo.toJSON(),
            credential,
            email: emailResultado,
            blockchain: {
                studentName: cert.studentName,
                courseName: cert.courseName,
                ra: raNormalizado,
                documentHash: cert.documentHash,
                blockchainTx: txHash,
                loteId,
                institutionId,
                merkleProof: cert.merkleProof,
                raizMerkle: cert.raizMerkle,
                issueDate
            }
        });
    }

    return {
        loteId: loteId,
        raizMerkle: raizMerkle,
        txHash: txHash,
        totalCertificados: certificadosSalvos.length,
        certificados: certificadosSalvos
    };
}

async function verificarDiplomaMerkle(loteId, documentHash, merkleProof, institutionId) {
    if (!loteId || !documentHash || !merkleProof) {
        throw new Error('loteId, documentHash e merkleProof são obrigatórios');
    }

    const resolvedInstitutionId = await obterInstitutionIdDoCertificado(documentHash, institutionId);
    const { contrato } = await obterContextoBlockchain(resolvedInstitutionId);

    const hashNormalizado = typeof documentHash === 'string' && documentHash.startsWith('0x')
        ? documentHash
        : '0x' + documentHash;

    const provaArray = merkleProof.map(p => {
        if (typeof p === 'string' && p.startsWith('0x')) {
            return p;
        }
        return '0x' + p;
    });

    const resultado = await contrato.verificarDiplomaMerkle(loteId, hashNormalizado, provaArray);

    return resultado;
}

async function revogarCertificadoMerkle(documentHash, institutionId) {
    if (!documentHash) {
        throw new Error('documentHash é obrigatório');
    }

    const resolvedInstitutionId = await obterInstitutionIdDoCertificado(documentHash, institutionId);
    const { contrato } = await obterContextoBlockchain(resolvedInstitutionId, true);

    const hashNormalizado = typeof documentHash === 'string' && documentHash.startsWith('0x')
        ? documentHash
        : '0x' + documentHash;

    const tx = await contrato.revogarCertificadoMerkle(hashNormalizado);
    console.log('Certificado revogado. Hash da transação:', tx.hash);
    await tx.wait();

    // Atualizar registro no banco
    await Certificate.update(
        { revogadoEmLote: true },
        { where: { documentHash, institutionId: resolvedInstitutionId } }
    );

    return {
        documentHash: documentHash,
        txHash: tx.hash,
        revogadoEm: new Date()
    };
}

async function consultarCertificadoLote(loteId, documentHash) {
    const certificado = await Certificate.findOne({
        where: {
            loteId: loteId,
            documentHash: documentHash
        }
    });

    if (!certificado) {
        return null;
    }

    return {
        id: certificado.id,
        studentName: certificado.studentName,
        courseName: certificado.courseName,
        ra: certificado.ra,
        documentHash: certificado.documentHash,
        loteId: certificado.loteId,
        merkleProof: certificado.merkleProof,
        raizMerkle: certificado.raizMerkle,
        revogadoEmLote: certificado.revogadoEmLote,
        issueDate: certificado.issueDate
    };
}

async function listarCertificadosLote(loteId) {
    const certificados = await Certificate.findAll({
        where: { loteId: loteId }
    });

    return certificados;
}

module.exports = {
    calcularRaizMerkle,
    gerarProvaMerkle,
    registrarLoteNaBlockchain,
    registrarCertificadosEmLote,
    verificarDiplomaMerkle,
    revogarCertificadoMerkle,
    consultarCertificadoLote,
    listarCertificadosLote
};
