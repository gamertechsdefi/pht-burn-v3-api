import { ethers } from "ethers";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig.js";
import dotenv from "dotenv";
dotenv.config();

const RPC_PROVIDERS = [
  new ethers.JsonRpcProvider("https://api.web3auth.io/infura-service/v1/0x38/BMs0lFX6VKciKYAMPzwjy9qyRpxcQUC2Q-4hGXIsmx30HRmXgN17VKlwzbD0wmJCBe4PY2cqw-Psmdq9AG0exVg"),
  new ethers.JsonRpcProvider("https://bsc-mainnet.infura.io/v3/23d12998e0d5431eac05ec4423ff5bcc"),
  new ethers.JsonRpcProvider("https://bsc-mainnet.infura.io/v3/f6c28866910b45d0944895d8e9ef6eb7"),
  new ethers.JsonRpcProvider("https://bsc-mainnet.infura.io/v3/a9e5474684444802be1afdd00713c304"),
  new ethers.JsonRpcProvider("https://billowing-autumn-putty.bsc.quiknode.pro/9f0a8e4f7aca60859ac94c8547d77a29cfabab17/"),
];
const PRIMARY_PROVIDERS = RPC_PROVIDERS.slice(0, 3);
const FALLBACK_PROVIDERS = RPC_PROVIDERS.slice(3);


const BURN_ADDRESSES = [
  "0x000000000000000000000000000000000000dEaD",
  "0x0000000000000000000000000000000000000000",
];

const TOKEN_MAP = {
  pht: "0x885c99a787BE6b41cbf964174C771A9f7ec48e04",
  wkc: "0x6Ec90334d89dBdc89E08A133271be3d104128Edb",
  war: "0x57bfe2af99aeb7a3de3bc0c42c22353742bfd20d",
  dtg: "0xb1957BDbA889686EbdE631DF970ecE6A7571A1B6",
  ocicat: "0xE53D384Cf33294C1882227ae4f90D64cF2a5dB70",
  nene: "0x551877C1A3378c3A4b697bE7f5f7111E88Ab4Af3",
  twc: "0xDA1060158F7D593667cCE0a15DB346BB3FfB3596",
  twd: "0xf00cD9366A13e725AB6764EE6FC8Bd21dA22786e",
  zedek: "0xCbEaaD74dcB3a4227D0E6e67302402E06c119271",
  bengcat: "0xD000815DB567372C3C3d7070bEF9fB7a9532F9e8",
  crystalstones: "0xe252FCb1Aa2E0876E9B5f3eD1e15B9b4d11A0b00",
  cross: "0x72928a49c4E88F382b0b6fF3E561F56Dd75485F9",
  popielno: "0xdc3d92dd5a468edb7a7772452700cc93bb1826ad",
  mbc: "0x170f044f9c7a41ff83caccad6ccca1b941d75af7",
  mars: "0x6844b2e9afb002d188a072a3ef0fbb068650f214",
  sdc: "0x8cDC41236C567511f84C12Da10805cF50Dcdc27b",
  kind: "0x41f52A42091A6B2146561bF05b722Ad1d0e46f8b",
  shibc: "0x456B1049bA12f906326891486B2BA93e46Ae0369",
  pcat: "0xFeD56F9Cd29F44e7C61c396DAc95cb3ed33d3546",
  // "1000pdf": "0xCa7930478492CDe4Be997FA898Cd1a6AfB8F41A1",
  aidove: "0xe9E3CDB871D315fEE80aF4c9FcD4886782694856",
  bbcat: "0x32Eb603F30ba75052f608CFcbAC45e39B5eF9beC",
  cct: "0x8489c022a10a8d2a65eb5aF2b0E4aE0191e7916D",
  talent: "0x38Aec84f305564cB2625430A294382Cf33e3c317",
  daystar: "0x39B4cBC1CE609D736E9aC3BaDd98E95c890731F3",
  zoe:"0x034437C7037317eaAbA782f2aD5B0A54cFcCf726",
  orb:"0x218ce180c6b21a355a55cdbb5b3b3bf7aad5c8a5",
  light: "0x794BF989b667E718FD4053029397CF8BF8CaC4ca",
  spt: "0x3925f2ae71bCd36b9e4284F92f519f3924b2A91a",
  jct: "0x199A88E5BFacc9eAB72913c5F05Ca75D1f30234f",
  amem: "0x0B9237Fc2D9b2bA19023ddBCCF0Dd649092bb649",
  aide: "0xA925EbCF141c5efdDA5c38c569Ab789aa52f0Fc3",
  amem: "0x0b9237fc2d9b2ba19023ddbccf0dd649092bb649",
  griot: "0xa6e3eacdf8e6a1ea02052693838f3653fa3bffff",
};

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
];

const RATE_LIMIT_DELAY = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
// Most BSC RPC providers cap eth_getLogs at 5k-10k blocks per query
const MAX_BLOCK_RANGE = 5000;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced retry function with better error classification
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRateLimitError =
        error?.message?.includes("rate limit") ||
        error?.message?.includes("too many requests") ||
        error?.message?.includes("429") ||
        error?.code === 429 ||
        error?.status === 429;

      const isNetworkError =
        error?.message?.includes("network") ||
        error?.message?.includes("timeout") ||
        error?.message?.includes("ECONNRESET") ||
        error?.code === 'NETWORK_ERROR';

      console.log(`Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

      if (isLastAttempt || (!isRateLimitError && !isNetworkError)) {
        throw error;
      }

      const backoffDelay = RETRY_DELAY * Math.pow(2, attempt);
      console.log(`Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await delay(backoffDelay);
    }
  }
  throw new Error("Max retries exceeded");
}

// Enhanced provider switching logic
async function getWorkingProvidersWithFallback(primary = PRIMARY_PROVIDERS, fallback = FALLBACK_PROVIDERS, requiredCount = 3) {
  const working = [];

  // Check primary providers first
  for (let i = 0; i < primary.length; i++) {
    const provider = primary[i];
    try {
      await provider.getBlockNumber();
      working.push(provider);
      console.log(`Primary provider ${i + 1} is working`);
    } catch (e) {
      console.warn(`Primary provider ${i + 1} failed: ${e.message}`);
    }
  }

  // Use fallback if needed
  for (let i = 0; i < fallback.length && working.length < requiredCount; i++) {
    const provider = fallback[i];
    try {
      await provider.getBlockNumber();
      working.push(provider);
      console.log(`Fallback provider ${i + 1} is working`);
    } catch (e) {
      console.warn(`Fallback provider ${i + 1} failed: ${e.message}`);
    }
  }

  if (working.length === 0) {
    throw new Error("No working RPC providers available.");
  }

  return working;
}



// Enhanced block fetching with multiple fallbacks
async function getLatestBlockWithFallback(provider) {
  return retryWithBackoff(async () => {
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`  📍 Latest block: #${blockNumber}`);

      // Try to get the full block data
      const blockData = await provider.getBlock(blockNumber);

      if (!blockData) {
        // If latest block data is null, try the previous block
        console.log("  ⚠️  Latest block data is null, trying previous block...");
        const previousBlockData = await provider.getBlock(blockNumber - 1);

        if (!previousBlockData) {
          throw new Error("Both latest and previous block data are null");
        }

        return {
          blockNumber: blockNumber - 1,
          blockData: previousBlockData
        };
      }

      console.log(`  ✓ Block timestamp: ${new Date(blockData.timestamp * 1000).toISOString()}`);
      return {
        blockNumber,
        blockData
      };
    } catch (error) {
      console.error("  ❌ Error fetching latest block:", error.message);
      throw error;
    }
  });
}

async function findBlockByTimestamp(provider, targetTimestamp, latestBlock, latestTimestamp = null) {
  // Narrow the search window: BSC block time is at least 0.25s, so the target
  // block can't be more than 4 blocks per second behind the latest block
  let left = 1;
  if (latestTimestamp) {
    const secondsBack = latestTimestamp - targetTimestamp;
    left = Math.max(1, latestBlock - Math.ceil(secondsBack * 4));
  }
  let right = latestBlock;
  let closestBlock = latestBlock;
  let iterations = 0;

  while (left <= right) {
    iterations++;
    const mid = Math.floor((left + right) / 2);
    // Retry flaky calls in place — treating an RPC error as "search earlier"
    // can skew the result millions of blocks back
    const block = await retryWithBackoff(() => provider.getBlock(mid));
    await delay(RATE_LIMIT_DELAY);

    if (block && block.timestamp) {
      if (block.timestamp <= targetTimestamp) {
        closestBlock = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    } else {
      right = mid - 1;
    }
  }

  const result = Math.max(closestBlock, 1);
  console.log(`      ✓ Found block #${result} (${iterations} iterations)`);
  return result;
}

const INTERVALS = {
  fiveMin: 5 * 60,
  fifteenMin: 15 * 60,
  thirtyMin: 30 * 60,
  oneHour: 60 * 60,
  threeHours: 3 * 60 * 60,
  sixHours: 6 * 60 * 60,
  twelveHours: 12 * 60 * 60,
  twentyFourHours: 24 * 60 * 60,
};

// All tokens in a run share the same reference block, so the interval start
// blocks only need to be found once — cache them per reference block
const blockEstimateCache = new Map();

function getIntervalBlocks(provider, latestBlock, latestTimestamp) {
  if (!blockEstimateCache.has(latestBlock)) {
    const promise = (async () => {
      const estimates = {};
      for (const [key, seconds] of Object.entries(INTERVALS)) {
        const targetTimestamp = latestTimestamp - seconds;
        const targetDate = new Date(targetTimestamp * 1000).toISOString();
        estimates[key] = await findBlockByTimestamp(provider, targetTimestamp, latestBlock, latestTimestamp);
        console.log(`    ${key.padEnd(14)}: target ${targetDate} → block #${estimates[key]}`);
        await delay(RATE_LIMIT_DELAY);
      }
      return estimates;
    })();
    // Drop failed computations so the next caller can retry with its own provider
    promise.catch(() => blockEstimateCache.delete(latestBlock));
    blockEstimateCache.set(latestBlock, promise);
  }
  return blockEstimateCache.get(latestBlock);
}

async function fetchLogRange(provider, filter, fromBlock, toBlock) {
  try {
    return await retryWithBackoff(() =>
      provider.getLogs({ ...filter, fromBlock, toBlock })
    );
  } catch (error) {
    // Providers reject ranges with too many results; split the range and retry
    const splittable =
      toBlock > fromBlock &&
      (error?.message?.includes("range") ||
        error?.message?.includes("limit") ||
        error?.message?.includes("exceed") ||
        error?.message?.includes("results"));
    if (splittable) {
      const mid = Math.floor((fromBlock + toBlock) / 2);
      const left = await fetchLogRange(provider, filter, fromBlock, mid);
      const right = await fetchLogRange(provider, filter, mid + 1, toBlock);
      return [...left, ...right];
    }
    throw error;
  }
}

async function getLogsChunked(provider, filter, fromBlock, toBlock) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, toBlock);
    const chunk = await fetchLogRange(provider, filter, start, end);
    logs.push(...chunk);
    await delay(RATE_LIMIT_DELAY);
  }
  return logs;
}

// Fetch every burn transfer in the range as { blockNumber, value }.
// Throws on RPC failure — callers must not persist a partial result as zero.
async function fetchBurnEvents(provider, contract, tokenAddress, fromBlock, toBlock) {
  const events = [];

  for (const burnAddress of BURN_ADDRESSES) {
    console.log(`  📋 Querying burn logs to ${burnAddress}, blocks ${fromBlock}-${toBlock}`);

    const logs = await getLogsChunked(provider, {
      address: tokenAddress,
      topics: [
        TRANSFER_TOPIC,
        null,
        ethers.zeroPadValue(burnAddress.toLowerCase(), 32),
      ],
    }, fromBlock, toBlock);

    console.log(`  ✓ Found ${logs.length} transfer logs for burn address ${burnAddress}`);

    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        if (parsed && parsed.args) {
          events.push({ blockNumber: log.blockNumber, value: BigInt(parsed.args[2]) });
        }
      } catch (e) {
        console.error("    ⚠️ Log parsing error:", e.message);
      }
    }
  }

  return events;
}

// Enhanced calculateBurnData with better error handling
async function calculateBurnData(tokenName, provider = null, referenceBlock = null) {
  const tokenAddress = TOKEN_MAP[tokenName.toLowerCase()];
  if (!tokenAddress) {
    console.error(`Invalid token: ${tokenName}`);
    return null;
  }

  console.log(`\n🔥 Starting burn calculation for ${tokenName} (${tokenAddress})`);

  let activeProvider = provider;
  let fallbackTried = false;

  try {
    // Get a fallback-aware provider only if not passed
    if (!activeProvider) {
      console.log(`  📡 No provider passed, selecting from working providers...`);
      const workingProviders = await getWorkingProvidersWithFallback();
      activeProvider = workingProviders[0]; // use only the first working one
      console.log(`  ✓ Selected provider`);
    } else {
      console.log(`  ✓ Using provided provider`);
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, activeProvider);

    // Use reference block if provided, otherwise get latest
    let latestBlock, latestBlockData;
    if (referenceBlock) {
      latestBlock = referenceBlock.blockNumber;
      latestBlockData = referenceBlock.blockData;
      console.log(`  📦 Using reference block: #${latestBlock} (timestamp: ${new Date(latestBlockData.timestamp * 1000).toISOString()})`);
    } else {
      console.log(`  🔍 Fetching latest block...`);
      const result = await getLatestBlockWithFallback(activeProvider);
      latestBlock = result.blockNumber;
      latestBlockData = result.blockData;
      console.log(`  ✓ Latest block: #${latestBlock} (timestamp: ${new Date(latestBlockData.timestamp * 1000).toISOString()})`);
    }

    const decimals = await retryWithBackoff(() => contract.decimals());
    console.log(`  📊 Token decimals: ${decimals}`);

    const latestTimestamp = latestBlockData.timestamp;

    console.log(`  ⏱️  Finding blocks for each interval...`);
    const blockEstimates = await getIntervalBlocks(activeProvider, latestBlock, latestTimestamp);

    // The intervals are nested, so one scan over the largest (24h) range is
    // enough — each interval total is the sum of events at or after its block
    console.log(`  🔎 Scanning burn logs from block #${blockEstimates.twentyFourHours} to #${latestBlock}...`);
    const burnEvents = await fetchBurnEvents(activeProvider, contract, tokenAddress, blockEstimates.twentyFourHours, latestBlock);
    console.log(`  ✓ Found ${burnEvents.length} burn transfers in the last 24h`);

    const results = [];
    for (const [key, fromBlock] of Object.entries(blockEstimates)) {
      let total = BigInt(0);
      for (const event of burnEvents) {
        if (event.blockNumber >= fromBlock) {
          total += event.value;
        }
      }
      results.push({ key, result: total });
    }

    const divisor = BigInt(10) ** BigInt(decimals);
    const burnData = {};

    console.log(`\n  🧮 Converting to human-readable format (divisor: 10^${decimals})...`);
    results.forEach(({ key, result }) => {
      const burnKey = key
        .replace("fiveMin", "burn5min")
        .replace("fifteenMin", "burn15min")
        .replace("thirtyMin", "burn30min")
        .replace("oneHour", "burn1h")
        .replace("threeHours", "burn3h")
        .replace("sixHours", "burn6h")
        .replace("twelveHours", "burn12h")
        .replace("twentyFourHours", "burn24h");
      const humanReadable = Number(result) / Number(divisor);
      burnData[burnKey] = humanReadable;
      console.log(`    ${burnKey.padEnd(10)}: ${result.toString().padStart(20)} raw → ${humanReadable.toFixed(8)} tokens`);
    });

    const now = new Date();
    const nextUpdate = new Date(now.getTime() + 5 * 60 * 1000);

    const finalData = {
      address: tokenAddress,
      burn5min: burnData.burn5min || 0,
      burn15min: burnData.burn15min || 0,
      burn30min: burnData.burn30min || 0,
      burn1h: burnData.burn1h || 0,
      burn3h: burnData.burn3h || 0,
      burn6h: burnData.burn6h || 0,
      burn12h: burnData.burn12h || 0,
      burn24h: burnData.burn24h || 0,
      lastUpdated: now.toISOString(),
      nextUpdate: nextUpdate.toISOString(),
    };

    console.log(`✅ Completed ${tokenName}: 5m=${finalData.burn5min.toFixed(4)} | 24h=${finalData.burn24h.toFixed(4)} tokens`);
    return finalData;

  } catch (error) {
    console.error(`\n❌ Error calculating burn data for ${tokenName}:`, error.message);

    if (!fallbackTried) {
      console.log(`  🔄 Attempting fallback provider for ${tokenName}...`);
      fallbackTried = true;
      try {
        // Get fallback provider and retry
        const workingFallbacks = await getWorkingProvidersWithFallback(PRIMARY_PROVIDERS, FALLBACK_PROVIDERS, 1);
        if (workingFallbacks.length) {
          console.log(`  ✓ Got fallback provider, retrying...`);
          return await calculateBurnData(tokenName, workingFallbacks[0], referenceBlock);
        }
      } catch (fallbackError) {
        console.error(`  ❌ Fallback provider also failed:`, fallbackError.message);
      }
    }

    console.log(`  ⏭️  Skipping ${tokenName}`);
    return null;
  }
}


// ...existing code...

async function saveBurnDataToFirebase(tokenName, burnData) {
  try {
    const address = TOKEN_MAP[tokenName.toLowerCase()];
    if (!address) throw new Error(`Unknown token: ${tokenName}`);

    console.log(`    📝 Writing to Firebase: ${tokenName} (doc: ${address.substring(0, 10)}...)`);
    console.log(`      - 5min: ${burnData.burn5min.toFixed(4)}`);
    console.log(`      - 1h: ${burnData.burn1h.toFixed(4)}`);
    console.log(`      - 24h: ${burnData.burn24h.toFixed(4)}`);

    await setDoc(doc(collection(db, "burnData"), address.toLowerCase()), burnData);
    console.log(`    ✅ Saved ${tokenName} to Firebase`);
  } catch (error) {
    console.error(`    ❌ Error saving burn data for ${tokenName}:`, error.message);
    throw error;
  }
}

async function getCachedBurnData(tokenName) {
  try {
    const address = TOKEN_MAP[tokenName.toLowerCase()];
    if (!address) throw new Error(`Unknown token: ${tokenName}`);
    const docSnap = await getDoc(doc(collection(db, "burnData"), address.toLowerCase()));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error(`Error getting cached burn data for ${tokenName}:`, error);
    return null;
  }
}

// ...existing code...

// async function getCachedBurnData(tokenName) {
//   try {
//     const docSnap = await getDoc(doc(collection(db, "burnData"), tokenName.toLowerCase()));
//     return docSnap.exists() ? docSnap.data() : null;
//   } catch (error) {
//     console.error(`Error getting cached burn data for ${tokenName}:`, error);
//     return null;
//   }
// }

// Enhanced processAllTokens with better error handling and provider management
async function processAllTokens() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 STARTING DAILY BURN CALCULATION");
  console.log("=".repeat(70));
  console.log(`⏰ Started at: ${new Date().toISOString()}`);

  const tokenNames = Object.keys(TOKEN_MAP);
  console.log(`📦 Total tokens to process: ${tokenNames.length}`);
  const results = [];

  try {
    // Get working providers
    console.log("\n🔌 Checking RPC providers...");
    const workingProviders = await getWorkingProvidersWithFallback();

    if (workingProviders.length === 0) {
      throw new Error("No working RPC providers available");
    }

    console.log(`✅ ${workingProviders.length} working providers available`);

    // Get ONE reference block for all tokens (ensures consistent time window)
    console.log("\n📡 Fetching reference block (will be used for all tokens)...");
    const referenceBlock = await getLatestBlockWithFallback(workingProviders[0]);
    const refBlockDate = new Date(referenceBlock.blockData.timestamp * 1000).toISOString();
    console.log(`✓ Reference block: #${referenceBlock.blockNumber} at ${refBlockDate}`);

    // Split tokens across working providers
    const tokenChunks = workingProviders.map((_, i) =>
      tokenNames.filter((_, index) => index % workingProviders.length === i)
    );

    console.log(`\n⚡ Distributing tokens across providers:`);
    tokenChunks.forEach((chunk, idx) => {
      console.log(`  Provider ${idx + 1}: ${chunk.length} tokens`);
    });

    // Process tokens with working providers
    console.log(`\n${"=".repeat(70)}`);
    console.log(`🔥 PROCESSING TOKENS`);
    console.log(`${"=".repeat(70)}\n`);

    const workers = tokenChunks.map((tokens, idx) =>
      (async () => {
        const provider = workingProviders[idx];

        for (const tokenName of tokens) {
          try {
            const burnData = await calculateBurnData(tokenName, provider, referenceBlock);

            if (burnData) {
              console.log(`  💾 Saving ${tokenName} to Firebase...`);
              await saveBurnDataToFirebase(tokenName, burnData);
              console.log(`  ✅ Saved ${tokenName}\n`);
              results.push({ tokenName, success: true });
            } else {
              results.push({ tokenName, success: false, error: "Failed to calculate burn data" });
            }

            await delay(RATE_LIMIT_DELAY * 3); // More conservative throttling
          } catch (e) {
            console.error(`❌ Error processing ${tokenName}:`, e.message);
            results.push({ tokenName, success: false, error: e.message });
          }
        }
      })()
    );

    await Promise.all(workers);
  } catch (error) {
    console.error("❌ Fatal error in processAllTokens:", error);
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 BURN CALCULATION COMPLETE`);
  console.log(`${"=".repeat(70)}`);
  console.log(`⏰ Completed at: ${new Date().toISOString()}`);
  console.log(`✅ Successful: ${successful}/${tokenNames.length}`);
  console.log(`❌ Failed: ${failed}/${tokenNames.length}`);

  if (failed > 0) {
    console.log(`\n Failed tokens:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.tokenName}: ${r.error}`);
    });
  }

  console.log(`${"=".repeat(70)}\n`);

  return results;
}

export {
  calculateBurnData,
  saveBurnDataToFirebase,
  getCachedBurnData,
  processAllTokens,
  getWorkingProvidersWithFallback,
  getLatestBlockWithFallback,
};