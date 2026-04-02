import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import type { TelemetryEvent } from "@/lib/types";

export interface UseWebSocketResult {
  connected: boolean;
  events: TelemetryEvent[];
  clearEvents: () => void;
}

export function useWebSocket(maxEvents = 500): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as TelemetryEvent;
        setEvents((prev) => {
          const next = [data, ...prev];
          return next.length > maxEvents ? next.slice(0, maxEvents) : next;
        });
      } catch {
        // ignore parse errors
      }
    };

    wsRef.current = ws;
  }, [maxEvents]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { connected, events, clearEvents };
}
