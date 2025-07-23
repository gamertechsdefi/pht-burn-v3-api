// index.js
import express from 'express';
import { processAllTokens } from './cron-job/job.js';

const app = express();
const PORT = process.env.PORT || 3000;

let burnData = {}; // store latest results here

// Run processing job every 5 minutes
async function startJobLoop() {
  while (true) {
    try {
      const result = await processAllTokens(); // assuming it returns data
      burnData = result;
      console.log('Burn data updated');
    } catch (err) {
      console.error('Failed to process tokens:', err);
    }
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000)); // wait 5 mins
  }
}

app.get('/burn-data', (req, res) => {
  res.json(burnData);
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  startJobLoop(); // start background job when server starts
});
