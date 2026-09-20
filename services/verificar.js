const { ethers } = require('ethers');
const { consultarIPFS_CID, consultarJSON } = require('./consultar'); 
const { verifyVerifiableCredential, getIssuerAddress } = require('./eip712Service');
const { verificarDiplomaMerkle } = require('./registrarLote');
const crypto = require('crypto');
require('dotenv').config();

async function verificarJSON(certificadoJSON) {
    try {
        console.log("Iniciando validação criptográfica do objeto JSON...");

        let dadosCredencial = certificadoJSON;
        if (certificadoJSON.credential && typeof certificadoJSON.credential === 'object') {
            dadosCredencial = certificadoJSON.credential;
        }

        const provaOriginal = dadosCredencial.proof;
        if (!provaOriginal) {
            return { autentico: false, motivo: "JSON malformado: Falta o bloco de assinatura 'proof'." };
        }

        const vc = {
            issuer: dadosCredencial.issuer,
            issuanceDate: dadosCredencial.issuanceDate,
            credentialSubject: dadosCredencial.credentialSubject,
            documentHash: dadosCredencial.documentHash,
            proof: dadosCredencial.proof
        };

        let cidDoc = certificadoJSON.blockchain?.documentHash || vc.documentHash;
        if (!cidDoc && dadosCredencial.credentialSubject?.fileHash) {
            cidDoc = dadosCredencial.credentialSubject.fileHash;
        }

        if (!cidDoc) {
            return {
                autentico: false,
                motivo: "Identificador de armazenamento (CID) não encontrado no documento."
            };
        }

        console.log('Verificando assinatura EIP-712 para o emissor...');
        let recoveredAddress;
        try {
            recoveredAddress = verifyVerifiableCredential(vc);
        } catch (signatureError) {
            console.error('Erro na verificação da assinatura EIP-712:', signatureError);
            return {
                autentico: false,
                motivo: 'A prova criptográfica do documento é inválida ou o JSON foi adulterado.'
            };
        }

        const issuerAddress = getIssuerAddress();
        if (recoveredAddress.toLowerCase() !== issuerAddress.toLowerCase()) {
            return {
                autentico: false,
                motivo: 'A assinatura digital não corresponde à chave oficial da Instituição.'
            };
        }

        const dadosLote = certificadoJSON.blockchain;
        if (dadosLote?.loteId && Array.isArray(dadosLote.merkleProof)) {
            if (dadosLote.documentHash !== vc.documentHash) {
                return {
                    autentico: false,
                    motivo: 'O hash do certificado diverge do hash registrado no lote.'
                };
            }

            const loteValido = await verificarDiplomaMerkle(
                dadosLote.loteId,
                vc.documentHash,
                dadosLote.merkleProof
            );

            if (!loteValido) {
                return {
                    autentico: false,
                    motivo: 'A prova Merkle do certificado não foi validada pela Blockchain.'
                };
            }

            const nomeDoLote = dadosLote.studentName || dadosCredencial.credentialSubject?.name || 'Não informado';
            const raDoLote = String(dadosLote.ra || dadosCredencial.credentialSubject?.id || '')
                .replace(/^did:aluno:/i, '')
                .toUpperCase()
                .trim();

            return {
                autentico: true,
                mensagem: 'Diploma de lote verificado com sucesso via prova Merkle e assinatura EIP-712.',
                detalhes: {
                    aluno: nomeDoLote,
                    ra: raDoLote,
                    curso: dadosLote.courseName || dadosCredencial.credentialSubject?.degree || 'Não informado',
                    dataEmissao: dadosLote.issueDate,
                    transactionHash: dadosLote.blockchainTx || 'N/A',
                    recoveredAddress,
                    issuerAddress
                }
            };
        }

        console.log('Consultando o Smart Contract com o CID:', cidDoc);
        const jsonstring = JSON.stringify(dadosCredencial)
        const hashedJSON = ethers.id(jsonstring);
        const registroBlockchain = await consultarJSON(hashedJSON);
        console.log('Resultado da consulta na Blockchain:', registroBlockchain);

        if (!registroBlockchain.success) {
            return {
                autentico: false,
                motivo: 'Falha na validação on-chain: este documento não consta na Blockchain oficial.'
            };
        }
        console.log('Registro encontrado na Blockchain:', registroBlockchain);
        
        const nomeNoJson = dadosCredencial.credentialSubject?.name || certificadoJSON.blockchain?.studentName || "Não informado";
        console.log('Nome extraído do JSON:', dadosCredencial);
        const raBrutoNoJson = dadosCredencial.credentialSubject?.id || String(certificadoJSON.blockchain?.ra || '');
        const raJsonLimpo = String(raBrutoNoJson).replace(/^did:aluno:/i, '') .toUpperCase().trim();
        const hashDoRaJson = ethers.id(`${process.env.SALT_KEY}`+raJsonLimpo);
        console.log('tardadawd', raJsonLimpo,hashDoRaJson, registroBlockchain.hashRa)
        if (hashDoRaJson !== registroBlockchain.hashRa) {
            return {
                autentico: false,
                motivo: 'Adulteração detectada! O RA do arquivo diverge do registro imutável gravado na Blockchain.'
            };
        }

        return {
            autentico: true,
            mensagem: 'Diploma verificado com sucesso no padrão VC + EIP-712! Assinatura e registro on-chain validados.',
            detalhes: {
                aluno: nomeNoJson,
                ra: raJsonLimpo,
                curso: dadosCredencial.credentialSubject?.degree || certificadoJSON.blockchain?.courseName || 'Não informado',
                dataEmissao: registroBlockchain.dataRegistro,
                transactionHash: registroBlockchain.transactionHash || 'N/A',
                recoveredAddress,
                issuerAddress
            }
        };

    } catch (error) {
        console.error("Erro crítico no fluxo do service de validação:", error);
        return { autentico: false, motivo: "Falha crítica ao processar os componentes de criptografia." };
    }
}

module.exports = {
    verificarJSON
};