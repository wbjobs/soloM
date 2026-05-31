import { useState } from "react";
import { X } from "lucide-react";
import { useFileStore } from "@/store/useFileStore";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"register" | "login">("register");
  const [nickname, setNickname] = useState("");
  const [address, setAddress] = useState("");
  const { register, login } = useFileStore();

  if (!isOpen) return null;

  const handleRegister = async () => {
    if (!nickname.trim()) return;
    await register(nickname);
    onClose();
  };

  const handleLogin = async () => {
    if (!address.trim()) return;
    await login(address);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md mx-4 rounded-lg overflow-hidden"
        style={{
          backgroundColor: "#0f0f1a",
          border: "1px solid rgba(0, 212, 170, 0.3)",
          boxShadow: "0 0 30px rgba(0, 212, 170, 0.15), inset 0 0 30px rgba(0, 212, 170, 0.05)",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{
            background: "linear-gradient(90deg, transparent, #00d4aa, transparent)",
          }}
        />
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(0, 212, 170, 0.15)" }}>
          <h2
            className="text-lg font-bold"
            style={{
              fontFamily: "'Outfit', sans-serif",
              color: "#00d4aa",
              textShadow: "0 0 10px rgba(0, 212, 170, 0.5)",
            }}
          >
            {activeTab === "register" ? "创建账户" : "用户登录"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:opacity-70"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex border-b" style={{ borderColor: "rgba(0, 212, 170, 0.15)" }}>
          <button
            onClick={() => setActiveTab("register")}
            className="flex-1 py-3 text-sm font-medium transition-colors"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: activeTab === "register" ? "#00d4aa" : "rgba(255,255,255,0.5)",
              borderBottom: activeTab === "register" ? "2px solid #00d4aa" : "2px solid transparent",
              textShadow: activeTab === "register" ? "0 0 8px rgba(0, 212, 170, 0.5)" : "none",
            }}
          >
            注册
          </button>
          <button
            onClick={() => setActiveTab("login")}
            className="flex-1 py-3 text-sm font-medium transition-colors"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: activeTab === "login" ? "#00d4aa" : "rgba(255,255,255,0.5)",
              borderBottom: activeTab === "login" ? "2px solid #00d4aa" : "2px solid transparent",
              textShadow: activeTab === "login" ? "0 0 8px rgba(0, 212, 170, 0.5)" : "none",
            }}
          >
            登录
          </button>
        </div>
        <div className="p-6">
          {activeTab === "register" ? (
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm mb-2"
                  style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.7)" }}
                >
                  用户昵称
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="输入您的昵称"
                  className="w-full px-4 py-2.5 rounded-md text-sm outline-none transition-all"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    backgroundColor: "rgba(0, 212, 170, 0.05)",
                    border: "1px solid rgba(0, 212, 170, 0.25)",
                    color: "#ffffff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#00d4aa";
                    e.target.style.boxShadow = "0 0 10px rgba(0, 212, 170, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(0, 212, 170, 0.25)";
                    e.target.style.boxShadow = "none";
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={!nickname.trim()}
                className="w-full py-2.5 rounded-md font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  backgroundColor: "#00d4aa",
                  color: "#0a0a1a",
                  boxShadow: "0 0 15px rgba(0, 212, 170, 0.4)",
                }}
              >
                注册账户
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm mb-2"
                  style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.7)" }}
                >
                  用户地址
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="输入您的用户地址"
                  className="w-full px-4 py-2.5 rounded-md text-sm outline-none transition-all font-mono"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    backgroundColor: "rgba(0, 212, 170, 0.05)",
                    border: "1px solid rgba(0, 212, 170, 0.25)",
                    color: "#ffffff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#00d4aa";
                    e.target.style.boxShadow = "0 0 10px rgba(0, 212, 170, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(0, 212, 170, 0.25)";
                    e.target.style.boxShadow = "none";
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={!address.trim()}
                className="w-full py-2.5 rounded-md font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  backgroundColor: "#00d4aa",
                  color: "#0a0a1a",
                  boxShadow: "0 0 15px rgba(0, 212, 170, 0.4)",
                }}
              >
                登录
              </button>
            </div>
          )}
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{
            background: "linear-gradient(90deg, transparent, #00d4aa, transparent)",
          }}
        />
      </div>
    </div>
  );
}
