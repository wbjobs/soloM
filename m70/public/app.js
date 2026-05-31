const API_BASE = '/api';
let mempoolTimer = null;
let currentWallet = null;
let currentNonce = 0;

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        
        if (btn.dataset.tab === 'explorer') {
            refreshChainInfo();
        }
        if (btn.dataset.tab === 'mempool') {
            refreshMempool();
            startMempoolAutoRefresh();
        } else {
            stopMempoolAutoRefresh();
        }
    });
});

function startMempoolAutoRefresh() {
    stopMempoolAutoRefresh();
    mempoolTimer = setInterval(refreshMempool, 2000);
}

function stopMempoolAutoRefresh() {
    if (mempoolTimer) {
        clearInterval(mempoolTimer);
        mempoolTimer = null;
    }
}

async function resolveDomain() {
    const name = document.getElementById('resolveName').value.trim();
    const resultDiv = document.getElementById('resolveResult');
    
    if (!name) {
        showResult(resultDiv, false, '请输入域名');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/resolve/${encodeURIComponent(name)}`);
        const data = await response.json();
        
        if (data.success) {
            const isConfirmed = data.status === 'confirmed';
            const isTransfer = data.txType === 'transfer';
            const statusLabel = isConfirmed ? '✅ 已上链确认' : '⏳ 内存池待确认';
            const statusColor = isConfirmed ? '#10b981' : '#f59e0b';
            showResult(resultDiv, true, `
                <h3>${statusLabel}</h3>
                <p><strong>状态:</strong> <span style="color: ${statusColor}">${data.status}</span></p>
                ${isTransfer ? `<p style="color: #7c3aed;"><strong>交易类型:</strong> 所有权转移</p>` : ''}
                <p><strong>域名:</strong> <code>${data.domain}</code></p>
                <p><strong>IP 地址:</strong> <code>${data.ip}</code></p>
                <p><strong>当前所有者:</strong> <code>${data.owner || data.newOwner}</code></p>
                ${isTransfer && !isConfirmed ? `
                    <p><strong>原所有者:</strong> <code>${data.currentOwner}</code></p>
                ` : ''}
                ${isConfirmed ? `
                    <p><strong>初始注册时间:</strong> ${new Date(data.registeredAt).toLocaleString()}</p>
                    <p><strong>注册区块:</strong> #${data.blockIndex}</p>
                    ${data.transferredAt ? `
                        <p><strong>最近转移时间:</strong> ${new Date(data.transferredAt).toLocaleString()}</p>
                        <p><strong>转移区块:</strong> #${data.transferBlockIndex}</p>
                        <p><strong>初始所有者:</strong> <code>${data.originalOwner}</code></p>
                    ` : ''}
                ` : `
                    <p><strong>Gas 费:</strong> ${data.gasPrice}</p>
                    <p><strong>交易 ID:</strong> <code>${data.txId}</code></p>
                    <p><em>${data.message}</em></p>
                `}
            `);
        } else {
            showResult(resultDiv, false, data.error);
        }
    } catch (error) {
        showResult(resultDiv, false, '请求失败: ' + error.message);
    }
}

async function registerDomain() {
    const name = document.getElementById('registerName').value.trim();
    const owner = document.getElementById('ownerAddress').value.trim();
    const gasPrice = document.getElementById('gasPrice').value;
    const resultDiv = document.getElementById('registerResult');
    
    if (!name || !owner) {
        showResult(resultDiv, false, '请填写域名和所有者地址');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                owner_address: owner,
                gas_price: Number(gasPrice) || 1
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showResult(resultDiv, true, `
                <h3>⏳ 交易已提交至内存池!</h3>
                <p><strong>域名:</strong> <code>${data.domain}</code></p>
                <p><strong>IP 地址:</strong> <code>${data.ip}</code></p>
                <p><strong>所有者:</strong> <code>${data.owner}</code></p>
                <p><strong>Gas 费:</strong> ${data.gasPrice}</p>
                <p><strong>交易 ID:</strong> <code>${data.txId}</code></p>
                <hr style="margin: 15px 0; border-color: rgba(255,255,255,0.1);">
                <p><em>${data.message}</em></p>
                <p style="color: #94a3b8; font-size: 0.9em;">💡 Gas 费越高的交易越优先被打包进下一个区块</p>
            `);
        } else {
            showResult(resultDiv, false, data.error);
        }
    } catch (error) {
        showResult(resultDiv, false, '请求失败: ' + error.message);
    }
}

async function refreshMempool() {
    try {
        const response = await fetch(`${API_BASE}/mempool`);
        const data = await response.json();
        
        if (data.success) {
            renderMempool(data);
        }
    } catch (error) {
        console.error('Failed to refresh mempool:', error);
    }
}

function renderMempool(data) {
    const countDiv = document.getElementById('mempoolCount');
    const listDiv = document.getElementById('mempoolList');
    
    countDiv.textContent = `待处理交易: ${data.size}`;
    
    if (data.size === 0) {
        listDiv.innerHTML = '<div class="empty-state">内存池为空，等待新交易...</div>';
        return;
    }
    
    listDiv.innerHTML = data.transactions.map((tx, index) => {
        const isTransfer = tx.type === 'TRANSFER_DOMAIN';
        const txTypeLabel = isTransfer ? '🔄 转移' : '📝 注册';
        const meta = isTransfer
            ? `从 <code>${tx.data.currentOwner.substring(0, 10)}...</code> → <code>${tx.data.newOwner.substring(0, 10)}...</code>`
            : `所有者: <code>${tx.data.owner.substring(0, 14)}...</code> | IP: <code>${tx.data.ip}</code>`;
        
        return `
        <div class="mempool-item ${index === 0 ? 'highest-gas' : ''}">
            <div class="mempool-rank">#${index + 1}</div>
            <div class="mempool-details">
                <div class="mempool-domain">${txTypeLabel} ${tx.data.name}</div>
                <div class="mempool-meta">
                    ${meta}
                </div>
            </div>
            <div class="mempool-gas">
                <div class="gas-value">${tx.gasPrice}</div>
                <div class="gas-label">Gas</div>
            </div>
        </div>
        `;
    }).join('');
}

async function refreshChainInfo() {
    try {
        const [infoRes, domainsRes, chainRes] = await Promise.all([
            fetch(`${API_BASE}/info`),
            fetch(`${API_BASE}/domains`),
            fetch(`${API_BASE}/chain`)
        ]);
        
        const infoData = await infoRes.json();
        const domainsData = await domainsRes.json();
        const chainData = await chainRes.json();
        
        renderChainInfo(infoData);
        renderDomainsList(domainsData.domains);
        renderBlocksList(chainData.chain);
    } catch (error) {
        console.error('Failed to refresh chain info:', error);
    }
}

function renderChainInfo(info) {
    const chainInfoDiv = document.getElementById('chainInfo');
    chainInfoDiv.innerHTML = `
        <div class="info-item">
            <div class="label">区块高度</div>
            <div class="value">${info.chainLength}</div>
        </div>
        <div class="info-item">
            <div class="label">域名数量</div>
            <div class="value">${info.stateSize}</div>
        </div>
        <div class="info-item">
            <div class="label">内存池</div>
            <div class="value" style="color: ${info.mempoolSize > 0 ? '#f59e0b' : '#10b981'}">${info.mempoolSize}</div>
        </div>
        <div class="info-item">
            <div class="label">链完整性</div>
            <div class="value" style="color: ${info.isChainValid ? '#10b981' : '#ef4444'}">${info.isChainValid ? '✓ 有效' : '✗ 无效'}</div>
        </div>
        <div class="info-item">
            <div class="label">最新区块</div>
            <div class="value">#${info.latestBlock.index}</div>
        </div>
        <div class="info-item">
            <div class="label">出块状态</div>
            <div class="value" style="color: ${info.blockProductionRunning ? '#10b981' : '#ef4444'}">${info.blockProductionRunning ? '▶ 运行中' : '⏸ 已停止'}</div>
        </div>
    `;
}

function renderDomainsList(domains) {
    const domainsListDiv = document.getElementById('domainsList');
    const domainKeys = Object.keys(domains);
    
    if (domainKeys.length === 0) {
        domainsListDiv.innerHTML = '<div class="empty-state">暂无已注册域名</div>';
        return;
    }
    
    domainsListDiv.innerHTML = domainKeys.map(name => {
        const domain = domains[name];
        return `
            <div class="domain-item">
                <div class="name">${name}</div>
                <div class="details">
                    IP: <code>${domain.ip}</code> | 所有者: <code>${domain.owner.substring(0, 10)}...</code>
                </div>
            </div>
        `;
    }).join('');
}

function renderBlocksList(chain) {
    const blocksListDiv = document.getElementById('blocksList');
    
    blocksListDiv.innerHTML = [...chain].reverse().map(block => {
        const gasPrices = block.transactions.map(tx => tx.gasPrice || '-').join(', ');
        return `
            <div class="block-item">
                <div class="block-header">
                    <span class="index">区块 #${block.index}</span>
                    <span class="hash">${block.hash.substring(0, 20)}...</span>
                </div>
                <div class="tx-count">
                    交易数: ${block.transactions.length} | 
                    Merkle 根: ${block.merkleRoot.substring(0, 20)}...
                    ${gasPrices ? ` | Gas: [${gasPrices}]` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function generateWallet() {
    if (typeof ethers === 'undefined') {
        alert('ethers.js 加载失败，请刷新页面');
        return;
    }
    
    const wallet = ethers.Wallet.createRandom();
    currentWallet = wallet;
    document.getElementById('privateKey').value = wallet.privateKey;
    updateWalletDisplay();
}

function importWallet() {
    if (typeof ethers === 'undefined') {
        alert('ethers.js 加载失败，请刷新页面');
        return;
    }
    
    const privateKey = document.getElementById('privateKey').value.trim();
    if (!privateKey) {
        alert('请输入私钥');
        return;
    }
    
    try {
        const wallet = new ethers.Wallet(privateKey);
        currentWallet = wallet;
        updateWalletDisplay();
    } catch (error) {
        alert('无效的私钥: ' + error.message);
    }
}

function updateWalletDisplay() {
    const walletInfoDiv = document.getElementById('walletInfo');
    if (!currentWallet) {
        walletInfoDiv.innerHTML = '';
        return;
    }
    
    walletInfoDiv.innerHTML = `
        <div class="label">钱包地址:</div>
        <div class="value">${currentWallet.address}</div>
        <div class="label">私钥:</div>
        <div class="value">${currentWallet.privateKey}</div>
        <div class="warning">⚠️ 请妥善保管私钥，不要泄露给他人</div>
    `;
}

function buildTransferMessage(name, newOwner, nonce) {
    const normalized = name.toLowerCase().trim();
    const domainName = normalized.endsWith('.dn') ? normalized : normalized + '.dn';
    return `Transfer domain ${domainName} to ${newOwner} (nonce: ${nonce})`;
}

function previewMessage() {
    const name = document.getElementById('transferName').value.trim();
    const newOwner = document.getElementById('newOwner').value.trim();
    
    if (!name || !newOwner) {
        alert('请填写域名和新所有者地址');
        return;
    }
    
    currentNonce = Date.now();
    const message = buildTransferMessage(name, newOwner, currentNonce);
    document.getElementById('messageToSign').textContent = message;
}

async function signAndTransfer() {
    if (!currentWallet) {
        alert('请先生成或导入钱包');
        return;
    }
    
    const name = document.getElementById('transferName').value.trim();
    const newOwner = document.getElementById('newOwner').value.trim();
    const gasPrice = document.getElementById('transferGasPrice').value;
    const resultDiv = document.getElementById('transferResult');
    
    if (!name || !newOwner) {
        showResult(resultDiv, false, '请填写域名和新所有者地址');
        return;
    }
    
    if (!currentNonce) {
        currentNonce = Date.now();
    }
    
    const message = buildTransferMessage(name, newOwner, currentNonce);
    
    try {
        const signature = await currentWallet.signMessage(message);
        
        const response = await fetch(`${API_BASE}/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                new_owner: newOwner,
                signature,
                nonce: currentNonce,
                gas_price: Number(gasPrice) || 1
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showResult(resultDiv, true, `
                <h3>⏳ 转移交易已提交至内存池!</h3>
                <p><strong>域名:</strong> <code>${data.domain}</code></p>
                <p><strong>当前所有者:</strong> <code>${data.currentOwner}</code></p>
                <p><strong>新所有者:</strong> <code>${data.newOwner}</code></p>
                <p><strong>Gas 费:</strong> ${data.gasPrice}</p>
                <p><strong>交易 ID:</strong> <code>${data.txId}</code></p>
                <p><strong>签名:</strong> <code style="font-size: 0.8em;">${signature.substring(0, 40)}...</code></p>
                <hr style="margin: 15px 0; border-color: rgba(255,255,255,0.1);">
                <p><em>${data.message}</em></p>
            `);
            
            currentNonce = 0;
            document.getElementById('messageToSign').textContent = '-';
        } else {
            showResult(resultDiv, false, `
                <p>${data.error}</p>
                ${data.details ? `<p style="font-size: 0.85em; color: #94a3b8;">期望签名者: <code>${data.details.expectedSigner}</code></p>` : ''}
            `);
        }
    } catch (error) {
        showResult(resultDiv, false, '请求失败: ' + error.message);
    }
}

function showResult(element, success, content) {
    element.className = `result ${success ? 'success' : 'error'}`;
    element.innerHTML = typeof content === 'string' ? content : `<h3>${success ? '✅ 成功' : '❌ 失败'}</h3><p>${content}</p>`;
}

document.addEventListener('DOMContentLoaded', () => {
    refreshChainInfo();
});
