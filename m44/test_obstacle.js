eval(require('fs').readFileSync('public/app.js', 'utf8'));

console.log('=== 障碍物功能测试 ===\n');

const testResolutions = [128, 256];

for (const res of testResolutions) {
    console.log(`测试分辨率 ${res}x${res}:`);
    
    const solver = new FluidSolverJS(res, res, 0.0001, 0.00001, 0.2);
    
    const centerX = Math.floor(res / 2);
    const centerY = Math.floor(res / 2);
    
    console.log(`  在 (${centerX}, ${centerY}) 添加半径为 10 的障碍物`);
    solver.addObstacle(centerX, centerY, 10);
    
    let obstacleCount = 0;
    for (let i = 0; i < solver.size; i++) {
        if (solver.obstacles[i]) obstacleCount++;
    }
    console.log(`  障碍物网格数: ${obstacleCount}`);
    
    console.log(`  验证障碍物位置: isObstacle(${centerX}, ${centerY}) = ${solver.isObstacle(centerX, centerY)}`);
    
    console.log(`  在障碍物周围添加流体...`);
    solver.addDensity(centerX - 30, centerY, 100, 15);
    solver.addVelocity(centerX - 30, centerY, 20, 0, 15);
    
    let initialDensity = 0;
    for (let i = 0; i < solver.size; i++) {
        initialDensity += solver.density[i];
    }
    
    console.log(`  初始总密度: ${initialDensity.toFixed(2)}`);
    
    console.log(`  运行 10 步模拟...`);
    for (let i = 0; i < 10; i++) {
        solver.step();
    }
    
    let finalDensity = 0;
    let obstacleDensity = 0;
    for (let i = 0; i < solver.size; i++) {
        finalDensity += solver.density[i];
        if (solver.obstacles[i]) {
            obstacleDensity += solver.density[i];
        }
    }
    
    console.log(`  最终总密度: ${finalDensity.toFixed(2)}`);
    console.log(`  障碍物区域密度: ${obstacleDensity.toFixed(2)} (应该接近 0)`);
    
    if (obstacleDensity < 1) {
        console.log('  ✓ 障碍物边界条件工作正常!\n');
    } else {
        console.log('  ⚠ 障碍物区域仍有密度残留\n');
    }
}

console.log('=== 测试完成 ===');
console.log('\n障碍物功能已实现:');
console.log('1. addObstacle(x, y, radius) - 添加圆形障碍物');
console.log('2. removeObstacle(x, y, radius) - 移除障碍物');
console.log('3. clearObstacles() - 清除所有障碍物');
console.log('4. isObstacle(x, y) - 检查是否为障碍物');
console.log('5. getObstacles() - 获取障碍物数组');
console.log('6. resetAll() - 重置流体和障碍物');
