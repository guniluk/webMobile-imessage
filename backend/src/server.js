import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";
import connectDB from "./config/db.js";
import { clerkMiddleware } from "@clerk/express";
import { initKeepAliveCron } from "./lib/cron.js";

// Load environment variables (supports root and backend folder execution)
const envPath = fs.existsSync(path.resolve("backend/.env"))
  ? path.resolve("backend/.env")
  : path.resolve(".env");
dotenv.config({ path: envPath, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Allowed Origins Setup
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8081", // Expo / React Native
  process.env.CLIENT_URL?.replace(/\/$/, ""),
].filter(Boolean);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // 1. origin이 없는 경우 (동일 출처 요청, 모바일 앱 네이티브 요청, Postman, Webhook 등)
      // 2. 개발 환경(development)인 경우 로컬 접속 편의 허용
      // 3. 허용 목록(allowedOrigins)에 포함된 도메인인 경우
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== "production"
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(clerkMiddleware());

// Health check route
app.get("/health", (_, res) => {
  res.status(200).json({
    message: "iMessage Backend is healthy...",
    timestamp: new Date().toLocaleString(),
  });
});

// Production: Serve frontend static build files
if (process.env.NODE_ENV === "production") {
  const distPath = fs.existsSync(path.resolve("frontend/dist"))
    ? path.resolve("frontend/dist")
    : path.resolve("../frontend/dist");

  app.use(express.static(distPath));

  app.get(/.*/, (_, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Initialize keep-alive cron job
      initKeepAliveCron(PORT);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  });
