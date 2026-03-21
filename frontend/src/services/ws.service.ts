import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000/ws';

class WsService {
  private socket: Socket | null = null;
  private token: string | null = null;

  connect(token: string) {
    if (this.socket && this.token === token) {
      return this.socket;
    }

    this.disconnect();

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    this.token = token;

    return this.socket;
  }

  getSocket() {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
  }
}

export const wsService = new WsService();

