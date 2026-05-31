import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api';

export function useTimeMachine(roomId) {
  const [timestamps, setTimestamps] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isTimeTraveling, setIsTimeTraveling] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [historyState, setHistoryState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const debounceRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomId)}/history`);
      if (res.ok) {
        const data = await res.json();
        setTimestamps(data.timestamps);
        setSummary(data.summary);
        if (data.timestamps.length > 0 && currentIndex === -1) {
          setCurrentIndex(data.timestamps.length - 1);
        }
      }
    } catch (err) {
      console.error('[TimeMachine] Failed to fetch history:', err);
    }
  }, [roomId, currentIndex]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const previewAtTimestamp = useCallback(async (timestamp) => {
    if (!roomId || !timestamp) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/rooms/${encodeURIComponent(roomId)}/snapshot?timestamp=${timestamp}`
      );
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content);
        setHistoryState(data.state);
        setIsTimeTraveling(true);
      }
    } catch (err) {
      console.error('[TimeMachine] Failed to preview:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const seekTo = useCallback((index) => {
    if (index < 0 || index >= timestamps.length) return;
    setCurrentIndex(index);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      previewAtTimestamp(timestamps[index]);
    }, 150);
  }, [timestamps, previewAtTimestamp]);

  const restoreCurrent = useCallback(async () => {
    if (!roomId || !historyState) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/rooms/${encodeURIComponent(roomId)}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: historyState }),
        }
      );
      if (res.ok) {
        setIsTimeTraveling(false);
        setPreviewContent(null);
        setHistoryState(null);
        await fetchHistory();
      }
    } catch (err) {
      console.error('[TimeMachine] Failed to restore:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, historyState, fetchHistory]);

  const backToPresent = useCallback(() => {
    setIsTimeTraveling(false);
    setPreviewContent(null);
    setHistoryState(null);
    if (timestamps.length > 0) {
      setCurrentIndex(timestamps.length - 1);
    }
  }, [timestamps]);

  const forceSnapshot = useCallback(async () => {
    if (!roomId) return;
    try {
      await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomId)}/snapshot`, {
        method: 'POST',
      });
      await fetchHistory();
    } catch (err) {
      console.error('[TimeMachine] Failed to force snapshot:', err);
    }
  }, [roomId, fetchHistory]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    timestamps,
    currentIndex,
    isTimeTraveling,
    previewContent,
    historyState,
    loading,
    summary,
    seekTo,
    restoreCurrent,
    backToPresent,
    forceSnapshot,
    fetchHistory,
  };
}
