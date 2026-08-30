const express = require('express');
const certificadosRouter = require('./routes/certificados');
const verificacaoRouter = require('./routes/verificacao');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

const cors = require('cors');

app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

// Middleware para parsear URL encoded
app.use(express.urlencoded({ extended: true }));

// Rotas
app.use('/certificados', certificadosRouter);
app.use('/auth', authRouter);
app.use('/verificacao', verificacaoRouter);
app.use('/users', usersRouter);
// Rota de teste
app.get('/', (req, res) => {
    res.json({ message: 'API de Certificados e autenticação funcionando!' });
});

// Tratamento de erros 404
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento de erros gerais
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
