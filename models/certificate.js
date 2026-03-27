'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Certificate extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Certificate.init({
    studentName: DataTypes.STRING,
    courseName: DataTypes.STRING,
    documentHash: DataTypes.STRING,
    blockchainTx: DataTypes.STRING,
    issueDate: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Certificate',
  });
  return Certificate;
};