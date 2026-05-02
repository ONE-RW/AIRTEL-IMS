# HRMS

This directory now holds the separate HRMS system you described.

What is inside:

- `backend/server.js`: HRMS API server
- `backend/db.js`: HRMS database connection
- `backend/.env.example`: HRMS environment template
- `database/schema.sql`: HRMS database schema

Main HRMS API endpoints:

- `POST /api/auth/login`
- `GET /api/employees`
- `GET /api/employees/:id`
- `POST /api/employees`
- `PUT /api/employees/:id`

Default local run target:

- HRMS backend: `http://127.0.0.1:4200`

IMS integration:

- IMS now expects HRMS as an external API.
- IMS defaults to `http://127.0.0.1:4200` unless `HRMS_API_BASE_URL` is overridden in IMS backend `.env`.
- When IMS creates or links an IMS employee account from HRMS data, it pushes `imsUserId` and `imsAccountStatus` back into HRMS so both systems stay aligned.
