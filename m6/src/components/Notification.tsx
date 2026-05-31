import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export const Notification: React.FC = () => {
  const { notification, setNotification } = useAppStore();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification, setNotification]);

  if (!notification) return null;

  const config = {
    success: {
      bg: 'bg-green-600',
      icon: <CheckCircle className="w-5 h-5" />,
    },
    error: {
      bg: 'bg-red-600',
      icon: <AlertCircle className="w-5 h-5" />,
    },
    info: {
      bg: 'bg-cyan-600',
      icon: <Info className="w-5 h-5" />,
    },
  };

  const style = config[notification.type];

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className={`${style.bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-64`}>
        {style.icon}
        <span className="flex-1">{notification.message}</span>
        <button
          onClick={() => setNotification(null)}
          className="hover:bg-white/20 p-1 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
