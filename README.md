# 🏆 Contest Management System (Backend)

A **Node.js + Express + MongoDB** backend for managing contests, user participation, questions, scoring, leaderboards, and automated prize distribution.  
Built as part of the **TenTwenty Backend Assignment**, this project emphasizes **clean architecture**, **security**, and **production-ready design**.

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
## Live link
https://contestmanagement.onrender.com/

## Note
- The cron job wont function on the deployment since it is on a free tier and not supported.

## Improvements
- In current implementation, frontend is not available and that can be added.
- Does not support user prize fetching API as of now (upcoming)
- Write operations can be faster with PostgreSQL
- Caching operations for fetching popular contests is not implemented. 
