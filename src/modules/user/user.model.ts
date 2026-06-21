import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../../db/sequelize';

export type UserRole   = 'SUPER_ADMIN' | 'VENUE_OWNER' | 'COORDINATOR';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface UserAttributes {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

type UserCreation = Optional<UserAttributes, 'id' | 'status'>;

export class User extends Model<UserAttributes, UserCreation>
  implements UserAttributes {
  declare id: string;
  declare name: string;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare status: UserStatus;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
    id:           { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name:         { type: DataTypes.STRING(120), allowNull: false },
    email:        { type: DataTypes.STRING(255), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    role:         { type: DataTypes.ENUM('SUPER_ADMIN','VENUE_OWNER','COORDINATOR'), allowNull: false },
    status:       { type: DataTypes.ENUM('ACTIVE','SUSPENDED','PENDING'), allowNull: false, defaultValue: 'ACTIVE' },
  },
  { sequelize, tableName: 'users', underscored: true },
);
