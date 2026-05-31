import type { Block, Transaction, GasRankingItem } from '../../shared/types';
import { blockStore } from './blockStore.js';

const generateHash = (length: number = 64): string => {
  const chars = '0123456789abcdef';
  let result = '0x';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateAddress = (): string => {
  return generateHash(40);
};

const LATEST_BLOCK_HEIGHT = 19876543;

const createBlock = (height: number, now: number, offset: number): Block => ({
  height,
  hash: generateHash(),
  timestamp: now - offset * 12,
  transactions: Math.floor(Math.random() * 150) + 50,
  miner: generateAddress(),
  difficulty: (Math.random() * 10 + 15).toFixed(2) + ' T',
  size: Math.floor(Math.random() * 500) + 100,
  gasUsed: Math.floor(Math.random() * 10000000 + 15000000).toLocaleString(),
  gasLimit: '30,000,000',
});

const createTransactions = (blockHeight: number, count: number): Transaction[] => {
  const transactions: Transaction[] = [];
  const baseTime = Math.floor(Date.now() / 1000) - (LATEST_BLOCK_HEIGHT - blockHeight) * 12;

  for (let i = 0; i < count; i++) {
    const gasUsed = Math.floor(Math.random() * 500000) + 21000;
    const gasPrice = Math.floor(Math.random() * 50 + 10);
    transactions.push({
      hash: generateHash(),
      from: generateAddress(),
      to: generateAddress(),
      value: (Math.random() * 10).toFixed(4),
      gasPrice: gasPrice.toString() + ' Gwei',
      gasUsed,
      blockHeight,
      timestamp: baseTime + Math.floor(Math.random() * 10),
    });
  }

  return transactions;
};

export const syncBlocks = (count: number): { synced: number; forks: number } => {
  const now = Math.floor(Date.now() / 1000);
  let synced = 0;
  let forks = 0;

  for (let i = 0; i < count; i++) {
    const height = LATEST_BLOCK_HEIGHT - i;
    const block = createBlock(height, now, i);
    const transactions = createTransactions(height, block.transactions);

    const result = blockStore.upsertBlock(block, transactions);
    synced++;
    if (result.isFork) {
      forks++;
    }
  }

  return { synced, forks };
};

export const syncForkBlock = (height: number): { success: boolean; isFork: boolean } => {
  const now = Math.floor(Date.now() / 1000);
  const offset = LATEST_BLOCK_HEIGHT - height;
  const block = createBlock(height, now, offset);
  const transactions = createTransactions(height, block.transactions);

  const result = blockStore.upsertBlock(block, transactions);
  return { success: true, isFork: result.isFork };
};

export const getBlocksFromStore = (limit: number): Block[] => {
  const stored = blockStore.getLatestBlocks(limit);
  if (stored.length > 0) {
    return stored;
  }
  syncBlocks(limit);
  return blockStore.getLatestBlocks(limit);
};

export const getBlockDetailFromStore = (height: number) => {
  let detail = blockStore.getCanonicalBlockByHeight(height);
  if (!detail) {
    const now = Math.floor(Date.now() / 1000);
    const offset = LATEST_BLOCK_HEIGHT - height;
    const block = createBlock(height, now, offset);
    const transactions = createTransactions(height, block.transactions);
    blockStore.upsertBlock(block, transactions);
    detail = blockStore.getCanonicalBlockByHeight(height);
  }
  return detail || null;
};

export const getForksFromStore = () => {
  return blockStore.getForks();
};

export const resolveFork = (height: number, canonicalHash: string): boolean => {
  return blockStore.resolveFork(height, canonicalHash);
};

export const getAllBlocksAtHeight = (height: number): Block[] => {
  return blockStore.getAllBlocksAtHeight(height);
};

export const generateGasRanking = (count: number): GasRankingItem[] => {
  const items: GasRankingItem[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const gasUsed = Math.floor(Math.random() * 2000000) + 500000;
    const gasPrice = Math.floor(Math.random() * 100 + 50);
    const fee = ((gasUsed * gasPrice) / 1e9).toFixed(6);

    items.push({
      rank: i + 1,
      hash: generateHash(),
      gasUsed,
      gasPrice: gasPrice.toString() + ' Gwei',
      fee,
      from: generateAddress(),
      to: generateAddress(),
      timestamp: now - Math.floor(Math.random() * 3600),
    });
  }

  return items.sort((a, b) => b.gasUsed - a.gasUsed).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
};

export const getLatestBlockHeight = (): number => {
  return LATEST_BLOCK_HEIGHT;
};
