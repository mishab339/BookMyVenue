# Implementation Plan: Book My Venue

## Overview

Build a multi-tenant SaaS REST API in TypeScript (Node.js + Express + Sequelize + MySQL 8.0+) with three user roles, a venue approval workflow, a booking lifecycle with pessimistic concurrency control, JWT auth with refresh-token rotation, Celebrate/Joi validation on every route, and property-based tests covering all 23 correctness properties using `fast-check`.

---

## Tasks

- [x] 1. Project scaffold and configuration
  - [x] 1.1 Initialise package.json, tsconfig.json, and install all dependencies
    - Run `npm init -y`, configure `tsconfig.json` with `strict: true`, `outDir: dist`, `rootDir: src`
    - Install runtime deps: `express`, `sequelize`, `mysql2`, `jsonwebtoken`, `bcryptjs`, `celebrate`, `joi`, `dotenv`, `crypto`
    - Install dev deps: `typescript`, `ts-node`, `nodemon`, `@types/*`, `jest`, `ts-jest`, `fast-check`, `supertest`, `@types/supertest`
    - Add `scripts`: `build`, `start`, `dev`, `migrate`, `test`
    - _Requirements: 1.1_

  - [x] 1.2 Create `.env.example` and `src/config/config.ts`
    - Write `.env.example` with all env vars: `NODE_ENV`, `PORT`, `DB_*`, `JWT_*`, `BCRYPT_ROUNDS`, `DEFAULT_PAGE_SIZE` — each with inline comments
    - Implement `loadConfig(): AppConfig` that reads from `process.env` and throws a descriptive startup error if any required variable is absent
    - _Requirements: 1.2, 1.3_

  - [x] 1.3 Bootstrap Express app factory (`src/app.ts`) and HTTP entry point (`src/server.ts`)
    - Create `src/app.ts` that builds and exports the Express app with JSON body parser, routes mounted, and global error handler registered last
    - Create `src/server.ts` that calls `loadConfig()`, connects Sequelize, then starts `http.listen`; registers `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers that log and `process.exit(1)`
    - _Requirements: 1.3, 1.6_

  - [x] 1.4 Add directory scaffolding for all modules
    - Create empty placeholder files (or index barrel files) for `src/db/`, `src/middleware/`, `src/modules/auth/`, `src/modules/admin/`, `src/modules/venue/`, `src/modules/booking/`, `src/modules/user/`, `src/types/`, `tests/unit/`, `tests/integration/`, `tests/property/`
    - _Requirements: 1.1_

- [x] 2. Database layer: Sequelize instance, models, and migrations
  - [x] 2.1 Create Sequelize instance (`src/db/sequelize.ts`)
    - Instantiate `new Sequelize(config.db.name, config.db.user, config.db.password, { host, port, dialect: 'mysql', logging })` and export it
    - Export a `connectDb(): Promise<void>` helper that calls `sequelize.authenticate()`
    - _Requirements: 1.1_

  - [x] 2.2 Define `User` model (`src/modules/user/user.model.ts`)
    - Implement the `User` Sequelize model exactly as specified in the design, with `CHAR(36)` PK, `ENUM` for `role` and `status`, `underscored: true`
    - Export `UserRole` and `UserStatus` TypeScript union types
    - _Requirements: 2.1, 5.1_

  - [x] 2.3 Define `RefreshToken` model (`src/modules/auth/refreshToken.model.ts`)
    - Implement the `RefreshToken` Sequelize model with `updatedAt: false`, foreign key to `users`, unique index on `tokenHash`
    - _Requirements: 2.5_

  - [x] 2.4 Define `Venue` model (`src/modules/venue/venue.model.ts`)
    - Implement the `Venue` Sequelize model with `DECIMAL(10,2)` for `hourlyPrice`, `JSON` for `metadata`, `ENUM` for `approvalStatus`, all indexes from the schema
    - Export `ApprovalStatus` type
    - _Requirements: 7.1, 6.1_

  - [x] 2.5 Define `Booking` model (`src/modules/booking/booking.model.ts`)
    - Implement the `Booking` Sequelize model with composite index on `(venue_id, start_time, end_time)` and `ENUM` for `status`
    - Export `BookingStatus` type
    - _Requirements: 9.1_

  - [x] 2.6 Create Sequelize CLI migrations for all four tables
    - Write four migration files under `src/db/migrations/` that produce the exact DDL from the design (including foreign keys, indexes, `CHECK` constraint on bookings, `ON UPDATE CURRENT_TIMESTAMP`)
    - Ensure migrations run in dependency order: `users` → `refresh_tokens` → `venues` → `bookings`
    - _Requirements: 1.1_

  - [x] 2.7 Augment Express Request type (`src/types/express.d.ts`)
    - Declare module augmentation for `Express.Request` adding `user: { id: string; role: UserRole }`
    - _Requirements: 3.4_

- [ ] 3. Middleware: authentication, RBAC, and global error handler
  - [ ] 3.1 Implement JWT authenticate middleware (`src/middleware/authenticate.ts`)
    - Extract `Bearer <token>` from `Authorization` header; return 401 if missing
    - Verify signature with `JWT_ACCESS_SECRET`; return 401 if expired or tampered
    - Attach decoded `{ id, role }` to `req.user`; call `next()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property test for authenticate middleware — Property 9
    - **Property 9: Protected Routes Require Valid Bearer Token**
    - Use `fast-check` to generate arbitrary strings as tokens and assert all non-valid tokens return HTTP 401
    - Tag: `// Feature: book-my-venue, Property 9: Protected Routes Require Valid Bearer Token`
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ] 3.3 Implement RBAC `checkRole` middleware factory (`src/middleware/checkRole.ts`)
    - `checkRole(roles: UserRole[]): RequestHandler` — returns 403 when `req.user.role` is not in the allowed list; calls `next()` otherwise
    - _Requirements: 4.1_

  - [ ]* 3.4 Write property test for checkRole middleware — Property 10
    - **Property 10: RBAC Enforced Across All Roles**
    - Use `fast-check` to enumerate all (role, endpoint category) pairings and assert disallowed pairings return HTTP 403
    - Tag: `// Feature: book-my-venue, Property 10: RBAC Enforced Across All Roles`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ] 3.5 Implement `AppError` class and global error handler (`src/middleware/errorHandler.ts`)
    - Define `AppError extends Error` with `statusCode`, `message`, optional `errors`
    - Implement `globalErrorHandler: ErrorRequestHandler` that handles Celebrate errors (→ 422 with `errors` array), `AppError` instances, and unknown errors (→ 500)
    - Register as last middleware in `src/app.ts`
    - _Requirements: 1.5_

  - [ ]* 3.6 Write property test for global error handler and validation schemas — Property 1
    - **Property 1: Input Validation Returns 422**
    - Use `fast-check` to generate payloads with missing/invalid required fields for each route and assert HTTP 422 with `status: 422` and non-empty `errors` array
    - Tag: `// Feature: book-my-venue, Property 1: Input Validation Returns 422`
    - **Validates: Requirements 1.4, 11.1, 11.2**

- [ ] 4. Checkpoint — ensure project compiles and middleware unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Auth module: registration, login, refresh, logout
  - [ ] 5.1 Implement `AuthService` (`src/modules/auth/auth.service.ts`)
    - `register`: check email uniqueness (→ 409), `bcrypt.hash`, `User.create` (→ 201 `{ id }`)
    - `login`: find user, check status not SUSPENDED (→ 401), `bcrypt.compare` (→ 401 on mismatch), sign JWT accessToken (15 min), generate opaque refreshToken via `crypto.randomBytes(48)`, sha256 hash, `RefreshToken.create`, return token pair
    - `refreshTokens`: sha256 lookup in `refresh_tokens`, validate not revoked and not expired (→ 401), mark old row `isRevoked = true`, issue new pair
    - `logout`: sha256 lookup, mark row `isRevoked = true`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 5.2 Write property test for password hashing — Property 3
    - **Property 3: Registration Creates Hashed Password**
    - Use `fast-check` to generate random valid passwords and assert the stored `password_hash` satisfies `bcrypt.compare(plain, hash)` and is never equal to the plain text
    - Tag: `// Feature: book-my-venue, Property 3: Registration Creates Hashed Password`
    - **Validates: Requirements 2.1**

  - [ ]* 5.3 Write property test for duplicate email rejection — Property 4
    - **Property 4: Duplicate Email Rejected**
    - Use `fast-check` to generate an email, register once, then attempt a second registration with the same email, and assert HTTP 409
    - Tag: `// Feature: book-my-venue, Property 4: Duplicate Email Rejected`
    - **Validates: Requirements 2.2**

  - [ ]* 5.4 Write property test for login token pair and refresh token persistence — Property 5
    - **Property 5: Login Returns Token Pair and Persists Refresh Token**
    - Use `fast-check` to generate valid credentials, register, login, and assert both `accessToken` and `refreshToken` are returned and a non-revoked row exists in `refresh_tokens`
    - Tag: `// Feature: book-my-venue, Property 5: Login Returns Token Pair and Persists Refresh Token`
    - **Validates: Requirements 2.3, 2.5**

  - [ ]* 5.5 Write property test for suspended user login — Property 6
    - **Property 6: Suspended User Cannot Login**
    - Use `fast-check` to generate user credentials, register, suspend the user, then attempt login and assert HTTP 401
    - Tag: `// Feature: book-my-venue, Property 6: Suspended User Cannot Login`
    - **Validates: Requirements 5.5**

  - [ ]* 5.6 Write property test for refresh token rotation — Property 7
    - **Property 7: Refresh Token Rotation Round-Trip**
    - Use `fast-check` to register+login, rotate the refresh token, assert a new pair is returned and the old token now returns HTTP 401
    - Tag: `// Feature: book-my-venue, Property 7: Refresh Token Rotation Round-Trip`
    - **Validates: Requirements 2.6, 2.7**

  - [ ]* 5.7 Write property test for logout scoped to single device — Property 8
    - **Property 8: Logout Scoped to Single Device**
    - Use `fast-check` to register+login twice (two deviceIds), logout one session, assert the other session's refresh token still works
    - Tag: `// Feature: book-my-venue, Property 8: Logout Scoped to Single Device`
    - **Validates: Requirements 2.8**

  - [ ] 5.8 Implement auth Celebrate/Joi validators (`src/modules/auth/auth.validators.ts`)
    - `registerSchema`: name, email, password (min 8), role (VENUE_OWNER|COORDINATOR), deviceId
    - `loginSchema`: email, password, deviceId
    - `refreshSchema`: refreshToken, deviceId
    - `logoutSchema`: refreshToken
    - _Requirements: 11.1, 11.5_

  - [ ] 5.9 Implement auth controller and routes (`src/modules/auth/auth.controller.ts`, `auth.routes.ts`)
    - Wire `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` with their validators and service calls
    - Mount router in `src/app.ts`
    - _Requirements: 2.1, 2.3, 2.6, 2.8_

- [ ] 6. Admin module: user management and venue approval
  - [ ] 6.1 Implement `AdminService` (`src/modules/admin/admin.service.ts`)
    - `listUsers(page, pageSize)`: paginated fetch of all users with id, name, email, role, status
    - `suspendUser(userId)`: find user (→ 404 if absent), set `status = SUSPENDED`, save
    - `approveUser(userId)`: find user (→ 404 if absent), set `status = ACTIVE`, save
    - `approveVenue(venueId)`: find venue (→ 404 if absent), check `approvalStatus === 'PENDING_APPROVAL'` (→ 409 if not), set `approvalStatus = APPROVED`, save
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [ ] 6.2 Implement admin controller and routes (`src/modules/admin/admin.controller.ts`, `admin.routes.ts`)
    - Apply `authenticate` + `checkRole(['SUPER_ADMIN'])` to all routes
    - Wire `GET /api/admin/users`, `PATCH /api/admin/users/:id/suspend`, `PATCH /api/admin/users/:id/approve`, `PATCH /api/admin/venues/:id/approve`
    - Add Celebrate query schema on `GET /users` for `page` and `pageSize`
    - Mount router in `src/app.ts`
    - _Requirements: 4.2, 5.1, 5.2, 5.4, 6.1_

- [ ] 7. Venue Owner module: venue CRUD with tenant isolation
  - [ ] 7.1 Implement `VenueService` create, update, and list-owner methods (`src/modules/venue/venue.service.ts`)
    - `createVenue(ownerId, dto)`: `Venue.create({ ...dto, ownerId, approvalStatus: 'PENDING_APPROVAL' })` → return 201 DTO
    - `listOwnerVenues(ownerId)`: `Venue.findAll({ where: { ownerId } })`
    - `updateVenue(ownerId, venueId, dto)`: find venue scoped to `ownerId` (→ 404 if not found, 403 if wrong owner), update fields including optional metadata, save, return updated DTO
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 7.2 Write property test for venue creation invariants — Property 11
    - **Property 11: Venue Created With PENDING_APPROVAL and Correct Owner**
    - Use `fast-check` to generate valid create-venue payloads and assert the persisted record has `approvalStatus === 'PENDING_APPROVAL'` and `ownerId` equals the authenticated user's ID
    - Tag: `// Feature: book-my-venue, Property 11: Venue Created With PENDING_APPROVAL and Correct Owner`
    - **Validates: Requirements 7.1**

  - [ ]* 7.3 Write property test for tenant isolation — Property 12
    - **Property 12: Tenant Isolation for Venues**
    - Use `fast-check` to generate two distinct owner IDs, create a venue under owner A, then attempt read/update/delete as owner B and assert HTTP 403
    - Tag: `// Feature: book-my-venue, Property 12: Tenant Isolation for Venues`
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 7.4 Write property test for venue update round-trip — Property 13
    - **Property 13: Venue Update Round-Trip**
    - Use `fast-check` to generate arbitrary valid field combinations (name, capacity, address, hourlyPrice, metadata) and assert that a subsequent read returns exactly the written values
    - Tag: `// Feature: book-my-venue, Property 13: Venue Update Round-Trip`
    - **Validates: Requirements 7.5, 7.6**

  - [ ]* 7.5 Write property test for metadata JSON round-trip — Property 14
    - **Property 14: Metadata JSON Round-Trip**
    - Use `fast-check`'s `fc.jsonValue()` to generate arbitrary JSON objects, store as metadata, read back, and assert deep-equality
    - Tag: `// Feature: book-my-venue, Property 14: Metadata JSON Round-Trip`
    - **Validates: Requirements 7.6**

  - [ ] 7.6 Implement venue Celebrate/Joi validators (`src/modules/venue/venue.validators.ts`)
    - `createVenueSchema`: name, address, capacity (positive integer), hourlyPrice (positive decimal), optional metadata object
    - `updateVenueSchema`: same fields as create but all optional (at least one required)
    - `venueSearchSchema`: minCapacity, maxCapacity, maxHourlyPrice, availableFrom, availableTo (isoDate), page, pageSize
    - _Requirements: 11.1, 11.4_

  - [ ] 7.7 Implement venue owner controller and routes (`src/modules/venue/venue.routes.ts`, `venue.controller.ts`)
    - Apply `authenticate` + `checkRole(['VENUE_OWNER'])` to owner routes
    - Wire `POST /api/venues`, `GET /api/venues`, `PATCH /api/venues/:id` with validators
    - Mount router in `src/app.ts`
    - _Requirements: 4.3, 7.1, 7.4, 7.5_

- [ ] 8. Checkpoint — ensure all modules so far compile and auth+admin+venue tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Event Coordinator module: venue search
  - [ ] 9.1 Implement `VenueService.searchVenues` (`src/modules/venue/venue.service.ts`)
    - Filter `approvalStatus = 'APPROVED'` always
    - Apply `minCapacity`, `maxCapacity` with Sequelize `Op.gte`/`Op.lte`
    - Apply `maxHourlyPrice` with `Op.lte`
    - When `availableFrom` + `availableTo` provided: find all `venue_id`s from `CONFIRMED` bookings where `(availableFrom < endTime) AND (availableTo > startTime)` and exclude them via `Op.notIn`
    - Apply pagination (`limit`, `offset`) and return `{ data, total, page, pageSize }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.2 Write property test for approved-only search — Property 15
    - **Property 15: Search Returns Only Approved Venues**
    - Use `fast-check` to generate arbitrary filter combinations and assert every item in the result has `approvalStatus === 'APPROVED'`
    - Tag: `// Feature: book-my-venue, Property 15: Search Returns Only Approved Venues`
    - **Validates: Requirements 6.4, 8.1, 8.5**

  - [ ]* 9.3 Write property test for capacity filter — Property 16
    - **Property 16: Capacity Filter Correctness**
    - Use `fast-check` to generate `minCapacity` and `maxCapacity` pairs and assert every returned venue satisfies the bounds
    - Tag: `// Feature: book-my-venue, Property 16: Capacity Filter Correctness`
    - **Validates: Requirements 8.2**

  - [ ]* 9.4 Write property test for price filter — Property 17
    - **Property 17: Price Filter Correctness**
    - Use `fast-check` to generate `maxHourlyPrice` values and assert every returned venue has `hourlyPrice <= maxHourlyPrice`
    - Tag: `// Feature: book-my-venue, Property 17: Price Filter Correctness`
    - **Validates: Requirements 8.3**

  - [ ]* 9.5 Write property test for availability filter — Property 18
    - **Property 18: Availability Filter Excludes Conflicting Venues**
    - Use `fast-check` to generate time windows, seed some CONFIRMED bookings, run search, and assert no returned venue has an overlapping CONFIRMED booking
    - Tag: `// Feature: book-my-venue, Property 18: Availability Filter Excludes Conflicting Venues`
    - **Validates: Requirements 8.4**

  - [ ] 9.6 Implement venue search controller and route (`src/modules/venue/venue.routes.ts`)
    - Apply `authenticate` + `checkRole(['COORDINATOR'])` + `venueSearchSchema` to `GET /api/venues/search`
    - Mount before the VENUE_OWNER venue routes to avoid route shadowing
    - _Requirements: 4.4, 8.1_

- [ ] 10. Booking engine: lifecycle management with ACID transaction
  - [ ] 10.1 Implement `BookingService.createBooking` (`src/modules/booking/booking.service.ts`)
    - Find venue by ID (→ 404 if absent), assert `approvalStatus === 'APPROVED'` (→ 422 if not)
    - `Booking.create({ venueId, coordinatorId, startTime, endTime, status: 'PENDING' })` → return DTO
    - _Requirements: 9.1, 9.2_

  - [ ]* 10.2 Write property test for new booking is PENDING — Property 20
    - **Property 20: New Booking Created as PENDING**
    - Use `fast-check` to generate valid booking payloads against an APPROVED venue and assert the created record has `status === 'PENDING'`
    - Tag: `// Feature: book-my-venue, Property 20: New Booking Created as PENDING`
    - **Validates: Requirements 9.1**

  - [ ] 10.3 Implement `BookingService.confirmBooking` with pessimistic locking (`src/modules/booking/booking.service.ts`)
    - Open Sequelize transaction at `REPEATABLE_READ` isolation
    - `Booking.findOne({ where: { id, coordinatorId, status: 'PENDING' }, lock: LOCK.UPDATE, transaction })` → 404 if absent
    - `Booking.findAll` with overlap predicate and `lock: LOCK.UPDATE` on the same transaction → 409 if `conflicts.length > 0`, rollback
    - On no conflict: set `booking.status = 'CONFIRMED'`, `booking.save({ transaction })`, commit → return DTO
    - Catch block: rollback if `!txn.finished`, re-throw to Global Error Handler
    - _Requirements: 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 10.4 Write property test for exactly-one-winner concurrency — Property 21
    - **Property 21: Exactly-One-Winner Under Concurrent Confirmation**
    - Seed a venue + two overlapping PENDING bookings, fire both `confirmBooking` calls concurrently via `Promise.all`, assert exactly one HTTP 200 and one HTTP 409, assert exactly one CONFIRMED booking in DB
    - Tag: `// Feature: book-my-venue, Property 21: Exactly-One-Winner Under Concurrent Confirmation`
    - **Validates: Requirements 9.3, 9.4, 9.5, 10.1, 10.2**

  - [ ] 10.5 Implement `BookingService.cancelBooking` and `listBookings`
    - `cancelBooking`: find booking (→ 404), check `coordinatorId` (→ 403), check not already CANCELLED (→ 409), set CANCELLED, save → return DTO
    - `listBookings`: `Booking.findAll({ where: { coordinatorId }, order: [['createdAt','DESC']] })`
    - _Requirements: 9.6, 9.7, 9.8, 9.9_

  - [ ]* 10.6 Write property test for cancellation state machine — Property 23
    - **Property 23: Cancellation State Machine**
    - Use `fast-check` to generate bookings in PENDING and CONFIRMED states, cancel once (assert CANCELLED), cancel again (assert HTTP 409)
    - Tag: `// Feature: book-my-venue, Property 23: Cancellation State Machine`
    - **Validates: Requirements 9.6, 9.7**

  - [ ]* 10.7 Write property test for booking ownership isolation — Property 22
    - **Property 22: Booking Ownership Isolation**
    - Use `fast-check` to generate two distinct coordinator IDs, create a booking under coordinator A, attempt confirm/cancel/list as coordinator B, assert HTTP 403
    - Tag: `// Feature: book-my-venue, Property 22: Booking Ownership Isolation`
    - **Validates: Requirements 9.8**

  - [ ] 10.8 Implement booking Celebrate/Joi validators (`src/modules/booking/booking.validators.ts`)
    - `createBookingSchema`: venueId (UUID v4), startTime (isoDate), endTime (isoDate) — custom cross-field validation `endTime > startTime`
    - _Requirements: 11.1, 11.3_

  - [ ]* 10.9 Write property test for booking datetime ordering — Property 2
    - **Property 2: Booking Datetime Ordering**
    - Use `fast-check` to generate pairs where `endTime <= startTime` and assert HTTP 422 is returned for all such payloads
    - Tag: `// Feature: book-my-venue, Property 2: Booking Datetime Ordering`
    - **Validates: Requirements 11.3**

  - [ ] 10.10 Implement booking controller and routes (`src/modules/booking/booking.routes.ts`, `booking.controller.ts`)
    - Apply `authenticate` + `checkRole(['COORDINATOR'])` to all booking routes
    - Wire `POST /api/bookings`, `GET /api/bookings`, `POST /api/bookings/:id/confirm`, `POST /api/bookings/:id/cancel` with validators
    - Mount router in `src/app.ts`
    - _Requirements: 4.4, 9.1, 9.3, 9.6, 9.9_

- [ ] 11. Pagination invariant property tests
  - [ ]* 11.1 Write property test for pagination result size invariant — Property 19
    - **Property 19: Pagination Result Size Invariant**
    - Use `fast-check` to generate arbitrary `pageSize` values (1–100) for user list and venue search endpoints, assert `response.data.length <= pageSize`
    - Tag: `// Feature: book-my-venue, Property 19: Pagination Result Size Invariant`
    - **Validates: Requirements 5.1, 8.6**

- [ ] 12. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with `numRuns: 100` minimum per property
- Unit/integration tests should cover happy-path, error-path, and the concurrency scenario (Property 21) using a real MySQL instance (Docker in CI)
- All 23 correctness properties from the design document are covered by `*` sub-tasks
- Booking confirmation (task 10.3) is the highest-risk path — review the pessimistic locking implementation carefully before marking complete

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.7"] },
    { "id": 4, "tasks": ["2.6"] },
    { "id": 5, "tasks": ["3.1", "3.3", "3.5"] },
    { "id": 6, "tasks": ["3.2", "3.4", "3.6", "5.8"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.9"] },
    { "id": 9, "tasks": ["6.1", "7.1", "7.6"] },
    { "id": 10, "tasks": ["6.2", "7.2", "7.3", "7.4", "7.5", "7.7"] },
    { "id": 11, "tasks": ["9.1", "10.1", "10.5", "10.8"] },
    { "id": 12, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "10.2", "10.3", "10.9", "10.10"] },
    { "id": 13, "tasks": ["10.4", "10.6", "10.7", "11.1"] }
  ]
}
```
