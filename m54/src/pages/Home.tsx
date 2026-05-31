import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Plus, FileText, Eye, EyeOff, Lock, Users, Trash2 } from 'lucide-react';
import { useDocStore } from '@/store/docStore';
import { generateSalt, deriveKey, exportKey, encrypt } from '@/utils/crypto';
import { saveDocument, deleteDocument as deleteDocFromDB, type DocumentRecord } from '@/utils/db';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function Home() {
  const navigate = useNavigate();
  const { documents, setDocuments, addDocument, removeDocument, setCryptoKey, removeCryptoKey } = useDocStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { getAllDocuments } = await import('@/utils/db');
        const docs = await getAllDocuments();
        setDocuments(docs);
      } catch {
        setDocuments([]);
      }
    })();
  }, [setDocuments]);

  const handleDelete = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    try {
      await deleteDocFromDB(docId);
      removeDocument(docId);
      removeCryptoKey(docId);
    } catch {}
  };

  const canCreate =
    title.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const resetForm = () => {
    setTitle('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);

    try {
      const docId = crypto.randomUUID();
      const salt = await generateSalt();
      const key = await deriveKey(password, salt);
      const exportedJwk = await exportKey(key);

      const emptyContent = new TextEncoder().encode('');
      const { ciphertext, iv } = await encrypt(emptyContent, key);

      const now = Date.now();
      const doc: DocumentRecord = {
        id: docId,
        title: title.trim(),
        encryptedContent: ciphertext,
        encryptedKey: JSON.stringify(exportedJwk),
        salt,
        iv,
        yjsStateVector: new Uint8Array(0),
        createdAt: now,
        updatedAt: now,
      };

      await saveDocument(doc);
      addDocument(doc);
      setCryptoKey(docId, key);
      resetForm();
      setModalOpen(false);
      navigate(`/editor/${docId}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#0D1117', color: '#E6EDF3' }}
    >
      <header className="border-b" style={{ borderColor: '#30363D' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6" style={{ color: '#00D68F' }} />
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              CryptoPad
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#00D68F' }}
            >
              <Plus className="w-4 h-4" />
              New Document
            </button>
            <button
              onClick={() => navigate('/room')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors border"
              style={{ borderColor: '#30363D', backgroundColor: '#161B22' }}
            >
              <Users className="w-4 h-4" />
              Collaborate
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <FileText
              className="w-16 h-16 mb-4"
              style={{ color: '#8B949E' }}
            />
            <p
              className="text-lg mb-6"
              style={{ color: '#8B949E', fontFamily: "'DM Sans', sans-serif" }}
            >
              No documents yet
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#00D68F' }}
            >
              <Plus className="w-4 h-4" />
              Create your first document
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => navigate(`/editor/${doc.id}`)}
                className="p-5 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: '#161B22',
                  borderColor: '#30363D',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#00D68F';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#30363D';
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3
                    className="text-base font-medium truncate mr-2"
                    style={{ color: '#E6EDF3' }}
                  >
                    {doc.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ShieldCheck
                      className="w-4 h-4 mt-0.5"
                      style={{ color: '#A371F7' }}
                    />
                    <button
                      onClick={(e) => handleDelete(e, doc.id)}
                      className="p-1 rounded transition-colors hover:bg-red-500/20"
                      style={{ color: '#8B949E' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs" style={{ color: '#8B949E' }}>
                  {dateFormatter.format(new Date(doc.updatedAt))}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => {
              resetForm();
              setModalOpen(false);
            }}
          />
          <div
            className="relative w-full max-w-md rounded-lg border p-6 mx-4"
            style={{
              backgroundColor: '#161B22',
              borderColor: '#30363D',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <h2
              className="text-lg font-semibold mb-5"
              style={{ color: '#E6EDF3' }}
            >
              New Document
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: '#8B949E' }}
                >
                  Document Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled Document"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: '#0D1117',
                    borderColor: '#30363D',
                    color: '#E6EDF3',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#00D68F';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#30363D';
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: '#8B949E' }}
                >
                  Encryption Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: '#0D1117',
                      borderColor: '#30363D',
                      color: '#E6EDF3',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#00D68F';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#30363D';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: '#8B949E' }}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: '#8B949E' }}
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: '#0D1117',
                      borderColor:
                        confirmPassword.length > 0 &&
                        password !== confirmPassword
                          ? '#FFB800'
                          : '#30363D',
                      color: '#E6EDF3',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onFocus={(e) => {
                      if (password === confirmPassword) {
                        e.currentTarget.style.borderColor = '#00D68F';
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor =
                        confirmPassword.length > 0 &&
                        password !== confirmPassword
                          ? '#FFB800'
                          : '#30363D';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: '#8B949E' }}
                  >
                    {showConfirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 &&
                  password !== confirmPassword && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: '#FFB800' }}
                    >
                      Passwords do not match
                    </p>
                  )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  resetForm();
                  setModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: '#21262D',
                  color: '#E6EDF3',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: canCreate ? '#00D68F' : '#21262D',
                }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
