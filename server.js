import express from "express";
import cron from "node-cron";
import { processAllTokens } from "./cron-job/job.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Store latest results
let burnData = {};

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve latest burn data
app.get("/burn-data", (req, res) => {
  if (Object.keys(burnData).length === 0) {
    return res.status(503).json({ error: "Burn data not yet available" });
  }
  res.json(burnData);
});

// Dynamic scheduling function
async function runAndSchedule() {
  console.log(`Starting token processing at ${new Date().toISOString()}...`);
  try {
    const result = await processAllTokens(); // Wait for all tokens to process
    burnData = result || burnData; // Update burnData
    console.log(`Completed processing at ${new Date().toISOString()}. Scheduling next run in 5 minutes...`);

    // Schedule the next run 5 minutes from now
    const nextRun = new Date(Date.now() + 5 * 60 * 1000);
    cron.schedule(
      `${nextRun.getSeconds()} ${nextRun.getMinutes()} ${nextRun.getHours()} * * *`,
      async () => {
        await runAndSchedule(); // Recursively schedule after completion
      },
      { scheduled: true, timezone: "Europe/Paris" } // CEST timezone
    );
  } catch (error) {
    console.error(`Error in runAndSchedule: ${error.message}`);
    // Schedule retry in 5 minutes if it fails
    const retryRun = new Date(Date.now() + 5 * 60 * 1000);
    cron.schedule(
      `${retryRun.getSeconds()} ${retryRun.getMinutes()} ${retryRun.getHours()} * * *`,
      async () => {
        await runAndSchedule();
      },
      { scheduled: true, timezone: "Europe/Paris" }
    );
  }
}

// Global error handling
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start server and initial job
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
  runAndSchedule(); // Start the first run
});