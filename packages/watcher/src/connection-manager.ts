/**
 * WebSocket connection manager for real-time updates.
 */

import type { WSContext } from "hono/ws";

export interface BroadcastMessage {
  type: string;
  [key: string]: unknown;
}

export class ConnectionManager {
  private connections = new Set<WSContext>();

  connect(ws: WSContext): void {
    this.connections.add(ws);
  }

  disconnect(ws: WSContext): void {
    this.connections.delete(ws);
  }

  broadcast(message: BroadcastMessage): void {
    if (this.connections.size === 0) return;

    const data = JSON.stringify(message);
    const disconnected: WSContext[] = [];

    for (const ws of this.connections) {
      try {
        ws.send(data);
      } catch {
        disconnected.push(ws);
      }
    }

    // Clean up disconnected clients
    for (const ws of disconnected) {
      this.connections.delete(ws);
    }
  }

  sendTo(ws: WSContext, message: BroadcastMessage): boolean {
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}
