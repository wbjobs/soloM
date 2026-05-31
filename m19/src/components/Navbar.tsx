import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Upload, Database, Trophy, Coins, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/useFileStore";
import AuthModal from "./AuthModal";

const navItems = [
  { to: "/", label: "Upload", icon: Upload },
  { to: "/library", label: "资源库", icon: Database },
  { to: "/leaderboard", label: "排行榜", icon: Trophy },
];

export default function Navbar() {
  const location = useLocation();
  const { currentUser, logout } = useFileStore();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <nav
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{
          backgroundColor: "#1a1a2e",
          borderColor: "rgba(0, 212, 170, 0.15)",
        }}
      >
        <Link
          to="/"
          className="text-xl font-bold tracking-wide"
          style={{
            fontFamily: "'Outfit', sans-serif",
            color: "#00d4aa",
            textShadow: "0 0 12px rgba(0, 212, 170, 0.5), 0 0 24px rgba(0, 212, 170, 0.25)",
          }}
        >
          IPFS Share
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                )}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: isActive ? "#00d4aa" : "rgba(255,255,255,0.55)",
                }}
              >
                <Icon size={16} />
                {label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "#00d4aa" }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: "rgba(0, 212, 170, 0.1)" }}>
                <User size={16} style={{ color: "#00d4aa" }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.85)" }}>
                  {currentUser.nickname}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md" style={{ backgroundColor: "rgba(0, 212, 170, 0.1)" }}>
                <Coins size={16} style={{ color: "#00d4aa" }} />
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#00d4aa",
                    textShadow: "0 0 8px rgba(0, 212, 170, 0.6)",
                    fontWeight: 600,
                  }}
                >
                  {currentUser.points}
                </span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:opacity-80"
                style={{ backgroundColor: "rgba(255, 100, 100, 0.15)" }}
              >
                <LogOut size={16} style={{ color: "#ff6464" }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", color: "#ff6464", fontSize: "13px" }}>
                  退出
                </span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all hover:opacity-90"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                backgroundColor: "#00d4aa",
                color: "#0a0a1a",
                boxShadow: "0 0 12px rgba(0, 212, 170, 0.4)",
              }}
            >
              <User size={16} />
              登录/注册
            </button>
          )}
        </div>
      </nav>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
}
