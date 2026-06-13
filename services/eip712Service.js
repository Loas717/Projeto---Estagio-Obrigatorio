const { ethers } = require('ethers');
require('dotenv').config();

const issuerDid = process.env.ISSUER_DID || 'did:pucminas:12345';
const issuerAddress = process.env.ISSUER_ADDRESS || new ethers.Wallet(process.env.PRIVATE_KEY).address;

const domain = {
    name: 'VerifiableCredential',
    version: '1',
    chainId: Number(process.env.CHAIN_ID || 1),
    verifyingContract: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
};

const types = {
    CredentialSubject: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'degree', type: 'string' },
        { name: 'fileHash', type: 'string' }
    ],
    VerifiableCredential: [
        { name: 'issuer', type: 'string' },
        { name: 'issuanceDate', type: 'string' },
        { name: 'credentialSubject', type: 'CredentialSubject' },
        { name: 'documentHash', type: 'string' }
    ]
};

function gerarVerifiableCredential(nome, curso, ra, fileHash) {
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

async function signVerifiableCredential(vc) {
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const value = {
        issuer: vc.issuer,
        issuanceDate: vc.issuanceDate,
        credentialSubject: vc.credentialSubject,
        documentHash: vc.documentHash
    };
    const signature = await wallet.signTypedData(domain, types, value);
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

    const recoveredAddress = ethers.verifyTypedData(domain, types, value, vc.proof.proofValue);
    return recoveredAddress;
}

function getIssuerAddress() {
    return issuerAddress;
}

module.exports = {
    gerarVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    getIssuerAddress
};
