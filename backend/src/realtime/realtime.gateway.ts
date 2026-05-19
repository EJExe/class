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
import { AssignmentsService } from '../assignments/assignments.service';
import { verifyAuthToken } from '../auth/token.util';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationHubService } from '../notifications/notification-hub.service';
import { CourseRole } from '@prisma/client';

const MANAGE_ROLES: CourseRole[] = [CourseRole.admin, CourseRole.teacher];

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    nickname?: string;
    joinedRoomIds?: Set<string>;
    joinedPrivateChatIds?: Set<string>;
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
    private readonly assignmentsService: AssignmentsService,
    private readonly notificationHub: NotificationHubService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    const authorized = await this.authorizeSocket(client);
    if (!authorized) {
      client.emit('room:error', { message: 'Invalid token' });
      client.disconnect(true);
      return;
    }
    await client.join(`user:${client.data.userId}`);
    this.notificationHub.attach(this.server);
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

  // ── Private chat ──────────────────────────────────────────

  @SubscribeMessage('private-chat:join')
  async onPrivateChatJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { chatId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    await this.access.assertPrivateChatAccess(payload.chatId, userId);
    client.data.joinedPrivateChatIds?.add(payload.chatId);
    await client.join(`private-chat:${payload.chatId}`);
    client.emit('private-chat:join', { chatId: payload.chatId, ok: true });
  }

  @SubscribeMessage('private-chat:leave')
  async onPrivateChatLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { chatId: string },
  ) {
    client.data.joinedPrivateChatIds?.delete(payload.chatId);
    await client.leave(`private-chat:${payload.chatId}`);
    client.emit('private-chat:leave', { chatId: payload.chatId, ok: true });
  }

  @SubscribeMessage('private-chat:message')
  async onPrivateChatMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { chatId: string; content: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    const normalizedContent = payload.content?.trim();
    if (!normalizedContent) {
      return;
    }
    const normalized = await this.assignmentsService.createPrivateChatMessage(userId, payload.chatId, {
      content: normalizedContent,
    });
    this.server.to(`private-chat:${payload.chatId}`).emit('private-chat:message:new', {
      chatId: payload.chatId,
      message: normalized,
    });
    client.emit('private-chat:message:new', {
      chatId: payload.chatId,
      message: normalized,
    });
  }

  @SubscribeMessage('private-chat:message:update')
  async onPrivateChatMessageUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { chatId: string; messageId: string; content: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    const message = await this.assignmentsService.updatePrivateChatMessage(userId, payload.messageId, {
      content: payload.content,
    });
    this.server.to(`private-chat:${payload.chatId}`).emit('private-chat:message:updated', {
      chatId: payload.chatId,
      message,
    });
  }

  // ── Course chat ──────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async onChatJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    await this.ensureSocketUser(client);
    await this.access.assertChannelAccess(payload.channelId, client.data.userId as string);
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
    await this.messagesService.createMessage(userId, payload.channelId, payload.content);
  }

  @SubscribeMessage('chat:message:update')
  async onChatMessageUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { channelId: string; messageId: string; content: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    await this.messagesService.updateMessage(userId, payload.messageId, payload.content);
  }

  @SubscribeMessage('chat:message:delete')
  async onChatMessageDelete(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { messageId: string; channelId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    await this.messagesService.softDeleteMessage(userId, payload.messageId);
  }

  // ── Video room: core ─────────────────────────────────────

  @SubscribeMessage('room:join')
  async onRoomJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const room = await this.prisma.videoRoom.findUnique({ where: { id: payload.roomId } });
    if (!room) {
      client.emit('room:error', { message: 'Комната не найдена' });
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
      client.emit('room:error', { message: 'Комната заполнена' });
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
            fullName: true,
          },
        },
      },
    });

    const membership = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId: room.courseId, userId } },
    });

    client.emit('room:joined', {
      roomId: payload.roomId,
      peerId,
      participants,
      role: membership?.role ?? 'student',
    });
    this.server.to(`room:${payload.roomId}`).emit('room:participants', {
      roomId: payload.roomId,
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

  // ── Video room: signalling ───────────────────────────────

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

  // ── Video room: raise hand ──────────────────────────────

  @SubscribeMessage('room:raise-hand')
  async onRaiseHand(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    this.server.to(`room:${payload.roomId}`).emit('room:hand-raised', {
      roomId: payload.roomId,
      userId,
    });
  }

  @SubscribeMessage('room:lower-hand')
  async onLowerHand(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    this.server.to(`room:${payload.roomId}`).emit('room:hand-lowered', {
      roomId: payload.roomId,
      userId,
    });
  }

  // ── Video room: speaking indicator ──────────────────────

  @SubscribeMessage('room:speaking')
  async onSpeaking(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; speaking: boolean },
  ) {
    const userId = await this.ensureSocketUser(client);
    this.server.to(`room:${payload.roomId}`).emit('room:speaking', {
      roomId: payload.roomId,
      userId,
      speaking: payload.speaking,
    });
  }

  // ── Video room: chat ────────────────────────────────────

  @SubscribeMessage('room:chat:message')
  async onRoomChatMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; content: string },
  ) {
    const userId = await this.ensureSocketUser(client);
    const normalizedContent = payload.content?.trim();
    if (!normalizedContent) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, fullName: true },
    });

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      roomId: payload.roomId,
      userId,
      content: normalizedContent,
      createdAt: new Date().toISOString(),
      user,
    };

    this.server.to(`room:${payload.roomId}`).emit('room:chat:message', message);
  }

  // ── Video room: state changes (mic/cam) ─────────────────

  @SubscribeMessage('room:state-change')
  async onStateChange(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; micEnabled?: boolean; camEnabled?: boolean },
  ) {
    const userId = await this.ensureSocketUser(client);
    this.server.to(`room:${payload.roomId}`).emit('room:state-change', {
      roomId: payload.roomId,
      userId,
      micEnabled: payload.micEnabled,
      camEnabled: payload.camEnabled,
    });
  }

  // ── Video room: moderation ──────────────────────────────

  @SubscribeMessage('room:mute-peer')
  async onMutePeer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetUserId: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const room = await this.prisma.videoRoom.findUnique({ where: { id: payload.roomId } });
    if (!room) return;

    const membership = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId: room.courseId, userId } },
    });
    if (!membership || !MANAGE_ROLES.includes(membership.role)) return;

    this.server.to(`room:${payload.roomId}`).emit('room:force-mute', {
      roomId: payload.roomId,
      userId: payload.targetUserId,
    });
  }

  @SubscribeMessage('room:unmute-peer')
  async onUnmutePeer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetUserId: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const room = await this.prisma.videoRoom.findUnique({ where: { id: payload.roomId } });
    if (!room) return;

    const membership = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId: room.courseId, userId } },
    });
    if (!membership || !MANAGE_ROLES.includes(membership.role)) return;

    this.server.to(`room:${payload.roomId}`).emit('room:force-unmute', {
      roomId: payload.roomId,
      userId: payload.targetUserId,
    });
  }

  @SubscribeMessage('room:kick-peer')
  async onKickPeer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; targetUserId: string },
  ) {
    const userId = await this.ensureSocketUser(client);

    const room = await this.prisma.videoRoom.findUnique({ where: { id: payload.roomId } });
    if (!room) return;

    const membership = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId: room.courseId, userId } },
    });
    if (!membership || !MANAGE_ROLES.includes(membership.role)) return;

    // Mark target as left
    await this.prisma.videoRoomParticipant.updateMany({
      where: {
        roomId: payload.roomId,
        userId: payload.targetUserId,
        leftAt: null,
      },
      data: { leftAt: new Date() },
    });

    // Notify the target
    this.server.to(`user:${payload.targetUserId}`).emit('room:kicked', {
      roomId: payload.roomId,
    });

    // Broadcast updated participant list
    const participants = await this.prisma.videoRoomParticipant.findMany({
      where: { roomId: payload.roomId, leftAt: null },
      include: { user: { select: { id: true, nickname: true, fullName: true } } },
    });
    this.server.to(`room:${payload.roomId}`).emit('room:participants', {
      roomId: payload.roomId,
      participants,
    });
  }

  // ── Internal helpers ────────────────────────────────────

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

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      return false;
    }

    const session = await this.prisma.session.findUnique({
      where: { token: payload.sid },
      include: { user: true },
    });

    if (!session || session.userId !== payload.sub || (session.expiresAt && session.expiresAt < new Date())) {
      return false;
    }

    client.data.userId = session.user.id;
    client.data.nickname = session.user.nickname;
    client.data.joinedRoomIds = client.data.joinedRoomIds ?? new Set<string>();
    client.data.joinedPrivateChatIds = client.data.joinedPrivateChatIds ?? new Set<string>();
    return true;
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
            fullName: true,
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
