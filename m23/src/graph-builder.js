const fs = require('fs');
const path = require('path');

function normalizePath(target, sourceFilePath, rootPath) {
  let normalized = target;
  
  try {
    normalized = decodeURIComponent(normalized);
  } catch (e) {}
  
  normalized = normalized.replace(/\\/g, '/');
  
  if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) {
    const sourceDir = path.dirname(sourceFilePath);
    let resolvedPath;
    if (path.isAbsolute(normalized)) {
      resolvedPath = normalized;
    } else {
      resolvedPath = path.resolve(sourceDir, normalized);
    }
    resolvedPath = resolvedPath.replace(/\\/g, '/');
    const rootPathNormalized = rootPath.replace(/\\/g, '/');
    
    if (resolvedPath.startsWith(rootPathNormalized)) {
      normalized = resolvedPath.substring(rootPathNormalized.length);
      if (normalized.startsWith('/')) {
        normalized = normalized.substring(1);
      }
    } else {
      normalized = path.basename(resolvedPath);
    }
  }
  
  if (!normalized.endsWith('.md')) {
    normalized += '.md';
  }
  
  return normalized;
}

function normalizeKey(key) {
  let result = key.replace(/\\/g, '/').toLowerCase();
  if (!result.endsWith('.md')) {
    result += '.md';
  }
  return result;
}

function scanMarkdownFiles(folderPath) {
  const files = [];
  
  function scan(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (item.endsWith('.md')) {
        files.push({
          path: fullPath,
          name: item,
          content: fs.readFileSync(fullPath, 'utf-8')
        });
      }
    }
  }
  
  scan(folderPath);
  return files;
}

function parseWikiLinks(content) {
  const wikiLinkRegex = /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g;
  const links = [];
  let match;
  
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.push({
      target: match[1].trim(),
      displayText: match[2] || match[1].trim()
    });
  }
  
  return links;
}

function buildLinkGraph(files, rootPath) {
  const nodes = [];
  const edges = [];
  const fileMap = new Map();
  
  files.forEach((file, index) => {
    const relativePath = path.relative(rootPath, file.path);
    const fileNameWithoutExt = file.name.replace(/\.md$/, '');
    
    const node = {
      id: index,
      name: fileNameWithoutExt,
      path: file.path,
      relativePath: relativePath
    };
    
    nodes.push(node);
    
    fileMap.set(normalizeKey(fileNameWithoutExt), index);
    fileMap.set(normalizeKey(relativePath), index);
    fileMap.set(normalizeKey(file.name), index);
  });
  
  files.forEach((file, sourceIndex) => {
    const links = parseWikiLinks(file.content);
    
    links.forEach(link => {
      const normalizedTarget = normalizePath(link.target, file.path, rootPath);
      const targetKey = normalizeKey(normalizedTarget);
      let targetIndex = fileMap.get(targetKey);
      
      if (targetIndex === undefined) {
        const targetBase = normalizeKey(path.basename(link.target));
        for (const [key, value] of fileMap.entries()) {
          if (key === targetBase || key.endsWith('/' + targetBase)) {
            targetIndex = value;
            break;
          }
        }
      }
      
      if (targetIndex === undefined) {
        const targetKeyNoExt = targetKey.replace(/\.md$/, '');
        for (const [key, value] of fileMap.entries()) {
          if (key === targetKeyNoExt || key.endsWith('/' + targetKeyNoExt)) {
            targetIndex = value;
            break;
          }
        }
      }
      
      if (targetIndex !== undefined && sourceIndex !== targetIndex) {
        const existingEdge = edges.find(
          e => e.source === sourceIndex && e.target === targetIndex
        );
        
        if (!existingEdge) {
          edges.push({
            source: sourceIndex,
            target: targetIndex
          });
        }
      }
    });
  });
  
  nodes.forEach(node => {
    node.incomingLinks = edges.filter(e => e.target === node.id).map(e => e.source);
    node.outgoingLinks = edges.filter(e => e.source === node.id).map(e => e.target);
    node.linkCount = node.incomingLinks.length + node.outgoingLinks.length;
    node.isIsolated = node.linkCount === 0;
  });
  
  return {
    nodes,
    edges,
    statistics: {
      totalFiles: files.length,
      totalLinks: edges.length,
      isolatedNodes: nodes.filter(n => n.isIsolated).length
    }
  };
}

function findIsolatedFiles(folderPath) {
  const files = scanMarkdownFiles(folderPath);
  const graph = buildLinkGraph(files, folderPath);
  return graph.nodes.filter(n => n.isIsolated).map(n => n.path);
}

module.exports = {
  scanMarkdownFiles,
  parseWikiLinks,
  buildLinkGraph,
  findIsolatedFiles
};
