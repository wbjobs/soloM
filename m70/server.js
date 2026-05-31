const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🌐 去中心化域名解析服务已启动                           ║
║                                                           ║
║   前端界面: http://localhost:${PORT}                        ║
║                                                           ║
║   API 接口:                                               ║
║   • POST /api/register    - 注册域名                      ║
║   • POST /api/transfer    - 转移域名所有权 (需签名)       ║
║   • GET  /api/resolve/:name - 解析域名                    ║
║   • GET  /api/mempool     - 查询内存池                    ║
║   • GET  /api/info        - 区块链信息                    ║
║   • GET  /api/chain       - 完整区块链                    ║
║   • GET  /api/domains     - 所有域名                      ║
║   • GET  /api/verify      - 验证链完整性                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
