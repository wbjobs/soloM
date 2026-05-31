import type { Block, BlockDetail, Transaction } from '../../shared/types';

interface ForkInfo {
  height: number;
  hashes: string[];
  canonicalHash: string;
  detectedAt: number;
}

interface BlockRecord {
  block: Block;
  transactions: Transaction[];
  storedAt: number;
  isCanonical: boolean;
}

class BlockStore {
  private blocksByHash: Map<string, BlockRecord> = new Map();
  private heightIndex: Map<number, Set<string>> = new Map();
  private forks: Map<number, ForkInfo> = new Map();
  private maxBlocks: number = 1000;
  private maxForkDepth: number = 64;

  upsertBlock(block: Block, transactions: Transaction[]): { isFork: boolean; replacedHash: string | null } {
    const existingHashes = this.heightIndex.get(block.height);
    const isFork = existingHashes !== undefined && existingHashes.size > 0 && !existingHashes.has(block.hash);

    let replacedHash: string | null = null;

    if (isFork) {
      const forkInfo: ForkInfo = {
        height: block.height,
        hashes: [...existingHashes, block.hash],
        canonicalHash: block.hash,
        detectedAt: Date.now(),
      };
      this.forks.set(block.height, forkInfo);

      for (const oldHash of existingHashes) {
        const oldRecord = this.blocksByHash.get(oldHash);
        if (oldRecord) {
          oldRecord.isCanonical = false;
        }
      }
    }

    if (existingHashes) {
      if (!existingHashes.has(block.hash)) {
        existingHashes.add(block.hash);
      }
    } else {
      this.heightIndex.set(block.height, new Set([block.hash]));
    }

    const existingRecord = this.blocksByHash.get(block.hash);
    if (existingRecord) {
      existingRecord.block = block;
      existingRecord.transactions = transactions;
      existingRecord.isCanonical = !isFork;
    } else {
      this.blocksByHash.set(block.hash, {
        block,
        transactions,
        storedAt: Date.now(),
        isCanonical: !isFork,
      });
    }

    if (this.blocksByHash.size > this.maxBlocks) {
      this.evictOldest();
    }

    this.pruneOldForks();

    return { isFork, replacedHash };
  }

  getBlockByHash(hash: string): BlockRecord | undefined {
    return this.blocksByHash.get(hash);
  }

  getCanonicalBlockByHeight(height: number): BlockDetail | undefined {
    const hashes = this.heightIndex.get(height);
    if (!hashes || hashes.size === 0) return undefined;

    let canonicalHash: string | null = null;
    const forkInfo = this.forks.get(height);
    if (forkInfo) {
      canonicalHash = forkInfo.canonicalHash;
    } else {
      canonicalHash = hashes.values().next().value ?? null;
    }

    if (!canonicalHash) return undefined;
    const record = this.blocksByHash.get(canonicalHash);
    if (!record) return undefined;

    return {
      ...record.block,
      transactionList: record.transactions,
    };
  }

  getAllBlocksAtHeight(height: number): Block[] {
    const hashes = this.heightIndex.get(height);
    if (!hashes) return [];
    return [...hashes]
      .map(h => this.blocksByHash.get(h)?.block)
      .filter((b): b is Block => b !== undefined);
  }

  getLatestBlocks(limit: number): Block[] {
    const heights = [...this.heightIndex.keys()].sort((a, b) => b - a);
    const blocks: Block[] = [];

    for (const height of heights) {
      if (blocks.length >= limit) break;
      const detail = this.getCanonicalBlockByHeight(height);
      if (detail) {
        blocks.push(detail);
      }
    }

    return blocks;
  }

  getForks(): ForkInfo[] {
    return [...this.forks.values()];
  }

  resolveFork(height: number, canonicalHash: string): boolean {
    const hashes = this.heightIndex.get(height);
    if (!hashes || !hashes.has(canonicalHash)) return false;

    const forkInfo = this.forks.get(height);
    if (forkInfo) {
      forkInfo.canonicalHash = canonicalHash;
    }

    for (const hash of hashes) {
      const record = this.blocksByHash.get(hash);
      if (record) {
        record.isCanonical = hash === canonicalHash;
      }
    }

    return true;
  }

  getBlockCount(): number {
    return this.blocksByHash.size;
  }

  hasBlock(hash: string): boolean {
    return this.blocksByHash.has(hash);
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, record] of this.blocksByHash) {
      if (record.storedAt < oldestTime) {
        oldestTime = record.storedAt;
        oldestKey = hash;
      }
    }

    if (oldestKey) {
      const record = this.blocksByHash.get(oldestKey);
      if (record) {
        const heightHashes = this.heightIndex.get(record.block.height);
        if (heightHashes) {
          heightHashes.delete(oldestKey);
          if (heightHashes.size === 0) {
            this.heightIndex.delete(record.block.height);
          }
        }
      }
      this.blocksByHash.delete(oldestKey);
    }
  }

  private pruneOldForks(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    for (const [height, fork] of this.forks) {
      if (now - fork.detectedAt > maxAge) {
        this.forks.delete(height);
      }
    }

    const sortedForks = [...this.forks.entries()].sort((a, b) => b[0] - a[0]);
    if (sortedForks.length > this.maxForkDepth) {
      for (let i = this.maxForkDepth; i < sortedForks.length; i++) {
        this.forks.delete(sortedForks[i][0]);
      }
    }
  }
}

export const blockStore = new BlockStore();
export type { ForkInfo, BlockRecord };
