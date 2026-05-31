import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { CollabProvider } from '@/utils/collabProvider';
import { useConnectionStore } from '@/store/connectionStore';
import { useDocStore } from '@/store/docStore';
import { useRoomStore } from '@/store/roomStore';
import { useHistoryStore } from '@/store/historyStore';
import { getDocument, saveDocument, getSnapshot, type DocumentRecord } from '@/utils/db';
import { importKey, decrypt, encrypt } from '@/utils/crypto';
import {
  startAutoSnapshot,
  stopAutoSnapshot,
  loadSnapshotMetas,
  restoreFromSnapshotState,
  takeSnapshot,
} from '@/utils/snapshotService';
import { CodeMirrorEditor } from '@/components/CodeMirrorEditor';
import { HistorySlider } from '@/components/HistorySlider';
import {
  ArrowLeft,
  PanelRightOpen,
  PanelRightClose,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  connected: { color: '#00D68F', label: 'Connected' },
  connecting: { color: '#FFB800', label: 'Connecting...' },
  reconnecting: { color: '#FF8C00', label: 'Reconnecting...' },
  disconnected: { color: '#F85149', label: 'Disconnected' },
};

export default function Editor() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { status, isOnline, setStatus } = useConnectionStore();
  const { getCryptoKey, setCryptoKey } = useDocStore();
  const { username, members, setMembers } = useRoomStore();
  const {
    snapshots,
    isViewingHistory,
    setSnapshots,
    addSnapshot,
    setIsViewingHistory,
    setCurrentIndex,
    reset: resetHistory,
  } = useHistoryStore();

  const [docTitle, setDocTitle] = useState('');
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<string | null>(null);

  const providerRef = useRef<CollabProvider | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const docRecordRef = useRef<DocumentRecord | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const saveToDB = useCallback(async () => {
    const currentYdoc = ydocRef.current;
    const key = cryptoKeyRef.current;
    const doc = docRecordRef.current;
    if (!currentYdoc || !docId || !doc) return;

    setIsSaving(true);
    try {
      const fullState = Y.encodeStateAsUpdate(currentYdoc);
      const title = docTitle || doc.title;

      if (key) {
        const encrypted = await encrypt(fullState, key);
        const updated: DocumentRecord = {
          ...doc,
          title,
          encryptedContent: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: encrypted.salt,
          yjsStateVector: Y.encodeStateVector(currentYdoc),
          updatedAt: Date.now(),
        };
        docRecordRef.current = updated;
        await saveDocument(updated);
      } else {
        const updated: DocumentRecord = {
          ...doc,
          title,
          encryptedContent: fullState,
          yjsStateVector: Y.encodeStateVector(currentYdoc),
          updatedAt: Date.now(),
        };
        docRecordRef.current = updated;
        await saveDocument(updated);
      }
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [docId, docTitle]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToDB(), 500);
  }, [saveToDB]);

  const handleStatusChange = useCallback(
    (newStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => {
      setStatus(newStatus);
    },
    [setStatus],
  );

  const handleMembersChange = useCallback(
    (newMembers: { id: string; username: string; color: string }[]) => {
      setMembers(newMembers);
    },
    [setMembers],
  );

  const initCollab = useCallback(
    (doc: Y.Doc, key?: CryptoKey) => {
      const provider = new CollabProvider({
        docId: docId!,
        ydoc: doc,
        username: username || 'Anonymous',
        cryptoKey: key,
        onStatusChange: handleStatusChange,
        onMembersChange: handleMembersChange,
      });
      providerRef.current = provider;
      provider.connect();
    },
    [docId, username, handleStatusChange, handleMembersChange],
  );

  const handleEditorChange = useCallback((newContent: string) => {
    setContent(newContent);
    debouncedSave();
  }, [debouncedSave]);

  const initYjsAndCollab = useCallback(
    async (doc: DocumentRecord, key?: CryptoKey) => {
      const newYdoc = new Y.Doc();
      ydocRef.current = newYdoc;
      setYdoc(newYdoc);

      if (doc.encryptedContent && doc.encryptedContent.length > 0) {
        try {
          let stateData: Uint8Array;
          if (key) {
            stateData = await decrypt(
              { ciphertext: doc.encryptedContent, iv: doc.iv, salt: doc.salt },
              key
            );
          } else {
            stateData = doc.encryptedContent;
          }
          Y.applyUpdate(newYdoc, stateData);
        } catch {
          try {
            const text = new TextDecoder().decode(doc.encryptedContent);
            if (text) {
              const ytext = newYdoc.getText('content');
              ytext.insert(0, text);
            }
          } catch {}
        }
      }

      const ytext = newYdoc.getText('content');
      setContent(ytext.toString());

      newYdoc.on('update', () => {
        debouncedSave();
      });

      initCollab(newYdoc, key);

      if (docId) {
        const metas = await loadSnapshotMetas(docId);
        setSnapshots(metas);

        startAutoSnapshot(docId, newYdoc, doc.title, (meta) => {
          addSnapshot(meta);
        });
      }
    },
    [debouncedSave, initCollab, docId, setSnapshots, addSnapshot],
  );

  useEffect(() => {
    if (!docId) {
      navigate('/');
      return;
    }

    let cancelled = false;

    async function load() {
      const doc = await getDocument(docId);
      if (!doc) {
        navigate('/');
        return;
      }
      if (cancelled) return;

      setDocTitle(doc.title);
      docRecordRef.current = doc;

      const existingKey = getCryptoKey(docId);
      if (doc.encryptedKey && !existingKey) {
        setNeedsPassword(true);
        setIsLoading(false);
        return;
      }

      const key = existingKey || undefined;
      cryptoKeyRef.current = key ?? null;
      setIsLoading(false);
      await initYjsAndCollab(doc, key);
    }

    load();

    return () => {
      cancelled = true;
      stopAutoSnapshot();
      resetHistory();
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [docId, navigate, getCryptoKey, initYjsAndCollab, resetHistory]);

  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim() || !docId) return;

      setPasswordError(false);
      try {
        const doc = await getDocument(docId);
        if (!doc) return;

        const jwk = JSON.parse(doc.encryptedKey) as JsonWebKey;
        const key = await importKey(jwk);
        cryptoKeyRef.current = key;
        setCryptoKey(docId, key);
        setNeedsPassword(false);
        await initYjsAndCollab(doc, key);
      } catch {
        setPasswordError(true);
        setPassword('');
      }
    },
    [password, docId, setCryptoKey, initYjsAndCollab],
  );

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  const handleBack = useCallback(async () => {
    await saveToDB();
    navigate('/');
  }, [navigate, saveToDB]);

  const handleHistoryPreview = useCallback(async (snapshotId: string) => {
    const snapshot = await getSnapshot(snapshotId);
    if (!snapshot) return;

    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, snapshot.yjsState);
    const previewText = tempDoc.getText('content').toString();
    tempDoc.destroy();

    setHistoryPreview(previewText);
  }, []);

  const handleHistoryRestore = useCallback(
    async (snapshotId: string) => {
      const currentYdoc = ydocRef.current;
      if (!currentYdoc || !docId) return;

      const snapshot = await getSnapshot(snapshotId);
      if (!snapshot) return;

      restoreFromSnapshotState(currentYdoc, snapshot.yjsState);

      const ytext = currentYdoc.getText('content');
      setContent(ytext.toString());
      setHistoryPreview(null);
      setIsViewingHistory(false);
      setShowHistory(false);
      setCurrentIndex(snapshots.length - 1);

      await takeSnapshot(docId, currentYdoc, docTitle, '还原点');

      await saveToDB();
    },
    [docId, docTitle, saveToDB, snapshots.length, setIsViewingHistory, setCurrentIndex],
  );

  const handleCloseHistory = useCallback(() => {
    setHistoryPreview(null);
    setIsViewingHistory(false);
    setCurrentIndex(snapshots.length - 1);
    setShowHistory(false);
  }, [snapshots.length, setIsViewingHistory, setCurrentIndex]);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0D1117' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#00D68F' }} />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0D1117' }}>
        <form
          onSubmit={handlePasswordSubmit}
          className="w-full max-w-sm p-6 rounded-lg border"
          style={{ background: '#161B22', borderColor: '#30363D' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 shield-breathe" style={{ color: '#A371F7' }} />
            <h2 className="text-lg font-semibold text-white">Enter Password</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: '#8B949E' }}>
            This document is encrypted. Enter the password to unlock it.
          </p>
          {passwordError && (
            <p className="text-sm mb-3" style={{ color: '#F85149' }}>
              Invalid password. Please try again.
            </p>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 rounded-lg border text-white text-sm mb-4 outline-none transition-colors"
            style={{
              background: '#0D1117',
              borderColor: passwordError ? '#F85149' : '#30363D',
            }}
            autoFocus
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-black transition-all hover:brightness-110"
            style={{ background: '#00D68F' }}
          >
            Unlock Document
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#0D1117' }}>
      {!isOnline && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium offline-banner-enter"
          style={{ background: '#FFB80020', color: '#FFB800' }}
        >
          <AlertTriangle className="w-4 h-4" />
          离线编辑中 — 恢复连接后自动同步
        </div>
      )}

      <div
        className="flex items-center gap-3 px-4 py-2 border-b"
        style={{ borderColor: '#30363D', background: '#0D1117' }}
      >
        <button
          onClick={handleBack}
          className="p-1.5 rounded transition-colors hover:bg-white/10"
          style={{ color: '#8B949E' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 bg-transparent text-white text-sm font-medium outline-none px-2 py-1 rounded border border-transparent focus:border-[#30363D] transition-colors"
          placeholder="Untitled Document"
        />

        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: statusConfig.color }}
          />
        </div>

        <div className="flex items-center -space-x-2">
          {members.slice(0, 5).map((member) => (
            <div
              key={member.id}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2"
              style={{
                background: member.color,
                borderColor: '#0D1117',
              }}
              title={member.username}
            >
              {member.username.charAt(0).toUpperCase()}
            </div>
          ))}
          {members.length > 5 && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2"
              style={{
                background: '#30363D',
                borderColor: '#0D1117',
                color: '#8B949E',
              }}
            >
              +{members.length - 5}
            </div>
          )}
        </div>

        <button
          onClick={toggleHistory}
          className="p-1.5 rounded transition-colors hover:bg-white/10 relative"
          style={{ color: showHistory ? '#A371F7' : '#8B949E' }}
          title="版本历史"
        >
          <Clock className="w-5 h-5" />
          {snapshots.length > 0 && !showHistory && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
              style={{ background: '#A371F7' }}
            />
          )}
        </button>

        <button
          onClick={togglePreview}
          className="p-1.5 rounded transition-colors hover:bg-white/10"
          style={{ color: '#8B949E' }}
        >
          {showPreview ? (
            <PanelRightClose className="w-5 h-5" />
          ) : (
            <PanelRightOpen className="w-5 h-5" />
          )}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div
          className="flex flex-col flex-1 min-w-0"
          style={{ background: '#0D1117' }}
        >
          {ydoc && !isViewingHistory && (
            <CodeMirrorEditor
              ydoc={ydoc}
              onChange={handleEditorChange}
              className="flex-1 min-h-0"
            />
          )}
          {isViewingHistory && historyPreview !== null && (
            <div
              className="flex-1 min-h-0 overflow-y-auto p-4"
              style={{ background: '#0D1117' }}
            >
              <pre
                className="font-mono text-sm whitespace-pre-wrap"
                style={{ color: '#8B949E', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {historyPreview}
              </pre>
            </div>
          )}
        </div>

        {showPreview && (
          <div
            className="flex-1 min-w-0 overflow-y-auto border-l p-6"
            style={{ background: '#161B22', borderColor: '#30363D' }}
          >
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {isViewingHistory && historyPreview !== null ? historyPreview : content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {showHistory && (
        <HistorySlider
          onRestore={handleHistoryRestore}
          onPreview={handleHistoryPreview}
          onClose={handleCloseHistory}
        />
      )}

      <div
        className="flex items-center justify-between px-4 py-1.5 text-xs border-t"
        style={{ background: '#161B22', borderColor: showHistory ? '#A371F733' : '#30363D', color: '#8B949E' }}
      >
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            {status === 'connected' ? (
              <Wifi className="w-3.5 h-3.5" style={{ color: statusConfig.color }} />
            ) : (
              <WifiOff className="w-3.5 h-3.5" style={{ color: statusConfig.color }} />
            )}
            <span style={{ color: statusConfig.color }}>{statusConfig.label}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {members.length} online
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>{content.length} chars</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 shield-breathe" style={{ color: cryptoKeyRef.current ? '#A371F7' : '#8B949E' }} />
            {cryptoKeyRef.current ? 'E2EE' : 'Unencrypted'}
          </span>
          {isSaving && (
            <span className="flex items-center gap-1" style={{ color: '#FFB800' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
