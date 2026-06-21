import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../../db/sequelize';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface BookingAttributes {
  id: string;
  venueId: string;
  coordinatorId: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

type BookingCreation = Optional<BookingAttributes, 'id' | 'status'>;

export class Booking extends Model<BookingAttributes, BookingCreation>
  implements BookingAttributes {
  declare id: string;
  declare venueId: string;
  declare coordinatorId: string;
  declare startTime: Date;
  declare endTime: Date;
  declare status: BookingStatus;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Booking.init(
  {
    id:            { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    venueId:       { type: DataTypes.CHAR(36), allowNull: false, field: 'venue_id' },
    coordinatorId: { type: DataTypes.CHAR(36), allowNull: false, field: 'coordinator_id' },
    startTime:     { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
    endTime:       { type: DataTypes.DATE, allowNull: false, field: 'end_time' },
    status:        {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
  },
  {
    sequelize,
    tableName: 'bookings',
    underscored: true,
    indexes: [
      { name: 'idx_booking_venue',  fields: ['venue_id'] },
      { name: 'idx_booking_coord',  fields: ['coordinator_id'] },
      { name: 'idx_booking_status', fields: ['status'] },
      { name: 'idx_booking_times',  fields: ['venue_id', 'start_time', 'end_time'] },
    ],
  },
);
