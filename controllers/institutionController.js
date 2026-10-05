'use strict';

const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { User, Institution } = require('../models');

function getContractArtifact() {
    const contractPath = path.join(__dirname, '..', 'contrato.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
        'RegistroAcademicoIPFS.sol': {
            content: source,
        },
        },
        settings: {
        outputSelection: {
            '*': {
            '*': ['abi', 'evm.bytecode.object'],
            },
        },
        },
    };

    const findImports = (importPath) => {
        const candidate = path.join(__dirname, '..', 'node_modules', importPath);
        if (fs.existsSync(candidate)) {
        return { contents: fs.readFileSync(candidate, 'utf8') };
        }

        const rootCandidate = path.join(__dirname, '..', importPath);
        if (fs.existsSync(rootCandidate)) {
        return { contents: fs.readFileSync(rootCandidate, 'utf8') };
        }

        return { error: `Arquivo de importação não encontrado: ${importPath}` };
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    const contract = output.contracts['RegistroAcademicoIPFS.sol'].RegistroAcademicoIPFS;

    if (!contract) {
        throw new Error('Contrato não foi compilado corretamente.');
    }

    return {
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        contractName: 'RegistroAcademicoIPFS',
    };
}

async function getInstitutionProfile(req, res) {
    try {
        const userId = req.usuarioLogado?.id;
        if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        const user = await User.findByPk(userId, {
        attributes: ['id', 'fullName', 'email', 'role', 'institutionId'],
        include: [{
            model: Institution,
            as: 'institution',
            attributes: ['id', 'name', 'contractAddress', 'walletAddress'],
        }],
        });

        if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        return res.status(200).json({
        institution: {
            id: user.institution?.id ?? null,
            name: user.institution?.name ?? null,
            contractAddress: user.institution?.contractAddress ?? null,
            walletAddress: user.institution?.walletAddress ?? null,
        },
        });
    } catch (error) {
        console.error('Erro ao buscar instituição do usuário:', error);
        return res.status(500).json({ error: 'Erro ao buscar dados da instituição.' });
    }
}

async function compileContract(req, res) {
    try {
        const artifact = getContractArtifact();
        return res.status(200).json(artifact);
    } catch (error) {
        console.error('Erro ao compilar contrato:', error);
        return res.status(500).json({ error: 'Não foi possível compilar o contrato.', details: error.message });
    }
}

async function saveInstitutionContract(req, res) {
    try {
        const userId = req.usuarioLogado?.id;
        const { contractAddress, walletAddress } = req.body || {};

        if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        if (!contractAddress || typeof contractAddress !== 'string') {
        return res.status(400).json({ error: 'É necessário informar um endereço válido do contrato.' });
        }

        if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'É necessário informar um endereço válido da carteira.' });
        }

        const user = await User.findByPk(userId, {
        attributes: ['institutionId'],
        });

        if (!user?.institutionId) {
        return res.status(400).json({ error: 'Esta conta não pertence a uma instituição.' });
        }

        const [updated] = await Institution.update(
        {
            contractAddress: contractAddress.trim(),
            walletAddress: walletAddress.trim(),
        },
        { where: { id: user.institutionId } }
        );

        if (!updated) {
        return res.status(404).json({ error: 'Instituição não encontrada para atualizar o contrato.' });
        }

        const institution = await Institution.findByPk(user.institutionId, {
            attributes: ['id', 'name', 'contractAddress', 'walletAddress'],
        });

        return res.status(200).json({
        message: 'Endereço do contrato salvo com sucesso.',
        institution,
        });
    } catch (error) {
        console.error('Erro ao salvar endereço do contrato:', error);
        return res.status(500).json({ error: 'Erro ao salvar endereço do contrato.' });
    }
}

module.exports = {
    getInstitutionProfile,
    compileContract,
    saveInstitutionContract,
};
