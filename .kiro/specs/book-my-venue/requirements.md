# Requirements Document

## Introduction

Book My Venue is a multi-tenant SaaS backend built on Node.js, Express, and TypeScript with MySQL 8.0+ and Sequelize ORM. It exposes a REST API that supports three user roles — Super Admin, Venue Owner, and Event Coordinator — and orchestrates a venue approval workflow, a booking lifecycle with pessimistic concurrency control, and JWT-based authentication with refresh token rotation. The backend is production-ready and ships with Joi/Celebrate request validation, global error-handling middleware, RBAC enforcement, and an `.env.example` scaffold.

---

## Glossary

- **System**: The Book My Venue backend application.
- **Auth Service**: The subsystem responsible for issuing, validating, and revoking JWT access and refresh tokens.
- **User**: A registered account stored in the `users` table, carrying one of three roles.
- **Super Admin (SUPER_ADMIN)**: A platform operator who manages all users and approves venue listings.
- **Venue Owner (VENUE_OWNER)**: A user who registers and manages venue listings scoped to their `owner_id`.
- **Event Coordinator (COORDINATOR)**: A user who searches approved venues and creates bookings.
- **Venue**: A resource record containing Name, Capacity, Address, Hourly Price, and optional metadata fields.
- **Booking**: A time-bound reservation of a Venue with a defined lifecycle.
- **Booking Lifecycle**: The ordered state machine: `PENDING` → `CONFIRMED` → `CANCELLED`.
- **Conflict Check**: The overlap predicate `(requested_start < existing_end) AND (requested_end > existing_start)` applied to confirmed bookings for the same venue.
- **Pessimistic Lock**: A `SELECT ... FOR UPDATE` row-level lock acquired inside a MySQL ACID transaction before confirming a booking.
- **RBAC Middleware**: The `checkRole([...])` Express middleware that rejects requests whose JWT role claim is not in the allowed list.
- **Celebrate**: The Express middleware wrapper around Joi that validates incoming request payloads and returns structured 422 errors.
- **Refresh Token**: An opaque, long-lived token stored in the `refresh_tokens` MySQL table, used to obtain new access tokens and support revocation per device.
- **Tenant Isolation**: Enforcement that a Venue Owner can only read or mutate their own venue records, identified by `owner_id`.
- **Venue Approval Workflow**: The state transition `PENDING_APPROVAL` → `APPROVED` gated by a Super Admin action.
- **Global Error Handler**: An Express `(err, req, res, next)` middleware registered last in the middleware chain that normalises all thrown errors into a consistent JSON response shape.

---

## Requirements

### Requirement 1: Project Scaffold and Configuration

**User Story:** As a developer, I want a production-ready project scaffold, so that the codebase follows consistent structure, validation, and environment-variable conventions from day one.

#### Acceptance Criteria

1. THE System SHALL implement a layered directory structure separating Routes, Controllers, Services, and Repositories/Models.
2. THE System SHALL include a `.env.example` file listing every required environment variable with placeholder values and inline comments.
3. THE System SHALL load all runtime configuration from environment variables and SHALL raise a startup error when any required variable is absent.
4. THE System SHALL register Celebrate (Joi) validation middleware on every route that accepts a request body or query parameters, and SHALL return HTTP 422 with a structured error payload when validation fails.
5. THE System SHALL register a Global Error Handler as the last middleware in the Express chain that intercepts all unhandled errors and returns a JSON response containing `status`, `message`, and optional `errors` fields.
6. WHEN an unhandled promise rejection or uncaught exception occurs, THE System SHALL log the error and exit the process with a non-zero code.

---

### Requirement 2: Authentication: Registration and Login

**User Story:** As a user, I want to register and log in with email and password, so that I can obtain JWT tokens to access protected API endpoints.

#### Acceptance Criteria

1. WHEN a registration request is received with a unique email, name, password, and a valid role (`VENUE_OWNER` or `COORDINATOR`), THE Auth Service SHALL create a user record in the `users` table with a bcrypt-hashed password and return HTTP 201.
2. IF a registration request is received with an email that already exists in the `users` table, THEN THE Auth Service SHALL return HTTP 409 with a descriptive error message.
3. WHEN a login request is received with valid credentials, THE Auth Service SHALL return an access token (JWT, short-lived) and a refresh token (opaque, long-lived) in the response body.
4. WHEN a login request is received with invalid credentials, THE Auth Service SHALL return HTTP 401.
5. THE Auth Service SHALL store each issued refresh token as a row in the `refresh_tokens` table, associating it with the user ID and device identifier.
6. WHEN a refresh-token rotation request is received with a valid, non-revoked refresh token, THE Auth Service SHALL issue a new access token and a new refresh token, and SHALL invalidate the previously used refresh token row.
7. IF a refresh-token rotation request is received with a revoked or non-existent refresh token, THEN THE Auth Service SHALL return HTTP 401.
8. WHEN a logout request is received with a valid refresh token, THE Auth Service SHALL mark that specific refresh token row as revoked, leaving all other device sessions unaffected.

---

### Requirement 3: JWT Access Token Verification

**User Story:** As the platform, I want every protected endpoint to verify the access token, so that only authenticated requests are processed.

#### Acceptance Criteria

1. THE Auth Service SHALL expose an Express middleware that extracts the Bearer token from the `Authorization` header and validates its signature and expiry.
2. IF a request reaches a protected route without a `Authorization: Bearer <token>` header, THEN THE Auth Service SHALL return HTTP 401.
3. IF a request presents an expired or tampered access token, THEN THE Auth Service SHALL return HTTP 401.
4. WHEN a valid access token is verified, THE Auth Service SHALL attach the decoded payload (user ID, role) to the request context for downstream middleware and controllers.

---

### Requirement 4: Role-Based Access Control

**User Story:** As the platform, I want RBAC enforced at the route level, so that users can only access endpoints permitted for their role.

#### Acceptance Criteria

1. THE System SHALL provide a `checkRole([...roles])` middleware factory that accepts an array of permitted roles and rejects requests whose token role is not in that array with HTTP 403.
2. THE System SHALL apply `checkRole(['SUPER_ADMIN'])` to all Admin Module routes.
3. THE System SHALL apply `checkRole(['VENUE_OWNER'])` to all Venue Owner Module routes.
4. THE System SHALL apply `checkRole(['COORDINATOR'])` to all Event Coordinator booking routes.
5. WHEN a request passes RBAC, THE System SHALL invoke the next middleware in the chain without modification.

---

### Requirement 5: Admin Module: User Management

**User Story:** As a Super Admin, I want to manage platform users, so that I can approve, suspend, or remove accounts to maintain platform integrity.

#### Acceptance Criteria

1. WHEN a Super Admin requests the user list, THE System SHALL return a paginated list of all user records including ID, name, email, role, and account status.
2. WHEN a Super Admin suspends a user by ID, THE System SHALL set that user's `status` to `SUSPENDED` and SHALL return HTTP 200.
3. IF a Super Admin attempts to suspend a user ID that does not exist, THEN THE System SHALL return HTTP 404.
4. WHEN a Super Admin approves a user by ID, THE System SHALL set that user's `status` to `ACTIVE` and SHALL return HTTP 200.
5. THE System SHALL prevent a suspended user from obtaining a valid access token during login.

---

### Requirement 6: Venue Approval Workflow

**User Story:** As a Super Admin, I want to approve venue submissions, so that only vetted venues are visible to Event Coordinators.

#### Acceptance Criteria

1. WHEN a Super Admin approves a venue by ID, THE System SHALL transition the venue's `approval_status` from `PENDING_APPROVAL` to `APPROVED` and SHALL return HTTP 200.
2. IF a Super Admin attempts to approve a venue that is not in `PENDING_APPROVAL` status, THEN THE System SHALL return HTTP 409.
3. IF a Super Admin attempts to approve a venue ID that does not exist, THEN THE System SHALL return HTTP 404.
4. WHILE a venue's `approval_status` is `PENDING_APPROVAL` or any status other than `APPROVED`, THE System SHALL exclude that venue from Event Coordinator search results.

---

### Requirement 7: Venue Owner Module: Venue Management

**User Story:** As a Venue Owner, I want to create and manage my venue listings, so that Event Coordinators can discover and book them.

#### Acceptance Criteria

1. WHEN a Venue Owner submits a create-venue request with Name, Capacity, Address, and Hourly Price, THE System SHALL persist the venue record with `approval_status` set to `PENDING_APPROVAL`, `owner_id` set to the authenticated user's ID, and SHALL return HTTP 201.
2. THE System SHALL enforce tenant isolation so that a Venue Owner's read, update, and delete operations are restricted to venues where `owner_id` matches the authenticated user's ID.
3. IF a Venue Owner attempts to access or mutate a venue where `owner_id` does not match the authenticated user's ID, THEN THE System SHALL return HTTP 403.
4. WHEN a Venue Owner requests their venue list, THE System SHALL return all venues owned by that user regardless of `approval_status`.
5. WHEN a Venue Owner updates a venue's fields (Name, Capacity, Address, Hourly Price, or metadata), THE System SHALL persist the changes and SHALL return the updated venue record.
6. THE System SHALL accept optional metadata as a JSON object on venue creation and update, and SHALL store it in a dedicated column.

---

### Requirement 8: Event Coordinator Module: Venue Search

**User Story:** As an Event Coordinator, I want to search and filter approved venues, so that I can find a venue that meets my event's capacity and budget requirements.

#### Acceptance Criteria

1. WHEN an Event Coordinator requests the venue search endpoint, THE System SHALL return only venues with `approval_status` equal to `APPROVED`.
2. WHERE a `min_capacity` or `max_capacity` query parameter is provided, THE System SHALL filter results to venues whose Capacity falls within the specified range.
3. WHERE a `max_hourly_price` query parameter is provided, THE System SHALL filter results to venues whose Hourly Price is less than or equal to the specified value.
4. WHERE `available_from` and `available_to` query parameters are provided, THE System SHALL exclude venues that have at least one `CONFIRMED` booking whose time range overlaps with the requested interval, using the predicate `(available_from < existing_end) AND (available_to > existing_start)`.
5. WHEN a search request is received without any filter parameters, THE System SHALL return all `APPROVED` venues.
6. THE System SHALL return venue search results as a paginated list, with default page size configurable via environment variable.

---

### Requirement 9: Booking Engine: Lifecycle Management

**User Story:** As an Event Coordinator, I want to create and manage bookings, so that I can reserve a venue for my event with confidence that no double-booking can occur.

#### Acceptance Criteria

1. WHEN an Event Coordinator submits a booking request with a valid venue ID, start datetime, and end datetime, THE System SHALL create a booking record with `status` set to `PENDING` and SHALL return HTTP 201.
2. IF an Event Coordinator submits a booking request for a venue that does not have `approval_status` equal to `APPROVED`, THEN THE System SHALL return HTTP 422.
3. WHEN an Event Coordinator requests confirmation of a `PENDING` booking, THE System SHALL open a MySQL ACID transaction, acquire a `SELECT ... FOR UPDATE` pessimistic lock on the target venue's relevant booking rows, and perform a conflict check against all `CONFIRMED` bookings for the same venue using the predicate `(requested_start < existing_end) AND (requested_end > existing_start)`.
4. WHEN the conflict check passes, THE System SHALL transition the booking `status` to `CONFIRMED`, commit the transaction, and return HTTP 200.
5. IF the conflict check finds an overlapping `CONFIRMED` booking, THEN THE System SHALL rollback the transaction and return HTTP 409 with a message indicating the time slot is unavailable.
6. WHEN an Event Coordinator cancels a `PENDING` or `CONFIRMED` booking, THE System SHALL transition the booking `status` to `CANCELLED` and SHALL return HTTP 200.
7. IF an Event Coordinator attempts to cancel a booking whose `status` is already `CANCELLED`, THEN THE System SHALL return HTTP 409.
8. THE System SHALL restrict booking read and mutation operations to the Event Coordinator who created the booking, returning HTTP 403 for any attempt by another user.
9. WHEN an Event Coordinator requests their booking list, THE System SHALL return all bookings associated with that coordinator's user ID, including current `status`.

---

### Requirement 10: Data Integrity and Concurrency

**User Story:** As the platform, I want all booking state transitions to be atomic and isolated, so that concurrent confirmation requests cannot produce double-bookings.

#### Acceptance Criteria

1. THE System SHALL wrap the booking confirmation flow (lock acquisition, conflict check, status update) inside a single Sequelize-managed MySQL transaction with `SERIALIZABLE` or `REPEATABLE READ` isolation.
2. WHEN two concurrent confirmation requests target the same venue and overlapping time slots, THE System SHALL allow exactly one to succeed and SHALL return HTTP 409 to the other.
3. THE System SHALL release all acquired row-level locks when the transaction commits or rolls back.
4. IF a database error occurs during the transaction, THEN THE System SHALL rollback the transaction and propagate the error to the Global Error Handler.

---

### Requirement 11: Input Validation

**User Story:** As the platform, I want all incoming request data validated before reaching business logic, so that invalid inputs are rejected early with actionable error messages.

#### Acceptance Criteria

1. THE System SHALL define a Celebrate/Joi schema for every route that accepts a request body, path parameter, or query string.
2. WHEN a request body fails schema validation, THE System SHALL return HTTP 422 with a JSON payload listing each failed field and its validation message.
3. THE System SHALL validate that datetime fields conform to ISO 8601 format and that `end datetime` is strictly after `start datetime` in booking requests.
4. THE System SHALL validate that numeric fields (Capacity, Hourly Price) are positive numbers.
5. THE System SHALL validate that the `role` field on registration accepts only `VENUE_OWNER` or `COORDINATOR` as valid values.
