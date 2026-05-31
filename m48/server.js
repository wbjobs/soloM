const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

const WALL_MATERIALS = {
    concrete: {
        name: '混凝土',
        attenuation24GHz: 12,
        attenuation5GHz: 18,
        color: 0x6b6b6b
    },
    wood: {
        name: '木板',
        attenuation24GHz: 4,
        attenuation5GHz: 6,
        color: 0x8b4513
    },
    brick: {
        name: '砖墙',
        attenuation24GHz: 8,
        attenuation5GHz: 12,
        color: 0xb22222
    },
    glass: {
        name: '玻璃',
        attenuation24GHz: 2,
        attenuation5GHz: 3,
        color: 0x87ceeb
    },
    metal: {
        name: '金属',
        attenuation24GHz: 25,
        attenuation5GHz: 35,
        color: 0x708090
    }
};

function getWallMaterial(wall) {
    const materialName = wall.material || 'concrete';
    return WALL_MATERIALS[materialName] || WALL_MATERIALS.concrete;
}

function getAttenuationForWall(wall, channel) {
    const material = getWallMaterial(wall);
    const is5GHz = channel >= 36;
    const attenuation = is5GHz ? material.attenuation5GHz : material.attenuation24GHz;
    return attenuation;
}

function calculateRSSI(router, point) {
    const dx = point.x - router.x;
    const dy = point.y - router.y;
    const dz = point.z - router.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance < 0.1) {
        return router.power;
    }
    
    const pathLossExponent = 3.0;
    const referenceLoss = 40;
    const rssi = router.power - referenceLoss - (10 * pathLossExponent * Math.log10(distance));
    
    return Math.max(rssi, -100);
}

function lineSegmentsIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
        return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };
    
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

function calculateWallAttenuation(router, point, walls, channel) {
    let totalAttenuation = 0;
    
    const rayStart = { x: router.x, y: router.y };
    const rayEnd = { x: point.x, y: point.y };
    
    const dx = rayEnd.x - rayStart.x;
    const dy = rayEnd.y - rayStart.y;
    const rayLength = Math.sqrt(dx * dx + dy * dy);
    
    if (rayLength < 0.1) {
        return 0;
    }
    
    for (const wall of walls) {
        const wallStart = { x: wall.x1, y: wall.y1 };
        const wallEnd = { x: wall.x2, y: wall.y2 };
        
        if (lineSegmentsIntersect(rayStart, rayEnd, wallStart, wallEnd)) {
            const attenuation = getAttenuationForWall(wall, channel);
            totalAttenuation += attenuation;
        }
    }
    
    return totalAttenuation;
}

function dBmToMW(dBm) {
    return Math.pow(10, dBm / 10);
}

function mWToDBm(mW) {
    if (mW <= 0) return -100;
    return 10 * Math.log10(mW);
}

function calculateCombinedRSSI(routers, point, walls) {
    const channelGroups = {};
    
    for (const router of routers) {
        const channel = router.channel || 1;
        let rssi = calculateRSSI(router, point);
        if (walls && walls.length > 0) {
            const wallAtten = calculateWallAttenuation(router, point, walls, channel);
            rssi -= wallAtten;
        }
        
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(rssi);
    }
    
    let maxChannelRSSI = -100;
    
    for (const channel in channelGroups) {
        const rssiList = channelGroups[channel];
        let totalMW = 0;
        
        for (const rssi of rssiList) {
            totalMW += dBmToMW(rssi);
        }
        
        const combinedRSSI = mWToDBm(totalMW);
        maxChannelRSSI = Math.max(maxChannelRSSI, combinedRSSI);
    }
    
    return maxChannelRSSI;
}

app.post('/api/calculate-rssi', (req, res) => {
    try {
        const { routers, gridSize, roomSize, walls } = req.body;
        
        if (!routers || !gridSize || !roomSize) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const gridPoints = [];
        const stepX = roomSize.width / (gridSize.x - 1);
        const stepY = roomSize.depth / (gridSize.y - 1);
        
        for (let i = 0; i < gridSize.x; i++) {
            for (let j = 0; j < gridSize.y; j++) {
                const x = i * stepX - roomSize.width / 2;
                const y = j * stepY - roomSize.depth / 2;
                const z = 0;
                
                const routerRSSIs = [];
                for (const router of routers) {
                    const channel = router.channel || 1;
                    let rssi = calculateRSSI(router, { x, y, z });
                    if (walls && walls.length > 0) {
                        const wallAtten = calculateWallAttenuation(router, { x, y, z }, walls, channel);
                        rssi -= wallAtten;
                    }
                    routerRSSIs.push({
                        routerId: router.id || routerRSSIs.length,
                        channel: channel,
                        rssi: rssi
                    });
                }
                
                const combinedRSSI = calculateCombinedRSSI(routers, { x, y, z }, walls);
                
                gridPoints.push({
                    x, y, z,
                    rssi: combinedRSSI,
                    routerRSSIs: routerRSSIs
                });
            }
        }
        
        res.json({
            success: true,
            gridPoints,
            gridSize,
            roomSize
        });
    } catch (error) {
        console.error('Error calculating RSSI:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/room-model', (req, res) => {
    const roomModel = {
        name: 'Simple Apartment',
        size: { width: 10, depth: 8, height: 2.8 },
        walls: [
            { id: 1, type: 'outer', material: 'concrete', x1: -5, y1: -4, x2: 5, y2: -4, height: 2.8 },
            { id: 2, type: 'outer', material: 'concrete', x1: 5, y1: -4, x2: 5, y2: 4, height: 2.8 },
            { id: 3, type: 'outer', material: 'concrete', x1: 5, y1: 4, x2: -5, y2: 4, height: 2.8 },
            { id: 4, type: 'outer', material: 'concrete', x1: -5, y1: 4, x2: -5, y2: -4, height: 2.8 },
            { id: 5, type: 'inner', material: 'brick', x1: -1, y1: -4, x2: -1, y2: 1, height: 2.8 },
            { id: 6, type: 'inner', material: 'wood', x1: -1, y1: 2, x2: 2, y2: 2, height: 2.8 }
        ],
        obstacles: []
    };
    
    res.json(roomModel);
});

app.get('/api/wall-materials', (req, res) => {
    res.json({
        success: true,
        materials: WALL_MATERIALS
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
