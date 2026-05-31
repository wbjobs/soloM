const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function isGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function hasStagedChanges() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output.trim().split('\n').filter(f => f.trim());
  } catch (error) {
    throw new Error(`获取暂存文件列表失败: ${error.message}`);
  }
}

function getStagedDiff(filter = {}) {
  try {
    const diff = execSync('git diff --cached', { encoding: 'utf8' });
    
    if (!filter || (!filter.excludeExtensions?.length && !filter.excludePatterns?.length)) {
      return { diff, filteredFiles: [] };
    }
    
    return filterDiffByFiles(diff, filter);
  } catch (error) {
    throw new Error(`获取暂存区变更失败: ${error.message}`);
  }
}

function filterDiffByFiles(diff, filter) {
  const { excludeExtensions = [], excludePatterns = [], includeExtensions = [], includePatterns = [] } = filter;
  
  const fileDiffs = diff.split(/(?=^diff --git )/m);
  const filteredDiffs = [];
  const filteredFiles = [];
  
  for (const fileDiff of fileDiffs) {
    if (!fileDiff.trim()) continue;
    
    const fileNameMatch = fileDiff.match(/^diff --git a\/(.+?) b\//);
    if (!fileNameMatch) {
      filteredDiffs.push(fileDiff);
      continue;
    }
    
    const fileName = fileNameMatch[1];
    
    let shouldExclude = false;
    
    if (excludeExtensions.length > 0) {
      const ext = '.' + fileName.split('.').pop();
      if (excludeExtensions.some(e => e === ext || e === fileName.split('.').pop())) {
        shouldExclude = true;
      }
    }
    
    if (!shouldExclude && excludePatterns.length > 0) {
      if (excludePatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(fileName);
        } catch {
          return fileName.includes(pattern);
        }
      })) {
        shouldExclude = true;
      }
    }
    
    if (includeExtensions.length > 0) {
      const ext = '.' + fileName.split('.').pop();
      if (!includeExtensions.some(e => e === ext || e === fileName.split('.').pop())) {
        shouldExclude = true;
      }
    }
    
    if (!shouldExclude && includePatterns.length > 0) {
      if (!includePatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(fileName);
        } catch {
          return fileName.includes(pattern);
        }
      })) {
        shouldExclude = true;
      }
    }
    
    if (shouldExclude) {
      filteredFiles.push(fileName);
    } else {
      filteredDiffs.push(fileDiff);
    }
  }
  
  return {
    diff: filteredDiffs.join(''),
    filteredFiles
  };
}

function executeCommit(message) {
  try {
    execSync(`git commit -m ${escapeShellArg(message)}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
}

function escapeShellArg(arg) {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function getGitHooksDir() {
  const gitRoot = getGitRoot();
  if (!gitRoot) return null;
  return path.join(gitRoot, '.git', 'hooks');
}

function getHookPath(hookName) {
  const hooksDir = getGitHooksDir();
  if (!hooksDir) return null;
  return path.join(hooksDir, hookName);
}

function hookExists(hookName) {
  const hookPath = getHookPath(hookName);
  if (!hookPath) return false;
  return fs.existsSync(hookPath);
}

function installHook(hookName, hookContent) {
  if (!isGitRepository()) {
    throw new Error('当前目录不是 Git 仓库');
  }

  const hookPath = getHookPath(hookName);
  if (!hookPath) {
    throw new Error('无法获取 Git hooks 目录');
  }

  if (fs.existsSync(hookPath)) {
    const existingContent = fs.readFileSync(hookPath, 'utf8');
    if (existingContent.includes('git-commit-ai')) {
      return { installed: true, alreadyExists: true, path: hookPath };
    }
  }

  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  return { installed: true, alreadyExists: false, path: hookPath };
}

function uninstallHook(hookName) {
  const hookPath = getHookPath(hookName);
  if (!hookPath || !fs.existsSync(hookPath)) {
    return { uninstalled: true, notFound: true };
  }

  const content = fs.readFileSync(hookPath, 'utf8');
  if (!content.includes('git-commit-ai')) {
    return { uninstalled: false, notOurHook: true, path: hookPath };
  }

  fs.unlinkSync(hookPath);
  return { uninstalled: true, path: hookPath };
}

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

module.exports = {
  isGitRepository,
  getGitRoot,
  hasStagedChanges,
  getStagedFiles,
  getStagedDiff,
  filterDiffByFiles,
  executeCommit,
  getGitHooksDir,
  getHookPath,
  hookExists,
  installHook,
  uninstallHook,
  getCurrentBranch
};
