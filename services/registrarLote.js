const { Certificate, User, Institution } = require('../models');
const { ethers } = require('ethers');
const {
    gerarVerifiableCredential,
    getEip712Domain,
    types: credentialTypes,
    verifyVerifiableCredential
} = require('./eip712Service');
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

async function obterContextoBlockchain(institutionId) {
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

    return {
        institution,
        contrato: new ethers.Contract(institution.contractAddress, abi, provider),
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

async function registrarCertificadosEmLote(loteId, certificados, institutionId) {
    if (
        !/^\d+$/.test(String(loteId)) ||
        BigInt(loteId) < 1n ||
        !Array.isArray(certificados) ||
        certificados.length === 0
    ) {
        throw new Error('loteId e certificados são obrigatórios');
    }

    const { institution } = await obterContextoBlockchain(institutionId);
    if (!institution.walletAddress || !ethers.isAddress(institution.walletAddress)) {
        throw new Error('A instituição não possui um endereço de carteira válido cadastrado.');
    }

    const hashes = certificados.map(cert => {
        const hash = typeof cert.documentHash === 'string' && cert.documentHash.startsWith('0x')
            ? cert.documentHash
            : `0x${cert.documentHash}`;
        if (!ethers.isHexString(hash, 32)) {
            throw new Error(`Hash de documento inválido para aluno ${cert.ra || 'sem RA'}.`);
        }
        return hash;
    });
    const raizMerkle = calcularRaizMerkle(hashes);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const network = await provider.getNetwork();
    const domain = getEip712Domain({
        chainId: Number(network.chainId),
        verifyingContract: institution.contractAddress
    });

    const certificadosPreparados = [];
    for (const cert of certificados) {
        const raNormalizado = String(cert.ra || '').trim();
        if (!raNormalizado || raNormalizado === '00000') {
            throw new Error(`RA inválido para aluno ${cert.studentName}`);
        }
        const usuarioExiste = await User.findOne({ where: { ra: raNormalizado } });
        if (!usuarioExiste) {
            throw new Error(`RA ${raNormalizado} não está cadastrado como aluno.`);
        }

        const hashNormalizado = typeof cert.documentHash === 'string' && cert.documentHash.startsWith('0x')
            ? cert.documentHash
            : '0x' + cert.documentHash;
        const issueDate = new Date();
        const credential = gerarVerifiableCredential(
            cert.studentName,
            cert.courseName,
            raNormalizado,
            hashNormalizado,
            institution.walletAddress
        );
        credential.credentialSubject.keys = {
            cipherKey: '',
            cipherIv: '',
            cipherTag: ''
        };
        credential.issuanceDate = issueDate.toISOString();
        credential.proof.eip712Domain = domain;
        certificadosPreparados.push({
            ...cert,
            ra: raNormalizado,
            documentHash: hashNormalizado,
            merkleProof: gerarProvaMerkle(hashes, hashNormalizado),
            raizMerkle,
            issueDate,
            credential
        });
    }

    return {
        loteId,
        raizMerkle,
        contractAddress: institution.contractAddress,
        walletAddress: ethers.getAddress(institution.walletAddress),
        domain,
        types: credentialTypes,
        certificados: certificadosPreparados
    };
}

async function confirmarCertificadosEmLote(loteId, raizMerkle, txHash, certificados, institutionId) {
    if (!loteId || !raizMerkle || !txHash || !Array.isArray(certificados) || certificados.length === 0) {
        throw new Error('loteId, raizMerkle, txHash e certificados são obrigatórios.');
    }

    const prepared = await registrarCertificadosEmLote(loteId, certificados, institutionId);
    if (prepared.raizMerkle.toLowerCase() !== raizMerkle.toLowerCase()) {
        throw new Error('A raiz Merkle enviada não corresponde aos certificados.');
    }

    const { institution, contrato } = await obterContextoBlockchain(institutionId);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const transaction = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!transaction || !receipt || receipt.status !== 1) {
        throw new Error('A transação do lote não foi encontrada ou não foi confirmada com sucesso.');
    }
    if (
        !transaction.to ||
        transaction.to.toLowerCase() !== institution.contractAddress.toLowerCase() ||
        transaction.from.toLowerCase() !== institution.walletAddress.toLowerCase()
    ) {
        throw new Error('A transação não foi enviada pela carteira institucional ao contrato esperado.');
    }

    const parsedTransaction = contrato.interface.parseTransaction({
        data: transaction.data,
        value: transaction.value
    });
    if (
        parsedTransaction?.name !== 'registrarLote' ||
        BigInt(parsedTransaction.args[0]) !== BigInt(loteId) ||
        String(parsedTransaction.args[1]).toLowerCase() !== prepared.raizMerkle.toLowerCase()
    ) {
        throw new Error('A transação confirmada não registra este lote e esta raiz Merkle.');
    }

    const certificadosComProva = certificados.map((cert, index) => {
        const expected = prepared.certificados[index];
        const credential = cert.credential;
        if (!credential?.proof?.proofValue) {
            throw new Error(`A credencial do aluno ${expected.ra} não contém uma assinatura.`);
        }
        if (
            credential.issuer !== expected.credential.issuer ||
            credential.proof?.type !== expected.credential.proof.type ||
            credential.proof?.proofPurpose !== expected.credential.proof.proofPurpose ||
            credential.proof?.verificationMethod !== expected.credential.proof.verificationMethod ||
            credential.documentHash?.toLowerCase() !== expected.documentHash.toLowerCase() ||
            credential.credentialSubject?.id !== expected.credential.credentialSubject.id ||
            credential.credentialSubject?.name !== expected.studentName ||
            credential.credentialSubject?.degree !== expected.courseName ||
            credential.credentialSubject?.fileHash?.toLowerCase() !== expected.documentHash.toLowerCase() ||
            ethers.TypedDataEncoder.hashDomain(credential.proof.eip712Domain) !==
                ethers.TypedDataEncoder.hashDomain(prepared.domain)
        ) {
            throw new Error(`Os dados assinados da credencial do aluno ${expected.ra} foram alterados.`);
        }
        if (!Number.isFinite(Date.parse(credential.issuanceDate))) {
            throw new Error(`A data de emissão da credencial do aluno ${expected.ra} é inválida.`);
        }

        const recoveredAddress = verifyVerifiableCredential(credential);
        if (recoveredAddress.toLowerCase() !== institution.walletAddress.toLowerCase()) {
            throw new Error(`A assinatura da credencial do aluno ${expected.ra} não pertence à instituição.`);
        }
        if (
            credential.credentialSubject?.keys?.cipherKey !== '' ||
            credential.credentialSubject?.keys?.cipherIv !== '' ||
            credential.credentialSubject?.keys?.cipherTag !== ''
        ) {
            throw new Error(`Os dados de assinatura da credencial do aluno ${expected.ra} são inválidos.`);
        }

        return {
            ...expected,
            credential
        };
    });

    const certificadosSalvos = [];
    for (const cert of certificadosComProva) {
        const raNormalizado = cert.ra;
        const usuarioExiste = await User.findOne({ where: { ra: raNormalizado } });
        if (!usuarioExiste) {
            throw new Error(`RA ${raNormalizado} não está mais cadastrado como aluno.`);
        }
        const issueDate = new Date(cert.credential.issuanceDate);

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
                credential: cert.credential
            });
        } catch (error) {
            console.error(`Erro ao enviar certificado por e-mail para RA ${raNormalizado}:`, error);
            emailResultado = { sent: false, reason: 'EMAIL_SEND_FAILED' };
        }

        console.log(`Certificado para RA ${raNormalizado} registrado e e-mail enviado:`, emailResultado);

        certificadosSalvos.push({
            ...certificadoSalvo.toJSON(),
            credential: cert.credential,
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
        raizMerkle: prepared.raizMerkle,
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

async function revogarCertificadoMerkle(documentHash, institutionId, txHash) {
    if (!documentHash) {
        throw new Error('documentHash é obrigatório');
    }
    if (!txHash) {
        throw new Error('A transação assinada pela carteira institucional é obrigatória.');
    }

    const resolvedInstitutionId = await obterInstitutionIdDoCertificado(documentHash, institutionId);
    const { institution, contrato } = await obterContextoBlockchain(resolvedInstitutionId);
    if (!institution.walletAddress || !ethers.isAddress(institution.walletAddress)) {
        throw new Error('A instituição não possui um endereço de carteira válido cadastrado.');
    }

    const hashNormalizado = typeof documentHash === 'string' && documentHash.startsWith('0x')
        ? documentHash
        : '0x' + documentHash;

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const [transaction, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash)
    ]);
    if (!transaction || !receipt || receipt.status !== 1) {
        throw new Error('A transação de revogação não foi encontrada ou não foi confirmada com sucesso.');
    }
    if (
        !transaction.to ||
        transaction.to.toLowerCase() !== institution.contractAddress.toLowerCase() ||
        transaction.from.toLowerCase() !== institution.walletAddress.toLowerCase()
    ) {
        throw new Error('A transação não foi enviada pela carteira institucional ao contrato esperado.');
    }

    const parsedTransaction = contrato.interface.parseTransaction({
        data: transaction.data,
        value: transaction.value
    });
    if (
        parsedTransaction?.name !== 'revogarCertificadoMerkle' ||
        String(parsedTransaction.args[0]).toLowerCase() !== hashNormalizado.toLowerCase()
    ) {
        throw new Error('A transação confirmada não revoga o certificado solicitado.');
    }

    // Atualizar registro no banco
    await Certificate.update(
        { revogadoEmLote: true },
        { where: { documentHash, institutionId: resolvedInstitutionId } }
    );

    return {
        documentHash: documentHash,
        txHash,
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
    registrarCertificadosEmLote,
    confirmarCertificadosEmLote,
    verificarDiplomaMerkle,
    revogarCertificadoMerkle,
    consultarCertificadoLote,
    listarCertificadosLote
};
