'use strict';

const crypto = require('crypto');
const { User, Institution, InstitutionStudent } = require('../models');
const jwt = require('jsonwebtoken');

const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');

  return `${HASH_ITERATIONS}$${salt}$${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [iterations, salt, key] = storedHash.split('$');
  if (!iterations || !salt || !key) {
    return false;
  }

  const derivedKey = crypto
    .pbkdf2Sync(password, salt, parseInt(iterations, 10), HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');

  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derivedKey, 'hex'));
}

async function register(req, res) {
  try {
    const { email, password, fullName, role, institutionName, institutionNames, ra } = req.body;
    const normalizedRole = role === 'aluno' ? 'aluno' : 'instituicao';
    const requestedInstitutionNames = Array.isArray(institutionNames)
      ? institutionNames
      : institutionName
        ? [institutionName]
        : [];
    const normalizedInstitutionNames = [...new Set(
      requestedInstitutionNames
        .map((value) => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)
    )];

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (normalizedRole === 'instituicao' && normalizedInstitutionNames.length === 0) {
      return res.status(400).json({ error: 'A instituição é obrigatória para usuários do tipo instituição.' });
    }

    if (normalizedRole === 'aluno' && normalizedInstitutionNames.length === 0) {
      return res.status(400).json({ error: 'A instituição é obrigatória para usuários do tipo aluno.' });
    }

    if (normalizedRole === 'aluno' && (!ra || !ra.trim())) {
      return res.status(400).json({ error: 'O RA ou matrícula é obrigatório para usuários do tipo aluno.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });

    if (existingUser) {
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const passwordHash = hashPassword(password);

    if (normalizedRole === 'instituicao') {
      const institutionNameValue = normalizedInstitutionNames[0];
      const [institution] = await Institution.findOrCreate({
        where: { name: institutionNameValue },
        defaults: { name: institutionNameValue },
      });

      const user = await User.create({
        fullName: fullName?.trim() || null,
        email: normalizedEmail,
        passwordHash,
        role: normalizedRole,
        institutionId: institution.id,
      });

      return res.status(201).json({
        message: 'Instituição registrada com sucesso.',
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          institutionId: user.institutionId,
          institutionName: institution.name,
          ra: user.ra,
          isActive: user.isActive,
        },
      });
    }

    const institutions = [];
    for (const institutionNameValue of normalizedInstitutionNames) {
      const institution = await Institution.findOne({ where: { name: institutionNameValue } });

      if (!institution) {
        return res.status(400).json({ error: 'Selecione uma instituição cadastrada e ativa.' });
      }

      institutions.push(institution);
    }

    const user = await User.create({
      fullName: fullName?.trim() || null,
      email: normalizedEmail,
      passwordHash,
      role: normalizedRole,
      ra: ra?.trim() || null,
    });

    await Promise.all(
      institutions.map((institution) =>
        InstitutionStudent.findOrCreate({
          where: {
            institutionId: institution.id,
            studentId: user.id,
          },
          defaults: {
            institutionId: institution.id,
            studentId: user.id,
          },
        })
      )
    );

    return res.status(201).json({
      message: 'Aluno registrado com sucesso.',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        ra: user.ra,
        institutions: institutions.map((institution) => ({
          id: institution.id,
          name: institution.name,
        })),
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    return res.status(500).json({ error: 'Erro interno ao registrar usuário.', details: error.message });
  }
}

async function getInstitutions(req, res) {
  try {
    const institutions = await Institution.findAll({
      attributes: ['name'],
      order: [['name', 'ASC']],
    });

    const institutionNames = institutions
      .map((institution) => institution.name?.trim())
      .filter(Boolean);

    return res.status(200).json({ institutions: [...new Set(institutionNames)] });
  } catch (error) {
    console.error('Erro ao buscar instituições:', error);
    return res.status(500).json({ error: 'Erro ao buscar instituições.' });
  }
}

async function login(req, res) {
  try {
    const { email, password, role } = req.body;
    const requestedRole = role === 'aluno' ? 'aluno' : 'instituicao';

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      where: { email: normalizedEmail },
      include: [{
        model: Institution,
        as: 'institution',
        attributes: ['id', 'name'],
      }],
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    if (requestedRole && user.role !== requestedRole) {
      return res.status(401).json({ error: 'Tipo de usuário inválido para este login.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta inativa. Entre em contato com o administrador.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        institutionId: user.institutionId || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );

    return res.status(200).json({
      message: 'Login realizado com sucesso.',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        institutionName: user.institution?.name || null,
        contractAddress: user.institution?.contractAddress || null,
        ra: user.ra,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return res.status(500).json({ error: 'Erro interno ao autenticar usuário.', details: error.message });
  }
}

async function getProfile(req, res) {
  try {
    const usuarioId = req.usuarioLogado?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: 'Não autorizado. Identificação do usuário não encontrada.' });
    }

    const user = await User.findByPk(usuarioId, {
      attributes: ['id', 'fullName', 'email', 'role', 'institutionId', 'isActive', 'createdAt'],
      include: [{
        model: Institution,
        as: 'institution',
        attributes: ['id', 'name'],
      }],
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.status(200).json({
      message: 'Perfil recuperado com sucesso.',
      user: {
        ...user.toJSON(),
        institutionName: user.institution?.name || null,
        contractAddress: user.institution?.contractAddress || null,
      },
    });

  } catch (error) {
    console.error('Erro ao obter perfil do usuário:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao recuperar perfil.', 
      details: error.message 
    });
  }
}

module.exports = { register, login, getProfile, getInstitutions };
