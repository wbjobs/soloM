const http = require('http');

function makeRequest(path, method, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch (e) { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function dBmToMW(dBm) { return Math.pow(10, dBm / 10); }
function mWToDBm(mW) { return mW <= 0 ? -100 : 10 * Math.log10(mW); }

function calculateRSSI(router, point) {
    const dx = point.x - router.x;
    const dy = point.y - router.y;
    const dz = point.z - router.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dy);
    
    if (distance < 0.1) return router.power;
    
    const pathLossExponent = 3.0;
    const referenceLoss = 40;
    const rssi = router.power - referenceLoss - (10 * pathLossExponent * Math.log10(distance));
    return Math.max(rssi, -100);
}

async function debug() {
    const body = {
        routers: [{ id: 1, x: -3, y: 0, z: 1.5, power: 20, channel: 1 }],
        gridSize: { x: 7, y: 5 },
        roomSize: { width: 14, depth: 10 },
        walls: [{ id: 1, material: 'concrete', x1: 0, y1: -5, x2: 0, y2: 5 }]
    };

    const res = await makeRequest('/api/calculate-rssi', 'POST', body);
    
    console.log('Response status:', res.status);
    console.log('Response data:', JSON.stringify(res.data, null, 2).substring(0, 500));
    
    if (!res.data || !res.data.gridPoints) {
        console.log('No gridPoints in response');
        return;
    }
    
    console.log('Expected values (without wall):');
    const pointLeft = { x: -2, y: 0, z: 0 };
    const pointRight = { x: 2, y: 0, z: 0 };
    console.log(`  Point (-2,0): RSSI = ${calculateRSSI(body.routers[0], pointLeft).toFixed(2)} dBm, distance = 1m`);
    console.log(`  Point (2,0): RSSI = ${calculateRSSI(body.routers[0], pointRight).toFixed(2)} dBm, distance = 5m`);
    console.log(`  Distance attenuation difference = ${(calculateRSSI(body.routers[0], pointLeft) - calculateRSSI(body.routers[0], pointRight)).toFixed(2)} dB`);
    console.log(`  Expected with concrete wall (12dB) at point (2,0): ${(calculateRSSI(body.routers[0], pointRight) - 12).toFixed(2)} dBm`);
    console.log(`  Expected attenuation difference (wall + distance): ${(12 + (calculateRSSI(body.routers[0], pointLeft) - calculateRSSI(body.routers[0], pointRight))).toFixed(2)} dB`);
    
    console.log('\nActual grid points:');
    for (let i = 0; i < res.data.gridPoints.length; i++) {
        const p = res.data.gridPoints[i];
        console.log(`  [${i}] x=${p.x.toFixed(2)}, y=${p.y.toFixed(2)}, rssi=${p.rssi.toFixed(2)} dBm`);
    }
    
    console.log('\nRouter and wall info:');
    console.log(`  Router at (${body.routers[0].x}, ${body.routers[0].y})`);
    console.log(`  Wall from (${body.walls[0].x1}, ${body.walls[0].y1}) to (${body.walls[0].x2}, ${body.walls[0].y2})`);
    console.log(`  Wall material: ${body.walls[0].material}, attenuation 2.4GHz: 12dB`);
    
    const left = res.data.gridPoints.find(p => Math.abs(p.x - (-2)) < 1 && Math.abs(p.y) < 1);
    const right = res.data.gridPoints.find(p => Math.abs(p.x - 2) < 1 && Math.abs(p.y) < 1);
    
    if (left && right) {
        console.log('\nComparison:');
        console.log(`  Left point: x=${left.x.toFixed(2)}, y=${left.y.toFixed(2)}, rssi=${left.rssi.toFixed(2)}`);
        console.log(`  Right point: x=${right.x.toFixed(2)}, y=${right.y.toFixed(2)}, rssi=${right.rssi.toFixed(2)}`);
        console.log(`  Actual difference: ${(left.rssi - right.rssi).toFixed(2)} dB`);
    }
}

debug();
