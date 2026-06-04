const fs = require('fs');
const { verificarJSON: processarValidacaoMIT } = require('../services/verificar'); // ou o caminho real do seu service

async function verificarJSON(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                autentico: false, 
                motivo: "Nenhum arquivo JSON foi enviado ou recebido." 
            });
        }

        console.log("Arquivo recebido pelo Multer temporariamente em:", req.file.path);

        const conteudoArquivo = fs.readFileSync(req.file.path, 'utf8');

        let certificadoJSON;
        try {
            certificadoJSON = JSON.parse(conteudoArquivo);
        } catch (e) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                autentico: false, 
                motivo: "O arquivo enviado não é um JSON válido." 
            });
        }

        const resultado = await processarValidacaoMIT(certificadoJSON);

        fs.unlinkSync(req.file.path);

        if (resultado.autentico) {
            return res.status(200).json(resultado);
        } else {
            return res.status(400).json(resultado);
        }

    } catch (error) {
        console.error("Erro crítico no controller de verificação:", error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({ 
            autentico: false, 
            motivo: "Erro interno no servidor ao processar o arquivo de verificação." 
        });
    }
}

module.exports = {
    verificarJSON
};