"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Upload, Database } from "lucide-react";

const navItems = [
  { path: "/", label: "问答", icon: MessageSquare },
  { path: "/upload", label: "上传", icon: Upload },
  { path: "/knowledge", label: "知识库", icon: Database },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 30 }}
        className="w-60 bg-gray-900 text-white flex flex-col fixed h-full z-10"
      >
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            智能问答系统
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  href={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 relative group ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"
                    />
                  )}
                  <Icon
                    className={`w-5 h-5 transition-transform duration-200 ${
                      isActive ? "scale-110" : "group-hover:scale-110"
                    }`}
                  />
                  <span className="font-medium">{item.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-gray-800 rounded-lg p-4"
          >
            <p className="text-sm text-gray-400">版本 1.0.0</p>
          </motion.div>
        </div>
      </motion.aside>

      <main className="ml-60 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
