import * as Y from 'yjs';
import { storageService } from './storageService';

const BRANCHES_STORAGE_KEY = 'branches';
const ACTIVE_BRANCH_KEY = 'activeBranch';

export class BranchManager {
  constructor(roomName, mainDoc) {
    this.roomName = roomName;
    this.mainDoc = mainDoc;
    this.branches = new Map();
    this.activeBranchName = 'main';
    this.listeners = new Map();
    this._initPromise = this._initialize();
  }

  async _initialize() {
    const savedBranches = await this._loadBranchesMetadata();
    
    if (savedBranches && savedBranches.length > 0) {
      savedBranches.forEach(branchMeta => {
        if (branchMeta.name !== 'main') {
          this.branches.set(branchMeta.name, {
            ...branchMeta,
            doc: null,
          });
        }
      });
    }

    const activeBranch = await storageService.getItem(`${ACTIVE_BRANCH_KEY}_${this.roomName}`);
    if (activeBranch && this.branches.has(activeBranch)) {
      this.activeBranchName = activeBranch;
    }
  }

  async waitForInit() {
    await this._initPromise;
  }

  async _loadBranchesMetadata() {
    try {
      const data = await storageService.getItem(`${BRANCHES_STORAGE_KEY}_${this.roomName}`);
      return data || [];
    } catch (err) {
      console.error('[BranchManager] 加载分支元数据失败:', err);
      return [];
    }
  }

  async _saveBranchesMetadata() {
    const branchList = [];
    branchList.push({
      name: 'main',
      createdAt: new Date().toISOString(),
      isMain: true,
    });
    
    this.branches.forEach((branch, name) => {
      branchList.push({
        name: branch.name,
        createdAt: branch.createdAt,
        baseVersion: branch.baseVersion,
        isMain: false,
      });
    });

    await storageService.setItem(`${BRANCHES_STORAGE_KEY}_${this.roomName}`, branchList);
  }

  getBranchKey(branchName) {
    return `branch_${this.roomName}_${branchName}`;
  }

  async createBranch(branchName, sourceBranchName = 'main') {
    if (this.branches.has(branchName) || branchName === 'main') {
      throw new Error(`分支 "${branchName}" 已存在`);
    }

    const sourceDoc = sourceBranchName === 'main' 
      ? this.mainDoc 
      : await this.getBranchDoc(sourceBranchName);

    if (!sourceDoc) {
      throw new Error(`源分支 "${sourceBranchName}" 不存在`);
    }

    const newDoc = new Y.Doc();
    const stateVector = Y.encodeStateAsUpdate(sourceDoc);
    Y.applyUpdate(newDoc, stateVector);

    const branch = {
      name: branchName,
      doc: newDoc,
      createdAt: new Date().toISOString(),
      baseVersion: this._getDocVersion(sourceDoc),
    };

    this.branches.set(branchName, branch);
    await this._saveBranchesMetadata();
    await this._saveBranchSnapshot(branchName, newDoc);

    this.emit('branchCreated', { branchName, sourceBranchName });
    return branch;
  }

  async getBranchDoc(branchName) {
    if (branchName === 'main') {
      return this.mainDoc;
    }

    const branch = this.branches.get(branchName);
    if (!branch) {
      return null;
    }

    if (!branch.doc) {
      branch.doc = await this._loadBranchSnapshot(branchName);
      if (!branch.doc) {
        branch.doc = new Y.Doc();
      }
    }

    return branch.doc;
  }

  async _saveBranchSnapshot(branchName, doc) {
    const snapshot = Y.encodeStateAsUpdate(doc);
    await storageService.setItem(this.getBranchKey(branchName), {
      snapshot: Array.from(snapshot),
      timestamp: Date.now(),
    });
  }

  async _loadBranchSnapshot(branchName) {
    try {
      const data = await storageService.getItem(this.getBranchKey(branchName));
      if (data && data.snapshot) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(data.snapshot));
        return doc;
      }
      return null;
    } catch (err) {
      console.error('[BranchManager] 加载分支快照失败:', err);
      return null;
    }
  }

  _getDocVersion(doc) {
    const state = Y.encodeStateVector(doc);
    return btoa(String.fromCharCode.apply(null, state));
  }

  async switchBranch(branchName) {
    if (branchName !== 'main' && !this.branches.has(branchName)) {
      throw new Error(`分支 "${branchName}" 不存在`);
    }

    if (this.activeBranchName === branchName) {
      return;
    }

    const oldBranchName = this.activeBranchName;
    if (oldBranchName !== 'main') {
      const oldBranch = this.branches.get(oldBranchName);
      if (oldBranch && oldBranch.doc) {
        await this._saveBranchSnapshot(oldBranchName, oldBranch.doc);
      }
    }

    this.activeBranchName = branchName;
    await storageService.setItem(`${ACTIVE_BRANCH_KEY}_${this.roomName}`, branchName);

    this.emit('branchSwitched', { branchName, oldBranchName });
    return branchName;
  }

  async deleteBranch(branchName) {
    if (branchName === 'main') {
      throw new Error('不能删除主分支');
    }

    if (!this.branches.has(branchName)) {
      throw new Error(`分支 "${branchName}" 不存在`);
    }

    const branch = this.branches.get(branchName);
    if (branch.doc) {
      branch.doc.destroy();
    }

    this.branches.delete(branchName);
    await storageService.removeItem(this.getBranchKey(branchName));
    await this._saveBranchesMetadata();

    if (this.activeBranchName === branchName) {
      await this.switchBranch('main');
    }

    this.emit('branchDeleted', { branchName });
  }

  async computeDiff(branchName, targetBranchName = 'main') {
    const sourceDoc = await this.getBranchDoc(branchName);
    const targetDoc = await this.getBranchDoc(targetBranchName);

    if (!sourceDoc || !targetDoc) {
      return null;
    }

    const sourceText = sourceDoc.getText('monaco').toString();
    const targetText = targetDoc.getText('monaco').toString();

    const sourceState = Y.encodeStateVector(sourceDoc);
    const targetState = Y.encodeStateVector(targetDoc);

    const sourceDiff = Y.encodeStateAsUpdate(sourceDoc, targetState);
    const targetDiff = Y.encodeStateAsUpdate(targetDoc, sourceState);

    return {
      sourceText,
      targetText,
      sourceBranch: branchName,
      targetBranch: targetBranchName,
      hasChanges: sourceDiff.length > 0 || targetDiff.length > 0,
    };
  }

  async mergeBranch(sourceBranchName, targetBranchName = 'main', resolution = 'source') {
    const sourceDoc = await this.getBranchDoc(sourceBranchName);
    const targetDoc = await this.getBranchDoc(targetBranchName);

    if (!sourceDoc || !targetDoc) {
      throw new Error('分支不存在');
    }

    const sourceText = sourceDoc.getText('monaco').toString();
    const targetText = targetDoc.getText('monaco').toString();

    if (resolution === 'source') {
      const targetYText = targetDoc.getText('monaco');
      targetYText.delete(0, targetYText.length);
      targetYText.insert(0, sourceText);
    } else if (resolution === 'target') {
    } else if (typeof resolution === 'string') {
      const targetYText = targetDoc.getText('monaco');
      targetYText.delete(0, targetYText.length);
      targetYText.insert(0, resolution);
    }

    if (targetBranchName === 'main' && this.activeBranchName === sourceBranchName) {
      const sourceBranch = this.branches.get(sourceBranchName);
      if (sourceBranch && sourceBranch.doc) {
        const stateVector = Y.encodeStateAsUpdate(targetDoc);
        Y.applyUpdate(sourceBranch.doc, stateVector);
      }
    }

    this.emit('branchMerged', { sourceBranchName, targetBranchName, resolution });
    return true;
  }

  detectConflicts(branchName, targetBranchName = 'main') {
    const sourceDoc = this.branches.get(branchName)?.doc;
    const targetDoc = targetBranchName === 'main' ? this.mainDoc : this.branches.get(targetBranchName)?.doc;

    if (!sourceDoc || !targetDoc) {
      return [];
    }

    const sourceText = sourceDoc.getText('monaco').toString();
    const targetText = targetDoc.getText('monaco').toString();

    const sourceLines = sourceText.split('\n');
    const targetLines = targetText.split('\n');

    const conflicts = [];
    const maxLines = Math.max(sourceLines.length, targetLines.length);

    for (let i = 0; i < maxLines; i++) {
      const sourceLine = sourceLines[i] || '';
      const targetLine = targetLines[i] || '';
      
      if (sourceLine !== targetLine && sourceLine !== '' && targetLine !== '') {
        const sourceModified = this._isLineModified(sourceDoc, i);
        const targetModified = this._isLineModified(targetDoc, i);
        
        if (sourceModified && targetModified) {
          conflicts.push({
            lineNumber: i + 1,
            sourceContent: sourceLine,
            targetContent: targetLine,
          });
        }
      }
    }

    return conflicts;
  }

  _isLineModified(doc, lineIndex) {
    return true;
  }

  getAllBranches() {
    const branchList = [
      { name: 'main', isMain: true, isActive: this.activeBranchName === 'main' }
    ];
    
    this.branches.forEach((branch, name) => {
      branchList.push({
        name,
        isMain: false,
        isActive: this.activeBranchName === name,
        createdAt: branch.createdAt,
        baseVersion: branch.baseVersion,
      });
    });

    return branchList;
  }

  getActiveBranch() {
    return this.activeBranchName;
  }

  async getActiveDoc() {
    return await this.getBranchDoc(this.activeBranchName);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(...args));
    }
  }

  async saveCurrentBranch() {
    if (this.activeBranchName !== 'main') {
      const branch = this.branches.get(this.activeBranchName);
      if (branch && branch.doc) {
        await this._saveBranchSnapshot(this.activeBranchName, branch.doc);
      }
    }
  }

  destroy() {
    this.branches.forEach((branch) => {
      if (branch.doc) {
        branch.doc.destroy();
      }
    });
    this.branches.clear();
    this.listeners.clear();
  }
}

export default BranchManager;
