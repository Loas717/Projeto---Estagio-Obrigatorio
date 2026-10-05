'use strict';

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      fullName: {
        type: DataTypes.STRING,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'instituicao',
        validate: {
          isIn: [['instituicao', 'aluno']],
        },
      },
      institutionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Institutions',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      ra: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {}
  );

  User.associate = function (models) {
    User.belongsTo(models.Institution, {
      foreignKey: 'institutionId',
      as: 'institution',
    });

    User.hasMany(models.InstitutionStudent, {
      foreignKey: 'studentId',
      as: 'studentInstitutions',
    });

    User.belongsToMany(models.Institution, {
      through: models.InstitutionStudent,
      foreignKey: 'studentId',
      otherKey: 'institutionId',
      as: 'institutions',
    });
  };

  return User;
};
