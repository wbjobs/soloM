const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn, execSync } = require('child_process');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const TEMP_DIR = path.join(__dirname, 'temp');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const MAX_REQUEST_SIZE = '500mb';
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
const CHUNK_EXPIRE_HOURS = 24;
const TIMESTAMP_TOLERANCE = 0.1;

for (const dir of [DATA_DIR, TEMP_DIR, UPLOAD_DIR, OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.originalname.endsWith('.mp4')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

function checkFFmpegAvailable() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

const FFMPEG_AVAILABLE = checkFFmpegAvailable();
console.log(`FFmpeg available: ${FFMPEG_AVAILABLE}`);

app.use(cors({
  maxAge: 86400
}));

app.use(express.json({ 
  limit: MAX_REQUEST_SIZE,
  strict: false
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: MAX_REQUEST_SIZE 
}));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ffmpegAvailable: FFMPEG_AVAILABLE,
    maxVideoSize: MAX_VIDEO_SIZE
  });
});

app.get('/api/server/ffmpeg-status', (req, res) => {
  res.json({
    available: FFMPEG_AVAILABLE,
    message: FFMPEG_AVAILABLE 
      ? 'FFmpeg is available for server-side processing' 
      : 'FFmpeg not found. Please install FFmpeg to enable server-side processing.'
  });
});

app.post('/api/server/upload', upload.single('video'), (req, res) => {
  try {
    if (!FFMPEG_AVAILABLE) {
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'FFmpeg not available on server' });
    }

    const uploadId = uuidv4();
    const originalPath = req.file.path;
    const newPath = path.join(UPLOAD_DIR, `${uploadId}.mp4`);
    
    fs.renameSync(originalPath, newPath);

    const videoInfo = {
      uploadId,
      originalName: req.file.originalname,
      size: req.file.size,
      path: newPath,
      createdAt: new Date().toISOString()
    };

    const infoPath = path.join(UPLOAD_DIR, `${uploadId}.json`);
    fs.writeFileSync(infoPath, JSON.stringify(videoInfo, null, 2));

    res.json({
      success: true,
      uploadId,
      message: 'Video uploaded successfully'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

app.post('/api/server/process', async (req, res) => {
  try {
    if (!FFMPEG_AVAILABLE) {
      return res.status(500).json({ error: 'FFmpeg not available on server' });
    }

    const { uploadId, options = {}, clientKeyframes = null } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'uploadId is required' });
    }

    const videoPath = path.join(UPLOAD_DIR, `${uploadId}.mp4`);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const infoPath = path.join(UPLOAD_DIR, `${uploadId}.json`);
    const videoInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    processVideoStreaming(videoPath, videoInfo, options, clientKeyframes, res);

  } catch (error) {
    console.error('Process error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Processing failed', message: error.message });
    }
  }
});

app.post('/api/keyframes', async (req, res) => {
  try {
    const { videoName, videoSize, duration, keyframes, compressed } = req.body;

    if (!keyframes || !Array.isArray(keyframes) || keyframes.length === 0) {
      return res.status(400).json({ error: 'No keyframes data provided' });
    }

    let processedKeyframes = keyframes;
    if (compressed) {
      try {
        processedKeyframes = await decompressKeyframes(keyframes);
      } catch (e) {
        console.error('Decompression failed:', e);
        return res.status(400).json({ error: 'Failed to decompress keyframe data' });
      }
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    const indexData = {
      id,
      videoName: videoName || 'unknown',
      videoSize: videoSize || 0,
      duration: duration || 0,
      keyframeCount: keyframes.length,
      createdAt,
      shareUrl: `/api/keyframes/${id}`,
      keyframes: processedKeyframes.map((kf, index) => ({
        index,
        timestamp: kf.timestamp,
        timestampFormatted: formatTime(kf.timestamp),
        dataUrl: kf.dataUrl,
        width: kf.width,
        height: kf.height,
        size: kf.size
      }))
    };

    const filePath = path.join(DATA_DIR, `${id}.json`);
    await saveJsonAtomic(filePath, indexData);

    res.json({
      success: true,
      id,
      shareUrl: `/api/keyframes/${id}`,
      keyframeCount: keyframes.length,
      createdAt
    });
  } catch (error) {
    console.error('Error saving keyframes:', error);
    res.status(500).json({ error: 'Failed to save keyframes', message: error.message });
  }
});

app.post('/api/keyframes/chunk/start', (req, res) => {
  try {
    const { videoName, videoSize, duration, totalChunks, totalKeyframes } = req.body;
    const uploadId = uuidv4();
    const chunkDir = path.join(TEMP_DIR, uploadId);
    
    fs.mkdirSync(chunkDir, { recursive: true });

    const metadata = {
      uploadId,
      videoName: videoName || 'unknown',
      videoSize: videoSize || 0,
      duration: duration || 0,
      totalChunks,
      totalKeyframes,
      receivedChunks: 0,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(
      path.join(chunkDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    res.json({
      success: true,
      uploadId,
      chunkSize: 5 * 1024 * 1024,
      message: 'Chunk upload started'
    });
  } catch (error) {
    console.error('Error starting chunk upload:', error);
    res.status(500).json({ error: 'Failed to start chunk upload', message: error.message });
  }
});

app.post('/api/keyframes/chunk/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { chunkIndex, keyframes, compressed } = req.body;
    const chunkDir = path.join(TEMP_DIR, uploadId);

    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    let processedKeyframes = keyframes;
    if (compressed) {
      try {
        processedKeyframes = await decompressKeyframes(keyframes);
      } catch (e) {
        return res.status(400).json({ error: 'Failed to decompress chunk data' });
      }
    }

    const chunkFile = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(6, '0')}.json`);
    await saveJsonAtomic(chunkFile, processedKeyframes);

    const metadataPath = path.join(chunkDir, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    metadata.receivedChunks++;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    res.json({
      success: true,
      chunkIndex,
      receivedChunks: metadata.receivedChunks,
      totalChunks: metadata.totalChunks
    });
  } catch (error) {
    console.error('Error saving chunk:', error);
    res.status(500).json({ error: 'Failed to save chunk', message: error.message });
  }
});

app.post('/api/keyframes/chunk/:uploadId/complete', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const chunkDir = path.join(TEMP_DIR, uploadId);

    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    const metadataPath = path.join(chunkDir, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    if (metadata.receivedChunks !== metadata.totalChunks) {
      return res.status(400).json({ 
        error: 'Incomplete upload',
        received: metadata.receivedChunks,
        expected: metadata.totalChunks
      });
    }

    const chunkFiles = fs.readdirSync(chunkDir)
      .filter(f => f.startsWith('chunk_') && f.endsWith('.json'))
      .sort();

    let allKeyframes = [];
    for (const chunkFile of chunkFiles) {
      const chunkData = JSON.parse(fs.readFileSync(path.join(chunkDir, chunkFile), 'utf-8'));
      allKeyframes = allKeyframes.concat(chunkData);
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    const indexData = {
      id,
      videoName: metadata.videoName,
      videoSize: metadata.videoSize,
      duration: metadata.duration,
      keyframeCount: allKeyframes.length,
      createdAt,
      shareUrl: `/api/keyframes/${id}`,
      keyframes: allKeyframes.map((kf, index) => ({
        index,
        timestamp: kf.timestamp,
        timestampFormatted: formatTime(kf.timestamp),
        dataUrl: kf.dataUrl,
        width: kf.width,
        height: kf.height,
        size: kf.size
      }))
    };

    const filePath = path.join(DATA_DIR, `${id}.json`);
    await saveJsonAtomic(filePath, indexData);

    fs.rmSync(chunkDir, { recursive: true, force: true });

    res.json({
      success: true,
      id,
      shareUrl: `/api/keyframes/${id}`,
      keyframeCount: allKeyframes.length,
      createdAt
    });
  } catch (error) {
    console.error('Error completing chunk upload:', error);
    res.status(500).json({ error: 'Failed to complete upload', message: error.message });
  }
});

app.get('/api/keyframes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(DATA_DIR, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Keyframe index not found' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (error) {
    console.error('Error loading keyframes:', error);
    res.status(500).json({ error: 'Failed to load keyframes', message: error.message });
  }
});

app.get('/api/keyframes', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(DATA_DIR, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          id: data.id,
          videoName: data.videoName,
          keyframeCount: data.keyframeCount,
          duration: data.duration,
          createdAt: data.createdAt,
          shareUrl: data.shareUrl
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(files);
  } catch (error) {
    console.error('Error listing keyframes:', error);
    res.status(500).json({ error: 'Failed to list keyframes', message: error.message });
  }
});

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

async function saveJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  const jsonStr = JSON.stringify(data, null, 2);
  
  await fs.promises.writeFile(tempPath, jsonStr, 'utf-8');
  await fs.promises.rename(tempPath, filePath);
}

async function decompressKeyframes(compressedData) {
  if (typeof compressedData === 'string') {
    const buffer = Buffer.from(compressedData, 'base64');
    return new Promise((resolve, reject) => {
      zlib.gunzip(buffer, (err, result) => {
        if (err) reject(err);
        else resolve(JSON.parse(result.toString('utf-8')));
      });
    });
  }
  return compressedData;
}

function cleanupExpiredChunks() {
  try {
    const now = Date.now();
    const expireMs = CHUNK_EXPIRE_HOURS * 60 * 60 * 1000;

    if (!fs.existsSync(TEMP_DIR)) return;

    const sessions = fs.readdirSync(TEMP_DIR);
    let cleanedCount = 0;

    for (const sessionId of sessions) {
      const sessionPath = path.join(TEMP_DIR, sessionId);
      const metadataPath = path.join(sessionPath, 'metadata.json');
      
      try {
        if (!fs.existsSync(metadataPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          cleanedCount++;
          continue;
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        const createdAt = new Date(metadata.createdAt).getTime();

        if (now - createdAt > expireMs) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          cleanedCount++;
        }
      } catch (e) {
        console.error(`Error cleaning session ${sessionId}:`, e);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired chunk sessions`);
    }
  } catch (e) {
    console.error('Error in cleanup job:', e);
  }
}

function sendSSE(res, type, data) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function processVideoStreaming(videoPath, videoInfo, options, clientKeyframes, res) {
  const jobId = uuidv4();
  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const { thumbnailWidth = 320, enableTranscode = true, enableValidation = true } = options;

  try {
    sendSSE(res, 'start', {
      jobId,
      videoName: videoInfo.originalName,
      thumbnailWidth
    });

    const duration = await getVideoDuration(videoPath);
    sendSSE(res, 'progress', { stage: 'probe', progress: 5, duration });

    const serverKeyframes = await extractServerKeyframes(
      videoPath, 
      outputDir, 
      thumbnailWidth,
      (progress) => {
        sendSSE(res, 'progress', { 
          stage: 'extract', 
          progress: 10 + progress * 0.6 
        });
      }
    );

    let transcodeResult = null;
    if (enableTranscode) {
      transcodeResult = await transcodeToH265(
        videoPath,
        outputDir,
        (progress) => {
          sendSSE(res, 'progress', { 
            stage: 'transcode', 
            progress: 70 + progress * 0.2 
          });
        }
      );
      sendSSE(res, 'transcode', transcodeResult);
    }

    let validationReport = null;
    if (enableValidation && clientKeyframes && clientKeyframes.length > 0) {
      validationReport = generateValidationReport(clientKeyframes, serverKeyframes);
      sendSSE(res, 'validation', validationReport);
    }

    const finalResult = {
      jobId,
      videoName: videoInfo.originalName,
      videoSize: videoInfo.size,
      duration,
      serverKeyframes: serverKeyframes,
      transcode: transcodeResult,
      validation: validationReport,
      keyframeCount: serverKeyframes.length
    };

    const resultPath = path.join(DATA_DIR, `server_${jobId}.json`);
    await saveJsonAtomic(resultPath, finalResult);

    sendSSE(res, 'complete', {
      ...finalResult,
      shareUrl: `/api/keyframes/server_${jobId}`
    });

    res.end();

  } catch (error) {
    console.error('Video processing failed:', error);
    sendSSE(res, 'error', { error: error.message });
    res.end();
  } finally {
    setTimeout(() => {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }, 60000);
  }
}

async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => output += data);
    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()));
      } else {
        reject(new Error('Failed to probe video duration'));
      }
    });
  });
}

async function extractServerKeyframes(videoPath, outputDir, thumbnailWidth, onProgress) {
  return new Promise((resolve, reject) => {
    const outputPattern = path.join(outputDir, 'frame_%06d.jpg');
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=${thumbnailWidth}:-1`,
      '-vsync', 'vfr',
      '-frame_pts', '1',
      '-q:v', '5',
      '-f', 'image2',
      outputPattern
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      const timeMatch = stderr.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (timeMatch) {
        const timeParts = timeMatch[1].split(':');
        const seconds = parseInt(timeParts[0]) * 3600 + 
                        parseInt(timeParts[1]) * 60 + 
                        parseFloat(timeParts[2]);
        getVideoDuration(videoPath).then(duration => {
          if (duration > 0) {
            onProgress(Math.min((seconds / duration) * 100, 99));
          }
        }).catch(() => {});
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error('FFmpeg extract error:', stderr);
        return reject(new Error('Keyframe extraction failed'));
      }

      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
        .sort();

      const keyframes = files.map((filename, index) => {
        const filePath = path.join(outputDir, filename);
        const stats = fs.statSync(filePath);
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        const match = filename.match(/frame_(\d+)\.jpg/);
        const timestamp = match ? parseInt(match[1]) / 1000 : 0;

        return {
          index,
          timestamp: Math.round(timestamp * 1000) / 1000,
          timestampFormatted: formatTime(timestamp),
          dataUrl,
          size: stats.length,
          width: thumbnailWidth
        };
      });

      keyframes.sort((a, b) => a.timestamp - b.timestamp);
      keyframes.forEach((kf, i) => kf.index = i);

      onProgress(100);
      resolve(keyframes);
    });
  });
}

async function transcodeToH265(videoPath, outputDir, onProgress) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'transcoded_h265.mp4');
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-c:v', 'libx265',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath
    ]);

    let stderr = '';
    let totalDuration = 0;

    ffmpeg.stderr.on('data', async (data) => {
      stderr += data.toString();
      
      if (!totalDuration) {
        const durationMatch = stderr.match(/Duration: (\d+:\d+:\d+\.\d+)/);
        if (durationMatch) {
          const parts = durationMatch[1].split(':');
          totalDuration = parseInt(parts[0]) * 3600 + 
                          parseInt(parts[1]) * 60 + 
                          parseFloat(parts[2]);
        }
      }

      const timeMatch = stderr.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (timeMatch && totalDuration > 0) {
        const timeParts = timeMatch[1].split(':');
        const current = parseInt(timeParts[0]) * 3600 + 
                        parseInt(timeParts[1]) * 60 + 
                        parseFloat(timeParts[2]);
        onProgress(Math.min((current / totalDuration) * 100, 99));
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error('Transcode error:', stderr);
        return reject(new Error('H.265 transcode failed'));
      }

      const stats = fs.statSync(outputPath);
      const originalStats = fs.statSync(videoPath);
      const compressionRatio = ((1 - stats.size / originalStats.size) * 100).toFixed(1);

      onProgress(100);
      resolve({
        success: true,
        codec: 'H.265 (HEVC)',
        crf: 28,
        originalSize: originalStats.size,
        transcodedSize: stats.size,
        compressionRatio: parseFloat(compressionRatio),
        outputPath
      });
    });
  });
}

function generateValidationReport(clientKeyframes, serverKeyframes) {
  const clientTimestamps = clientKeyframes.map(kf => kf.timestamp).sort((a, b) => a - b);
  const serverTimestamps = serverKeyframes.map(kf => kf.timestamp).sort((a, b) => a - b);

  const matches = [];
  const missing = [];
  const extra = [];

  const matchedServerIndices = new Set();

  for (let i = 0; i < clientTimestamps.length; i++) {
    const ct = clientTimestamps[i];
    let bestMatch = null;
    let bestDiff = Infinity;

    for (let j = 0; j < serverTimestamps.length; j++) {
      if (matchedServerIndices.has(j)) continue;
      
      const st = serverTimestamps[j];
      const diff = Math.abs(ct - st);
      
      if (diff < bestDiff && diff <= TIMESTAMP_TOLERANCE) {
        bestDiff = diff;
        bestMatch = j;
      }
    }

    if (bestMatch !== null) {
      matchedServerIndices.add(bestMatch);
      matches.push({
        clientIndex: i,
        serverIndex: bestMatch,
        clientTimestamp: ct,
        serverTimestamp: serverTimestamps[bestMatch],
        difference: bestDiff
      });
    } else {
      missing.push({
        clientIndex: i,
        timestamp: ct,
        reason: 'No matching keyframe found on server'
      });
    }
  }

  for (let j = 0; j < serverTimestamps.length; j++) {
    if (!matchedServerIndices.has(j)) {
      extra.push({
        serverIndex: j,
        timestamp: serverTimestamps[j],
        reason: 'Extra keyframe detected by server'
      });
    }
  }

  const avgDiff = matches.length > 0 
    ? matches.reduce((sum, m) => sum + m.difference, 0) / matches.length 
    : 0;

  const accuracy = clientTimestamps.length > 0
    ? ((matches.length / clientTimestamps.length) * 100).toFixed(1)
    : 0;

  const grade = getAccuracyGrade(parseFloat(accuracy));

  return {
    accuracy: parseFloat(accuracy),
    grade,
    clientFrameCount: clientTimestamps.length,
    serverFrameCount: serverTimestamps.length,
    matchedCount: matches.length,
    missingCount: missing.length,
    extraCount: extra.length,
    averageTimeDifference: Math.round(avgDiff * 1000),
    tolerance: TIMESTAMP_TOLERANCE,
    summary: generateValidationSummary(parseFloat(accuracy), matches.length, missing.length, extra.length),
    matches: matches.slice(0, 50),
    missing: missing.slice(0, 20),
    extra: extra.slice(0, 20)
  };
}

function getAccuracyGrade(accuracy) {
  if (accuracy >= 95) return { letter: 'A', color: '#28a745', text: 'Excellent' };
  if (accuracy >= 85) return { letter: 'B', color: '#17a2b8', text: 'Good' };
  if (accuracy >= 70) return { letter: 'C', color: '#ffc107', text: 'Fair' };
  if (accuracy >= 50) return { letter: 'D', color: '#fd7e14', text: 'Poor' };
  return { letter: 'F', color: '#dc3545', text: 'Failed' };
}

function generateValidationSummary(accuracy, matched, missing, extra) {
  if (accuracy >= 95) {
    return '✅ 前端提取的关键帧与服务器端提取结果高度一致，时间戳准确性优秀！';
  } else if (accuracy >= 85) {
    return '✅ 前端提取的关键帧基本准确，少数帧存在轻微时间偏差。';
  } else if (accuracy >= 70) {
    return '⚠️ 存在一定差异，建议使用服务器端结果作为基准。';
  } else {
    return '❌ 差异较大，建议依赖服务器端提取的关键帧数据。';
  }
}

setInterval(cleanupExpiredChunks, 60 * 60 * 1000);
cleanupExpiredChunks();

function cleanupOldUploads() {
  try {
    const now = Date.now();
    const expireMs = 24 * 60 * 60 * 1000;

    const files = fs.readdirSync(UPLOAD_DIR);
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > expireMs) {
        fs.rmSync(filePath, { force: true });
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old upload files`);
    }
  } catch (e) {
    console.error('Error cleaning uploads:', e);
  }
}

setInterval(cleanupOldUploads, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Temp directory: ${TEMP_DIR}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Max request size: ${MAX_REQUEST_SIZE}`);
  console.log(`FFmpeg available: ${FFMPEG_AVAILABLE}`);
});
