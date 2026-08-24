'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('Users', {
      fields: ['ra'],
      type: 'unique',
      name: 'custom_unique_users_ra'
    });

    await queryInterface.addConstraint('Certificates', {
      fields: ['ra'],
      type: 'foreign key',
      name: 'fk_certificates_users_ra',
      references: {
        table: 'Users',
        field: 'ra'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('Certificates', 'fk_certificates_users_ra');
    await queryInterface.removeConstraint('Users', 'custom_unique_users_ra');
  }
};