require("dotenv").config();

const ssl = {
    require: true,
    rejectUnauthorized: false,
};

const baseConfig = {
    dialect: process.env.DB_DIALECT || "postgres",
    dialectOptions: {
        ssl,
    },
};

const connectionConfig = process.env.DATABASE_URL
    ? {
        use_env_variable: "DATABASE_URL",
    }
    : {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
    };

module.exports = {
    development: {
        ...baseConfig,
        ...connectionConfig,
    },
    production: {
        ...baseConfig,
        ...connectionConfig,
    }
};
