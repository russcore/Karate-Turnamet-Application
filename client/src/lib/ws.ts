import { useEffect, useRef, useState } from 'react';

/**
 * Subscribe to live change notifications. Reconnects automatically with backoff.
 * Returns `connected` so views can show an offline indicator.
 */
export function useLive(topics: string[], onChange: () => void, onMessage?: (msg: any) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const topicKey = topics.join(',');

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?topics=${encodeURIComponent(topicKey)}`);
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'change') onChangeRef.current();
          onMessageRef.current?.(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retry = Math.min(retry + 1, 6);
          timer = setTimeout(connect, 500 * 2 ** retry);
        }
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [topicKey]);

  return { connected };
}

// --- Offline write queue for the tatami view (survives socket drops / reloads). ---
const QUEUE_KEY = 'karate_offline_queue';

export interface QueuedWrite {
  id: string;
  path: string;
  body: unknown;
}

export function loadQueue(): QueuedWrite[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveQueue(q: QueuedWrite[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
