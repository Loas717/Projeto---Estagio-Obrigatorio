const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');
const abiIPFS = require('../config/abiIPFS.json');
const crypto = require('crypto');
require('dotenv').config();

async function revogarCertificadoNaBlockchain(ra, cid) {
    try {
        const certificadoBanco = await Certificate.findOne({ 
            where: { 
                ra: ra,
                cid_pdf: cid
            } 
        });

        if (!certificadoBanco) {
            throw new Error("Certificado não localizado no banco de dados para o RA e CID informados.");
        }

        const hashJsonParaRevogar = certificadoBanco.documentHash;
        console.log(`Iniciando revogação on-chain para o Hash JSON: ${hashJsonParaRevogar}`);

        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, wallet);

        console.log("Enviando transação de revogação para a blockchain...");
        const tx = await contrato.revogarCertificado(hashJsonParaRevogar);
        
        console.log(`Transação enviada! Hash da TX: ${tx.hash}. Aguardando mineração...`);
        const receipt = await tx.wait(); // Espera a confirmação do bloco

        if (receipt.status === 1) {
            console.log("Transação de revogação confirmada com sucesso na Blockchain!");
            
            await certificadoBanco.destroy();
            
            return {
                success: true,
                transactionHash: tx.hash,
                message: "Certificado revogado com sucesso na Blockchain e atualizado localmente."
            };
        } else {
            throw new Error("A transação foi revertida pela rede.");
        }

    } catch (error) {
        console.error("Erro ao revogar certificado na blockchain:", error);
        console.error("Motivo técnico:", error.reason || error.message);
        return {
            success: false,
            error: error.message || "Falha ao processar revogação na Web3."
        };
    }
}

module.exports = { revogarCertificadoNaBlockchain };