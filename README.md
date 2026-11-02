# 🏆 Contest Management System (Backend)

A **Node.js + Express + MongoDB** backend for managing contests, user participation, questions, scoring, leaderboards, and automated prize distribution.  
Built as part of the **TenTwenty Backend Assignment**, this project emphasizes **clean architecture**, **security**, and **production-ready design**.

---

## ✈️ BLR Navigator MVP (`apps/web`)

This repository also contains an independent **BLR Navigator** prototype built from the BLR Navigator
PRD. It is a separate Vue 3 + TypeScript app and does **not** modify the contest-management backend.

BLR Navigator lets a passenger plan a departing or layover journey without an account, review demo or
manually entered flight details, search a schematic Terminal 1/2 map, calculate a demo walking route,
and see connection timing with conservative warnings.

```bash
cd apps/web
npm install
npm run dev       # local development
npm run test      # Vitest unit tests
npm run build     # typecheck + production build
```

> **Important:** the bundled map and flight data is demonstration data. Terminal floors, gates, POIs,
> walking edges, and access rules are unverified and are not for live airport navigation. Live flight
> lookup is feature-flagged off by default; manual entry and deterministic demo flights always work.
> Airline and airport instructions take precedence.

See [`apps/web/README.md`](apps/web/README.md), [`apps/web/docs/data-sources.md`](apps/web/docs/data-sources.md),
[`apps/web/docs/map-verification.md`](apps/web/docs/map-verification.md), and
[`apps/web/docs/flight-provider-proxy.md`](apps/web/docs/flight-provider-proxy.md).

---

## 🚀 Features

- 🧑‍💼 **User Management**
  - Register / Login with role-based access (Admin, VIP, Normal)
  - JWT Authentication and secure password hashing

- 🏁 **Contest Management**
  - Create Normal or VIP contests
  - Tracks participants and current top scorer automatically

- ❓ **Question Management**
  - Add single-select, multi-select, or boolean questions per contest

- 🧮 **Participation & Scoring**
  - Users can start and submit contests
  - Scores automatically calculated based on correct answers

- 🏅 **Leaderboard & Prizes**
  - Periodic cron job checks for ended contests and awards prizes

- 🔒 **Security**
  - Environment-based secrets (`.env`)
  - Express Rate Limiting for abuse prevention
  - Request validation using Joi

---

## 🧩 Tech Stack

| Component | Technology |
|------------|-------------|
| **Runtime** | Node.js (v18+) |
| **Framework** | Express.js |
| **Database** | MongoDB (Mongoose ODM) |
| **Authentication** | JWT |
| **Validation** | Joi |
| **Rate Limiting** | express-rate-limit |
| **Scheduling** | node-cron |
| **Deployment** | Render |

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/pratap011/contestManagement.git
cd contestManagement

2️⃣ Install Dependencies
npm install

3️⃣ Create .env File

In the root directory, create a .env file and add the following variables:

PORT=5000
MONGO_URI=<your-mongodb-connection-uri>
JWT_KEY=<your-secret-jwt-key>

4️⃣ Start the Server
npm start
```
### This project uses MongoDB as primary database hence mongoDB is a prerequisite to run the code. 
## Live link
https://contestmanagement.onrender.com/

## Note
- The cron job wont function on the deployment since it is on a free tier and not supported.

## Improvements
- In current implementation, frontend is not available and that can be added.
- Write operations can be faster with PostgreSQL
- Caching operations for fettching popular contests is not implemented. 
