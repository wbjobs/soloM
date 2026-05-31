import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFATAL\b/i,
  /\bCRITICAL\b/i,
  /\bSEVERE\b/i
];

const LOG_LINE_PATTERN = /^\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/;

export function isErrorLine(line) {
  return ERROR_PATTERNS.some(pattern => pattern.test(line));
}

export function isNewLogEntry(line) {
  return LOG_LINE_PATTERN.test(line);
}

export async function extractRecentErrors(filePath, limit = 50) {
  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Log file not found: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);
  const fileSize = stats.size;
  
  if (fileSize === 0) {
    return [];
  }

  const CHUNK_SIZE = 64 * 1024;
  const lines = [];
  let position = fileSize;
  let buffer = '';

  while (position > 0) {
    const start = Math.max(0, position - CHUNK_SIZE);
    const length = position - start;
    const chunk = Buffer.alloc(length);
    
    const fd = fs.openSync(absolutePath, 'r');
    fs.readSync(fd, chunk, 0, length, start);
    fs.closeSync(fd);

    buffer = chunk.toString('utf8') + buffer;
    position = start;

    const chunkLines = buffer.split('\n');
    buffer = chunkLines.shift() || '';
    
    for (let i = chunkLines.length - 1; i >= 0; i--) {
      const line = chunkLines[i].trim();
      lines.push(line);
    }

    const errorCount = lines.filter(l => isNewLogEntry(l) && isErrorLine(l)).length;
    if (errorCount >= limit && position === 0) {
      break;
    }
    if (errorCount >= limit + 5) {
      break;
    }
  }

  if (buffer.trim()) {
    lines.push(buffer.trim());
  }

  const errorEntries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (isNewLogEntry(line) && isErrorLine(line)) {
      const entryLines = [line];
      for (let j = i - 1; j >= 0; j--) {
        const prevLine = lines[j];
        if (!prevLine || isNewLogEntry(prevLine)) break;
        entryLines.push(prevLine);
      }
      errorEntries.push(entryLines.join('\n'));
      
      if (errorEntries.length >= limit) {
        break;
      }
    }
  }

  return errorEntries.reverse();
}

export function formatErrorsForLLM(errors) {
  return errors.map((error, index) => {
    return `--- Error #${index + 1} ---\n${error}`;
  }).join('\n\n');
}

const STACK_TRACE_LINE_PATTERN = /^\s*(at|Caused by:|---|\[.*\])/;
const NODE_MODULES_PATTERN = /node_modules/;
const INTERNAL_NODE_PATTERN = /node:|internal\//;
const ANONYMOUS_PATTERN = /<anonymous>|Object\.<anonymous>/;

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export function extractKeyInfo(errorEntry, maxLinesPerEntry = 15) {
  const lines = errorEntry.split('\n');
  const originalLineCount = lines.length;
  
  if (originalLineCount <= maxLinesPerEntry) {
    return { 
      content: errorEntry, 
      truncated: false, 
      originalLines: originalLineCount, 
      keptLines: originalLineCount 
    };
  }

  const essentialLines = [];
  
  essentialLines.push(lines[0].trim());
  if (lines[1] && lines[1].trim()) {
    essentialLines.push(lines[1].trim());
  }

  const seenFrames = new Set();
  let appFramesAdded = 0;
  let causedByAdded = 0;
  let queryAdded = false;

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if ((line.startsWith('Query:') || line.startsWith('SQL:') || 
         line.includes('SELECT ') || line.includes('UPDATE ') || 
         line.includes('INSERT ')) && !queryAdded) {
      essentialLines.push(line);
      queryAdded = true;
      continue;
    }

    if (line.startsWith('Caused by:') || line.startsWith('caused by:')) {
      if (causedByAdded < 3) {
        essentialLines.push(line);
        causedByAdded++;
      }
      continue;
    }

    if (line.startsWith('at ') || STACK_TRACE_LINE_PATTERN.test(line)) {
      const frameKey = line.replace(/:\d+:\d+/g, '').replace(/\d+/g, 'N');
      
      if (seenFrames.has(frameKey)) continue;
      seenFrames.add(frameKey);

      if (NODE_MODULES_PATTERN.test(line) || INTERNAL_NODE_PATTERN.test(line) || ANONYMOUS_PATTERN.test(line)) {
        continue;
      }

      if (appFramesAdded < Math.min(5, maxLinesPerEntry - 5)) {
        essentialLines.push(line);
        appFramesAdded++;
      }
    }
  }

  const totalRemoved = originalLineCount - essentialLines.length;
  if (totalRemoved > 0) {
    essentialLines.push(`[Truncated ${totalRemoved} lines of stack trace]`);
  }

  const truncatedContent = essentialLines.join('\n');
  
  return {
    content: truncatedContent,
    truncated: true,
    originalLines: originalLineCount,
    keptLines: essentialLines.length
  };
}

export function mergeSimilarErrors(errors) {
  const errorSignatures = new Map();

  errors.forEach((error, index) => {
    const lines = error.split('\n');
    const firstLine = lines[0] || '';
    
    const signature = firstLine
      .replace(/\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/, '[TIMESTAMP]')
      .replace(/\b\d+\b/g, '[NUM]')
      .replace(/(['"])(?:(?!\1)[^\\]|\\.)*\1/g, '[STR]')
      .replace(/\b[a-f0-9]{8,}\b/gi, '[ID]')
      .trim();

    if (!errorSignatures.has(signature)) {
      errorSignatures.set(signature, {
        count: 0,
        samples: [],
        firstLine: firstLine
      });
    }

    const entry = errorSignatures.get(signature);
    entry.count++;
    if (entry.samples.length < 2) {
      entry.samples.push(error);
    }
  });

  const merged = [];
  errorSignatures.forEach((entry, signature) => {
    if (entry.count === 1) {
      merged.push(entry.samples[0]);
    } else {
      const sampleCount = Math.min(2, entry.samples.length);
      let mergedEntry = entry.samples[0];
      
      if (sampleCount > 1) {
        mergedEntry += `\n\n[Similar error occurred ${entry.count} times. Showing ${sampleCount} samples:]\n`;
        for (let i = 1; i < sampleCount; i++) {
          const sampleLines = entry.samples[i].split('\n');
          if (sampleLines.length > 2) {
            mergedEntry += `\nSample #${i + 1}: ${sampleLines[0]}\n  ${sampleLines[1]}\n  ...`;
          } else {
            mergedEntry += `\nSample #${i + 1}: ${entry.samples[i]}`;
          }
        }
      } else {
        mergedEntry = `[Occurred ${entry.count} times] ${mergedEntry}`;
      }
      
      merged.push(mergedEntry);
    }
  });

  return merged;
}

export function preprocessErrorsForLLM(errors, options = {}) {
  const {
    maxTokens = 8000,
    maxErrorsToAnalyze = 50,
    maxLinesPerEntry = 15,
    enableMerge = true,
    systemPromptOverhead = 1000
  } = options;

  const result = {
    originalErrors: errors.length,
    processedErrors: 0,
    originalTokens: 0,
    processedTokens: 0,
    truncatedCount: 0,
    mergedCount: 0,
    errors: [],
    warnings: []
  };

  const formattedOriginal = formatErrorsForLLM(errors);
  result.originalTokens = estimateTokens(formattedOriginal);

  const availableTokens = maxTokens - systemPromptOverhead - 500;

  if (result.originalTokens <= availableTokens) {
    result.errors = errors.slice(0, maxErrorsToAnalyze);
    result.processedErrors = result.errors.length;
    result.processedTokens = estimateTokens(formatErrorsForLLM(result.errors));
    return result;
  }

  let workingErrors = [...errors];
  let mergedSuccessfully = false;

  if (enableMerge) {
    const beforeCount = workingErrors.length;
    workingErrors = mergeSimilarErrors(workingErrors);
    result.mergedCount = beforeCount - workingErrors.length;
    if (result.mergedCount > 0) {
      result.warnings.push(`Merged ${result.mergedCount} similar error entries`);
    }

    const mergedFormatted = formatErrorsForLLM(workingErrors);
    if (estimateTokens(mergedFormatted) <= availableTokens) {
      result.errors = workingErrors.slice(0, maxErrorsToAnalyze);
      result.processedErrors = result.errors.length;
      result.processedTokens = estimateTokens(formatErrorsForLLM(result.errors));
      mergedSuccessfully = true;
    }
  }

  if (!mergedSuccessfully) {
    const truncatedErrors = [];
    workingErrors.forEach(error => {
      const { content, truncated, originalLines, keptLines } = extractKeyInfo(error, maxLinesPerEntry);
      truncatedErrors.push(content);
      if (truncated) {
        result.truncatedCount++;
      }
    });

    let currentTokens = estimateTokens(formatErrorsForLLM(truncatedErrors));

    if (currentTokens <= availableTokens) {
      result.errors = truncatedErrors.slice(0, maxErrorsToAnalyze);
      result.processedErrors = result.errors.length;
      result.processedTokens = estimateTokens(formatErrorsForLLM(result.errors));
    } else {
      let errorLimit = Math.min(maxErrorsToAnalyze, truncatedErrors.length);
      while (errorLimit > 0) {
        const testErrors = truncatedErrors.slice(0, errorLimit);
        const testTokens = estimateTokens(formatErrorsForLLM(testErrors));
        
        if (testTokens <= availableTokens) {
          result.errors = testErrors;
          result.processedErrors = errorLimit;
          result.processedTokens = testTokens;
          result.warnings.push(`Reduced analyzed errors from ${truncatedErrors.length} to ${errorLimit} to fit token limit`);
          break;
        }
        errorLimit = Math.floor(errorLimit * 0.8);
      }

      if (result.errors.length === 0) {
        const firstError = truncatedErrors[0] || workingErrors[0];
        let finalError = firstError;
        let lines = finalError.split('\n');
        
        while (lines.length > 3 && estimateTokens(formatErrorsForLLM([finalError])) > availableTokens) {
          lines = lines.slice(0, Math.max(3, Math.floor(lines.length * 0.8)));
          finalError = lines.join('\n');
        }
        
        result.errors = [finalError];
        result.processedErrors = 1;
        result.processedTokens = estimateTokens(formatErrorsForLLM(result.errors));
        result.warnings.push('Severely truncated to fit within token limit - analysis may be incomplete');
      }
    }
  }

  if (result.truncatedCount > 0) {
    result.warnings.push(`Truncated ${result.truncatedCount} entries to keep essential information`);
  }

  return result;
}

export default {
  extractRecentErrors,
  isErrorLine,
  isNewLogEntry,
  formatErrorsForLLM,
  preprocessErrorsForLLM,
  extractKeyInfo,
  mergeSimilarErrors,
  estimateTokens
};
