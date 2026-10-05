'use strict';

module.exports = (sequelize, DataTypes) => {
    const InstitutionStudent = sequelize.define(
        'InstitutionStudent',
        {
        institutionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
            model: 'Institutions',
            key: 'id',
            },
            onDelete: 'CASCADE',
        },
        studentId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
            model: 'Users',
            key: 'id',
            },
            onDelete: 'CASCADE',
        },
        },
        {
        tableName: 'InstitutionStudents',
        indexes: [
            {
            unique: true,
            fields: ['institutionId', 'studentId'],
            },
        ],
        }
    );

    InstitutionStudent.associate = function (models) {
        InstitutionStudent.belongsTo(models.Institution, {
        foreignKey: 'institutionId',
        as: 'institution',
        });

        InstitutionStudent.belongsTo(models.User, {
        foreignKey: 'studentId',
        as: 'student',
        });
    };

    return InstitutionStudent;
};
