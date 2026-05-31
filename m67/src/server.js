require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const PromptInjectionDetector = require('./detector');
const StorageEngine = require('./storage');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com';
const DETECTION_THRESHOLD = parseInt(process.env.DETECTION_THRESHOLD) || 50;
const SEMANTIC_ENABLED = process.env.SEMANTIC_ENABLED !== 'false';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const STORAGE_ENABLED = process.env.STORAGE_ENABLED !== 'false';

const detector = new PromptInjectionDetector({
  threshold: DETECTION_THRESHOLD,
  semanticEnabled: SEMANTIC_ENABLED,
});

const storage = new StorageEngine();

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(ADMIN_SESSION_SECRET));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

async function initStorageAndLearning() {
  if (!STORAGE_ENABLED) return;

  try {
    await storage.connect();
    const learned = storage.getLearnedPhrases();
    if (SEMANTIC_ENABLED && (learned.benign.length > 0 || learned.attack.length > 0)) {
      detector.loadLearnedPhrases(learned.benign, learned.attack);
    }
    logger.info('Storage and self-learning system initialized');
  } catch (err) {
    logger.error(`Failed to initialize storage: ${err.message}`);
  }
}

initStorageAndLearning();

function extractUserContent(body) {
  if (body.messages && Array.isArray(body.messages)) {
    return body.messages.map(msg => msg.content || '').join('\n');
  }
  if (body.prompt) {
    return Array.isArray(body.prompt) ? body.prompt.join('\n') : body.prompt;
  }
  if (body.input) {
    return body.input;
  }
  return '';
}

function checkAdminAuth(req, res, next) {
  const sessionToken = req.signedCookies.admin_session;
  if (sessionToken && sessionToken === 'authenticated') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use((req, res, next) => {
  if (req.method === 'POST' && (req.path === '/v1/chat/completions' || req.path === '/v1/completions')) {
    const userContent = extractUserContent(req.body);

    if (userContent) {
      const detectionResult = detector.detect(userContent);

      if (detectionResult.detected) {
        logger.warn('Prompt injection attack detected', {
          ip: req.ip,
          score: detectionResult.score,
          threshold: detectionResult.threshold,
          matchedItems: detectionResult.matchedItems,
          semantic: detectionResult.semantic,
          contentPreview: userContent.substring(0, 200),
        });

        if (STORAGE_ENABLED) {
          storage.saveLog({
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            content: userContent,
            score: detectionResult.score,
            threshold: detectionResult.threshold,
            matchedItems: detectionResult.matchedItems,
            semantic: detectionResult.semantic,
          }).catch(err => {
            logger.error(`Failed to save log: ${err.message}`);
          });
        }

        const details = {
          score: detectionResult.score,
          threshold: detectionResult.threshold,
          matchedItems: detectionResult.matchedItems.map(item => ({
            type: item.type,
            value: item.value,
            ...(item.similarity ? { similarity: item.similarity } : {}),
          })),
        };

        if (detectionResult.semantic) {
          details.semantic = {
            injectionSimilarity: detectionResult.semantic.maxInjectionSimilarity,
            benignSimilarity: detectionResult.semantic.maxBenignSimilarity,
            bestMatch: detectionResult.semantic.bestMatch,
            isLearned: detectionResult.semantic.isLearnedBenign || detectionResult.semantic.isLearnedInjection,
          };
        }

        return res.status(400).json({
          error: {
            message: 'Potential prompt injection attack detected. Request blocked.',
            type: 'prompt_injection_detected',
            code: 'PI-001',
            details,
          },
        });
      }

      logger.info('Request passed injection detection', {
        score: detectionResult.score,
        threshold: detectionResult.threshold,
      });
    }
  }
  next();
});

const openaiProxy = createProxyMiddleware({
  target: OPENAI_API_BASE_URL,
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/v1': '/v1',
  },
  onProxyReq: (proxyReq, req, res) => {
    if (OPENAI_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);
    }

    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
      try {
        const response = JSON.parse(responseBuffer.toString('utf8'));
        logger.info('Response received from upstream', {
          path: req.path,
          status: proxyRes.statusCode,
          model: response.model || 'unknown',
        });
      } catch (e) {
        // Ignore JSON parse errors for logging
      }
    }
    return responseBuffer;
  }),
  onError: (err, req, res) => {
    logger.error('Proxy error', {
      error: err.message,
      path: req.path,
    });
    res.status(502).json({
      error: {
        message: 'Bad gateway. Error connecting to upstream service.',
        type: 'proxy_error',
      },
    });
  },
});

app.use('/v1', openaiProxy);

app.get('/health', (req, res) => {
  const semanticStats = SEMANTIC_ENABLED ? detector.getSemanticStats() : null;
  res.json({
    status: 'healthy',
    service: 'llm-prompt-injection-gateway',
    timestamp: new Date().toISOString(),
    detectionThreshold: DETECTION_THRESHOLD,
    semanticEnabled: SEMANTIC_ENABLED,
    storageEnabled: STORAGE_ENABLED,
    semanticStats,
  });
});

app.post('/api/detect', (req, res) => {
  const { text, messages } = req.body;

  let result;
  if (messages) {
    result = detector.detectMessages(messages);
  } else if (text) {
    result = detector.detect(text);
  } else {
    return res.status(400).json({
      error: 'Please provide either "text" or "messages" in the request body.',
    });
  }

  res.json(result);
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin_session', 'authenticated', {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Invalid password' });
});

app.post('/api/admin/logout', checkAdminAuth, (req, res) => {
  res.clearCookie('admin_session');
  res.json({ success: true });
});

app.get('/api/admin/logs', checkAdminAuth, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
      feedback: req.query.feedback || null,
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null,
      minScore: req.query.minScore ? parseFloat(req.query.minScore) : null,
      search: req.query.search || null,
    };
    const result = await storage.queryLogs(options);
    res.json(result);
  } catch (err) {
    logger.error(`Failed to query logs: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/logs/:id', checkAdminAuth, async (req, res) => {
  try {
    const log = await storage.getById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json(log);
  } catch (err) {
    logger.error(`Failed to get log: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/logs/:id/feedback', checkAdminAuth, async (req, res) => {
  try {
    const { feedback, note } = req.body;
    if (!['false_positive', 'true_positive', 'unsure'].includes(feedback)) {
      return res.status(400).json({ error: 'Invalid feedback value. Must be false_positive, true_positive, or unsure' });
    }

    const log = await storage.getById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const updatedLog = await storage.updateFeedback(req.params.id, feedback, note);

    if (feedback === 'false_positive' && !log.learned && SEMANTIC_ENABLED) {
      const learned = detector.learnBenignPhrase(log.content);
      if (learned) {
        await storage.markAsLearned(req.params.id);
        storage.saveLearnedPhrase(log.content, 'benign');
        updatedLog.learned = true;
        logger.info(`Auto-learned false positive phrase: "${log.content.substring(0, 50)}..."`);
      }
    } else if (feedback === 'true_positive' && !log.learned && SEMANTIC_ENABLED) {
      const learned = detector.learnInjectionPhrase(log.content);
      if (learned) {
        await storage.markAsLearned(req.params.id);
        storage.saveLearnedPhrase(log.content, 'attack');
        updatedLog.learned = true;
        logger.info(`Auto-learned true positive phrase: "${log.content.substring(0, 50)}..."`);
      }
    }

    res.json(updatedLog);
  } catch (err) {
    logger.error(`Failed to update feedback: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', checkAdminAuth, async (req, res) => {
  try {
    const storageStats = await storage.getStats();
    const semanticStats = SEMANTIC_ENABLED ? detector.getSemanticStats() : null;
    const learnedPhrases = STORAGE_ENABLED ? storage.getLearnedPhrases() : { benign: [], attack: [] };

    res.json({
      storage: storageStats,
      semantic: semanticStats,
      learned: {
        benignCount: learnedPhrases.benign.length,
        attackCount: learnedPhrases.attack.length,
      },
    });
  } catch (err) {
    logger.error(`Failed to get stats: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/learned', checkAdminAuth, (req, res) => {
  if (!STORAGE_ENABLED) {
    return res.json({ benign: [], attack: [] });
  }
  res.json(storage.getLearnedPhrases());
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      type: 'not_found',
    },
  });
});

app.use((err, req, res, next) => {
  logger.error('Server error', {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'internal_error',
    },
  });
});

app.listen(PORT, () => {
  logger.info(`LLM Prompt Injection Gateway is running on port ${PORT}`);
  logger.info(`OpenAI API Base URL: ${OPENAI_API_BASE_URL}`);
  logger.info(`Detection threshold: ${DETECTION_THRESHOLD}`);
  logger.info(`Semantic detection: ${SEMANTIC_ENABLED ? 'enabled' : 'disabled'}`);
  logger.info(`Storage: ${STORAGE_ENABLED ? 'enabled' : 'disabled'}`);
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   LLM Prompt Injection Gateway                                ║
║                                                               ║
║   Server running at: http://localhost:${PORT}                ║
║   Health check:    http://localhost:${PORT}/health          ║
║   Detection API:   http://localhost:${PORT}/api/detect      ║
║   Admin Panel:     http://localhost:${PORT}/admin           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
