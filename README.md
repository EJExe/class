# DIPLOM LMS

Local LMS platform built on `NestJS + Prisma + PostgreSQL + React`.

## Implemented LMS scope

- courses with roles `admin / teacher / assistant / student`
- student groups inside courses
- group-based channel visibility
- text channels with chat history, delete and realtime socket flow
- assignment channels
- assignments with description, status and deadline
- local file storage for assignment materials and student submissions
- draft upload + final submit
- late submission marking
- grading and teacher comments
- private assignment chat
- notifications
- audit log
- submission activity log
- video room module preserved from MVP

## Main routes

- `POST /api/session`
- `GET /api/courses`
- `PATCH /api/courses/:id`
- `PATCH /api/courses/:id/members/:userId/role`
- `POST /api/courses/:id/groups`
- `POST /api/courses/:id/channels`
- `POST /api/channels/:id/assignments`
- `GET /api/assignments/:id`
- `POST /api/assignments/:id/files`
- `POST /api/assignments/:id/submissions/upload`
- `POST /api/assignments/:id/submissions/submit`
- `PATCH /api/submissions/:id/grade`
- `GET /api/assignments/:id/private-chat`
- `GET /api/notifications`
- `GET /api/audit-logs`

## Run

1. Start PostgreSQL:

```bat
docker compose up -d
```

2. Backend:

```bat
cd backend
copy .env.example .env
npm install
npx prisma generate
npm run start:dev
```

3. Frontend:

```bat
cd frontend
copy .env.example .env
npm install
npm run dev
```

4. Open `http://localhost:5173`

## Database note

The codebase is already updated to the LMS schema, but migration from the old MVP database was not completed automatically in this session.

If your local database still contains the old MVP schema, use one of these approaches:

1. Safe local reset for development:

```bat
cd backend
npx prisma migrate reset
```

2. Or recreate the local database and run:

```bat
cd backend
npx prisma migrate dev --name lms_upgrade
```

Use reset only if you are fine with wiping old local MVP data.
