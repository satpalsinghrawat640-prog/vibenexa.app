type Listener = (payload: unknown) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectTimer: number | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private shouldReconnect = false;

  connect(token: string) {
    this.token = token;
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect() {
    this.shouldReconnect = false;
    this.token = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket() {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      if (this.token) {
        ws.send(JSON.stringify({ event: 'auth', token: this.token }));
      }
    };

    ws.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed && typeof parsed.event === 'string') {
          const set = this.listeners.get(parsed.event);
          if (set) {
            for (const fn of set) fn(parsed.payload);
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect && this.token) {
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), 2500);
      }
    };
  }

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return () => {
      this.listeners.get(event)?.delete(fn);
    };
  }

  sendTyping(chatId: string, isTyping: boolean) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'dm:typing', payload: { chatId, isTyping } }));
    }
  }
}

export const realtime = new RealtimeClient();
