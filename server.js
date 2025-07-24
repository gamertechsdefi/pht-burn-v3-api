// index.js
import express from 'express';
import cron from 'node-cron';
import { processAllTokens } from './cron-job/job.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Store latest results
let burnData = {};

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve latest burn data
app.get('/burn-data', (req, res) => {
  if (Object.keys(burnData).length === 0) {
    return res.status(503).json({ error: 'Burn data not yet available' });
  }
  res.json(burnData);
});

// Run the job immediately once on server start
async function runInitialJob() {
  try {
    console.log('Running initial burn data job...');
    const result = await processAllTokens();
    burnData = result || burnData;
    console.log('Initial burn data updated successfully');
  } catch (err) {
    console.error('Initial job failed:', err.message);
  }
}

// Schedule job every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('⏰ Scheduled burn job started...');
    const result = await processAllTokens();
    burnData = result || burnData;
    console.log('✅ Burn data updated via cron');
  } catch (err) {
    console.error('Scheduled job failed:', err.message);
  }
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
  runInitialJob(); // Initial fetch before first cron trigger
});
