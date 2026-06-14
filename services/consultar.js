const { Certificate } = require('../models');
const { ethers } = require('ethers');
require('dotenv').config();
const abi = require('../config/abi.json');
const abiIPFS = require('../config/abiIPFS.json');
const crypto = require('crypto');
require('dotenv').config();

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
        const hashRA = ethers.id(`${process.env.SALT_KEY}` + RA);
        
        const resultado = await contrato.consultar(hashRA);
        console.log(`Foram encontrados ${resultado.length} diplomas na Web3 para o RA ${RA}`);
        
        if (!resultado || resultado.length === 0) {
            return { 
                success: false, 
                status: "not_found", 
                certificados: []
            };
        }
        const certInBD = await consultarCertificadoPorRA(RA);
        const certificadosEncontrados = certInBD.success ? certInBD.data : [];
        console.log("Dados do usuário encontrados no banco relacional:", certInBD);
        const historicoDiplomas = resultado.map(diploma => {
            const cidBlockchain = diploma[1]; 
            const timestampEmSegundos = Number(diploma[3]); 
            const estaRevogado = diploma[5]; 
            
            const dataOriginal = new Date(timestampEmSegundos * 1000);

            return {
                cid: cidBlockchain,
                hashJson: diploma[2],
                dataRegistro: dataOriginal,
                dataFormatada: dataOriginal.toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric' 
                }),
                course: certificadosEncontrados.find(c => c.documentHash === diploma[2])?.courseName || "Curso Desconhecido",
                status: estaRevogado ? "Inválido - Diploma Revogado" : "Autêntico - Registro na Blockchain",
                revogado: estaRevogado
            };
        });
        
        return {
            success: true,
            name: certInBD.studentName,
            ra: certInBD.ra,
            certificados: historicoDiplomas 
        };

    } catch (error) {
        console.log("Erro na verificação:", error);
        console.error("Motivo:", error.reason || error.message);
        return { success: false, status: "Erro - Falha ao conectar com a rede Web3." };
    }
}

async function consultarCertificadoPorRA(ra) {
    try {
        const certificado = await Certificate.findAll({
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
            studentName: certificado[0].studentName,
            ra: certificado[0].ra,
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