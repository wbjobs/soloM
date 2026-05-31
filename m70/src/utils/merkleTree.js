const SHA256 = require('crypto-js/sha256');

class MerkleTree {
    constructor(leaves = []) {
        this.leaves = leaves.map(leaf => this.hash(leaf.toString()));
        this.tree = this.buildTree(this.leaves);
    }

    hash(data) {
        return SHA256(data).toString();
    }

    buildTree(leaves) {
        if (leaves.length === 0) {
            return [this.hash('')];
        }

        const tree = [...leaves];
        let level = [...leaves];

        while (level.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || level[i];
                const parentHash = this.hash(left + right);
                nextLevel.push(parentHash);
            }
            tree.push(...nextLevel);
            level = nextLevel;
        }

        return tree;
    }

    getRoot() {
        return this.tree[this.tree.length - 1];
    }

    addLeaf(leaf) {
        this.leaves.push(this.hash(leaf.toString()));
        this.tree = this.buildTree(this.leaves);
        return this.getRoot();
    }

    getLeaves() {
        return [...this.leaves];
    }

    verify(leaf, index) {
        const leafHash = this.hash(leaf.toString());
        if (this.leaves[index] !== leafHash) {
            return false;
        }

        let currentHash = leafHash;
        let currentIndex = index;
        let levelSize = this.leaves.length;
        let treeIndex = 0;

        while (levelSize > 1) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            const siblingHash = siblingIndex < levelSize 
                ? this.tree[treeIndex + siblingIndex] 
                : currentHash;

            if (isRight) {
                currentHash = this.hash(siblingHash + currentHash);
            } else {
                currentHash = this.hash(currentHash + siblingHash);
            }

            treeIndex += levelSize;
            levelSize = Math.ceil(levelSize / 2);
            currentIndex = Math.floor(currentIndex / 2);
        }

        return currentHash === this.getRoot();
    }

    getProof(index) {
        const proof = [];
        let currentIndex = index;
        let levelSize = this.leaves.length;
        let treeIndex = 0;

        while (levelSize > 1) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            const siblingHash = siblingIndex < levelSize 
                ? this.tree[treeIndex + siblingIndex] 
                : this.tree[treeIndex + currentIndex];

            proof.push({
                position: isRight ? 'left' : 'right',
                hash: siblingHash
            });

            treeIndex += levelSize;
            levelSize = Math.ceil(levelSize / 2);
            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    static verifyProof(leaf, proof, root) {
        const tree = new MerkleTree();
        let currentHash = tree.hash(leaf.toString());

        for (const step of proof) {
            if (step.position === 'left') {
                currentHash = tree.hash(step.hash + currentHash);
            } else {
                currentHash = tree.hash(currentHash + step.hash);
            }
        }

        return currentHash === root;
    }
}

module.exports = MerkleTree;
