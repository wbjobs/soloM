const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

console.log('Express version:', require('express/package.json').version);
console.log('__dirname:', __dirname);
console.log('Public path:', path.join(__dirname, 'public'));

app.use(cors());
app.use(express.json());

app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', time: new Date().toISOString() });
});

app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Sending file:', indexPath);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Error: ' + err.message);
        }
    });
});

const apiRouter = require('./src/routes/api');
app.use('/api', apiRouter);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
