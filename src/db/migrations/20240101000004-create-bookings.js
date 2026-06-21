'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookings', {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('(UUID())'),
      },
      venue_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
      },
      coordinator_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'CONFIRMED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
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

    // Foreign key: bookings.venue_id → venues.id
    await queryInterface.addConstraint('bookings', {
      fields: ['venue_id'],
      type: 'foreign key',
      name: 'fk_booking_venue',
      references: {
        table: 'venues',
        field: 'id',
      },
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });

    // Foreign key: bookings.coordinator_id → users.id
    await queryInterface.addConstraint('bookings', {
      fields: ['coordinator_id'],
      type: 'foreign key',
      name: 'fk_booking_coord',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });

    // CHECK constraint: end_time > start_time
    await queryInterface.sequelize.query(
      'ALTER TABLE `bookings` ADD CONSTRAINT `chk_booking_times` CHECK (`end_time` > `start_time`)'
    );

    // Indexes
    await queryInterface.addIndex('bookings', ['venue_id'],                            { name: 'idx_booking_venue' });
    await queryInterface.addIndex('bookings', ['coordinator_id'],                      { name: 'idx_booking_coord' });
    await queryInterface.addIndex('bookings', ['status'],                              { name: 'idx_booking_status' });
    await queryInterface.addIndex('bookings', ['venue_id', 'start_time', 'end_time'], { name: 'idx_booking_times' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('bookings');
  },
};
