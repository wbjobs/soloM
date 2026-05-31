const path = require('path');

function calculateRSSI(router, point) {
    const dx = point.x - router.x;
    const dy = point.y - router.y;
    const dz = point.z - router.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    console.log(`  dx=${dx}, dy=${dy}, dz=${dz}, distance=${distance.toFixed(4)}m`);
    
    if (distance < 0.1) {
        return router.power;
    }
    
    const pathLossExponent = 3.0;
    const referenceLoss = 40;
    const rssi = router.power - referenceLoss - (10 * pathLossExponent * Math.log10(distance));
    
    console.log(`  Ptx=${router.power}, referenceLoss=${referenceLoss}, 30*log10(d)=${(30*Math.log10(distance)).toFixed(4)}`);
    console.log(`  RSSI = ${router.power} - ${referenceLoss} - ${(30*Math.log10(distance)).toFixed(4)} = ${rssi.toFixed(4)}`);
    
    return Math.max(rssi, -100);
}

const router = { x: -3, y: 0, z: 1.5, power: 20 };
const pointLeft = { x: -2.33, y: 0, z: 0 };
const pointRight = { x: 2.33, y: 0, z: 0 };

console.log('Testing left point (-2.33, 0, 0):');
const rssiLeft = calculateRSSI(router, pointLeft);
console.log(`  Result: ${rssiLeft.toFixed(4)} dBm\n`);

console.log('Testing right point (2.33, 0, 0):');
const rssiRight = calculateRSSI(router, pointRight);
console.log(`  Result: ${rssiRight.toFixed(4)} dBm\n`);

console.log(`Difference: ${(rssiLeft - rssiRight).toFixed(4)} dB`);

console.log('\nWith concrete wall attenuation (12dB) for right point:');
console.log(`  Right RSSI with wall: ${(rssiRight - 12).toFixed(4)} dBm`);
console.log(`  Total attenuation: ${(rssiLeft - (rssiRight - 12)).toFixed(4)} dB`);
