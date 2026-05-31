const Block = require('./block');

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 3;
        this.pendingTransactions = [];
        this.state = {};
    }

    createGenesisBlock() {
        const genesisBlock = new Block(0, Date.now(), [], '0');
        genesisBlock.mineBlock(this.difficulty);
        return genesisBlock;
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addTransaction(transaction) {
        if (!transaction.type || !transaction.data) {
            throw new Error('Transaction must include type and data');
        }
        this.pendingTransactions.push(transaction);
        return this.pendingTransactions.length - 1;
    }

    minePendingTransactions() {
        const block = new Block(
            this.chain.length,
            Date.now(),
            this.pendingTransactions,
            this.getLatestBlock().hash
        );
        block.mineBlock(this.difficulty);
        this.chain.push(block);
        this.applyTransactions(block.transactions);
        this.pendingTransactions = [];
        return block;
    }

    applyTransactions(transactions) {
        for (const tx of transactions) {
            if (tx.type === 'REGISTER_DOMAIN') {
                const { name, owner, ip } = tx.data;
                this.state[name] = {
                    owner,
                    ip,
                    originalOwner: owner,
                    registeredAt: Date.now(),
                    blockIndex: this.chain.length - 1
                };
            } else if (tx.type === 'TRANSFER_DOMAIN') {
                const { name, newOwner } = tx.data;
                if (this.state[name]) {
                    this.state[name].previousOwner = this.state[name].owner;
                    this.state[name].owner = newOwner;
                    this.state[name].transferredAt = Date.now();
                    this.state[name].transferBlockIndex = this.chain.length - 1;
                }
            }
        }
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (!currentBlock.hasValidTransactions()) {
                return false;
            }

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }

    getState() {
        return { ...this.state };
    }

    getDomain(name) {
        return this.state[name] || null;
    }

    getChain() {
        return this.chain.map(block => block.toJSON());
    }

    getBlock(index) {
        return this.chain[index] ? this.chain[index].toJSON() : null;
    }

    getTransactionProof(blockIndex, transactionIndex) {
        const block = this.chain[blockIndex];
        if (!block) return null;
        return block.getTransactionProof(transactionIndex);
    }
}

module.exports = Blockchain;
