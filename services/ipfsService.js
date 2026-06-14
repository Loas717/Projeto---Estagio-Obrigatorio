const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

async function uploadToIPFS(caminhoDoArquivo) {
    try {
        const data = new FormData();
        data.append('file', fs.createReadStream(caminhoDoArquivo));
        const config = {
            method: 'post',
            url: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
            headers: { 
                ...data.getHeaders(),
                'Authorization': `Bearer ${process.env.PINATA_JWT}`
            },
            data: data
        };

        const res = await axios(config);
        
        console.log("PDF enviado com sucesso para o IPFS com CID:", res.data.IpfsHash);
        return res.data.IpfsHash; 
    } catch (error) {
        console.error("Erro ao subir PDF para IPFS:", error);
        throw error;
    }
}

module.exports = { uploadToIPFS };