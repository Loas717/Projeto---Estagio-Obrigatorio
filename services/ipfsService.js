const axios = require('axios');
require('dotenv').config();

async function uploadToIPFS(jsonDocument) {
    try {
        const config = {
            method: 'post',
            url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PINATA_JWT}`
            },
            data: jsonDocument
        };

        const res = await axios(config);
        
        console.log("Arquivo no IPFS com CID:", res.data.IpfsHash);
        return res.data.IpfsHash; 
    } catch (error) {
        console.error("Erro ao subir para IPFS:", error);
        throw error;
    }
}

module.exports = { uploadToIPFS };