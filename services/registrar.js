const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');

async function registrarCertificado(nome, curso, hashDoArquivo) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const carteira = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, carteira);

    const tx = await contrato.registrar("RA123", nome, hashDoArquivo);
    await tx.wait(); 

    const novoRegistro = await Certificate.create({
        studentName: nome,
        courseName: curso,
        documentHash: hashDoArquivo,
        blockchainTx: tx.hash, 
        issueDate: new Date()
    });

    return novoRegistro;
}

module.exports = { registrarCertificado };