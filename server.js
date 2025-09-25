import express from "express";
import cron from "node-cron";
import { processAllTokens, getCachedBurnData, TOKEN_MAP } from "./cron-job/job.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Store latest results and cache metadata
let burnData = {};
let lastUpdateDate = null;

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Manual trigger endpoint (for testing/emergency updates)
app.post("/trigger-update", async (req, res) => {
  try {
    console.log("Manual update triggered");
    res.json({ message: "Update started", timestamp: new Date().toISOString() });
    await runDailyJob(); // Run in background
  } catch (error) {
    console.error("Manual update failed:", error);
    res.status(500).json({ error: "Update failed", message: error.message });
  }
});

// Serve latest burn data
app.get("/burn-data", (req, res) => {
  if (Object.keys(burnData).length === 0) {
    return res.status(503).json({
      error: "Burn data not yet available",
      message: "Please wait for the daily data update at 6pm UTC",
      nextUpdate: getNext6pmUTC().toISOString()
    });
  }

  // Check if data is stale (more than 25 hours old)
  const isStale = lastUpdateDate &&
    (new Date() - new Date(lastUpdateDate)) > (25 * 60 * 60 * 1000);

  res.json({
    ...burnData,
    cacheInfo: {
      lastUpdate: lastUpdateDate,
      nextUpdate: getNext6pmUTC().toISOString(),
      isStale: isStale,
      dataAge: lastUpdateDate ?
        Math.round((new Date() - new Date(lastUpdateDate)) / (60 * 60 * 1000)) + " hours" :
        "unknown"
    }
  });
});

// Helper function to get next 6pm UTC
function getNext6pmUTC() {
  const now = new Date();
  const next6pm = new Date();
  next6pm.setUTCHours(18, 0, 0, 0); // Set to 6pm UTC

  // If it's already past 6pm today, schedule for tomorrow
  if (now >= next6pm) {
    next6pm.setUTCDate(next6pm.getUTCDate() + 1);
  }

  return next6pm;
}

// Helper function to check if we have today's data
function isTodaysData() {
  if (!lastUpdateDate) return false;

  const today = new Date();
  const updateDate = new Date(lastUpdateDate);

  return (
    today.getUTCFullYear() === updateDate.getUTCFullYear() &&
    today.getUTCMonth() === updateDate.getUTCMonth() &&
    today.getUTCDate() === updateDate.getUTCDate() &&
    updateDate.getUTCHours() >= 18 // Must be from 6pm or later
  );
}

// Load cached data from Firebase on startup
async function loadCachedData() {
  console.log("Loading cached burn data from Firebase...");
  try {
    // Get token names from the imported TOKEN_MAP
    const tokenNames = Object.keys(TOKEN_MAP);
    const cachedData = {};
    let loadedCount = 0;

    for (const tokenName of tokenNames) {
      try {
        const data = await getCachedBurnData(tokenName);
        if (data && data.lastUpdated) {
          cachedData[tokenName] = data;
          loadedCount++;
        }
      } catch (error) {
        console.warn(`Failed to load cached data for ${tokenName}:`, error.message);
      }
    }

    if (Object.keys(cachedData).length > 0) {
      burnData = cachedData;
      // Get the most recent lastUpdated timestamp
      const timestamps = Object.values(cachedData)
        .map(data => data.lastUpdated)
        .filter(Boolean)
        .sort()
        .reverse();

      if (timestamps.length > 0) {
        lastUpdateDate = timestamps[0];
        console.log(`✅ Loaded cached data for ${loadedCount}/${tokenNames.length} tokens from ${lastUpdateDate}`);
      }
    } else {
      console.log("⚠️ No cached data found");
    }
  } catch (error) {
    console.error("❌ Error loading cached data:", error);
  }
}

// Daily job function
async function runDailyJob() {
  const startTime = new Date();
  console.log(`🔄 Starting daily burn data processing at ${startTime.toISOString()}...`);

  try {
    const result = await processAllTokens();
    if (result && Object.keys(result).length > 0) {
      burnData = result;
      lastUpdateDate = startTime.toISOString();
      const duration = ((new Date() - startTime) / 1000).toFixed(2);
      console.log(`✅ Daily job completed successfully in ${duration}s at ${lastUpdateDate}`);
      console.log(`📊 Updated data for ${Object.keys(result).length} tokens`);
    } else {
      console.error("❌ Daily job failed - no data returned");
    }
  } catch (error) {
    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    console.error(`❌ Daily job failed after ${duration}s: ${error.message}`);
    console.error(error.stack);
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

// Start server and setup cron job
app.listen(PORT, async () => {
  console.log(`🚀 API running on port ${PORT}`);

  // Load any existing cached data
  await loadCachedData();

  // Schedule daily job at 6pm UTC (18:00)
  cron.schedule('0 18 * * *', runDailyJob, {
    scheduled: true,
    timezone: "UTC"
  });

  console.log(`📅 Daily job scheduled for 6pm UTC`);
  console.log(`⏰ Next run: ${getNext6pmUTC().toISOString()}`);

  // If we don't have today's data, run the job now (for initial setup)
  if (!isTodaysData()) {
    console.log("🔄 No current data found, running initial job...");
    await runDailyJob();
  } else {
    console.log("✅ Using cached data from today");
  }
});