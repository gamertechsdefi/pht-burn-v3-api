// index.js
import express from 'express';
import { processAllTokens } from './cron-job/job.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON (if needed for other endpoints)
app.use(express.json());

// Store latest results
let burnData = {};

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint to serve burn data
app.get('/burn-data', (req, res) => {
  if (Object.keys(burnData).length === 0) {
    return res.status(503).json({ error: 'Burn data not yet available' });
  }
  res.json(burnData);
});

// Background job to process tokens every 5 minutes
async function startJobLoop() {
  while (true) {
    try {
      console.log('Starting token processing...');
      const result = await processAllTokens(); // Assuming it returns data
      burnData = result || burnData; // Only update if result is valid
      console.log('Burn data updated successfully');
    } catch (err) {
      console.error('Failed to process tokens:', err.message);
      // Optionally log stack trace for debugging
      console.error(err.stack);
    }
    // Wait 5 minutes before next iteration
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  }
}

// Error handling for uncaught exceptions to prevent process crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
  // Note: Not exiting process to keep it running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Note: Not exiting process to keep it running
});

// Start the server
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  // Start background job in a non-blocking way
  startJobLoop().catch((err) => {
    console.error('Failed to start job loop:', err.message);
  });
});