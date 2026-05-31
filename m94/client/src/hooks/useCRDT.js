import { useState, useEffect, useRef, useCallback } from 'react';
import { CRDTService, generateUserId, generateUserName, getUserColor } from '../services/crdtService';
import { loadUserSettings, saveUserSettings } from '../services/storageService';
import { BranchManager } from '../services/branchService';

export const useCRDT = (roomName) => {
  const [crdtService, setCrdtService] = useState(null);
  const [branchManager, setBranchManager] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState({ phase: 'init', progress: 0 });
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState('main');

  const serviceRef = useRef(null);
  const branchManagerRef = useRef(null);

  useEffect(() => {
    const initializeService = async () => {
      if (!roomName) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setLoadingProgress({ phase: 'init', progress: 0 });

      try {
        let settings = await loadUserSettings();
        if (!settings) {
          const userId = generateUserId();
          const userName = generateUserName();
          const userColor = getUserColor(userId);
          settings = { userId, userName, userColor };
          await saveUserSettings(settings);
        }

        setUserInfo(settings);

        const service = new CRDTService(
          roomName,
          settings.userId,
          settings.userName,
          settings.userColor
        );

        service.on('connectionStatus', (connected) => {
          setIsConnected(connected);
        });

        service.on('syncStatus', (synced) => {
          setIsSynced(synced);
        });

        service.on('usersChange', (usersList) => {
          setUsers(usersList);
        });

        service.on('localSynced', () => {
          setIsLoading(false);
        });

        service.on('loadingProgress', (progress) => {
          setLoadingProgress(progress);
        });

        await service.initialize();
        serviceRef.current = service;
        setCrdtService(service);

        const manager = new BranchManager(roomName, service.ydoc);
        await manager.waitForInit();
        
        manager.on('branchCreated', () => {
          setBranches(manager.getAllBranches());
        });
        
        manager.on('branchSwitched', ({ branchName }) => {
          setActiveBranch(branchName);
          setBranches(manager.getAllBranches());
        });
        
        manager.on('branchDeleted', () => {
          setBranches(manager.getAllBranches());
        });
        
        manager.on('branchMerged', () => {
          setBranches(manager.getAllBranches());
        });

        branchManagerRef.current = manager;
        setBranchManager(manager);
        setBranches(manager.getAllBranches());
        setActiveBranch(manager.getActiveBranch());
      } catch (err) {
        console.error('[useCRDT] 初始化失败:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    initializeService();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
        setCrdtService(null);
      }
      if (branchManagerRef.current) {
        branchManagerRef.current.destroy();
        branchManagerRef.current = null;
        setBranchManager(null);
      }
    };
  }, [roomName]);

  const updateUserInfo = useCallback(async (newInfo) => {
    try {
      const settings = await loadUserSettings();
      const updatedSettings = { ...settings, ...newInfo };
      await saveUserSettings(updatedSettings);
      setUserInfo(updatedSettings);
      return true;
    } catch (err) {
      console.error('[useCRDT] 更新用户信息失败:', err);
      return false;
    }
  }, []);

  const createBranch = useCallback(async (branchName, sourceBranch = 'main') => {
    if (!branchManagerRef.current) return false;
    try {
      await branchManagerRef.current.createBranch(branchName, sourceBranch);
      return true;
    } catch (err) {
      console.error('[useCRDT] 创建分支失败:', err);
      return false;
    }
  }, []);

  const switchBranch = useCallback(async (branchName) => {
    if (!branchManagerRef.current) return false;
    try {
      await branchManagerRef.current.switchBranch(branchName);
      return true;
    } catch (err) {
      console.error('[useCRDT] 切换分支失败:', err);
      return false;
    }
  }, []);

  const deleteBranch = useCallback(async (branchName) => {
    if (!branchManagerRef.current) return false;
    try {
      await branchManagerRef.current.deleteBranch(branchName);
      return true;
    } catch (err) {
      console.error('[useCRDT] 删除分支失败:', err);
      return false;
    }
  }, []);

  const computeDiff = useCallback(async (branchName, targetBranch = 'main') => {
    if (!branchManagerRef.current) return null;
    try {
      return await branchManagerRef.current.computeDiff(branchName, targetBranch);
    } catch (err) {
      console.error('[useCRDT] 计算差异失败:', err);
      return null;
    }
  }, []);

  const mergeBranch = useCallback(async (sourceBranch, targetBranch = 'main', resolution) => {
    if (!branchManagerRef.current) return false;
    try {
      return await branchManagerRef.current.mergeBranch(sourceBranch, targetBranch, resolution);
    } catch (err) {
      console.error('[useCRDT] 合并分支失败:', err);
      return false;
    }
  }, []);

  const detectConflicts = useCallback((branchName, targetBranch = 'main') => {
    if (!branchManagerRef.current) return [];
    return branchManagerRef.current.detectConflicts(branchName, targetBranch);
  }, []);

  const getActiveDoc = useCallback(async () => {
    if (!branchManagerRef.current) return null;
    return await branchManagerRef.current.getActiveDoc();
  }, []);

  const saveCurrentBranch = useCallback(async () => {
    if (!branchManagerRef.current) return;
    await branchManagerRef.current.saveCurrentBranch();
  }, []);

  return {
    crdtService,
    branchManager,
    isConnected,
    isSynced,
    users,
    isLoading,
    userInfo,
    error,
    loadingProgress,
    branches,
    activeBranch,
    updateUserInfo,
    createBranch,
    switchBranch,
    deleteBranch,
    computeDiff,
    mergeBranch,
    detectConflicts,
    getActiveDoc,
    saveCurrentBranch,
  };
};

export default useCRDT;
