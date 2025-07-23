// index.js
import express from 'express';
import { processAllTokens, getCachedBurnData } from './cron-job/job.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(express.json());

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Store job status and metadata
let jobStatus = {
  isRunning: false,
  lastRun: null,
  lastSuccess: null,
  lastError: null,
  totalRuns: 0,
  successfulRuns: 0,
  errors: []
};

// Token list from your job file
const TOKEN_LIST = [
  'pht', 'wkc', 'war', 'dtg', 'yukan', 'btcdragon', 'ocicat', 'nene', 
  'twc', 'tkc', 'durt', 'twd', 'gtan', 'zedek', 'bengcat', 'bcat', 
  'nct', 'kitsune', 'crystalstones', 'bft', 'cross', 'thc', 'bbft'
];

// Enhanced job processing with better error handling
async function runBurnDataJob() {
  if (jobStatus.isRunning) {
    console.log('Job already running, skipping...');
    return;
  }

  jobStatus.isRunning = true;
  jobStatus.lastRun = new Date().toISOString();
  jobStatus.totalRuns++;

  try {
    console.log(`🚀 Starting burn data job #${jobStatus.totalRuns}...`);
    
    const results = await processAllTokens();
    
    if (results && Array.isArray(results)) {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`✅ Job completed: ${successful} successful, ${failed} failed`);
      
      if (successful > 0) {
        jobStatus.lastSuccess = new Date().toISOString();
        jobStatus.successfulRuns++;
      }
      
      if (failed > 0) {
        const failedTokens = results.filter(r => !r.success).map(r => r.tokenName);
        console.warn(`⚠️ Failed tokens: ${failedTokens.join(', ')}`);
      }
    } else {
      throw new Error('processAllTokens returned invalid results');
    }

  } catch (error) {
    console.error('❌ Job failed:', error.message);
    jobStatus.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: NODE_ENV === 'development' ? error.stack : undefined
    };
    
    // Keep only last 10 errors
    jobStatus.errors.unshift(jobStatus.lastError);
    if (jobStatus.errors.length > 10) {
      jobStatus.errors = jobStatus.errors.slice(0, 10);
    }
  } finally {
    jobStatus.isRunning = false;
  }
}

// Background job loop with exponential backoff on failures
async function startJobLoop() {
  let consecutiveFailures = 0;
  const maxFailures = 5;
  const baseDelay = 5 * 60 * 1000; // 5 minutes
  const maxDelay = 30 * 60 * 1000; // 30 minutes

  console.log('🔄 Starting background job loop...');

  while (true) {
    try {
      await runBurnDataJob();
      consecutiveFailures = 0; // Reset on success
      
      // Standard 5-minute delay
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      
    } catch (error) {
      consecutiveFailures++;
      console.error(`Job loop error (${consecutiveFailures}/${maxFailures}):`, error.message);
      
      if (consecutiveFailures >= maxFailures) {
        console.error('🚨 Too many consecutive failures, increasing delay...');
        const backoffDelay = Math.min(baseDelay * Math.pow(2, consecutiveFailures - maxFailures), maxDelay);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        // Shorter delay for first few failures
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      }
    }
  }
}

// API Routes

// Health check endpoint (required for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    jobStatus: {
      isRunning: jobStatus.isRunning,
      lastRun: jobStatus.lastRun,
      lastSuccess: jobStatus.lastSuccess,
      totalRuns: jobStatus.totalRuns,
      successfulRuns: jobStatus.successfulRuns
    }
  });
});

// Get all burn data
app.get('/burn-data', async (req, res) => {
  try {
    const allBurnData = {};
    
    // Fetch cached data for all tokens
    const dataPromises = TOKEN_LIST.map(async (tokenName) => {
      try {
        const data = await getCachedBurnData(tokenName);
        if (data) {
          allBurnData[tokenName] = data;
        }
        return { tokenName, success: !!data };
      } catch (error) {
        console.error(`Error fetching ${tokenName}:`, error.message);
        return { tokenName, success: false, error: error.message };
      }
    });

    await Promise.all(dataPromises);
    
    const tokenCount = Object.keys(allBurnData).length;
    
    res.json({
      success: true,
      tokenCount,
      lastUpdated: new Date().toISOString(),
      data: allBurnData
    });
    
  } catch (error) {
    console.error('Error in /burn-data endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch burn data',
      message: error.message
    });
  }
});

// Get burn data for specific token
app.get('/burn-data/:token', async (req, res) => {
  try {
    const tokenName = req.params.token.toLowerCase();
    
    if (!TOKEN_LIST.includes(tokenName)) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
        availableTokens: TOKEN_LIST
      });
    }
    
    const burnData = await getCachedBurnData(tokenName);
    
    if (!burnData) {
      return res.status(404).json({
        success: false,
        error: 'No data available for this token'
      });
    }
    
    res.json({
      success: true,
      token: tokenName,
      data: burnData
    });
    
  } catch (error) {
    console.error(`Error fetching data for ${req.params.token}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token data',
      message: error.message
    });
  }
});

// Get job status and statistics
app.get('/status', (req, res) => {
  res.json({
    success: true,
    server: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      port: PORT
    },
    job: jobStatus,
    tokens: {
      total: TOKEN_LIST.length,
      list: TOKEN_LIST
    }
  });
});

// Manual job trigger (useful for debugging)
app.post('/trigger-job', async (req, res) => {
  if (jobStatus.isRunning) {
    return res.status(409).json({
      success: false,
      error: 'Job is already running'
    });
  }
  
  // Don't await - run in background
  runBurnDataJob().catch(error => {
    console.error('Manual job trigger failed:', error);
  });
  
  res.json({
    success: true,
    message: 'Job triggered successfully',
    jobId: jobStatus.totalRuns + 1
  });
});

// Get available tokens
app.get('/tokens', (req, res) => {
  res.json({
    success: true,
    count: TOKEN_LIST.length,
    tokens: TOKEN_LIST
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /burn-data',
      'GET /burn-data/:token',
      'GET /status',
      'GET /tokens',
      'POST /trigger-job'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Unhandled rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // For uncaught exceptions, we should exit
  process.exit(1);
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Start the background job loop
  startJobLoop().catch(error => {
    console.error('Failed to start job loop:', error);
    process.exit(1);
  });
});

// Handle server startup errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

export default app;