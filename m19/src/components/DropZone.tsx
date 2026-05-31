import { useState, useRef, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onUpload: (file: File) => void;
  uploading: boolean;
  progress: number;
}

function DropZone({ onUpload, uploading, progress }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-all cursor-pointer",
      )}
      style={{
        backgroundColor: isDragging ? "rgba(0, 212, 170, 0.05)" : "#16213e",
        borderColor: isDragging ? "#00d4aa" : "rgba(255,255,255,0.15)",
        boxShadow: isDragging
          ? "0 0 20px rgba(0, 212, 170, 0.25), inset 0 0 20px rgba(0, 212, 170, 0.08)"
          : "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
      />

      <Upload
        size={40}
        style={{
          color: isDragging ? "#00d4aa" : "rgba(255,255,255,0.4)",
          filter: isDragging ? "drop-shadow(0 0 8px rgba(0, 212, 170, 0.5))" : "none",
        }}
      />

      <p
        className="text-sm"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: isDragging ? "#00d4aa" : "rgba(255,255,255,0.5)",
        }}
      >
        拖拽文件到此处，或点击选择
      </p>

      {uploading && (
        <div className="w-full max-w-xs mt-2">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #00d4aa, #ff6b35)",
              }}
            />
          </div>
          <p
            className="text-center text-xs mt-2"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: "#00d4aa",
            }}
          >
            {progress}%
          </p>
        </div>
      )}
    </div>
  );
}

export { DropZone };
export default DropZone;
