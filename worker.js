// worker.js
import { processAllTokens, saveBurnDataToFirebase } from "./cron-job/job.js";

async function runWorker() {
  while (true) {
    try {
      console.log(`Starting processing at ${new Date().toISOString()}`);
      await processAllTokens();
      console.log(`Completed processing, waiting 5 minutes...`);
      
      // Wait 5 minutes
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    } catch (error) {
      console.error("Worker error:", error.message);
      // Wait 1 minute before retrying on error
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    }
  }
}

runWorker();