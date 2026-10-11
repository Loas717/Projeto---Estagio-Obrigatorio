const { ethers } = require('ethers');
require('dotenv').config();

const defaultDomain = {
    name: 'VerifiableCredential',
    version: '1',
    chainId: Number(process.env.CHAIN_ID || 1),
    verifyingContract: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
};

const types = {
    DocumentKeys: [
        { name: 'cipherKey', type: 'string' },
        { name: 'cipherIv', type: 'string' },
        { name: 'cipherTag', type: 'string' }
    ],
    CredentialSubject: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'degree', type: 'string' },
        { name: 'fileHash', type: 'string' },
        { name: 'keys', type: 'DocumentKeys' }
    ],
    VerifiableCredential: [
        { name: 'issuer', type: 'string' },
        { name: 'issuanceDate', type: 'string' },
        { name: 'credentialSubject', type: 'CredentialSubject' },
        { name: 'documentHash', type: 'string' }
    ]
};

function getIssuerAddress(issuer = process.env.ISSUER_ADDRESS) {
    const candidate = issuer?.split(':').pop() || process.env.ISSUER_DID?.split(':').pop();
    if (candidate && ethers.isAddress(candidate)) {
        return ethers.getAddress(candidate);
    }
    if (process.env.PRIVATE_KEY) {
        return new ethers.Wallet(process.env.PRIVATE_KEY).address;
    }
    throw new Error('O endereço da carteira emissora não foi informado.');
}

function getEip712Domain(overrides = {}) {
    return { ...defaultDomain, ...overrides };
}

function gerarVerifiableCredential(nome, curso, ra, fileHash, issuerAddress) {
    const resolvedIssuerAddress = getIssuerAddress(issuerAddress);
    const issuerDid = process.env.ISSUER_DID && !issuerAddress
        ? process.env.ISSUER_DID
        : `did:ethr:${resolvedIssuerAddress}`;

    return {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'UniversityDegree'],
        issuer: issuerDid,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
        id: `did:aluno:${ra}`,
        name: nome,
        degree: curso,
        fileHash
        },
        documentHash: fileHash,
        proof: {
        type: 'EthereumEip712Signature2021',
        proofPurpose: 'assertionMethod',
        verificationMethod: `${issuerDid}#keys-1`
        }
    };
}

async function signVerifiableCredential(vc, signer, signingDomain) {
    const signingWallet = signer || (
        process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY) : null
    );
    if (!signingWallet || typeof signingWallet.signTypedData !== 'function') {
        throw new Error('É necessário fornecer a wallet institucional para assinar a credencial.');
    }
    const value = {
        issuer: vc.issuer,
        issuanceDate: vc.issuanceDate,
        credentialSubject: {
            id: vc.credentialSubject.id,
            name: vc.credentialSubject.name,
            degree: vc.credentialSubject.degree,
            fileHash: vc.credentialSubject.fileHash,
            keys: {
                cipherKey: vc.credentialSubject.keys.cipherKey,
                cipherIv: vc.credentialSubject.keys.cipherIv,
                cipherTag: vc.credentialSubject.keys.cipherTag
            }
        },
        documentHash: vc.documentHash
    };
    const signature = await signingWallet.signTypedData(
        signingDomain || vc.proof?.eip712Domain || defaultDomain,
        types,
        value
    );
    return signature;
}

function verifyVerifiableCredential(vc) {
    if (!vc.proof || !vc.proof.proofValue) {
        throw new Error('A prova do VC está ausente ou não contém proofValue.');
    }

    const value = {
        issuer: vc.issuer,
        issuanceDate: vc.issuanceDate,
        credentialSubject: vc.credentialSubject,
        documentHash: vc.documentHash
    };

    const recoveredAddress = ethers.verifyTypedData(
        vc.proof.eip712Domain || defaultDomain,
        types,
        value,
        vc.proof.proofValue
    );
    return recoveredAddress;
}

module.exports = {
    gerarVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    getIssuerAddress,
    getEip712Domain,
    types
};
