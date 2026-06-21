# Design Document — Book My Venue

## Overview

Book My Venue is a multi-tenant SaaS REST API built on **Node.js + Express + TypeScript**, backed by **MySQL 8.0+** via **Sequelize ORM**. It supports three user roles (SUPER_ADMIN, VENUE_OWNER, COORDINATOR) and orchestrates a venue approval workflow, a booking lifecycle with pessimistic concurrency control, and JWT-based authentication with refresh-token rotation.

## Architecture

The design follows a classic **layered architecture**:

```
HTTP Request
    │
    ▼
Routes  (Express Router, Celebrate validation)
    │
    ▼
Controllers  (parse request → call service → send response)
    │
    ▼
Services  (business logic, transactions)
    │
    ▼
Repositories / Models  (Sequelize, raw SQL where needed)
    │
    ▼
MySQL 8.0+
```

---

## Folder Structure

```
book-my-venue/
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── app.ts                        # Express app factory
│   ├── server.ts                     # HTTP server entry point
│   ├── config/
│   │   └── config.ts                 # Env-variable loader (throws on missing)
│   ├── db/
│   │   ├── sequelize.ts              # Sequelize instance + connection
│   │   └── migrations/               # Sequelize CLI migration files
│   ├── middleware/
│   │   ├── authenticate.ts           # JWT Bearer verification
│   │   ├── checkRole.ts              # RBAC factory middleware
│   │   └── errorHandler.ts           # Global error handler (last in chain)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.validators.ts    # Celebrate/Joi schemas
│   │   │   └── refreshToken.model.ts
│   │   ├── admin/
│   │   │   ├── admin.routes.ts
│   │   │   ├── admin.controller.ts
│   │   │   └── admin.service.ts
│   │   ├── venue/
│   │   │   ├── venue.routes.ts
│   │   │   ├── venue.controller.ts
│   │   │   ├── venue.service.ts
│   │   │   ├── venue.validators.ts
│   │   │   └── venue.model.ts
│   │   ├── booking/
│   │   │   ├── booking.routes.ts
│   │   │   ├── booking.controller.ts
│   │   │   ├── booking.service.ts
│   │   │   ├── booking.validators.ts
│   │   │   └── booking.model.ts
│   │   └── user/
│   │       └── user.model.ts
│   └── types/
│       └── express.d.ts              # Augment Request with user payload
└── tests/
    ├── unit/
    └── integration/
```

---

## Data Models

### `users`

```sql
CREATE TABLE users (
  id            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('SUPER_ADMIN','VENUE_OWNER','COORDINATOR') NOT NULL,
  status        ENUM('ACTIVE','SUSPENDED','PENDING')            NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id         CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36)     NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_id  VARCHAR(120) NOT NULL,
  is_revoked TINYINT(1)   NOT NULL DEFAULT 0,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_user (user_id),
  INDEX idx_rt_token (token_hash)
);
```

### `venues`

```sql
CREATE TABLE venues (
  id              CHAR(36)       NOT NULL PRIMARY KEY DEFAULT (UUID()),
  owner_id        CHAR(36)       NOT NULL,
  name            VARCHAR(255)   NOT NULL,
  address         TEXT           NOT NULL,
  capacity        INT UNSIGNED   NOT NULL,
  hourly_price    DECIMAL(10,2)  NOT NULL,
  approval_status ENUM('PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  metadata        JSON           NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_venue_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  INDEX idx_venue_owner   (owner_id),
  INDEX idx_venue_status  (approval_status),
  INDEX idx_venue_cap     (capacity),
  INDEX idx_venue_price   (hourly_price)
);
```

### `bookings`

```sql
CREATE TABLE bookings (
  id             CHAR(36)    NOT NULL PRIMARY KEY DEFAULT (UUID()),
  venue_id       CHAR(36)    NOT NULL,
  coordinator_id CHAR(36)    NOT NULL,
  start_time     DATETIME    NOT NULL,
  end_time       DATETIME    NOT NULL,
  status         ENUM('PENDING','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_venue FOREIGN KEY (venue_id)       REFERENCES venues(id),
  CONSTRAINT fk_booking_coord FOREIGN KEY (coordinator_id) REFERENCES users(id),
  CONSTRAINT chk_booking_times CHECK (end_time > start_time),
  INDEX idx_booking_venue  (venue_id),
  INDEX idx_booking_coord  (coordinator_id),
  INDEX idx_booking_status (status),
  INDEX idx_booking_times  (venue_id, start_time, end_time)
);
```

---

## Sequelize Model Definitions

### `User` model (`src/modules/user/user.model.ts`)

```typescript
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
```


### `RefreshToken` model (`src/modules/auth/refreshToken.model.ts`)

```typescript
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
```

### `Venue` model (`src/modules/venue/venue.model.ts`)

```typescript
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
    hourlyPrice:    { type: DataTypes.DECIMAL(10,2), allowNull: false, field: 'hourly_price' },
    approvalStatus: {
      type: DataTypes.ENUM('PENDING_APPROVAL','APPROVED','REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING_APPROVAL',
      field: 'approval_status',
    },
    metadata: { type: DataTypes.JSON, allowNull: true },
  },
  { sequelize, tableName: 'venues', underscored: true },
);
```

### `Booking` model (`src/modules/booking/booking.model.ts`)

```typescript
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
      type: DataTypes.ENUM('PENDING','CONFIRMED','CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
  },
  { sequelize, tableName: 'bookings', underscored: true },
);
```

---

## Components and Interfaces

### Configuration (`src/config/config.ts`)

```typescript
interface AppConfig {
  port: number;
  nodeEnv: string;
  db: { host: string; port: number; name: string; user: string; password: string };
  jwt: { accessSecret: string; refreshSecret: string; accessExpiresIn: string; refreshExpiresIn: string };
  bcrypt: { rounds: number };
  pagination: { defaultPageSize: number };
}

/** Throws at startup if any required env var is missing. */
export function loadConfig(): AppConfig;
```

### Authentication Middleware (`src/middleware/authenticate.ts`)

```typescript
/**
 * Extracts Bearer token from Authorization header, verifies JWT signature
 * and expiry, then attaches { id, role } to req.user.
 * Returns 401 if header is missing or token is invalid/expired.
 */
export const authenticate: RequestHandler;
```

### RBAC Middleware (`src/middleware/checkRole.ts`)

```typescript
/**
 * Factory that returns an Express middleware.
 * Returns 403 when req.user.role is not in the allowed list.
 */
export function checkRole(roles: UserRole[]): RequestHandler;
```

### Global Error Handler (`src/middleware/errorHandler.ts`)

```typescript
/**
 * Must be registered LAST in the Express chain.
 * Normalises all errors (including Celebrate validation errors) into:
 *   { status: number, message: string, errors?: unknown[] }
 */
export const globalErrorHandler: ErrorRequestHandler;
```

### AuthService (`src/modules/auth/auth.service.ts`)

```typescript
interface AuthService {
  register(dto: RegisterDto): Promise<{ id: string }>;
  login(dto: LoginDto): Promise<TokenPair>;
  refreshTokens(rawToken: string): Promise<TokenPair>;
  logout(rawToken: string): Promise<void>;
}

interface TokenPair { accessToken: string; refreshToken: string }
interface RegisterDto { name: string; email: string; password: string; role: UserRole; deviceId: string }
interface LoginDto    { email: string; password: string; deviceId: string }
```

### AdminService (`src/modules/admin/admin.service.ts`)

```typescript
interface AdminService {
  listUsers(page: number, pageSize: number): Promise<PaginatedResult<UserDto>>;
  suspendUser(userId: string): Promise<void>;
  approveUser(userId: string): Promise<void>;
  approveVenue(venueId: string): Promise<void>;
}
```

### VenueService (`src/modules/venue/venue.service.ts`)

```typescript
interface VenueService {
  createVenue(ownerId: string, dto: CreateVenueDto): Promise<VenueDto>;
  updateVenue(ownerId: string, venueId: string, dto: UpdateVenueDto): Promise<VenueDto>;
  listOwnerVenues(ownerId: string): Promise<VenueDto[]>;
  searchVenues(filters: VenueSearchFilters, page: number, pageSize: number): Promise<PaginatedResult<VenueDto>>;
}

interface VenueSearchFilters {
  minCapacity?: number;
  maxCapacity?: number;
  maxHourlyPrice?: number;
  availableFrom?: Date;
  availableTo?: Date;
}
```

### BookingService (`src/modules/booking/booking.service.ts`)

```typescript
interface BookingService {
  createBooking(coordinatorId: string, dto: CreateBookingDto): Promise<BookingDto>;
  confirmBooking(coordinatorId: string, bookingId: string): Promise<BookingDto>;
  cancelBooking(coordinatorId: string, bookingId: string): Promise<BookingDto>;
  listBookings(coordinatorId: string): Promise<BookingDto[]>;
}
```

---

## Core Implementation: `BookingService.confirmBooking`

This is the most critical path in the system — it must be atomic, isolated, and guarantee exactly one winner.

```typescript
// src/modules/booking/booking.service.ts
import { Op, Transaction } from 'sequelize';
import sequelize from '../../db/sequelize';
import { Booking } from './booking.model';
import { Venue }   from '../venue/venue.model';
import { AppError } from '../../middleware/errorHandler';

export class BookingService {

  async confirmBooking(coordinatorId: string, bookingId: string): Promise<BookingDto> {
    // Use REPEATABLE READ to prevent phantom reads during the conflict window.
    const txn = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    });

    try {
      // 1. Fetch the target booking and acquire a row-level exclusive lock on it.
      const booking = await Booking.findOne({
        where: { id: bookingId, coordinatorId, status: 'PENDING' },
        lock: txn.LOCK.UPDATE,           // SELECT ... FOR UPDATE
        transaction: txn,
      });

      if (!booking) {
        await txn.rollback();
        throw new AppError(404, 'Booking not found or not in PENDING state');
      }

      // Ownership guard is already enforced by the coordinatorId filter above.

      // 2. Lock ALL confirmed bookings for this venue that could overlap.
      //    Acquiring the lock here prevents a concurrent transaction from
      //    inserting a new CONFIRMED booking in the same window.
      const conflicts = await Booking.findAll({
        where: {
          venueId: booking.venueId,
          status:  'CONFIRMED',
          // Overlap predicate: (requested_start < existing_end) AND (requested_end > existing_start)
          startTime: { [Op.lt]: booking.endTime },
          endTime:   { [Op.gt]: booking.startTime },
        },
        lock: txn.LOCK.UPDATE,           // SELECT ... FOR UPDATE on conflicting rows
        transaction: txn,
      });

      if (conflicts.length > 0) {
        await txn.rollback();
        throw new AppError(409, 'Time slot is no longer available — a conflicting booking exists');
      }

      // 3. No conflicts — transition status to CONFIRMED.
      booking.status = 'CONFIRMED';
      await booking.save({ transaction: txn });

      await txn.commit();

      return this.toDto(booking);

    } catch (err) {
      // Guard against double rollback when we've already rolled back above.
      if (txn && !txn.finished) {
        await txn.rollback();
      }
      throw err;   // Re-throw so Global Error Handler normalises the response.
    }
  }

  // ── createBooking ────────────────────────────────────────────────────────────

  async createBooking(coordinatorId: string, dto: CreateBookingDto): Promise<BookingDto> {
    const venue = await Venue.findByPk(dto.venueId);
    if (!venue) throw new AppError(404, 'Venue not found');
    if (venue.approvalStatus !== 'APPROVED') {
      throw new AppError(422, 'Cannot book a venue that is not APPROVED');
    }

    const booking = await Booking.create({
      venueId:       dto.venueId,
      coordinatorId,
      startTime:     new Date(dto.startTime),
      endTime:       new Date(dto.endTime),
      status:        'PENDING',
    });

    return this.toDto(booking);
  }

  // ── cancelBooking ────────────────────────────────────────────────────────────

  async cancelBooking(coordinatorId: string, bookingId: string): Promise<BookingDto> {
    const booking = await Booking.findOne({ where: { id: bookingId } });
    if (!booking)                  throw new AppError(404, 'Booking not found');
    if (booking.coordinatorId !== coordinatorId) throw new AppError(403, 'Forbidden');
    if (booking.status === 'CANCELLED') throw new AppError(409, 'Booking is already cancelled');

    booking.status = 'CANCELLED';
    await booking.save();
    return this.toDto(booking);
  }

  // ── listBookings ─────────────────────────────────────────────────────────────

  async listBookings(coordinatorId: string): Promise<BookingDto[]> {
    const bookings = await Booking.findAll({ where: { coordinatorId }, order: [['createdAt', 'DESC']] });
    return bookings.map(this.toDto);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private toDto(b: Booking): BookingDto {
    return {
      id:            b.id,
      venueId:       b.venueId,
      coordinatorId: b.coordinatorId,
      startTime:     b.startTime.toISOString(),
      endTime:       b.endTime.toISOString(),
      status:        b.status,
      createdAt:     b.createdAt.toISOString(),
    };
  }
}
```

### Why this works under concurrency

When two coordinators try to confirm overlapping bookings at the same time:

1. Both transactions start and issue `SELECT ... FOR UPDATE` on the target booking row.
2. One transaction acquires the lock first; the other blocks.
3. The first transaction checks conflicts (none), sets status = CONFIRMED, **commits**, releasing its locks.
4. The second transaction unblocks, re-reads — it now finds a CONFIRMED row overlapping its window.
5. The second transaction finds a conflict → rollbacks → returns HTTP 409.

This guarantees exactly one winner without application-level retries.

---

## Authentication Flow

### Registration

```
POST /api/auth/register
  │  Celebrate validates body (name, email, password, role, deviceId)
  ├─ AuthService.register()
  │    ├─ Check email uniqueness → 409 if exists
  │    ├─ bcrypt.hash(password, rounds)
  │    └─ User.create({ name, email, passwordHash, role, status: 'ACTIVE' })
  └─ 201 { id }
```

### Login

```
POST /api/auth/login
  │  Celebrate validates body (email, password, deviceId)
  ├─ AuthService.login()
  │    ├─ User.findOne({ email })  → 401 if not found
  │    ├─ Check status !== 'SUSPENDED'  → 401 if suspended
  │    ├─ bcrypt.compare(password, passwordHash)  → 401 if mismatch
  │    ├─ Sign JWT accessToken (sub: userId, role, exp: 15 min)
  │    ├─ Generate opaque refreshToken (crypto.randomBytes(48).toString('hex'))
  │    ├─ sha256(refreshToken) → tokenHash
  │    ├─ RefreshToken.create({ userId, tokenHash, deviceId, expiresAt })
  │    └─ return { accessToken, refreshToken }
  └─ 200 { accessToken, refreshToken }
```

### Token Rotation

```
POST /api/auth/refresh
  │  Celebrate validates body (refreshToken, deviceId)
  ├─ AuthService.refreshTokens()
  │    ├─ sha256(refreshToken) → hash
  │    ├─ RefreshToken.findOne({ tokenHash: hash })  → 401 if not found
  │    ├─ Check !isRevoked && expiresAt > now  → 401 if stale
  │    ├─ Mark old row: isRevoked = true
  │    ├─ Issue new accessToken + new refreshToken
  │    └─ RefreshToken.create(new row)
  └─ 200 { accessToken, refreshToken }
```

---

## API Routes Summary

### Auth (`/api/auth`)

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| POST | `/register` | celebrate | Register new user |
| POST | `/login` | celebrate | Login, receive token pair |
| POST | `/refresh` | celebrate | Rotate refresh token |
| POST | `/logout` | authenticate, celebrate | Revoke refresh token |

### Admin (`/api/admin`)

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| GET | `/users` | authenticate, checkRole(['SUPER_ADMIN']), celebrate | List users (paginated) |
| PATCH | `/users/:id/suspend` | authenticate, checkRole(['SUPER_ADMIN']) | Suspend user |
| PATCH | `/users/:id/approve` | authenticate, checkRole(['SUPER_ADMIN']) | Approve user |
| PATCH | `/venues/:id/approve` | authenticate, checkRole(['SUPER_ADMIN']) | Approve venue |

### Venue Owner (`/api/venues`)

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| POST | `/` | authenticate, checkRole(['VENUE_OWNER']), celebrate | Create venue |
| GET | `/` | authenticate, checkRole(['VENUE_OWNER']) | List own venues |
| PATCH | `/:id` | authenticate, checkRole(['VENUE_OWNER']), celebrate | Update venue |

### Coordinator — Search (`/api/venues/search`)

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| GET | `/` | authenticate, checkRole(['COORDINATOR']), celebrate | Search approved venues |

### Coordinator — Bookings (`/api/bookings`)

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| POST | `/` | authenticate, checkRole(['COORDINATOR']), celebrate | Create booking |
| GET | `/` | authenticate, checkRole(['COORDINATOR']) | List own bookings |
| POST | `/:id/confirm` | authenticate, checkRole(['COORDINATOR']) | Confirm booking |
| POST | `/:id/cancel` | authenticate, checkRole(['COORDINATOR']) | Cancel booking |

---

## Venue Search Implementation

```typescript
// src/modules/venue/venue.service.ts  (searchVenues method)
async searchVenues(filters: VenueSearchFilters, page: number, pageSize: number) {
  const where: WhereOptions<VenueAttributes> = { approvalStatus: 'APPROVED' };

  if (filters.minCapacity !== undefined) where.capacity = { ...where.capacity as object, [Op.gte]: filters.minCapacity };
  if (filters.maxCapacity !== undefined) where.capacity = { ...where.capacity as object, [Op.lte]: filters.maxCapacity };
  if (filters.maxHourlyPrice !== undefined) where.hourlyPrice = { [Op.lte]: filters.maxHourlyPrice };

  // Availability filter: exclude venues with any CONFIRMED booking overlapping the window
  let excludedVenueIds: string[] = [];
  if (filters.availableFrom && filters.availableTo) {
    const conflicting = await Booking.findAll({
      attributes: ['venueId'],
      where: {
        status:    'CONFIRMED',
        startTime: { [Op.lt]: filters.availableTo },
        endTime:   { [Op.gt]: filters.availableFrom },
      },
      group: ['venue_id'],
    });
    excludedVenueIds = conflicting.map(b => b.venueId);
  }

  if (excludedVenueIds.length > 0) {
    where.id = { [Op.notIn]: excludedVenueIds };
  }

  const { count, rows } = await Venue.findAndCountAll({
    where,
    limit:  pageSize,
    offset: (page - 1) * pageSize,
    order:  [['name', 'ASC']],
  });

  return { data: rows.map(this.toDto), total: count, page, pageSize };
}
```

---

## Error Handling

### AppError class

```typescript
// src/middleware/errorHandler.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: unknown[],
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

### Global Error Handler

```typescript
export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Celebrate validation error
  if (isCelebrateError(err)) {
    const details = [...err.details.values()].flatMap(d => d.details.map(i => i.message));
    return res.status(422).json({ status: 422, message: 'Validation failed', errors: details });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status:  err.statusCode,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  // Unknown error — log and return 500
  console.error('[UnhandledError]', err);
  return res.status(500).json({ status: 500, message: 'Internal server error' });
};
```

---

## Environment Variables (`.env.example`)

```dotenv
# Application
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=book_my_venue
DB_USER=root
DB_PASSWORD=secret

# JWT
JWT_ACCESS_SECRET=change_me_access_secret_32chars_min
JWT_REFRESH_SECRET=change_me_refresh_secret_32chars_min
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# bcrypt
BCRYPT_ROUNDS=12

# Pagination
DEFAULT_PAGE_SIZE=20
```

---

## Celebrate/Joi Validation Schemas (representative examples)

```typescript
// src/modules/auth/auth.validators.ts
import { celebrate, Joi, Segments } from 'celebrate';

export const registerSchema = celebrate({
  [Segments.BODY]: Joi.object({
    name:     Joi.string().trim().min(1).max(120).required(),
    email:    Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    role:     Joi.string().valid('VENUE_OWNER', 'COORDINATOR').required(),
    deviceId: Joi.string().max(120).required(),
  }),
});

// src/modules/booking/booking.validators.ts
export const createBookingSchema = celebrate({
  [Segments.BODY]: Joi.object({
    venueId:   Joi.string().guid({ version: 'uuidv4' }).required(),
    startTime: Joi.string().isoDate().required(),
    endTime:   Joi.string().isoDate().required(),
  }).custom((value, helpers) => {
    if (new Date(value.endTime) <= new Date(value.startTime)) {
      return helpers.error('any.invalid');
    }
    return value;
  }).messages({ 'any.invalid': 'endTime must be strictly after startTime' }),
});

// src/modules/venue/venue.validators.ts
export const createVenueSchema = celebrate({
  [Segments.BODY]: Joi.object({
    name:        Joi.string().trim().min(1).max(255).required(),
    address:     Joi.string().trim().min(1).required(),
    capacity:    Joi.number().integer().positive().required(),
    hourlyPrice: Joi.number().positive().precision(2).required(),
    metadata:    Joi.object().optional(),
  }),
});

export const venueSearchSchema = celebrate({
  [Segments.QUERY]: Joi.object({
    minCapacity:    Joi.number().integer().positive().optional(),
    maxCapacity:    Joi.number().integer().positive().optional(),
    maxHourlyPrice: Joi.number().positive().optional(),
    availableFrom:  Joi.string().isoDate().optional(),
    availableTo:    Joi.string().isoDate().optional(),
    page:           Joi.number().integer().min(1).default(1),
    pageSize:       Joi.number().integer().min(1).max(100).optional(),
  }),
});
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before listing properties, the following consolidations were applied:

- Requirements 1.4 and 11.1/11.2 all relate to input validation returning 422 → merged into Property 1.
- Requirements 8.1 and 8.5 (search returns only APPROVED venues) → one invariant property.
- Requirements 4.2, 4.3, 4.4 (RBAC per role) → one cross-role RBAC property.
- Requirements 9.3 and 10.2 (exactly-one-winner concurrency) → one concurrency property.
- Requirements 2.5 and 2.6 (refresh token storage + rotation round-trip) → one round-trip property.

---

### Property 1: Input Validation Returns 422

*For any* route that accepts a request body or query parameters, sending a payload that violates the defined Joi schema SHALL result in HTTP 422 with a JSON body containing a `status` field equal to 422 and an `errors` array listing each failed field.

**Validates: Requirements 1.4, 11.1, 11.2**

---

### Property 2: Booking Datetime Ordering

*For any* create-booking or search-availability request where `endTime` (or `availableTo`) is not strictly after `startTime` (or `availableFrom`), the system SHALL reject the request with HTTP 422.

**Validates: Requirements 11.3**

---

### Property 3: Registration Creates Hashed Password

*For any* valid registration payload with a unique email, the created `users` row SHALL have a `password_hash` that is a valid bcrypt hash of the submitted password, and the plain-text password SHALL never be stored.

**Validates: Requirements 2.1**

---

### Property 4: Duplicate Email Rejected

*For any* email address already present in the `users` table, a subsequent registration attempt with that email SHALL return HTTP 409.

**Validates: Requirements 2.2**

---

### Property 5: Login Returns Token Pair and Persists Refresh Token

*For any* registered user in ACTIVE status, a login request with correct credentials SHALL return an `accessToken` and a `refreshToken`, and a corresponding non-revoked row SHALL exist in `refresh_tokens` for that user's device.

**Validates: Requirements 2.3, 2.5**

---

### Property 6: Suspended User Cannot Login

*For any* user whose `status` is `SUSPENDED`, a login attempt SHALL return HTTP 401 regardless of whether the password is correct.

**Validates: Requirements 5.5**

---

### Property 7: Refresh Token Rotation Round-Trip

*For any* valid, non-revoked refresh token, calling the rotation endpoint SHALL return a new access token and a new refresh token, and the previously used refresh token SHALL be marked `is_revoked = true` so that a second rotation attempt with the old token returns HTTP 401.

**Validates: Requirements 2.6, 2.7**

---

### Property 8: Logout Scoped to Single Device

*For any* user with multiple active sessions, logging out using one session's refresh token SHALL revoke only that token, leaving all other sessions' refresh tokens valid and usable.

**Validates: Requirements 2.8**

---

### Property 9: Protected Routes Require Valid Bearer Token

*For any* protected endpoint, a request sent without an `Authorization: Bearer <token>` header, or with an expired or tampered token, SHALL return HTTP 401.

**Validates: Requirements 3.1, 3.2, 3.3**

---

### Property 10: RBAC Enforced Across All Roles

*For any* Admin Module route accessed with a VENUE_OWNER or COORDINATOR token, *for any* Venue Owner Module route accessed with a SUPER_ADMIN or COORDINATOR token, and *for any* Coordinator booking route accessed with a SUPER_ADMIN or VENUE_OWNER token, the system SHALL return HTTP 403.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

---

### Property 11: Venue Created With PENDING_APPROVAL and Correct Owner

*For any* valid create-venue request by an authenticated VENUE_OWNER, the persisted venue record SHALL have `approval_status = PENDING_APPROVAL` and `owner_id` equal to the authenticated user's ID.

**Validates: Requirements 7.1**

---

### Property 12: Tenant Isolation for Venues

*For any* venue where `owner_id` is owner A, all read, update, and delete requests issued by owner B (where B ≠ A) SHALL return HTTP 403.

**Validates: Requirements 7.2, 7.3**

---

### Property 13: Venue Update Round-Trip

*For any* venue owned by the authenticated user, updating any combination of (Name, Capacity, Address, Hourly Price, metadata) and then reading the venue SHALL return the newly written values.

**Validates: Requirements 7.5, 7.6**

---

### Property 14: Metadata JSON Round-Trip

*For any* valid JSON object submitted as venue `metadata`, serialising to the database and deserialising on read SHALL produce an object that is deep-equal to the original.

**Validates: Requirements 7.6**

---

### Property 15: Search Returns Only Approved Venues

*For any* venue search query (with or without filters), every venue in the result set SHALL have `approval_status = APPROVED`. Venues in `PENDING_APPROVAL` or `REJECTED` states SHALL never appear.

**Validates: Requirements 6.4, 8.1, 8.5**

---

### Property 16: Capacity Filter Correctness

*For any* search with `minCapacity` and/or `maxCapacity` parameters, every returned venue SHALL satisfy `capacity >= minCapacity` (if provided) AND `capacity <= maxCapacity` (if provided).

**Validates: Requirements 8.2**

---

### Property 17: Price Filter Correctness

*For any* search with a `maxHourlyPrice` parameter, every returned venue SHALL satisfy `hourlyPrice <= maxHourlyPrice`.

**Validates: Requirements 8.3**

---

### Property 18: Availability Filter Excludes Conflicting Venues

*For any* search with `availableFrom` and `availableTo`, no returned venue SHALL have a `CONFIRMED` booking where `(availableFrom < booking.endTime) AND (availableTo > booking.startTime)`.

**Validates: Requirements 8.4**

---

### Property 19: Pagination Result Size Invariant

*For any* paginated list endpoint with a given `pageSize`, the number of items in any single page response SHALL be less than or equal to `pageSize`.

**Validates: Requirements 5.1, 8.6**

---

### Property 20: New Booking Created as PENDING

*For any* valid booking request targeting an APPROVED venue, the created booking record SHALL have `status = PENDING`.

**Validates: Requirements 9.1**

---

### Property 21: Exactly-One-Winner Under Concurrent Confirmation

*For any* two concurrent confirmation requests targeting the same venue with overlapping time slots, the system SHALL allow exactly one to transition to `CONFIRMED` and SHALL return HTTP 409 to the other. The `CONFIRMED` booking count for any venue/time-window combination SHALL never exceed one.

**Validates: Requirements 9.3, 9.4, 9.5, 10.1, 10.2**

---

### Property 22: Booking Ownership Isolation

*For any* booking created by coordinator A, all read and mutation requests from coordinator B (where B ≠ A) SHALL return HTTP 403.

**Validates: Requirements 9.8**

---

### Property 23: Cancellation State Machine

*For any* booking in `PENDING` or `CONFIRMED` state, a cancel request SHALL transition the booking to `CANCELLED`. A subsequent cancel request on the same booking SHALL return HTTP 409 without changing any data.

**Validates: Requirements 9.6, 9.7**

---

## Testing Strategy

### Dual Testing Approach

Both unit/integration tests and property-based tests are required and complementary.

**Unit / Integration tests** should cover:
- Specific happy-path and error-path examples for each controller endpoint
- Database integration (real MySQL in CI via Docker)
- The concurrency scenario using parallel Promise.all() calls in tests

**Property-based tests** (using `fast-check`) should cover:
- Properties 1–3 (validation schemas, password hashing)
- Properties 4–8 (auth token lifecycle round-trips)
- Properties 11–14 (venue creation, tenant isolation, metadata round-trip)
- Properties 15–18 (search filter correctness)
- Properties 20–23 (booking lifecycle)

**Property Test Configuration:**
- Minimum 100 iterations per property (`numRuns: 100`)
- Tag format: `// Feature: book-my-venue, Property N: <title>`

### Example Property Test (Property 15)

```typescript
// tests/property/venue-search.property.ts
import fc from 'fast-check';
import { searchVenues } from '../../src/modules/venue/venue.service';

it('Property 15: search returns only APPROVED venues', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        minCapacity:    fc.option(fc.integer({ min: 1, max: 1000 })),
        maxHourlyPrice: fc.option(fc.float({ min: 10, max: 5000 })),
      }),
      async (filters) => {
        // Feature: book-my-venue, Property 15: Search Returns Only Approved Venues
        const result = await searchVenues(filters, 1, 50);
        return result.data.every(v => v.approvalStatus === 'APPROVED');
      },
    ),
    { numRuns: 100 },
  );
});
```

### Example Property Test (Property 21 — Concurrency)

```typescript
// tests/integration/booking-concurrency.test.ts
it('Property 21: exactly one winner under concurrent confirmation', async () => {
  // Create venue + two overlapping PENDING bookings
  const [b1, b2] = await createTwoOverlappingPendingBookings();

  // Fire both confirmations simultaneously
  const [r1, r2] = await Promise.all([
    confirmBooking(coordinatorId, b1.id),
    confirmBooking(coordinatorId, b2.id),
  ]);

  const statuses = [r1.statusCode, r2.statusCode].sort();
  // Feature: book-my-venue, Property 21: Exactly-One-Winner Under Concurrent Confirmation
  expect(statuses).toEqual([200, 409]);
});
```

---

## Security Considerations

- **Password storage**: bcrypt with configurable rounds (default 12). Plain-text password is never logged or returned.
- **JWT secrets**: Loaded exclusively from env vars; startup fails if absent.
- **Refresh token storage**: Only the SHA-256 hash of the opaque token is stored; the raw token travels only over HTTPS and is never persisted.
- **SQL injection**: All queries use Sequelize parameterised bindings; no raw string interpolation.
- **Tenant isolation**: Every venue mutation query includes `owner_id = req.user.id` as an AND condition at the repository layer.
- **Rate limiting**: Not in scope for this document but recommended before production deployment (e.g., `express-rate-limit` on auth endpoints).
- **HTTPS**: Required in production; enforced at infrastructure level (load balancer / reverse proxy).
