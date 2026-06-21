import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../../db/sequelize';

export interface RefreshTokenAttributes {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt?: Date;
}

type RefreshTokenCreation = Optional<RefreshTokenAttributes, 'id' | 'isRevoked'>;

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreation>
  implements RefreshTokenAttributes {
  declare id: string;
  declare userId: string;
  declare tokenHash: string;
  declare deviceId: string;
  declare isRevoked: boolean;
  declare expiresAt: Date;
  declare createdAt: Date;
}

RefreshToken.init(
  {
    id:        { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId:    { type: DataTypes.CHAR(36), allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'token_hash' },
    deviceId:  { type: DataTypes.STRING(120), allowNull: false, field: 'device_id' },
    isRevoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_revoked' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  },
  { sequelize, tableName: 'refresh_tokens', underscored: true, updatedAt: false },
);
