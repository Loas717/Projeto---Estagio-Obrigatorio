import { ethers } from "ethers";
import abi from "../config/abiRegistry.json" with { type: "json" };

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const adminPrivateKey = process.env.PRIVATE_KEY; 
const adminWallet = new ethers.Wallet(adminPrivateKey, provider);

const contractAddress = "0x05b57DB4be74d6838178634f045aE5f667Ff9c3b";
const registryContract = new ethers.Contract(contractAddress, abi, adminWallet);

export async function credenciarInstituicao(req, res) {
    try {
        const carteiraNovaFaculdade = req.body.carteira;
        const nomeNovaFaculdade = req.body.nome;

        console.log("Enviando transação para a blockchain");
        
        const tx = await registryContract.credenciarInstituicao(
            carteiraNovaFaculdade, 
            nomeNovaFaculdade
        );
        
        console.log(`Transação enviada! Hash: ${tx.hash}`);
        console.log("Aguardando confirmação do bloco...");
        
        await tx.wait(); 
        
        console.log("Sucesso! Instituição credenciada oficialmente no contrato.");
        return res.status(200).json({ message: "Instituição credenciada com sucesso!" });
    } catch (error) {
        console.error("Erro ao registrar a instituição:", error.reason || error);
        return res.status(500).json({ error: "Erro ao registrar a instituição." });
    }
}