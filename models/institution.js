'use strict';

module.exports = (sequelize, DataTypes) => {
    const Institution = sequelize.define(
        'Institution',
        {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
            notEmpty: true,
            },
        },
        contractAddress: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'contract_address',
        },
        walletAddress: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'wallet_address',
        },
        },
        {
        tableName: 'Institutions',
        }
    );

    Institution.associate = function (models) {
        Institution.hasMany(models.User, {
        foreignKey: 'institutionId',
        as: 'institutionUsers',
        });

        Institution.belongsToMany(models.User, {
        through: models.InstitutionStudent,
        foreignKey: 'institutionId',
        otherKey: 'studentId',
        as: 'students',
        });
    };

    return Institution;
};
