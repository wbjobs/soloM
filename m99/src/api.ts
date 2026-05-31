import { SimParams } from './types';

const API_BASE = '/api';

export interface SnapshotInfo {
    id: string;
    name: string;
    description?: string;
    num_particles: number;
    created_at: string;
    params: SimParams;
}

export interface SnapshotDetail extends SnapshotInfo {
    particles: {
        positions: number[][];
        colors: number[][];
    };
}

export async function getParams(): Promise<SimParams> {
    try {
        const response = await fetch(`${API_BASE}/params`);
        if (!response.ok) {
            throw new Error('Failed to fetch params');
        }
        return await response.json();
    } catch (error) {
        console.warn('Using default params:', error);
        throw error;
    }
}

export async function setParams(params: Partial<SimParams>): Promise<{ status: string; params: SimParams }> {
    const response = await fetch(`${API_BASE}/params`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
    if (!response.ok) {
        throw new Error('Failed to set params');
    }
    return await response.json();
}

export async function exportPLY(positions: number[][], colors: number[][], binary: boolean = false): Promise<Blob> {
    const endpoint = binary ? `${API_BASE}/export/ply-binary` : `${API_BASE}/export/ply`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ positions, colors }),
    });
    if (!response.ok) {
        throw new Error('Failed to export PLY');
    }
    return await response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function listSnapshots(limit: number = 50): Promise<SnapshotInfo[]> {
    const response = await fetch(`${API_BASE}/snapshots?limit=${limit}`);
    if (!response.ok) {
        throw new Error('Failed to list snapshots');
    }
    return await response.json();
}

export async function createSnapshot(
    name: string,
    description: string | undefined,
    params: SimParams,
    positions: number[][],
    colors: number[][]
): Promise<SnapshotInfo> {
    const response = await fetch(`${API_BASE}/snapshots`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name,
            description,
            params,
            particles: { positions, colors }
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to create snapshot');
    }
    return await response.json();
}

export async function getSnapshot(id: string): Promise<SnapshotDetail> {
    const response = await fetch(`${API_BASE}/snapshots/${id}`);
    if (!response.ok) {
        throw new Error('Failed to get snapshot');
    }
    return await response.json();
}

export async function deleteSnapshot(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/snapshots/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete snapshot');
    }
}

export async function exportSnapshotPLY(id: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/snapshots/${id}/export/ply`);
    if (!response.ok) {
        throw new Error('Failed to export snapshot');
    }
    return await response.blob();
}
