import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class NotificationHubService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
