'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Certificates', 'institution_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Institutions',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Instituição responsável pela emissão do certificado',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Certificates', 'institution_id');
  },
};