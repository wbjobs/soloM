import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocStore } from '@/store/docStore';
import { useRoomStore } from '@/store/roomStore';
import { Copy, Check, Users, Plus, LogIn, Link } from 'lucide-react';

type Tab = 'create' | 'join';

export default function Room() {
  const navigate = useNavigate();
  const { documents, setCurrentDocId } = useDocStore();
  const { setRoomId, setUsername } = useRoomStore();

  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [username, setUsernameInput] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdDocId, setCreatedDocId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const extractRoomId = (input: string): string => {
    try {
      const url = new URL(input);
      const roomParam = url.searchParams.get('room');
      if (roomParam) return roomParam;
    } catch {}
    return input.trim();
  };

  const shareLink = createdDocId && createdRoomId
    ? `${window.location.origin}/editor/${createdDocId}?room=${createdRoomId}`
    : '';

  const handleCopy = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = () => {
    if (!username.trim() || !selectedDocId) return;
    const roomId = crypto.randomUUID();
    setRoomId(roomId);
    setUsername(username.trim());
    setCreatedRoomId(roomId);
    setCreatedDocId(selectedDocId);
    setCurrentDocId(selectedDocId);
  };

  const handleJoin = () => {
    if (!username.trim() || !joinRoomInput.trim()) return;
    const roomId = extractRoomId(joinRoomInput);
    setRoomId(roomId);
    setUsername(username.trim());

    let docId = '';
    try {
      const url = new URL(joinRoomInput);
      const pathParts = url.pathname.split('/');
      docId = pathParts[pathParts.length - 1] || '';
    } catch {}
    if (docId) {
      setCurrentDocId(docId);
      navigate(`/editor/${docId}?room=${roomId}`);
    } else {
      navigate(`/editor?room=${roomId}`);
    }
  };

  const inputClass = 'w-full px-4 py-2.5 bg-[#0D1117] border border-[#30363D] text-white rounded-lg outline-none focus:border-[#00D68F] transition-colors placeholder:text-[#8B949E]';
  const btnClass = 'w-full py-2.5 bg-[#00D68F] text-black font-semibold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#30363D]">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
              activeTab === 'create' ? 'text-[#00D68F]' : 'text-[#8B949E] hover:text-white'
            }`}
          >
            <Plus size={16} />
            Create Room
            {activeTab === 'create' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D68F]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('join')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
              activeTab === 'join' ? 'text-[#00D68F]' : 'text-[#8B949E] hover:text-white'
            }`}
          >
            <LogIn size={16} />
            Join Room
            {activeTab === 'join' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D68F]" />
            )}
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'create' && !createdRoomId && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#8B949E] mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter your username"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm text-[#8B949E] mb-1.5">Document</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>Select a document</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreate}
                disabled={!username.trim() || !selectedDocId}
                className={btnClass}
              >
                <Users size={16} />
                Create Room
              </button>
            </div>
          )}

          {activeTab === 'create' && createdRoomId && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#00D68F]/10 mb-3">
                  <Users size={24} className="text-[#00D68F]" />
                </div>
                <h3 className="text-white font-semibold text-lg">Room Created!</h3>
              </div>

              <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-3">
                <p className="text-xs text-[#8B949E] mb-1">Room ID</p>
                <p className="text-[#A371F7] font-mono text-sm break-all">{createdRoomId}</p>
              </div>

              <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-3">
                <p className="text-xs text-[#8B949E] mb-1">Share Link</p>
                <p className="text-white font-mono text-xs break-all">{shareLink}</p>
              </div>

              <button
                onClick={handleCopy}
                className="w-full py-2.5 bg-[#A371F7] text-white font-semibold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>

              <button
                onClick={() => {
                  if (createdDocId) {
                    navigate(`/editor/${createdDocId}?room=${createdRoomId}`);
                  }
                }}
                className={btnClass}
              >
                Open Editor
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#8B949E] mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter your username"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm text-[#8B949E] mb-1.5">Room ID or Link</label>
                <div className="relative">
                  <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
                  <input
                    type="text"
                    value={joinRoomInput}
                    onChange={(e) => setJoinRoomInput(e.target.value)}
                    placeholder="Paste room link or enter room ID"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              <button
                onClick={handleJoin}
                disabled={!username.trim() || !joinRoomInput.trim()}
                className={btnClass}
              >
                <LogIn size={16} />
                Join Room
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
