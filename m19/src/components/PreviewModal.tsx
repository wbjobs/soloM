import { useEffect, type ReactNode } from "react";
import { X, FileText, File as FileIcon } from "lucide-react";
import type { FileData } from "@/components/FileCard";

interface PreviewModalProps {
  file: FileData | null;
  onClose: () => void;
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdfType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function PreviewContent({ file }: { file: FileData }): ReactNode {
  if (isImageType(file.mimeType)) {
    return (
      <img
        src={`/api/file/${file.cid}`}
        alt={file.name}
        className="max-w-full max-h-[70vh] rounded-lg object-contain"
      />
    );
  }

  if (isPdfType(file.mimeType)) {
    return (
      <iframe
        src={`/api/file/${file.cid}`}
        className="w-[80vw] h-[70vh] rounded-lg border-0"
        style={{ backgroundColor: "#1a1a2e" }}
        title={file.name}
      />
    );
  }

  const Icon = file.mimeType.startsWith("text/") ? FileText : FileIcon;

  return (
    <div
      className="flex flex-col items-center gap-4 p-8 rounded-lg"
      style={{ backgroundColor: "#16213e" }}
    >
      <Icon size={56} style={{ color: "rgba(255,255,255,0.3)" }} />
      <p
        className="text-lg font-medium"
        style={{ fontFamily: "'Outfit', sans-serif", color: "#fff" }}
      >
        {file.name}
      </p>
      <div
        className="flex flex-col items-center gap-1 text-sm"
        style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.45)" }}
      >
        <span>CID: {file.cid}</span>
        <span>Size: {formatSize(file.size)}</span>
        <span>Type: {file.mimeType}</span>
        <span>Uploaded: {new Date(file.uploadedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function PreviewModal({ file, onClose }: PreviewModalProps) {
  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [file, onClose]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      onClick={onClose}
      style={{
        backgroundColor: "rgba(0,0,0,0.75)",
      }}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 rounded-md transition-colors z-10"
          style={{ color: "rgba(255,255,255,0.6)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#00d4aa";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <X size={22} />
        </button>

        <PreviewContent file={file} />
      </div>
    </div>
  );
}

export { PreviewModal };
export default PreviewModal;
