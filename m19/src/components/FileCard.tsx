import { Image, FileText, File as FileIcon, Trash2, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/useFileStore";

interface FileData {
  cid: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  pin_count: number;
  reward_level: number;
  owner_nickname: string;
  is_pinned?: boolean;
  is_owner?: boolean;
}

interface FileCardProps {
  file: FileData;
  onPreview: () => void;
  onDelete?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.startsWith("text/")) return FileText;
  return FileIcon;
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function FileCard({ file, onPreview, onDelete }: FileCardProps) {
  const { pinFile } = useFileStore();
  const [toast, setToast] = useState<string | null>(null);
  const Icon = getFileIcon(file.mimeType);

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await pinFile(file.cid);
    if (result.success) {
      setToast(`+${result.pointsEarned} 积分!`);
      setTimeout(() => setToast(null), 2000);
    }
  };

  return (
    <div
      onClick={onPreview}
      className={cn(
        "group relative flex flex-col rounded-lg overflow-hidden transition-all duration-200 cursor-pointer",
      )}
      style={{
        backgroundColor: "#16213e",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 0 18px rgba(0, 212, 170, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        className="flex items-center justify-center h-32 relative"
        style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
      >
        {isImageType(file.mimeType) ? (
          <img
            src={`/api/file/${file.cid}`}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon size={36} style={{ color: "rgba(255,255,255,0.35)" }} />
        )}
        {file.reward_level > 0 && (
          <span
            className="absolute top-2 left-2 text-sm font-bold"
            style={{
              color: "#fbbf24",
              textShadow: "0 0 8px rgba(251,191,36,0.6)",
            }}
          >
            ⚡
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p
          className="text-sm font-medium truncate"
          style={{
            fontFamily: "'Outfit', sans-serif",
            color: "#fff",
          }}
        >
          {file.name}
        </p>

        <p
          className="text-xs"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          上传者: {file.owner_nickname}
        </p>

        <div
          className="flex items-center gap-3 text-xs"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>{formatSize(file.size)}</span>
          <span>·</span>
          <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
        </div>

        <div className="flex items-center justify-between mt-1">
          <div
            className="flex items-center gap-1 text-xs"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <ThumbsUp size={12} />
            <span>{file.pin_count}</span>
          </div>

          <button
            onClick={handlePin}
            disabled={file.is_owner}
            className="px-3 py-1 text-xs font-medium rounded-full transition-all border"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              backgroundColor: file.is_pinned
                ? "rgba(0, 212, 170, 0.15)"
                : file.is_owner
                ? "rgba(255,255,255,0.05)"
                : "rgba(255,255,255,0.08)",
              borderColor: file.is_pinned
                ? "rgba(0, 212, 170, 0.5)"
                : "rgba(255,255,255,0.1)",
              color: file.is_pinned
                ? "#00d4aa"
                : file.is_owner
                ? "rgba(255,255,255,0.3)"
                : "rgba(255,255,255,0.6)",
              cursor: file.is_owner ? "not-allowed" : "pointer",
              boxShadow: file.is_pinned
                ? "0 0 8px rgba(0, 212, 170, 0.3)"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (!file.is_pinned && !file.is_owner) {
                e.currentTarget.style.boxShadow = "0 0 12px rgba(0, 212, 170, 0.4)";
                e.currentTarget.style.borderColor = "rgba(0, 212, 170, 0.5)";
                e.currentTarget.style.color = "#00d4aa";
              }
            }}
            onMouseLeave={(e) => {
              if (!file.is_pinned && !file.is_owner) {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }
            }}
          >
            {file.is_owner ? "自己的文件" : file.is_pinned ? "已固定 ✓" : "Pin 固定"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="absolute bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full text-sm font-bold z-10"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            backgroundColor: "rgba(0, 212, 170, 0.9)",
            color: "#fff",
            boxShadow: "0 0 20px rgba(0, 212, 170, 0.5)",
            animation: "fadeInOut 2s ease-in-out",
          }}
        >
          {toast}
        </div>
      )}

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
        >
          <Trash2 size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
        </button>
      )}
    </div>
  );
}

export { FileCard };
export type { FileData };
export default FileCard;
