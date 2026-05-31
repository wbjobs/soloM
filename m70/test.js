const DomainService = require('./src/services/domainService');

console.log('🧪 开始测试去中心化域名服务...\n');

const service = new DomainService();

console.log('📊 初始区块链信息:');
const info = service.getBlockchainInfo();
console.log(JSON.stringify(info, null, 2));
console.log();

console.log('📝 测试域名注册...');
const result1 = service.register('mydomain', '0x1234567890abcdef1234567890abcdef12345678');
console.log('注册结果:', JSON.stringify(result1, null, 2));
console.log();

console.log('📝 注册另一个域名...');
const result2 = service.register('testdomain', '0xabcdef1234567890abcdef1234567890abcdef12');
console.log('注册结果:', JSON.stringify(result2, null, 2));
console.log();

console.log('🔍 测试域名解析...');
const resolveResult = service.resolve('mydomain');
console.log('解析结果:', JSON.stringify(resolveResult, null, 2));
console.log();

console.log('🔍 解析不存在的域名...');
const notFoundResult = service.resolve('nonexistent');
console.log('解析结果:', JSON.stringify(notFoundResult, null, 2));
console.log();

console.log('📊 最终区块链信息:');
const finalInfo = service.getBlockchainInfo();
console.log(JSON.stringify(finalInfo, null, 2));
console.log();

console.log('✅ 所有测试完成!');
