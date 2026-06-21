'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('(UUID())'),
      },
      user_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      device_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      is_revoked: {
        type: Sequelize.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Foreign key: refresh_tokens.user_id → users.id (ON DELETE CASCADE)
    await queryInterface.addConstraint('refresh_tokens', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_rt_user',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    });

    // Indexes
    await queryInterface.addIndex('refresh_tokens', ['user_id'],       { name: 'idx_rt_user' });
    await queryInterface.addIndex('refresh_tokens', ['token_hash'],    { name: 'idx_rt_token' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
