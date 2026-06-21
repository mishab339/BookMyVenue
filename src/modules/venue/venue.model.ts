import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../../db/sequelize';

export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface VenueAttributes {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  capacity: number;
  hourlyPrice: number;
  approvalStatus: ApprovalStatus;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type VenueCreation = Optional<VenueAttributes, 'id' | 'approvalStatus' | 'metadata'>;

export class Venue extends Model<VenueAttributes, VenueCreation>
  implements VenueAttributes {
  declare id: string;
  declare ownerId: string;
  declare name: string;
  declare address: string;
  declare capacity: number;
  declare hourlyPrice: number;
  declare approvalStatus: ApprovalStatus;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Venue.init(
  {
    id:             { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    ownerId:        { type: DataTypes.CHAR(36), allowNull: false, field: 'owner_id' },
    name:           { type: DataTypes.STRING(255), allowNull: false },
    address:        { type: DataTypes.TEXT, allowNull: false },
    capacity:       { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    hourlyPrice:    { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'hourly_price' },
    approvalStatus: {
      type: DataTypes.ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING_APPROVAL',
      field: 'approval_status',
    },
    metadata: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: 'venues',
    underscored: true,
    indexes: [
      { name: 'idx_venue_owner',  fields: ['owner_id'] },
      { name: 'idx_venue_status', fields: ['approval_status'] },
      { name: 'idx_venue_cap',    fields: ['capacity'] },
      { name: 'idx_venue_price',  fields: ['hourly_price'] },
    ],
  },
);
