function lineSegmentsIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
        return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };
    
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

const rayStart = { x: -3, y: 0 };
const rayEnd = { x: 2, y: 0 };
const wallStart = { x: 0, y: -5 };
const wallEnd = { x: 0, y: 5 };

console.log('Testing intersection:');
console.log('Ray from (-3,0) to (2,0)');
console.log('Wall from (0,-5) to (0,5)');
console.log('Intersect:', lineSegmentsIntersect(rayStart, rayEnd, wallStart, wallEnd));

const rayStart2 = { x: -3, y: 0 };
const rayEnd2 = { x: -2, y: 0 };
console.log('\nTesting intersection 2:');
console.log('Ray from (-3,0) to (-2,0)');
console.log('Wall from (0,-5) to (0,5)');
console.log('Intersect:', lineSegmentsIntersect(rayStart2, rayEnd2, wallStart, wallEnd));

function ccw(A, B, C) {
    const result = (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    console.log(`ccw(A=(${A.x},${A.y}), B=(${B.x},${B.y}), C=(${C.x},${C.y})) = ${result}`);
    return result;
}

console.log('\nDetailed CCW calculation for first test:');
console.log('ccw(p1,p3,p4):', ccw(rayStart, wallStart, wallEnd));
console.log('ccw(p2,p3,p4):', ccw(rayEnd, wallStart, wallEnd));
console.log('ccw(p1,p2,p3):', ccw(rayStart, rayEnd, wallStart));
console.log('ccw(p1,p2,p4):', ccw(rayStart, rayEnd, wallEnd));
