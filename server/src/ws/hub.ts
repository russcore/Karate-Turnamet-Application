import type { WebSocket } from '@fastify/websocket';

interface Client {
  socket: WebSocket;
  topics: Set<string>;
}

/** Very small pub/sub hub over WebSocket connections. */
class Hub {
  private clients = new Set<Client>();

  add(socket: WebSocket, topics: string[]): Client {
    const client: Client = { socket, topics: new Set(topics.length ? topics : ['all']) };
    this.clients.add(client);
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
    return client;
  }

  /** Send a change notification to everyone subscribed to `all` or the given topic. */
  publish(topic: string, payload: unknown): void {
    const msg = JSON.stringify(payload);
    for (const c of this.clients) {
      if (c.topics.has('all') || c.topics.has(topic)) {
        try {
          if (c.socket.readyState === c.socket.OPEN) c.socket.send(msg);
        } catch {
          /* ignore broken sockets */
        }
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const hub = new Hub();

/** Notify listeners that a category (its bracket/results) changed. */
export function notifyCategory(categoryId: number, tatamiId?: number | null): void {
  const payload = { type: 'change', entity: 'category', id: categoryId, at: Date.now() };
  hub.publish('all', payload);
  hub.publish(`category:${categoryId}`, payload);
  if (tatamiId != null) hub.publish(`tatami:${tatamiId}`, payload);
}

/** Notify listeners that configuration (ranks/tatami/branding/categories) changed. */
export function notifyConfig(): void {
  hub.publish('all', { type: 'change', entity: 'config', at: Date.now() });
}

/** Announce a category's podium — projector clients show the winners full-screen. */
export function notifyPodium(categoryId: number): void {
  hub.publish('all', { type: 'podium', categoryId, at: Date.now() });
}
