import React, { useState, useEffect } from 'react';
import { SaveSlot } from './SaveSlot';
import type { SaveStateSlot, SaveStateInfo, CloudSyncStatus } from '../types';
import { saveStateManager } from '../save/SaveStateManager';

interface SavePanelProps {
    isOpen: boolean;
    onClose: () => void;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onQuickSave: (slot: number) => Promise<boolean>;
    onQuickLoad: (slot: number) => Promise<boolean>;
}

export const SavePanel: React.FC<SavePanelProps> = ({ isOpen, onClose, canvasRef, onQuickSave, onQuickLoad }) => {
    const [slots, setSlots] = useState<SaveStateSlot[]>([]);
    const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
    const [cloudEnabled, setCloudEnabled] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [editingSave, setEditingSave] = useState<SaveStateInfo | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            refreshSlots();
            refreshSyncStatus();
        }
    }, [isOpen]);

    useEffect(() => {
        saveStateManager.setSlotsChangeCallback(setSlots);
        saveStateManager.setSyncStatusCallback(setSyncStatus);
        
        return () => {
            saveStateManager.setSlotsChangeCallback(null);
            saveStateManager.setSyncStatusCallback(null);
        };
    }, []);

    const refreshSlots = async () => {
        const s = await saveStateManager.getSlots();
        setSlots(s);
    };

    const refreshSyncStatus = async () => {
        const status = await saveStateManager.getCloudSyncStatus();
        setSyncStatus(status);
        setCloudEnabled(status.enabled);
    };

    const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleSave = async (slot: number) => {
        try {
            const stateResult = await window.nesAPI.saveState();
            if (!stateResult.success) {
                showMessage('error', stateResult.error || '存档失败');
                return;
            }

            let thumbnail: string | undefined;
            if (canvasRef?.current) {
                thumbnail = canvasRef.current.toDataURL('image/jpeg', 0.6);
            }

            const result = await saveStateManager.quickSave(slot, stateResult.state, thumbnail);
            if (result.success && result.save) {
                showMessage('success', `已保存到槽位 ${slot}`);
                await refreshSlots();
            } else {
                showMessage('error', result.error || '存档失败');
            }
        } catch (e: any) {
            showMessage('error', e.message || '存档失败');
        }
    };

    const handleLoad = async (slot: number) => {
        try {
            const result = await saveStateManager.quickLoad(slot);
            if (result.success && result.state) {
                const loadResult = await window.nesAPI.loadState(result.state);
                if (loadResult.success) {
                    showMessage('success', `已加载槽位 ${slot}`);
                    onClose();
                } else {
                    showMessage('error', loadResult.error || '读档失败');
                }
            } else {
                showMessage('error', result.error || '读档失败');
            }
        } catch (e: any) {
            showMessage('error', e.message || '读档失败');
        }
    };

    const handleDelete = async (id: string) => {
        const success = await saveStateManager.deleteSave(id);
        if (success) {
            showMessage('success', '存档已删除');
            refreshSlots();
        } else {
            showMessage('error', '删除失败');
        }
    };

    const handleEdit = (save: SaveStateInfo) => {
        setEditingSave(save);
        setEditDescription(save.description || '');
    };

    const handleSaveEdit = async () => {
        if (!editingSave) return;
        
        const success = await saveStateManager.updateSaveInfo(editingSave.id, {
            description: editDescription
        });
        
        if (success) {
            showMessage('success', '描述已更新');
            refreshSlots();
        } else {
            showMessage('error', '更新失败');
        }
        
        setEditingSave(null);
    };

    const handleToggleCloud = async () => {
        const newEnabled = !cloudEnabled;
        setCloudEnabled(newEnabled);
        saveStateManager.setCloudSyncEnabled(newEnabled);
        setTimeout(refreshSyncStatus, 100);
    };

    const handleSyncNow = async () => {
        setIsSyncing(true);
        const result = await saveStateManager.syncNow();
        setIsSyncing(false);
        
        if (result.success) {
            showMessage('success', '同步完成');
        } else {
            showMessage('error', result.error || '同步失败');
        }
        refreshSyncStatus();
        refreshSlots();
    };

    if (!isOpen) return null;

    return (
        <div className="save-panel-overlay" onClick={onClose}>
            <div className="save-panel" onClick={(e) => e.stopPropagation()}>
                <div className="save-panel-header">
                    <h2>📁 即时存档</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="save-panel-toolbar">
                    <div className="toolbar-left">
                        <button
                            className="btn btn-secondary" onClick={() => handleQuickSave(0)} title="F5 快速存档">
                            ⚡ 快速存档 (F5)
                        </button>
                        <button
                            className="btn btn-secondary" onClick={() => handleQuickLoad(0)} title="F7 快速读档">
                            ⏮️ 快速读档 (F7)
                        </button>
                    </div>
                    <div className="toolbar-right">
                        <label className="cloud-toggle">
                            <input
                                type="checkbox"
                                checked={cloudEnabled}
                                onChange={handleToggleCloud}
                            />
                            ☁️ 云端同步
                        </label>
                        {cloudEnabled && (
                            <button
                                className="btn btn-secondary"
                                onClick={handleSyncNow}
                                disabled={isSyncing}
                            >
                                {isSyncing ? '⏳' : '🔄'} {isSyncing ? '同步中...' : '立即同步'}
                            </button>
                        )}
                    </div>
                </div>

                {syncStatus && cloudEnabled && (
                    <div className="sync-status-bar">
                        <span className="status-label">同步状态:</span>
                        <span className={`status-value ${syncStatus.error ? 'status-error' : syncStatus.pendingCount > 0 ? 'status-warn' : 'status-ok'}`}>
                            {syncStatus.error || (syncStatus.isSyncing ? '同步中' : (syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} 个待同步` : '已同步'))}
                        </span>
                        {syncStatus.lastSync && (
                            <>
                                <span className="status-label">上次同步:</span>
                                <span className="status-value">
                                    {new Date(syncStatus.lastSync).toLocaleString('zh-CN')}
                                </span>
                            </>
                        )}
                    </div>
                )}

                {message && (
                    <div className={`message-bar message-${message.type}`}>
                        {message.text}
                    </div>
                )}

                <div className="save-slots-grid">
                    {slots.map((slot) => (
                        <SaveSlot
                            key={slot.slot}
                            slot={slot}
                            onSave={handleSave}
                            onLoad={handleLoad}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                        />
                    ))}
                </div>

                <div className="save-panel-footer">
                    <span className="footer-hint">快捷键: F5 快速存档 | F7 快速读档 | Esc 关闭</span>
                </div>
            </div>

            {editingSave && (
                <div className="edit-dialog-overlay" onClick={() => setEditingSave(null)}>
                    <div className="edit-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>编辑存档描述</h3>
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="输入存档描述..."
                            rows={3}
                        />
                        <div className="edit-dialog-actions">
                            <button className="btn btn-secondary" onClick={() => setEditingSave(null)}>
                                取消
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveEdit}>
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
