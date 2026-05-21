import { processAllTokens } from "./cron-job/job.js";

console.log(`Daily burn job started at ${new Date().toISOString()}`);

try {
  await processAllTokens();
  console.log(`Daily burn job completed at ${new Date().toISOString()}`);
  process.exit(0);
} catch (error) {
  console.error("Daily burn job failed:", error.message);
  process.exit(1);
}
