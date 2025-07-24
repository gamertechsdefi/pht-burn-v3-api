import cron from "node-cron";
import { processAllTokens } from "./cron-job/job.js";
import dotenv from "dotenv";

dotenv.config();

// Dynamic scheduling function
async function runAndSchedule() {
  console.log(`Starting token processing at ${new Date().toISOString()}...`);
  try {
    const result = await processAllTokens(); // Wait for all tokens to process
    console.log(`Completed processing at ${new Date().toISOString()}. Scheduling next run in 5 minutes...`);

    // Schedule the next run 5 minutes from now
    const nextRun = new Date(Date.now() + 5 * 60 * 1000);
    cron.schedule(
      `${nextRun.getSeconds()} ${nextRun.getMinutes()} ${nextRun.getHours()} * * *`,
      async () => {
        await runAndSchedule(); // Recursively schedule after completion
      },
      { scheduled: true, timezone: "Africa/Nigeria" } // CEST timezone
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

// Start the first run
console.log("Initializing cron job...");
runAndSchedule();