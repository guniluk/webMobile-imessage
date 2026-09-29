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

// Load environment variables (supports root and backend folder execution)
const envPath = fs.existsSync(path.resolve(__dirname, "../.env"))
  ? path.resolve(__dirname, "../.env")
  : path.resolve(".env");
dotenv.config({ path: envPath, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Static Assets Serving (Must be placed before CORS and auth middleware for optimal performance)
const candidateDistPaths = [
  path.resolve(__dirname, "../../frontend/dist"),
  path.resolve(__dirname, "../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist"),
  path.resolve(process.cwd(), "../frontend/dist"),
];
const distPath =
  candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0];

if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// CORS Allowed Origins Setup
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8081", // Expo / React Native
  process.env.CLIENT_URL?.replace(/\/$/, ""),
  process.env.SERVER_URL?.replace(/\/$/, ""),
  process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, ""),
].filter(Boolean);

// 2. CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, same-origin, curl, webhooks)
      if (!origin) return callback(null, true);

      const isAllowed =
        process.env.NODE_ENV !== "production" ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".onrender.com") ||
        origin.includes("localhost");

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(null, false); // Returns 204 / disallows CORS without throwing 500 error
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

// 3. Production: SPA Fallback (Serve index.html for all frontend page routes)
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
