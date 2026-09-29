import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import { clerkMiddleware } from "@clerk/express";

// Load environment variables
dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(clerkMiddleware());

// Test route
app.get("/health", (_, res) => {
  res.status(200).json({
    message: "iMessage Backend is healthy...",
    timestamp: new Date().toLocaleString(),
  });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  });
