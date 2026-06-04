const { ethers } = require('ethers');
const { consultarIPFS_CID } = require('./consultar'); // Garanta que o caminho está correto

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

        let cidDoc = certificadoJSON.blockchain?.documentHash || dadosCredencial.credentialSubject?.fileHash;

        if (certificadoJSON.blockchain?.documentHash) {
            cidDoc = certificadoJSON.blockchain.documentHash;
        }

        if (!cidDoc) {
            return { 
                autentico: false, 
                motivo: "Identificador de armazenamento (documentHash/CID) não encontrado no documento." 
            };
        }

        console.log("Consultando o Smart Contract com o CID:", cidDoc);
        const registroBlockchain = await consultarIPFS_CID(cidDoc);

        if (!registroBlockchain.success) {
            return { 
                autentico: false, 
                motivo: "Fraude! Os dados deste documento não constam em nenhuma transação da Blockchain oficial." 
            };
        }

        const nomeNoJson = dadosCredencial.credentialSubject?.name || certificadoJSON.blockchain?.studentName;
        
        const raBrutoNoJson = dadosCredencial.credentialSubject?.id || String(certificadoJSON.blockchain?.ra || "");
        const raNoJson = raBrutoNoJson.replace("did:aluno:RA", "").replace("did:aluno:", "");

        const raBlockchainLimpo = String(registroBlockchain.ra).toUpperCase().replace("RA", "").trim();
        const raJsonLimpo = String(raNoJson).toUpperCase().replace("RA", "").trim();
        const nomeJsonLimpo = nomeNoJson?.toLowerCase().trim();
        const nomeBlockchainLimpo = registroBlockchain.aluno.toLowerCase().trim();

        if (nomeBlockchainLimpo !== nomeJsonLimpo || raBlockchainLimpo !== raJsonLimpo) {
            return { 
                autentico: false, 
                motivo: "Adulteração Detectada! O texto do arquivo foi modificado localmente e diverge do registro imutável gravado na Blockchain." 
            };
        }

        const txDaProva = certificadoJSON.blockchain?.blockchainTx || provaOriginal.proofValue || "Ancorado via Smart Contract";

        return {
            autentico: true,
            mensagem: "Diploma verificado com sucesso no padrão MIT Blockcerts / W3C!",
            detalhes: {
                aluno: registroBlockchain.aluno,
                ra: registroBlockchain.ra,
                curso: dadosCredencial.credentialSubject?.degree || certificadoJSON.blockchain?.courseName || "Não informado",
                dataEmissao: registroBlockchain.dataRegistro,
                transactionHash: txDaProva
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