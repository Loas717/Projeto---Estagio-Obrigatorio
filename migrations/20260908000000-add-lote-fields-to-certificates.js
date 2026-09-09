'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Certificates', 'loteId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('Certificates', 'merkleProof', {
      type: Sequelize.JSON,
      allowNull: true
    });

    await queryInterface.addColumn('Certificates', 'raizMerkle', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Certificates', 'revogadoEmLote', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Certificates', 'loteId');
    await queryInterface.removeColumn('Certificates', 'merkleProof');
    await queryInterface.removeColumn('Certificates', 'raizMerkle');
    await queryInterface.removeColumn('Certificates', 'revogadoEmLote');
  }
};
