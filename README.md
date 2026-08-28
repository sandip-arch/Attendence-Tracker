# Attendance Tracker

A lightweight, secure, and containerized student attendance tracking web application built with **Node.js, Express, and MongoDB (Mongoose)**. It features role-based access control, Google OAuth 2.0 integration, automated frontend code obfuscation, and Excel spreadsheet exports.

---

## Key Features

- **Docker-Style Auth Portal**: A clean, modern login and sign-up interface styled after the Docker login screens.
- **Google OAuth 2.0 Integration**: Redirection-based sign-in and registration flow.
- **Double-Layer Dashboards**:
  - **Admin**: Approve registrations, manage sessions, verify check-in/out timestamps, insert manual records, and export to Excel.
  - **Student**: View assigned schedules, perform check-in and check-out logs with a live ticking clock, and view historical logs.
- **IST Timezone Locked**: Automatically records attendance timestamps in Indian Standard Time (IST - `Asia/Kolkata`) regardless of the host server location.
- **Client Code Protection**: Automatic compilation build step that obfuscates and minifies browser-facing JavaScript (`app.js`) to secure backend API routes.
- **Docker Ready**: Pre-configured `Dockerfile` and `.dockerignore` for containerized hosting.

---

## Getting Started

### 1. Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/) (Local database or MongoDB Atlas cloud cluster)
- [Docker](https://www.docker.com/) (Optional, for containerized running)

### 2. Environment Configuration

Create a `.env` file in the root directory of your project and configure the variables:

```env
# Server Port
PORT=3000

# MongoDB Atlas or Local Connection String
MONGO_URI=your_mongodb_connection_string

# JWT Secret Key for Session Authentication
JWT_SECRET=your_jwt_secret_key

# Google OAuth Credentials (Optional / Required for Google Sign-in)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Optional: Override callback URI explicitly
# GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
```

*Note: If `GOOGLE_CLIENT_ID` is omitted, the portal automatically operates in **Demo Mock Mode** for convenient testing.*

### 3. Local Installation & Run

1. Clone the repository and navigate to the project directory:
   ```bash
   cd attendance-tracker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:3000`.

---

## Building and Obfuscating Code

For security, the client-side JavaScript (`app.js`) is obfuscated before going live. To run the build step locally:

```bash
npm run build
```

This compiles and scrambles the variables and API logic inside `public/js/app.js` to protect it from clients.

---

## Hosting on Docker

1. **Build the Docker Image**:
   ```bash
   docker build -t attendance-tracker .
   ```
2. **Run the Container**:
   Pass your local environment variables file (`.env`) directly to configure the container instance:
   ```bash
   docker run -d -p 3000:3000 --env-file .env --name attendance-app attendance-tracker
   ```
3. Access your application at `http://localhost:3000`.

---

## Deployment on Render

This project is configured to deploy out-of-the-box on Render:

1. Connect your GitHub repository to a new **Web Service** in Render.
2. In the configuration settings:
   - **Environment**: `Node` (or select `Docker` if you wish to build via the `Dockerfile`).
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. In **Environment Variables**, add your `MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.
4. Render will build and deploy the app securely!
