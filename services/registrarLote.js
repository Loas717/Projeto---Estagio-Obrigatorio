const { Certificate, User } = require('../models');
const { ethers } = require('ethers');
const crypto = require('crypto');
require('dotenv').config();
const abi = require('../config/abi.json');

/**
 * Calcula a raiz de Merkle de um array de hashes
 */
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

            const combinado = hash1.replace('0x', '') + hash2.replace('0x', '');
            const novoHash = crypto.createHash('sha256').update(Buffer.from(combinado, 'hex')).digest('hex');
            proximoNivel.push('0x' + novoHash);
        }

        nivelAtual = proximoNivel;
    }

    return nivelAtual[0];
}

/**
 * Gera a prova de Merkle para um hash específico
 */
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
                const combinado = hash1.replace('0x', '') + hash2.replace('0x', '');
                hashProximo = '0x' + crypto.createHash('sha256').update(Buffer.from(combinado, 'hex')).digest('hex');
            } else if (hash2 === hashAtual) {
                // Se hash2 é o alvo e é o segundo do par
                prova.push(hash1);
                encontrado = true;
                const combinado = hash1.replace('0x', '') + hash2.replace('0x', '');
                hashProximo = '0x' + crypto.createHash('sha256').update(Buffer.from(combinado, 'hex')).digest('hex');
            } else {
                // Hash normal que não contém nosso alvo, apenas calcula
                const combinado = hash1.replace('0x', '') + hash2.replace('0x', '');
                const novoHash = '0x' + crypto.createHash('sha256').update(Buffer.from(combinado, 'hex')).digest('hex');
                proximoNivel.push(novoHash);
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

/**
 * Registra um lote na blockchain
 */
async function registrarLoteNaBlockchain(loteId, raizMerkle) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const carteira = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, carteira);

    const tx = await contrato.registrarLote(loteId, raizMerkle);
    console.log(`Lote ${loteId} registrado. Hash da transação:`, tx.hash);
    await tx.wait();

    return tx.hash;
}

/**
 * Registra certificados em lote
 */
async function registrarCertificadosEmLote(loteId, certificados) {
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
    const txHash = await registrarLoteNaBlockchain(loteId, raizMerkle);
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

        const certificadoSalvo = await Certificate.create({
            studentName: cert.studentName,
            courseName: cert.courseName,
            ra: raNormalizado,
            documentHash: cert.documentHash,
            blockchainTx: txHash,
            loteId: loteId,
            merkleProof: cert.merkleProof,
            raizMerkle: cert.raizMerkle,
            revogadoEmLote: false,
            issueDate: new Date()
        });

        certificadosSalvos.push(certificadoSalvo);
    }

    return {
        loteId: loteId,
        raizMerkle: raizMerkle,
        txHash: txHash,
        totalCertificados: certificadosSalvos.length,
        certificados: certificadosSalvos
    };
}

/**
 * Verifica um diploma usando Merkle proof
 */
async function verificarDiplomaMerkle(loteId, documentHash, merkleProof) {
    if (!loteId || !documentHash || !merkleProof) {
        throw new Error('loteId, documentHash e merkleProof são obrigatórios');
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);

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

/**
 * Revoga um certificado em lote
 */
async function revogarCertificadoMerkle(documentHash) {
    if (!documentHash) {
        throw new Error('documentHash é obrigatório');
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const carteira = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, carteira);

    const hashNormalizado = typeof documentHash === 'string' && documentHash.startsWith('0x')
        ? documentHash
        : '0x' + documentHash;

    const tx = await contrato.revogarCertificadoMerkle(hashNormalizado);
    console.log('Certificado revogado. Hash da transação:', tx.hash);
    await tx.wait();

    // Atualizar registro no banco
    await Certificate.update(
        { revogadoEmLote: true },
        { where: { documentHash: documentHash } }
    );

    return {
        documentHash: documentHash,
        txHash: tx.hash,
        revogadoEm: new Date()
    };
}

/**
 * Consulta um certificado de lote
 */
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

/**
 * Lista todos os certificados de um lote
 */
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
