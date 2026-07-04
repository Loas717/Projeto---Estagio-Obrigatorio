const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

async function uploadToIPFS(bufferCriptografado) {
    try {
        const data = new FormData();
        
        data.append('file', bufferCriptografado, {
            filename: 'diploma_criptografado.enc',
            contentType: 'application/octet-stream',
        });

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
        console.log("PDF Criptografado enviado para o IPFS. CID:", res.data.IpfsHash);
        return res.data.IpfsHash; 
    } catch (error) {
        console.error("Erro ao subir para o IPFS:", error);
        throw error;
    }
}

module.exports = { uploadToIPFS };