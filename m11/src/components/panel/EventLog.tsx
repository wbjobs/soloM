import { useEffect, useRef } from "react";
import { useRaftStore } from "@/store/raftStore";

const EVENT_COLORS: Record<string, string> = {
  election: "#ff8c00",
  heartbeat: "#00f0ff",
  log_replication: "#44ff88",
  network_change: "#ff0044",
  state_change: "#ffd700",
};

const EVENT_ICONS: Record<string, string> = {
  election: "🗳",
  heartbeat: "💓",
  log_replication: "📋",
  network_change: "🔌",
  state_change: "🔄",
};

export function EventLog() {
  const events = useRaftStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex h-48 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-gray-400">Event Log</h3>
        <span className="font-mono text-xs text-gray-600">{events.length} events</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-gray-600">
            Waiting for events...
          </div>
        ) : (
          <div className="space-y-0.5">
            {events.map((event, i) => {
              const color = EVENT_COLORS[event.eventType] || "#ffffff";
              const icon = EVENT_ICONS[event.eventType] || "•";
              const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              } as Intl.DateTimeFormatOptions);

              return (
                <div
                  key={`${event.timestamp}-${i}`}
                  className="flex items-start gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-white/5"
                >
                  <span className="shrink-0 text-xs">{icon}</span>
                  <span className="shrink-0 text-gray-600">{time}</span>
                  <span className="shrink-0" style={{ color }}>
                    [{event.eventType.toUpperCase().slice(0, 5)}]
                  </span>
                  <span className="truncate text-gray-400">{event.detail}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
