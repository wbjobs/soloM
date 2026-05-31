const SHA256 = require('crypto-js/sha256');
const MerkleTree = require('../utils/merkleTree');

class Block {
    constructor(index, timestamp, transactions, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.merkleTree = new MerkleTree(transactions.map(tx => JSON.stringify(tx)));
        this.merkleRoot = this.merkleTree.getRoot();
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return SHA256(
            this.index +
            this.previousHash +
            this.timestamp +
            this.merkleRoot +
            this.nonce
        ).toString();
    }

    mineBlock(difficulty = 4) {
        const target = '0'.repeat(difficulty);
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        return this.hash;
    }

    hasValidTransactions() {
        for (let i = 0; i < this.transactions.length; i++) {
            if (!this.merkleTree.verify(JSON.stringify(this.transactions[i]), i)) {
                return false;
            }
        }
        return true;
    }

    getTransactionProof(transactionIndex) {
        return this.merkleTree.getProof(transactionIndex);
    }

    toJSON() {
        return {
            index: this.index,
            timestamp: this.timestamp,
            transactions: this.transactions,
            previousHash: this.previousHash,
            merkleRoot: this.merkleRoot,
            nonce: this.nonce,
            hash: this.hash
        };
    }
}

module.exports = Block;
