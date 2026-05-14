export function createPrismaMock() {
  return {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    course: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    courseMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    courseGroup: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    courseGroupMember: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    channel: {
      findUnique: jest.fn(),
    },
    channelReadState: {
      upsert: jest.fn(),
    },
    assignment: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    assignmentFile: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    assignmentReadState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    submission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    submissionFile: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    submissionFileComment: {
      create: jest.fn(),
    },
    submissionActivityLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    privateAssignmentChat: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    privateAssignmentMessage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    messageAttachment: {
      findUnique: jest.fn(),
    },
    messageReaction: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

export function createAccessMock() {
  return {
    assertCourseMember: jest.fn(),
    assertCourseManager: jest.fn(),
    assertCourseReviewer: jest.fn(),
    assertChannelAccess: jest.fn(),
    getCourseMembership: jest.fn(),
    getAssignmentAccessible: jest.fn(),
    assertSubmissionOwnerOrReviewer: jest.fn(),
    assertPrivateChatAccess: jest.fn(),
  };
}

export function createStorageMock() {
  return {
    saveFile: jest.fn(),
    remove: jest.fn(),
  };
}

export function createNotificationsMock() {
  return {
    create: jest.fn(),
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
}

export function createAuditMock() {
  return {
    log: jest.fn(),
    listAll: jest.fn(),
    listForEntity: jest.fn(),
  };
}

export function createHubMock() {
  return {
    emitToUser: jest.fn(),
  };
}
