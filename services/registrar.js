const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');

async function registrarCertificado(nome, curso, hashDoArquivo, ra) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const carteira = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, carteira);

    const tx = await contrato.registrar(ra, nome, hashDoArquivo);
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

async function consultarCertificado(ra) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);
    console.log("Consultando RA:", ra);
    console.log("No Contrato:", process.env.CONTRACT_ADDRESS);
    try {
        const resultado = await contrato.consultar(ra);
        
        return {
            nomeAluno: resultado[0],
            hashConteudo: resultado[1],
            dataRegistro: new Date(Number(resultado[2]) * 1000) 
        };
    } catch (error) {
        console.error("Certificado não encontrado ou erro na rede:", error.reason);
        return null;
    }
}

async function verificarCertificado(hash) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);
    console.log("Consultando Hash:", hash);
    console.log("No Contrato:", process.env.CONTRACT_ADDRESS);
    try {
        const resultado = await contrato.verificar(hash);
        
        return {
            nomeAluno: resultado[0],
            hashConteudo: resultado[1],
            dataRegistro: new Date(Number(resultado[2]) * 1000) 
        };
    } catch (error) {
        console.error("Certificado não encontrado ou erro na rede:", error.reason);
        return null;
    }
}

module.exports = { registrarCertificado, consultarCertificado, verificarCertificado };