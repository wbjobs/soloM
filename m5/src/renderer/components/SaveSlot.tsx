import React from 'react';
import type { SaveStateSlot, SaveStateInfo } from '../types';

interface SaveSlotProps {
    slot: SaveStateSlot;
    onSave: (slot: number) => void;
    onLoad: (slot: number) => void;
    onDelete: (id: string) => void;
    onEdit: (save: SaveStateInfo) => void;
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPlaytime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function getSyncStatusClass(status: string): string {
    switch (status) {
        case 'synced': return 'status-ok';
        case 'pending': return 'status-warn';
        case 'conflict': return 'status-error';
        default: return 'status-idle';
    }
}

function getSyncStatusIcon(status: string): string {
    switch (status) {
        case 'synced': return '☁️';
        case 'pending': return '⏳';
        case 'conflict': return '⚠️';
        default: return '💾';
    }
}

export const SaveSlot: React.FC<SaveSlotProps> = ({ slot, onSave, onLoad, onDelete, onEdit }) => {
    const { save } = slot;

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSave(slot.slot);
    };

    const handleLoad = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (save) onLoad(slot.slot);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (save && confirm(`确定删除槽位 ${slot.slot} 的存档吗？`)) {
            onDelete(save.id);
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (save) onEdit(save);
    };

    return (
        <div className={`save-slot ${save ? 'has-save' : 'empty'}`}>
            <div className="slot-header">
                <span className="slot-number">槽位 {slot.slot}</span>
                {save && (
                    <span className={`sync-status ${getSyncStatusClass(save.syncStatus)}`} title={save.syncStatus}>
                        {getSyncStatusIcon(save.syncStatus)}
                    </span>
                )}
            </div>

            {save ? (
                <div className="slot-content">
                    {save.thumbnail ? (
                        <img src={save.thumbnail} alt="" className="slot-thumbnail" />
                    ) : (
                        <div className="slot-thumbnail-placeholder">🎮</div>
                    )}
                    <div className="slot-info">
                        <div className="slot-timestamp">{formatTime(save.timestamp)}</div>
                        <div className="slot-playtime">⏱ {formatPlaytime(save.playtime)}</div>
                        {save.description && (
                            <div className="slot-description">{save.description}</div>
                        )}
                    </div>
                    <div className="slot-actions">
                        <button className="slot-btn slot-btn-load" onClick={handleLoad} title="读档">
                            📂
                        </button>
                        <button className="slot-btn slot-btn-edit" onClick={handleEdit} title="编辑">
                            ✏️
                        </button>
                        <button className="slot-btn slot-btn-delete" onClick={handleDelete} title="删除">
                            🗑️
                        </button>
                    </div>
                </div>
            ) : (
                <div className="slot-empty" onClick={handleSave}>
                    <div className="slot-empty-icon">➕</div>
                    <div className="slot-empty-text">点击存档</div>
                </div>
            )}

            {save && (
                <button className="slot-overwrite" onClick={handleSave} title="覆盖存档">
                    💾 覆盖
                </button>
            )}
        </div>
    );
};
