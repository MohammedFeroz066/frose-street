import type { StaffRole } from '../../../../shared/types/index.js';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: any[]) => void): any;
}

export interface ConnectedClient {
  socket: WebSocketLike;
  vendorId: string;
  role: StaffRole;
  deviceId?: string;
  connectedAt: Date;
  lastPing: number;
}

export interface WsEventMessage<T = any> {
  event: string;
  data: T;
  timestamp: string;
}

export class WebSocketHub {
  // Map of vendorId -> Set of connected WebSocket clients
  private static vendorClients: Map<string, Set<ConnectedClient>> = new Map();

  /**
   * Registers a newly authenticated WebSocket connection for a stall
   */
  static registerClient(client: ConnectedClient): void {
    if (!this.vendorClients.has(client.vendorId)) {
      this.vendorClients.set(client.vendorId, new Set());
    }

    this.vendorClients.get(client.vendorId)!.add(client);

    // Setup close and error cleanup listeners
    client.socket.on('close', () => {
      this.removeClient(client);
    });

    client.socket.on('error', () => {
      this.removeClient(client);
    });

    // Send connection established confirmation
    this.sendToClient(client, 'connected', {
      vendorId: client.vendorId,
      role: client.role,
      deviceId: client.deviceId,
      message: 'FROSE Street Real-Time Channel Connected',
    });
  }

  /**
   * Removes a client upon disconnect
   */
  static removeClient(client: ConnectedClient): void {
    const clients = this.vendorClients.get(client.vendorId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        this.vendorClients.delete(client.vendorId);
      }
    }
  }

  /**
   * Broadcasts an event to all connected screens of a specific vendor stall
   * Optional filter can restrict delivery to specific roles (e.g. only 'cook' or 'packer')
   */
  static broadcast<T = any>(
    vendorId: string,
    event: string,
    data: T,
    roleFilter?: StaffRole[],
  ): number {
    const clients = this.vendorClients.get(vendorId);
    if (!clients || clients.size === 0) {
      return 0;
    }

    const payload: WsEventMessage<T> = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    const message = JSON.stringify(payload);

    let deliveredCount = 0;
    for (const client of clients) {
      // Apply role filter if provided
      if (roleFilter && !roleFilter.includes(client.role)) {
        continue;
      }

      // Check if socket is open (readyState === 1)
      if (client.socket.readyState === 1) {
        try {
          client.socket.send(message);
          deliveredCount++;
        } catch {
          this.removeClient(client);
        }
      }
    }

    return deliveredCount;
  }

  /**
   * Sends a targeted message to a single connected client
   */
  static sendToClient<T = any>(client: ConnectedClient, event: string, data: T): void {
    if (client.socket.readyState === 1) {
      const payload: WsEventMessage<T> = {
        event,
        data,
        timestamp: new Date().toISOString(),
      };
      client.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * Returns current connection statistics
   */
  static getStats(vendorId?: string): { totalStalls: number; totalClients: number; stallClients: number } {
    let totalClients = 0;
    for (const set of this.vendorClients.values()) {
      totalClients += set.size;
    }

    return {
      totalStalls: this.vendorClients.size,
      totalClients,
      stallClients: vendorId ? (this.vendorClients.get(vendorId)?.size ?? 0) : 0,
    };
  }

  /**
   * Clears all client connections (for testing teardown)
   */
  static _reset(): void {
    for (const set of this.vendorClients.values()) {
      for (const client of set) {
        try {
          client.socket.close();
        } catch {
          // ignore
        }
      }
    }
    this.vendorClients.clear();
  }
}
