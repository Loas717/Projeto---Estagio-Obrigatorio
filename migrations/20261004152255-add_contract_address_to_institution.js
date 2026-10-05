'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Institutions', 'contract_address', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'name',
      comment: 'Endereço do Smart Contract publicado por esta instituição'
    });
    await queryInterface.addColumn('Institutions', 'wallet_address', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'contract_address',
      comment: 'Endereço da carteira da instituição'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Institutions', 'contract_address');
    await queryInterface.removeColumn('Institutions', 'wallet_address');
  }
};
