const { ipcRenderer } = require('electron');
const { marked } = require('marked');

let currentFolder = null;
let currentFile = null;
let linkGraph = null;
let isolatedFiles = new Set();

const selectFolderBtn = document.getElementById('selectFolderBtn');
const currentFolderEl = document.getElementById('currentFolder');
const fileTreeEl = document.getElementById('fileTree');
const editorEl = document.getElementById('editor');
const previewEl = document.getElementById('preview');
const saveBtn = document.getElementById('saveBtn');
const refreshGraphBtn = document.getElementById('refreshGraphBtn');
const graphJsonEl = document.getElementById('graphJson');
const graphStatsEl = document.getElementById('graphStats');
const graphCanvas = document.getElementById('graphCanvas');

selectFolderBtn.addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    currentFolder = folderPath;
    currentFolderEl.textContent = folderPath;
    refreshGraphBtn.disabled = false;
    await loadFileTree(folderPath);
    await loadIsolatedFiles(folderPath);
    await loadLinkGraph(folderPath);
  }
});

saveBtn.addEventListener('click', async () => {
  if (currentFile) {
    await ipcRenderer.invoke('save-file', currentFile, editorEl.value);
    await loadIsolatedFiles(currentFolder);
    await loadLinkGraph(currentFolder);
    updateIsolatedFileMarkers();
  }
});

refreshGraphBtn.addEventListener('click', async () => {
  if (currentFolder) {
    await loadIsolatedFiles(currentFolder);
    await loadLinkGraph(currentFolder);
    updateIsolatedFileMarkers();
  }
});

editorEl.addEventListener('input', () => {
  updatePreview();
  saveBtn.disabled = !currentFile;
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab + 'Tab').classList.add('active');
    
    if (tab === 'visual' && linkGraph) {
      renderGraphVisual();
    }
  });
});

async function loadFileTree(folderPath) {
  const tree = await ipcRenderer.invoke('read-directory', folderPath);
  fileTreeEl.innerHTML = '';
  renderTreeItems(tree, fileTreeEl);
  updateIsolatedFileMarkers();
}

async function loadIsolatedFiles(folderPath) {
  const files = await ipcRenderer.invoke('get-isolated-files', folderPath);
  isolatedFiles = new Set(files);
}

function updateIsolatedFileMarkers() {
  document.querySelectorAll('.file-tree-item.file').forEach(el => {
    const filePath = el.dataset.path;
    if (isolatedFiles.has(filePath)) {
      el.classList.add('isolated');
    } else {
      el.classList.remove('isolated');
    }
  });
}

function renderTreeItems(items, container) {
  items.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `file-tree-item ${item.type}`;
    itemEl.textContent = item.name;
    itemEl.dataset.path = item.path;
    
    if (item.type === 'file') {
      if (isolatedFiles.has(item.path)) {
        itemEl.classList.add('isolated');
      }
      itemEl.addEventListener('click', () => loadFile(item.path));
    }
    
    container.appendChild(itemEl);
    
    if (item.type === 'folder' && item.children && item.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'file-tree-children';
      renderTreeItems(item.children, childrenContainer);
      container.appendChild(childrenContainer);
    }
  });
}

async function loadFile(filePath) {
  currentFile = filePath;
  const content = await ipcRenderer.invoke('read-file', filePath);
  editorEl.value = content;
  updatePreview();
  saveBtn.disabled = true;
  
  document.querySelectorAll('.file-tree-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.path === filePath) {
      el.classList.add('active');
    }
  });
}

function updatePreview() {
  const content = editorEl.value;
  const html = marked.parse(content);
  previewEl.innerHTML = html;
}

async function loadLinkGraph(folderPath) {
  linkGraph = await ipcRenderer.invoke('get-link-graph', folderPath);
  graphJsonEl.textContent = JSON.stringify(linkGraph, null, 2);
  
  const stats = linkGraph.statistics;
  graphStatsEl.innerHTML = `
    文件总数: ${stats.totalFiles} | 
    链接数: ${stats.totalLinks} | 
    孤立文件: ${stats.isolatedNodes}
  `;
  
  if (document.getElementById('visualTab').classList.contains('active')) {
    renderGraphVisual();
  }
}

function renderGraphVisual() {
  const canvas = graphCanvas;
  const ctx = canvas.getContext('2d');
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  ctx.fillStyle = '#252526';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  if (!linkGraph || linkGraph.nodes.length === 0) return;
  
  const nodes = linkGraph.nodes;
  const edges = linkGraph.edges;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) * 0.35;
  
  const positions = [];
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });
  
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  edges.forEach(edge => {
    const source = positions[edge.source];
    const target = positions[edge.target];
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  });
  
  nodes.forEach((node, i) => {
    const pos = positions[i];
    const nodeRadius = 8 + Math.min(node.linkCount * 2, 10);
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
    ctx.fillStyle = node.linkCount > 0 ? '#0e639c' : '#555';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = '#d4d4d4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.name.substring(0, 12), pos.x, pos.y + nodeRadius + 14);
  });
}
