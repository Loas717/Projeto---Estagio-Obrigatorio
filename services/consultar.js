const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');
const abiIPFS = require('../config/abiIPFS.json');

async function consultarIPFS_CID(ipfsCID) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, provider);
    
    try {
        const resultado = await contrato.verificarPorCID(ipfsCID);
        
        return {
            aluno: resultado[0],
            ra: resultado[1],
            dataRegistro: new Date(Number(resultado[3]) * 1000),
            status: "Autêntico - Registro encontrado na Blockchain",
            success: true
        };
    } catch (error) {
        console.error("Erro na verificação:", error.reason);
        return { success: false, status: "Inválido - Este CID não consta nos registros oficiais." };
    }
}

async function consultarIPFS_RA(RA) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, provider);
    try {
        const resultado = await contrato.consultar(RA);

        if (!resultado[0] || resultado[0] == "") {
            return { 
                success: false, 
                status: "not_found", 
            };
        }

        return {
            name: resultado[0],
            ra: resultado[1],
            cid: resultado[2],
            dataRegistro: new Date(Number(resultado[3]) * 1000),
            status: "Autêntico - Registro encontrado na Blockchain",
            success: true
        };
    } catch (error) {
        console.log("Erro na verificação:", error);
        console.error("Erro na verificação:", error.reason);
        return { success: false, status: "Inválido - Este RA não consta nos registros oficiais." };
    }
}

module.exports = {
    consultarIPFS_CID,
    consultarIPFS_RA,
}