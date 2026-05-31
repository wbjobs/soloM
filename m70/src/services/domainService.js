const Blockchain = require('../blockchain/blockchain');
const { ethers } = require('ethers');

class DomainService {
    constructor() {
        this.blockchain = new Blockchain();
        this.tld = '.dn';
        this.mempool = [];
        this.blockInterval = null;
        this.blockProductionInterval = 10000;
        this.txIdCounter = 0;
    }

    generateTxId() {
        return `tx_${Date.now()}_${++this.txIdCounter}`;
    }

    normalizeName(name) {
        const normalized = name.toLowerCase().trim();
        if (!normalized.endsWith(this.tld)) {
            return normalized + this.tld;
        }
        return normalized;
    }

    generateRandomIP() {
        return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    }

    isDomainPending(name) {
        return this.mempool.some(tx => tx.data.name === name);
    }

    buildTransferMessage(name, newOwner, nonce) {
        return `Transfer domain ${name} to ${newOwner} (nonce: ${nonce})`;
    }

    verifySignature(message, signature, expectedSigner) {
        try {
            const recoveredAddress = ethers.verifyMessage(message, signature);
            return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
        } catch (error) {
            return false;
        }
    }

    register(name, ownerAddress, gasPrice = 1) {
        const normalizedName = this.normalizeName(name);

        if (this.blockchain.getDomain(normalizedName)) {
            return {
                success: false,
                error: 'Domain already registered on chain',
                domain: normalizedName
            };
        }

        if (this.isDomainPending(normalizedName)) {
            return {
                success: false,
                error: 'Domain already pending in mempool',
                domain: normalizedName
            };
        }

        const gasPriceNum = Number(gasPrice);
        if (isNaN(gasPriceNum) || gasPriceNum < 1) {
            return {
                success: false,
                error: 'gas_price must be a number >= 1'
            };
        }

        const ip = this.generateRandomIP();
        const txId = this.generateTxId();

        const transaction = {
            txId,
            type: 'REGISTER_DOMAIN',
            gasPrice: gasPriceNum,
            data: {
                name: normalizedName,
                owner: ownerAddress,
                ip: ip,
                timestamp: Date.now()
            }
        };

        this.mempool.push(transaction);

        return {
            success: true,
            status: 'pending',
            domain: normalizedName,
            owner: ownerAddress,
            ip: ip,
            txId,
            gasPrice: gasPriceNum,
            message: 'Transaction added to mempool, waiting for next block production'
        };
    }

    startBlockProduction() {
        if (this.blockInterval) return;

        this.blockInterval = setInterval(() => {
            this.produceBlock();
        }, this.blockProductionInterval);

        console.log(`⛏️  Block production started (interval: ${this.blockProductionInterval / 1000}s)`);
    }

    stopBlockProduction() {
        if (this.blockInterval) {
            clearInterval(this.blockInterval);
            this.blockInterval = null;
            console.log('⏹️  Block production stopped');
        }
    }

    produceBlock() {
        if (this.mempool.length === 0) {
            console.log(`⏳ [${new Date().toLocaleTimeString()}] No transactions in mempool, skipping block`);
            return;
        }

        const sorted = [...this.mempool].sort((a, b) => b.gasPrice - a.gasPrice);
        const includedNames = new Set();
        const validTransactions = [];

        for (const tx of sorted) {
            const domainName = tx.data.name;
            if (includedNames.has(domainName)) {
                continue;
            }

            if (tx.type === 'REGISTER_DOMAIN') {
                if (this.blockchain.getDomain(domainName)) {
                    continue;
                }
            } else if (tx.type === 'TRANSFER_DOMAIN') {
                const domain = this.blockchain.getDomain(domainName);
                if (!domain || domain.owner.toLowerCase() !== tx.data.currentOwner.toLowerCase()) {
                    continue;
                }
            }

            includedNames.add(domainName);
            validTransactions.push(tx);
        }

        this.mempool = this.mempool.filter(tx => !validTransactions.includes(tx));

        for (const tx of validTransactions) {
            this.blockchain.addTransaction(tx);
        }

        const block = this.blockchain.minePendingTransactions();

        const txTypes = validTransactions.map(tx => `${tx.type}:${tx.data.name.substring(0, 10)}`).join(', ');
        console.log(`✅ [${new Date().toLocaleTimeString()}] Block #${block.index} mined with ${validTransactions.length} tx(s) [${txTypes}], hash: ${block.hash.substring(0, 16)}...`);

        return block;
    }

    resolve(name) {
        const normalizedName = this.normalizeName(name);

        const domain = this.blockchain.getDomain(normalizedName);
        if (domain) {
            return {
                success: true,
                status: 'confirmed',
                domain: normalizedName,
                ip: domain.ip,
                owner: domain.owner,
                registeredAt: domain.registeredAt,
                blockIndex: domain.blockIndex,
                transferredAt: domain.transferredAt || null,
                transferBlockIndex: domain.transferBlockIndex || null,
                originalOwner: domain.originalOwner || domain.owner
            };
        }

        const pendingTx = this.mempool.find(tx => tx.data.name === normalizedName);
        if (pendingTx) {
            if (pendingTx.type === 'REGISTER_DOMAIN') {
                return {
                    success: true,
                    status: 'pending',
                    txType: 'registration',
                    domain: normalizedName,
                    ip: pendingTx.data.ip,
                    owner: pendingTx.data.owner,
                    gasPrice: pendingTx.gasPrice,
                    txId: pendingTx.txId,
                    message: 'Domain registration is pending in mempool'
                };
            } else if (pendingTx.type === 'TRANSFER_DOMAIN') {
                return {
                    success: true,
                    status: 'pending',
                    txType: 'transfer',
                    domain: normalizedName,
                    currentOwner: pendingTx.data.currentOwner,
                    newOwner: pendingTx.data.newOwner,
                    gasPrice: pendingTx.gasPrice,
                    txId: pendingTx.txId,
                    message: 'Domain transfer is pending in mempool'
                };
            }
        }

        return {
            success: false,
            error: 'Domain not found',
            domain: normalizedName
        };
    }

    transfer(name, newOwner, signature, nonce, gasPrice = 1) {
        const normalizedName = this.normalizeName(name);

        const domain = this.blockchain.getDomain(normalizedName);
        if (!domain) {
            return {
                success: false,
                error: 'Domain not found',
                domain: normalizedName
            };
        }

        const currentOwner = domain.owner;
        if (currentOwner.toLowerCase() === newOwner.toLowerCase()) {
            return {
                success: false,
                error: 'New owner must be different from current owner',
                domain: normalizedName
            };
        }

        if (this.isDomainPending(normalizedName)) {
            return {
                success: false,
                error: 'Domain already has a pending transaction in mempool',
                domain: normalizedName
            };
        }

        if (!nonce) {
            return {
                success: false,
                error: 'nonce is required for signature verification'
            };
        }

        const message = this.buildTransferMessage(normalizedName, newOwner, nonce);

        if (!this.verifySignature(message, signature, currentOwner)) {
            return {
                success: false,
                error: 'Invalid signature',
                domain: normalizedName,
                details: {
                    expectedSigner: currentOwner,
                    message: message
                }
            };
        }

        const gasPriceNum = Number(gasPrice);
        if (isNaN(gasPriceNum) || gasPriceNum < 1) {
            return {
                success: false,
                error: 'gas_price must be a number >= 1'
            };
        }

        const txId = this.generateTxId();

        const transaction = {
            txId,
            type: 'TRANSFER_DOMAIN',
            gasPrice: gasPriceNum,
            data: {
                name: normalizedName,
                currentOwner,
                newOwner,
                nonce,
                signature,
                timestamp: Date.now()
            }
        };

        this.mempool.push(transaction);

        return {
            success: true,
            status: 'pending',
            domain: normalizedName,
            currentOwner,
            newOwner,
            txId,
            gasPrice: gasPriceNum,
            message: 'Transfer transaction added to mempool, waiting for next block production'
        };
    }

    getMempool() {
        return {
            size: this.mempool.length,
            transactions: [...this.mempool].sort((a, b) => b.gasPrice - a.gasPrice)
        };
    }

    getBlockchainInfo() {
        return {
            chainLength: this.blockchain.chain.length,
            isChainValid: this.blockchain.isChainValid(),
            mempoolSize: this.mempool.length,
            blockProductionRunning: !!this.blockInterval,
            blockProductionInterval: this.blockProductionInterval,
            latestBlock: {
                index: this.blockchain.getLatestBlock().index,
                hash: this.blockchain.getLatestBlock().hash,
                timestamp: this.blockchain.getLatestBlock().timestamp,
                transactionCount: this.blockchain.getLatestBlock().transactions.length
            },
            stateSize: Object.keys(this.blockchain.getState()).length
        };
    }

    getChain() {
        return this.blockchain.getChain();
    }

    getBlock(index) {
        return this.blockchain.getBlock(index);
    }

    getAllDomains() {
        return this.blockchain.getState();
    }

    verifyChain() {
        return {
            valid: this.blockchain.isChainValid()
        };
    }

    getTransactionProof(blockIndex, transactionIndex) {
        return this.blockchain.getTransactionProof(blockIndex, transactionIndex);
    }
}

module.exports = DomainService;
