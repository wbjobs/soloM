const os = require('os');
const { execSync } = require('child_process');

function setupConsoleEncoding() {
  if (os.platform() === 'win32') {
    try {
      execSync('chcp 65001', { stdio: 'ignore' });
    } catch (e) {
    }
    
    if (process.stdout.setEncoding) {
      process.stdout.setEncoding('utf8');
    }
    if (process.stderr.setEncoding) {
      process.stderr.setEncoding('utf8');
    }
  }
}

function truncateDiff(diff, maxChars = 4000) {
  if (diff.length <= maxChars) {
    return { diff, truncated: false };
  }

  const lines = diff.split('\n');
  const fileDiffs = groupByFile(lines);
  
  let result = [];
  let currentLength = 0;
  let truncatedFiles = [];

  for (const fileDiff of fileDiffs) {
    const fileContent = fileDiff.join('\n');
    const estimatedLength = currentLength + fileContent.length + 1;

    if (estimatedLength <= maxChars * 0.8) {
      result.push(...fileDiff);
      currentLength = estimatedLength;
    } else {
      const fileName = extractFileName(fileDiff[0]);
      truncatedFiles.push(fileName);
      
      const summaryLine = `diff --git a/${fileName} b/${fileName}\n[文件内容过大，已省略详细变更]`;
      if (currentLength + summaryLine.length <= maxChars) {
        result.push(summaryLine);
        currentLength += summaryLine.length;
      }
    }
  }

  if (truncatedFiles.length > 0) {
    const summary = `\n\n[注意: 以下文件因内容过大已省略: ${truncatedFiles.join(', ')}]`;
    if (currentLength + summary.length <= maxChars) {
      result.push(summary);
    }
  }

  return {
    diff: result.join('\n'),
    truncated: true,
    truncatedFiles,
    originalLength: diff.length,
    resultLength: result.join('\n').length
  };
}

function groupByFile(lines) {
  const groups = [];
  let currentGroup = [];

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [line];
    } else if (currentGroup.length > 0) {
      currentGroup.push(line);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function extractFileName(diffLine) {
  const match = diffLine.match(/diff --git a\/(.+?) b\//);
  if (match) {
    return match[1];
  }
  return 'unknown';
}

function summarizeLargeDiff(diff, maxChars = 4000) {
  if (diff.length <= maxChars) {
    return { diff, summarized: false };
  }

  const lines = diff.split('\n');
  const fileChanges = extractFileChanges(lines);
  
  const summary = generateChangeSummary(fileChanges);
  
  let sampleDiffs = [];
  let currentLength = 0;
  
  for (const file of fileChanges) {
    if (file.isBinary) continue;
    
    const sample = file.sampleLines.join('\n');
    if (currentLength + sample.length < maxChars * 0.6) {
      sampleDiffs.push(sample);
      currentLength += sample.length;
    } else {
      break;
    }
  }

  const finalDiff = [
    '=== 变更摘要 ===',
    summary,
    '',
    '=== 部分变更详情 ===',
    sampleDiffs.join('\n\n'),
    '',
    `[注意: 总变更 ${diff.length} 字符，因超出 LLM 上下文限制已进行摘要处理]`
  ].join('\n');

  return {
    diff: finalDiff,
    summarized: true,
    originalLength: diff.length,
    resultLength: finalDiff.length,
    fileCount: fileChanges.length
  };
}

function extractFileChanges(lines) {
  const files = [];
  let currentFile = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (currentFile) {
        files.push(currentFile);
      }
      const fileName = extractFileName(line);
      currentFile = {
        name: fileName,
        additions: 0,
        deletions: 0,
        isBinary: false,
        sampleLines: [line]
      };
    } else if (currentFile) {
      if (line.includes('Binary files')) {
        currentFile.isBinary = true;
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions++;
      }
      
      if (currentFile.sampleLines.length < 15 && !currentFile.isBinary) {
        currentFile.sampleLines.push(line);
      }
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

function generateChangeSummary(fileChanges) {
  const totalAdditions = fileChanges.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileChanges.reduce((sum, f) => sum + f.deletions, 0);
  const binaryFiles = fileChanges.filter(f => f.isBinary);
  
  let summary = `变更文件: ${fileChanges.length} 个\n`;
  summary += `代码变更: +${totalAdditions} -${totalDeletions}\n`;
  
  if (binaryFiles.length > 0) {
    summary += `二进制文件: ${binaryFiles.length} 个 (${binaryFiles.map(f => f.name).join(', ')})\n`;
  }
  
  summary += '\n文件列表:\n';
  fileChanges.slice(0, 10).forEach(f => {
    if (!f.isBinary) {
      summary += `  ${f.name}: +${f.additions} -${f.deletions}\n`;
    }
  });
  
  if (fileChanges.length > 10) {
    summary += `  ... 还有 ${fileChanges.length - 10} 个文件\n`;
  }
  
  return summary;
}

function smartProcessDiff(diff, maxChars = 4000) {
  if (diff.length <= maxChars) {
    return {
      diff,
      processed: false,
      method: 'none',
      originalLength: diff.length
    };
  }

  const truncated = truncateDiff(diff, maxChars);
  
  if (truncated.diff.length <= maxChars) {
    return {
      ...truncated,
      processed: true,
      method: 'truncate'
    };
  }

  const summarized = summarizeLargeDiff(diff, maxChars);
  return {
    ...summarized,
    processed: true,
    method: 'summarize'
  };
}

module.exports = {
  setupConsoleEncoding,
  truncateDiff,
  summarizeLargeDiff,
  smartProcessDiff
};
