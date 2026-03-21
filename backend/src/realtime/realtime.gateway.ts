import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { MessagesService } from '../messages/messages.service';

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    nickname?: string;
    joinedRoomIds?: Set<string>;
  };
};

@Injectable()
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly messagesService: MessagesService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    const authorized = await this.authorizeSocket(client);
    if (!authorized) {
      client.emit('room:error', { message: 'Invalid token' });
      client.disconnect(true);
      return;
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    if (!client.data.userId) {
      return;
    }

    const roomIds: string[] = client.data.joinedRoomIds
      ? Array.from(client.data.joinedRoomIds)
      : [];
    for (const roomId of roomIds) {
      await this.leaveVideoRoom(client, roomId);
    }
  }

  @SubscribeMessage('chat:join')
  async onChatJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    const channel = await this.access.getChannelWithCourse(payload.channelId);
    await this.access.assertCourseMember(channel.courseId, userId);

    await client.join(`chat:${payload.channelId}`);
    client.emit('chat:join', { channelId: payload.channelId, ok: true });
  }

  @SubscribeMessage('chat:leave')
  async onChatLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    await client.leave(`chat:${payload.channelId}`);
    client.emit('chat:leave', { channelId: payload.channelId, ok: true });
  }

  @SubscribeMessage('chat:message')
  async onChatMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { channelId: string; content: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const message = await this.messagesService.createMessage(userId, payload.channelId, payload.content);

    this.server.to(`chat:${payload.channelId}`).emit('chat:message:new', {
      channelId: payload.channelId,
      message,
    });
    client.emit('chat:message:new', {
      channelId: payload.channelId,
      message,
    });
  }

  
  @SubscribeMessage('chat:message:delete')
  async onChatMessageDelete(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { messageId: string; channelId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    const deleted = await this.messagesService.softDeleteMessage(userId, payload.messageId);
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:deleted', {
      channelId: payload.channelId,
      messageId: deleted.id,
      deletedAt: deleted.deletedAt,
    });
  }
  @SubscribeMessage('room:join')
  async onRoomJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const room = await this.prisma.videoRoom.findUnique({ where: { id: payload.roomId } });
    if (!room) {
      client.emit('room:error', { message: 'Room not found' });
      return;
    }

    await this.access.assertCourseMember(room.courseId, userId);

    await this.prisma.videoRoomParticipant.updateMany({
      where: {
        roomId: payload.roomId,
        userId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    const activeCount = await this.prisma.videoRoomParticipant.count({
      where: {
        roomId: payload.roomId,
        leftAt: null,
      },
    });

    if (activeCount >= room.maxParticipants) {
      client.emit('room:error', { message: 'Room is full' });
      return;
    }

    const peerId = `${userId}:${client.id}`;

    await this.prisma.videoRoomParticipant.create({
      data: {
        roomId: payload.roomId,
        userId,
        peerId,
      },
    });

    client.data.joinedRoomIds?.add(payload.roomId);
    await client.join(`room:${payload.roomId}`);

    const participants = await this.prisma.videoRoomParticipant.findMany({
      where: {
        roomId: payload.roomId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    this.server.to(`room:${payload.roomId}`).emit('room:participants', {
      roomId: payload.roomId,
      participants,
    });
    client.emit('room:participants', {
      roomId: payload.roomId,
      participants,
    });
    client.emit('room:joined', {
      roomId: payload.roomId,
      peerId,
      participants,
    });
  }

  @SubscribeMessage('room:leave')
  async onRoomLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string },
  ) {
    await this.leaveVideoRoom(client, payload.roomId);
  }

  @SubscribeMessage('webrtc:offer')
  async onOffer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetPeerId: string; sdp: any },
  ) {
    await this.ensureSocketUser(client);
    const targetSocketId = this.peerIdToSocketId(payload.targetPeerId);
    this.server.to(targetSocketId).emit('webrtc:offer', {
      fromPeerId: `${client.data.userId}:${client.id}`,
      targetPeerId: payload.targetPeerId,
      sdp: payload.sdp,
    });
  }

  @SubscribeMessage('webrtc:answer')
  async onAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetPeerId: string; sdp: any },
  ) {
    await this.ensureSocketUser(client);
    const targetSocketId = this.peerIdToSocketId(payload.targetPeerId);
    this.server.to(targetSocketId).emit('webrtc:answer', {
      fromPeerId: `${client.data.userId}:${client.id}`,
      targetPeerId: payload.targetPeerId,
      sdp: payload.sdp,
    });
  }

  @SubscribeMessage('webrtc:ice')
  async onIce(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetPeerId: string; candidate: any },
  ) {
    await this.ensureSocketUser(client);
    const targetSocketId = this.peerIdToSocketId(payload.targetPeerId);
    this.server.to(targetSocketId).emit('webrtc:ice', {
      fromPeerId: `${client.data.userId}:${client.id}`,
      targetPeerId: payload.targetPeerId,
      candidate: payload.candidate,
    });
  }

  private async ensureSocketUser(client: AuthedSocket) {
    if (!client.data.userId) {
      const authorized = await this.authorizeSocket(client);
      if (!authorized) {
        throw new ForbiddenException('Socket is not authorized');
      }
    }
    return client.data.userId as string;
  }

  private extractToken(client: AuthedSocket) {
    return (
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.slice(7)
        : undefined)
    );
  }

  private async authorizeSocket(client: AuthedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      return false;
    }

    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || (session.expiresAt && session.expiresAt < new Date())) {
      return false;
    }

    client.data.userId = session.user.id;
    client.data.nickname = session.user.nickname;
    client.data.joinedRoomIds = client.data.joinedRoomIds ?? new Set<string>();
    return true;
  }

  private assertSocketUser(client: AuthedSocket) {
    if (!client.data.userId) {
      throw new ForbiddenException('Socket is not authorized');
    }
    return client.data.userId;
  }

  private peerIdToSocketId(peerId: string) {
    const index = peerId.lastIndexOf(':');
    return index >= 0 ? peerId.slice(index + 1) : peerId;
  }

  private async leaveVideoRoom(client: AuthedSocket, roomId: string) {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }

    await this.prisma.videoRoomParticipant.updateMany({
      where: {
        roomId,
        userId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    client.data.joinedRoomIds?.delete(roomId);
    await client.leave(`room:${roomId}`);

    const participants = await this.prisma.videoRoomParticipant.findMany({
      where: {
        roomId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    this.server.to(`room:${roomId}`).emit('room:participants', {
      roomId,
      participants,
    });
  }
}




