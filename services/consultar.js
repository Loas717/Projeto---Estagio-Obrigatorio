const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');
const abiIPFS = require('../config/abiIPFS.json');
const crypto = require('crypto');

async function consultarIPFS_CID(ipfsCID) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, provider);
    
    try {
        const resultado = await contrato.verificarPorCID(ipfsCID);
        
        return {
            aluno: resultado[0],
            ra: resultado[1],
            dataRegistro: new Date(Number(resultado[2]) * 1000),
            status: "Autêntico - Registro encontrado na Blockchain",
            success: true
        };
    } catch (error) {
        console.error("Erro na verificação:", error);
        return { success: false, status: "Inválido - Este CID não consta nos registros oficiais." };
    }
}

async function consultarJSON(HashJSON) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, provider);
    
    try {
        const resultado = await contrato.verificarPorJson(HashJSON);

        if (resultado[1] == 0 || resultado[0] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            return {
                success: false,
                motivo: "Nenhum registro encontrado com esse Hash."
            };
        }
        
        return {
            hashRa: resultado[0],
            dataRegistro: new Date(Number(resultado[1]) * 1000),
            status: "Autêntico - Registro encontrado na Blockchain",
            success: true
        };
    } catch (error) {
        console.error("Erro na verificação:", error);
        return { success: false, status: "Inválido - Este CID não consta nos registros oficiais." };
    }
}

async function consultarIPFS_RA(RA) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, abiIPFS, provider);
    try {
        const hashRA = ethers.id(RA);
        const resultado = await contrato.consultar(hashRA);
        console.log('Resultado da consulta por RA:', resultado);
        if (!resultado[0] || resultado[0] == "0x0000000000000000000000000000000000000000000000000000000000000000") {
            return { 
                success: false, 
                status: "not_found", 
            };
        }
        const userbasedOnRA = await consultarCertificadoPorRA(RA);
        console.log('Resultado da consulta por RA:', userbasedOnRA);
        return {
            name: userbasedOnRA.data.studentName,
            ra: userbasedOnRA.data.ra,
            cid: userbasedOnRA.data.cid_pdf,
            course: userbasedOnRA.data.courseName,
            dataRegistro: new Date(Number(resultado[2]) * 1000),
            status: "Autêntico - Registro encontrado na Blockchain",
            success: true
        };
    } catch (error) {
        console.log("Erro na verificação:", error);
        console.error("Erro na verificação:", error.reason);
        return { success: false, status: "Inválido - Este RA não consta nos registros oficiais." };
    }
}

async function consultarCertificadoPorRA(ra) {
    try {
        const certificado = await Certificate.findOne({
            where: { ra: ra },
            attributes: ['id', 'studentName', 'courseName', 'ra', 'documentHash', 'blockchainTx', 'cid_pdf', 'issueDate', 'createdAt', 'updatedAt']
        });

        if (!certificado) {
            return {
                success: false,
                status: "not_found",
                message: `Nenhum certificado encontrado para o RA: ${ra}`
            };
        }

        return {
            success: true,
            status: "found",
            data: certificado,
            message: "Certificado encontrado com sucesso"
        };
    } catch (error) {
        console.error("Erro ao consultar certificado por RA:", error);
        return {
            success: false,
            status: "error",
            message: "Erro ao consultar certificado no banco de dados",
            error: error.message
        };
    }
}

module.exports = {
    consultarIPFS_CID,
    consultarIPFS_RA,
    consultarJSON,
    consultarCertificadoPorRA
}