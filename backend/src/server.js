import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { clerkMiddleware } from "@clerk/express";
import { initKeepAliveCron } from "./lib/cron.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// backend/src 기준 루트의 frontend/dist 경로
const distPath = path.resolve(__dirname, "../../frontend/dist");

// Load environment variables (supports root and backend folder execution)
const envPath = fs.existsSync(path.resolve(__dirname, "../.env"))
  ? path.resolve(__dirname, "../.env")
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

// Production: Serve static assets directly before general middleware
if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.use(express.json());
app.use(clerkMiddleware());

// Health check route
app.get("/health", (_, res) => {
  res.status(200).json({
    message: "iMessage Backend is healthy...",
    timestamp: new Date().toLocaleString(),
  });
});

// Production: SPA Fallback (Serve index.html for all client-side routes)
if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: err.message || "Internal Server Error",
  });
});

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
