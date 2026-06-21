'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('venues', {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('(UUID())'),
      },
      owner_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      capacity: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      hourly_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      approval_status: {
        type: Sequelize.ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING_APPROVAL',
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      },
    });

    // Foreign key: venues.owner_id → users.id
    await queryInterface.addConstraint('venues', {
      fields: ['owner_id'],
      type: 'foreign key',
      name: 'fk_venue_owner',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });

    // Indexes
    await queryInterface.addIndex('venues', ['owner_id'],        { name: 'idx_venue_owner' });
    await queryInterface.addIndex('venues', ['approval_status'], { name: 'idx_venue_status' });
    await queryInterface.addIndex('venues', ['capacity'],        { name: 'idx_venue_cap' });
    await queryInterface.addIndex('venues', ['hourly_price'],    { name: 'idx_venue_price' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('venues');
  },
};
