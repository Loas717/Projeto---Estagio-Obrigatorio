'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Atualiza a coluna 'role' para o novo defaultValue
    await queryInterface.changeColumn('Users', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'instituicao',
    });

    // 2. Adiciona a coluna 'institutionName'
    await queryInterface.addColumn('Users', 'institutionName', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // 3. Adiciona a coluna 'ra'
    await queryInterface.addColumn('Users', 'ra', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Reverte a coluna 'role' para o defaultValue original ('user')
    await queryInterface.changeColumn('Users', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'user',
    });

    // Remove as colunas criadas
    await queryInterface.removeColumn('Users', 'institutionName');
    await queryInterface.removeColumn('Users', 'ra');
  }
};