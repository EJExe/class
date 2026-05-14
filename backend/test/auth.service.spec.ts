import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/auth/password.util';
import { signAuthToken } from '../src/auth/token.util';
import { createPrismaMock, createStorageMock } from './test-helpers';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = createStorageMock();
    service = new AuthService(prisma as any, storage as any);
    process.env.ADMIN_LOGIN = 'admin';
    process.env.ADMIN_NICKNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin123';
    process.env.SESSION_TTL_HOURS = '24';
    process.env.JWT_SECRET = 'test-secret';
  });

  it('registers a new user, hashes the password and creates a session', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'user-1',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: null,
      avatarPath: null,
    }));
    prisma.session.create.mockResolvedValue({ id: 'session-1' });

    const result = await service.register({
      login: 'Student1',
      email: 'Student1@example.com',
      fullName: 'Student One',
      birthDate: '2005-01-01',
      nickname: 'Student One',
      password: 'secret123',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          login: 'student1',
          email: 'student1@example.com',
          passwordHash: expect.stringMatching(/^scrypt\$/),
        }),
      }),
    );
    expect(result.token).toEqual(expect.any(String));
    expect(result.user.login).toBe('student1');
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it('rejects registration when login, email or nickname is already occupied', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        login: 'taken',
        email: 'taken@example.com',
        fullName: 'Taken User',
        birthDate: '2000-02-02',
        nickname: 'taken',
        password: 'secret123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('auto-provisions the admin account on login and returns a token', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'admin-id',
      login: 'admin',
      email: 'admin@local.dev',
      fullName: 'System Administrator',
      nickname: 'admin',
      passwordHash: hashPassword('admin123'),
      avatarPath: null,
    });
    prisma.user.update.mockResolvedValue({
      id: 'admin-id',
      login: 'admin',
      email: 'admin@local.dev',
      fullName: 'System Administrator',
      nickname: 'admin',
      passwordHash: hashPassword('admin123'),
      avatarPath: null,
    });
    prisma.session.create.mockResolvedValue({ id: 'session-1' });

    const result = await service.login({ login: 'admin', password: 'admin123' });

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-id' },
        data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
      }),
    );
    expect(result.user.nickname).toBe('admin');
    expect(result.token).toEqual(expect.any(String));
  });

  it('rejects login with an invalid password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      login: 'student',
      nickname: 'student',
      passwordHash: hashPassword('good-password'),
    });

    await expect(service.login({ login: 'student', password: 'wrong-password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects profile password change when the current password is invalid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      login: 'student',
      email: 'student@example.com',
      nickname: 'student',
      fullName: 'Student One',
      birthDate: new Date('2001-01-01'),
      passwordHash: hashPassword('old-password'),
    });

    await expect(
      service.updateProfile('user-1', {
        currentPassword: 'incorrect',
        newPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects profile update when login/email/nickname is already used by another user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      login: 'student',
      email: 'student@example.com',
      nickname: 'student',
      fullName: 'Student One',
      birthDate: new Date('2001-01-01'),
      passwordHash: hashPassword('old-password'),
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'other-user' });

    await expect(
      service.updateProfile('user-1', {
        login: 'occupied',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates profile fields and stores a new password hash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      login: 'student',
      email: 'student@example.com',
      nickname: 'student',
      fullName: 'Student One',
      birthDate: new Date('2001-01-01'),
      passwordHash: hashPassword('old-password'),
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockImplementation(async ({ data }) => ({
      id: 'user-1',
      login: data.login ?? 'student-updated',
      email: data.email ?? 'student-updated@example.com',
      nickname: data.nickname ?? 'student-new',
      fullName: data.fullName ?? 'Student Updated',
      birthDate: data.birthDate ?? new Date('2001-01-02'),
      avatarPath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
    }));

    await service.updateProfile('user-1', {
      login: 'Student-Updated',
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });

    const updatePayload = prisma.user.update.mock.calls[0][0].data;
    expect(updatePayload.login).toBe('student-updated');
    expect(updatePayload.passwordHash).toEqual(expect.stringMatching(/^scrypt\$/));
    expect(updatePayload.passwordHash).not.toBe('new-password');
  });

  it('deletes a session using the sid from the signed JWT', async () => {
    const token = signAuthToken(
      {
        sub: 'user-1',
        sid: 'session-123',
        login: 'student',
        nickname: 'student',
      },
      3600,
    );

    await service.deleteSession(token);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: 'session-123' } });
  });

  it('throws when avatar metadata is missing', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      avatarOriginalName: null,
      avatarMimeType: null,
      avatarPath: null,
    });

    await expect(service.getAvatar('user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
