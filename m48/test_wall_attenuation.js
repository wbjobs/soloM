const http = require('http');

function makeRequest(path, method, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

function calculateExpectedRSSI(router, point, wallAtten) {
    const dx = point.x - router.x;
    const dy = point.y - router.y;
    const dz = point.z - router.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance < 0.1) return router.power;
    
    const pathLossExponent = 3.0;
    const referenceLoss = 40;
    const rssi = router.power - referenceLoss - (10 * pathLossExponent * Math.log10(distance)) - wallAtten;
    
    return Math.max(rssi, -100);
}

async function runTests() {
    console.log('=== Testing Wall Materials API ===\n');

    try {
        const materialsRes = await makeRequest('/api/wall-materials', 'GET');
        console.log('Wall Materials API Status:', materialsRes.status);
        if (materialsRes.status === 200) {
            console.log('Available materials:', Object.keys(materialsRes.data.materials));
            for (const [name, mat] of Object.entries(materialsRes.data.materials)) {
                console.log(`  ${name}: 2.4GHz=${mat.attenuation24GHz}dB, 5GHz=${mat.attenuation5GHz}dB`);
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    console.log('\n=== Testing RSSI with Different Wall Materials ===\n');

    const testCases = [
        { material: 'wood', channel: 1, wallAtten: 4, desc: '木板, 2.4GHz' },
        { material: 'concrete', channel: 1, wallAtten: 12, desc: '混凝土, 2.4GHz' },
        { material: 'concrete', channel: 36, wallAtten: 18, desc: '混凝土, 5GHz' },
        { material: 'metal', channel: 1, wallAtten: 25, desc: '金属, 2.4GHz' },
        { material: 'glass', channel: 1, wallAtten: 2, desc: '玻璃, 2.4GHz' }
    ];

    let allPassed = true;
    const results = [];

    for (const testCase of testCases) {
        const body = {
            routers: [{ id: 1, x: -3, y: 0, z: 1.5, power: 20, channel: testCase.channel }],
            gridSize: { x: 7, y: 5 },
            roomSize: { width: 14, depth: 10 },
            walls: [{ id: 1, material: testCase.material, x1: 0, y1: -5, x2: 0, y2: 5 }]
        };

        try {
            const res = await makeRequest('/api/calculate-rssi', 'POST', body);
            if (res.status === 200 && res.data.success) {
                console.log(`${testCase.desc}:`);
                
                const leftPoint = res.data.gridPoints.find(p => Math.abs(p.x - (-2)) < 1 && Math.abs(p.y) < 1);
                const rightPoint = res.data.gridPoints.find(p => Math.abs(p.x - 2) < 1 && Math.abs(p.y) < 1);

                if (leftPoint && rightPoint) {
                    const router = body.routers[0];
                    const distLeft = Math.sqrt(Math.pow(leftPoint.x - (-3), 2) + Math.pow(leftPoint.y - 0, 2) + Math.pow(leftPoint.z - 1.5, 2));
                    const distRight = Math.sqrt(Math.pow(rightPoint.x - (-3), 2) + Math.pow(rightPoint.y - 0, 2) + Math.pow(rightPoint.z - 1.5, 2));
                    
                    const expectedLeft = calculateExpectedRSSI(router, leftPoint, 0);
                    const expectedRight = calculateExpectedRSSI(router, rightPoint, testCase.wallAtten);
                    
                    const actualAtten = leftPoint.rssi - rightPoint.rssi;
                    const expectedAtten = expectedLeft - expectedRight;
                    
                    console.log(`  墙左侧点: x=${leftPoint.x.toFixed(2)}, y=${leftPoint.y.toFixed(2)}, distance=${distLeft.toFixed(2)}m`);
                    console.log(`  墙右侧点: x=${rightPoint.x.toFixed(2)}, y=${rightPoint.y.toFixed(2)}, distance=${distRight.toFixed(2)}m`);
                    console.log(`  墙左侧 RSSI: 实际=${leftPoint.rssi.toFixed(2)} dBm, 预期=${expectedLeft.toFixed(2)} dBm`);
                    console.log(`  墙右侧 RSSI: 实际=${rightPoint.rssi.toFixed(2)} dBm, 预期=${expectedRight.toFixed(2)} dBm (墙体衰减=${testCase.wallAtten}dB)`);
                    console.log(`  总衰减: 实际=${actualAtten.toFixed(2)} dB, 预期=${expectedAtten.toFixed(2)} dB`);
                    
                    const tolerance = 2;
                    const passed = Math.abs(actualAtten - expectedAtten) < tolerance;
                    if (passed) {
                        console.log(`  结果: ✓ 通过\n`);
                    } else {
                        console.log(`  结果: ✗ 偏差 ${Math.abs(actualAtten - expectedAtten).toFixed(2)} dB\n`);
                        allPassed = false;
                    }
                    results.push({ test: testCase.desc, passed, actual: actualAtten, expected: expectedAtten });
                }
            } else {
                console.log(`${testCase.desc}: API Error - ${res.status}, ${JSON.stringify(res.data)}\n`);
            }
        } catch (e) {
            console.error(`${testCase.desc}: Error - ${e.message}\n`);
        }
    }

    console.log('=== Test Summary ===');
    for (const r of results) {
        console.log(`  ${r.test}: ${r.passed ? '✓' : '✗'} (${r.actual.toFixed(2)} vs ${r.expected.toFixed(2)} dB)`);
    }
    console.log(`\nOverall: ${allPassed ? '✓ All tests passed!' : '✗ Some tests failed'}`);
}

runTests();
