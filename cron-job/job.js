import { ethers } from "ethers";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig.js";
import dotenv from "dotenv";
dotenv.config();


const saveBurnData = async (tokenName, data) => {
  const col = collection(db, 'burnData');
  const docRef = doc(col, tokenName.toLowerCase());
  await setDoc(docRef, data);
};


const RPC_PROVIDERS = [
  new ethers.JsonRpcProvider("https://bsc-mainnet.infura.io/v3/c8b8404619e14e5385a48fbbdd1bca4f"),
  new ethers.JsonRpcProvider("https://rpc.ankr.com/bsc/dc925c9d02bd1784150150a6b57c653d61457a912203be377cfbdc3fb1f8b5e6"),
  new ethers.JsonRpcProvider("https://bsc-mainnet.infura.io/v3/d0bf9063f4774bee9d8fefc095f31c42"),
];

const BURN_ADDRESSES = [
  "0x000000000000000000000000000000000000dEaD",
  "0x0000000000000000000000000000000000000000",
];

const TOKEN_MAP = {
  pht: "0x885c99a787BE6b41cbf964174C771A9f7ec48e04",
  wkc: "0x6Ec90334d89dBdc89E08A133271be3d104128Edb",
  war: "0x57bfe2af99aeb7a3de3bc0c42c22353742bfd20d",
  dtg: "0xb1957BDbA889686EbdE631DF970ecE6A7571A1B6",
  yukan: "0xd086B849a71867731D74D6bB5Df4f640de900171",
  btcdragon: "0x1ee8a2f28586e542af677eb15fd00430f98d8fd8",
  ocicat: "0xE53D384Cf33294C1882227ae4f90D64cF2a5dB70",
  nene: "0x551877C1A3378c3A4b697bE7f5f7111E88Ab4Af3",
  twc: "0xDA1060158F7D593667cCE0a15DB346BB3FfB3596",
  tkc: "0x06Dc293c250e2fB2416A4276d291803fc74fb9B5",
  durt: "0x48a510A3394C2A07506d10910EBEFf3E25b7a3f1",
  twd: "0xf00cD9366A13e725AB6764EE6FC8Bd21dA22786e",
  gtan: "0xbD7909318b9Ca4ff140B840F69bB310a785d1095",
  zedek: "0xCbEaaD74dcB3a4227D0E6e67302402E06c119271",
  bengcat: "0xD000815DB567372C3C3d7070bEF9fB7a9532F9e8",
  bcat: "0x47a9B109Cfb8f89D16e8B34036150eE112572435",
  nct: "0x9F1f27179fB25F11e1F8113Be830cfF5926C4605",
  kitsune: "0xb6623B503d269f415B9B5c60CDDa3Aa4fE34Fd22",
  crystalstones: "0xe252FCb1Aa2E0876E9B5f3eD1e15B9b4d11A0b00",
  bft: "0x4b87F578d6FaBf381f43bd2197fBB2A877da6ef8",
  cross: "0x72928a49c4E88F382b0b6fF3E561F56Dd75485F9",
  thc: "0x56083560594E314b5cDd1680eC6a493bb851BBd8",
  bbft: "0xfB69e2d3d673A8DB9Fa74ffc036A8Cf641255769",
};

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
];

const RATE_LIMIT_DELAY = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRateLimitError =
        error?.message?.includes("rate limit") ||
        error?.message?.includes("too many requests") ||
        error?.code === 429;

      if (isLastAttempt || !isRateLimitError) throw error;

      const backoffDelay = RETRY_DELAY * Math.pow(2, attempt);
      console.log(`Rate limited, retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await delay(backoffDelay);
    }
  }
  throw new Error("Max retries exceeded");
}

async function findBlockByTimestamp(provider, targetTimestamp, latestBlock) {
  return retryWithBackoff(async () => {
    let left = 1;
    let right = latestBlock;
    let closestBlock = latestBlock;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      try {
        const block = await provider.getBlock(mid);
        await delay(RATE_LIMIT_DELAY);

        if (block) {
          if (block.timestamp <= targetTimestamp) {
            closestBlock = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        } else {
          right = mid - 1;
        }
      } catch {
        right = mid - 1;
      }
    }

    return Math.max(closestBlock, 1);
  });
}

async function fetchBurnLogs(provider, contract, tokenAddress, fromBlock, toBlock) {
  return retryWithBackoff(async () => {
    let total = BigInt(0);

    for (const burnAddress of BURN_ADDRESSES) {
      try {
        const logs = await provider.getLogs({
          fromBlock,
          toBlock,
          address: tokenAddress,
          topics: [
            ethers.id("Transfer(address,address,uint256)"),
            null,
            ethers.zeroPadValue(burnAddress.toLowerCase(), 32),
          ],
        });
        await delay(RATE_LIMIT_DELAY);

        for (const log of logs) {
          try {
            const parsed = contract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            if (parsed && parsed.args) {
              total += BigInt(parsed.args[2]);
            }
          } catch (e) {
            console.error("Log parsing error:", e);
          }
        }
      } catch (error) {
        console.error(`Error fetching logs for burn address ${burnAddress}:`, error);
      }
    }

    return total;
  });
}

async function calculateBurnData(tokenName, provider) {
  try {
    const tokenAddress = TOKEN_MAP[tokenName.toLowerCase()];
    if (!tokenAddress) {
      console.error(`Invalid token: ${tokenName}`);
      return null;
    }

    console.log(`Starting burn calculation for ${tokenName}...`);

    // const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [latestBlock, decimals] = await Promise.all([
      retryWithBackoff(() => provider.getBlockNumber()),
      retryWithBackoff(() => contract.decimals()),
    ]);

    const latestBlockData = await retryWithBackoff(() => provider.getBlock(latestBlock));
    if (!latestBlockData) throw new Error("Failed to fetch block data");

    const latestTimestamp = latestBlockData.timestamp;

    const intervals = {
      fiveMin: 5 * 60,
      fifteenMin: 15 * 60,
      thirtyMin: 30 * 60,
      oneHour: 60 * 60,
      threeHours: 3 * 60 * 60,
      sixHours: 6 * 60 * 60,
      twelveHours: 12 * 60 * 60,
      twentyFourHours: 24 * 60 * 60,
    };

    const blockEstimates = {};
    for (const [key, seconds] of Object.entries(intervals)) {
      const targetTimestamp = latestTimestamp - seconds;
      blockEstimates[key] = await findBlockByTimestamp(provider, targetTimestamp, latestBlock);
      await delay(RATE_LIMIT_DELAY);
    }

    const results = [];
    for (const [key, fromBlock] of Object.entries(blockEstimates)) {
      const result = await fetchBurnLogs(provider, contract, tokenAddress, fromBlock, latestBlock);
      results.push({ key, result });
      await delay(RATE_LIMIT_DELAY * 2);
    }

    const divisor = BigInt(10) ** BigInt(decimals);
    const burnData = {};

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
      burnData[burnKey] = Number(result) / Number(divisor);
    });

    const now = new Date();
    const nextUpdate = new Date(now.getTime() + 5 * 60 * 1000);

    return {
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
  } catch (error) {
    console.error(`Error calculating burn data for ${tokenName}:`, error);
    return null;
  }
}

async function saveBurnDataToFirebase(tokenName, burnData) {
  try {
    await setDoc(doc(collection(db, "burnData"), tokenName.toLowerCase()), burnData);
    console.log(`Saved burn data for ${tokenName} to Firebase`);
  } catch (error) {
    console.error(`Error saving burn data for ${tokenName}:`, error);
    throw error;
  }
}

async function getCachedBurnData(tokenName) {
  try {
    const docSnap = await getDoc(doc(collection(db, "burnData"), tokenName.toLowerCase()));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error(`Error getting cached burn data for ${tokenName}:`, error);
    return null;
  }
}

async function processAllTokens() {
  console.log("Starting burn data calculation for all tokens...");
  const tokenNames = Object.keys(TOKEN_MAP);
  const results = [];

  // Split tokens across RPCs
  const tokenChunks = RPC_PROVIDERS.map((_, i) =>
    tokenNames.filter((_, index) => index % RPC_PROVIDERS.length === i)
  );

  // One async worker per provider
  const workers = tokenChunks.map((tokens, idx) =>
    (async () => {
      const provider = RPC_PROVIDERS[idx];

      for (const tokenName of tokens) {
        try {
          console.log(`[RPC ${idx + 1}] Processing ${tokenName}...`);
          const burnData = await calculateBurnData(tokenName, provider);

          if (burnData) {
            await saveBurnDataToFirebase(tokenName, burnData);
            results.push({ tokenName, success: true });
          } else {
            results.push({ tokenName, success: false, error: "Failed to calculate burn data" });
          }

          await delay(RATE_LIMIT_DELAY * 2); // throttle per provider
        } catch (e) {
          console.error(`Error processing ${tokenName} on RPC ${idx + 1}`, e);
          results.push({ tokenName, success: false });
        }
      }
    })()
  );

  await Promise.all(workers);

  console.log("✅ Completed processing all tokens:", results);
}


// ✅ Export as ES module
export {
  calculateBurnData,
  saveBurnDataToFirebase,
  getCachedBurnData,
  processAllTokens,
};