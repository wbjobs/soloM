const { ethers } = require('ethers');

async function testTransfer() {
    console.log('🧪 开始测试域名转移功能...\n');

    const DomainService = require('./src/services/domainService');
    const service = new DomainService();

    const aliceWallet = ethers.Wallet.createRandom();
    const bobWallet = ethers.Wallet.createRandom();
    const charlieWallet = ethers.Wallet.createRandom();

    console.log('👛 生成的钱包:');
    console.log(`  Alice:   ${aliceWallet.address}`);
    console.log(`  Bob:     ${bobWallet.address}`);
    console.log(`  Charlie: ${charlieWallet.address}`);
    console.log();

    console.log('📝 步骤1: Alice 注册域名 alice.dn');
    const registerResult = service.register('alice', aliceWallet.address, 5);
    console.log('注册结果:', JSON.stringify(registerResult, null, 2));
    console.log();

    console.log('⛏️  步骤2: 手动出块 (模拟 10 秒定时器)');
    service.produceBlock();
    console.log();

    console.log('🔍 步骤3: 查询域名当前状态');
    const resolve1 = service.resolve('alice');
    console.log('解析结果:', JSON.stringify(resolve1, null, 2));
    console.log();

    console.log('🔏 步骤4: Alice 签名转移消息，将域名转给 Bob');
    const nonce = Date.now();
    const message = service.buildTransferMessage('alice.dn', bobWallet.address, nonce);
    console.log('待签名消息:', message);
    
    const signature = await aliceWallet.signMessage(message);
    console.log('签名结果:', signature);
    console.log();

    console.log('✅ 步骤5: 服务端验证签名并提交转移交易');
    const transferResult = service.transfer('alice', bobWallet.address, signature, nonce, 10);
    console.log('转移结果:', JSON.stringify(transferResult, null, 2));
    console.log();

    console.log('🔍 步骤6: 查询域名状态 (应显示 pending transfer)');
    const resolve2 = service.resolve('alice');
    console.log('解析结果:', JSON.stringify(resolve2, null, 2));
    console.log();

    console.log('⛏️  步骤7: 再次出块，打包转移交易');
    service.produceBlock();
    console.log();

    console.log('🔍 步骤8: 查询域名状态 (应显示已转移给 Bob)');
    const resolve3 = service.resolve('alice');
    console.log('解析结果:', JSON.stringify(resolve3, null, 2));
    console.log();

    console.log('❌ 负向测试: Bob 尝试用自己的私钥转移(应该失败，因为消息是 Alice 签名的)');
    const badNonce = Date.now();
    const badMessage = service.buildTransferMessage('alice.dn', charlieWallet.address, badNonce);
    const badSignature = await bobWallet.signMessage(badMessage);
    const badTransfer = service.transfer('alice', charlieWallet.address, badSignature, badNonce, 5);
    console.log('转移结果:', JSON.stringify(badTransfer, null, 2));
    console.log();

    console.log('❌ 负向测试: Alice 用自己的私钥签名转移给 Charlie (应该失败，因为当前所有者已是 Bob)');
    const badNonce2 = Date.now();
    const badMessage2 = service.buildTransferMessage('alice.dn', charlieWallet.address, badNonce2);
    const badSignature2 = await aliceWallet.signMessage(badMessage2);
    const badTransfer2 = service.transfer('alice', charlieWallet.address, badSignature2, badNonce2, 5);
    console.log('转移结果:', JSON.stringify(badTransfer2, null, 2));
    console.log();

    console.log('✅ 验证: Bob 用自己的私钥签名转移给 Charlie (应该成功)');
    const nonce3 = Date.now();
    const message3 = service.buildTransferMessage('alice.dn', charlieWallet.address, nonce3);
    const signature3 = await bobWallet.signMessage(message3);
    const transfer3 = service.transfer('alice', charlieWallet.address, signature3, nonce3, 8);
    console.log('转移结果:', JSON.stringify(transfer3, null, 2));
    console.log();

    console.log('⛏️  出块确认第二次转移');
    service.produceBlock();
    console.log();

    console.log('🔍 最终查询域名状态');
    const resolveFinal = service.resolve('alice');
    console.log('解析结果:', JSON.stringify(resolveFinal, null, 2));
    console.log();

    console.log('✅ 所有测试完成!');
}

testTransfer().catch(console.error);
