# DIPLOM MVP

MVP платформа курсов с каналами, real-time чатом и видеокомнатой.

## Структура

- `backend/` — NestJS + Prisma + PostgreSQL + WebSocket (`/ws`)
- `frontend/` — React + React Router + socket.io-client + WebRTC

## Быстрый старт

### Вариант 1: запуск в один клик (Windows)

Из корня проекта:

```bat
run.bat
```

Остановка:

```bat
stop.bat
```

### Вариант 2: ручной запуск

1. Поднять PostgreSQL:

```bash
docker compose up -d
```

2. Backend:

```bash
cd backend
copy .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

3. Frontend:

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

## Реализовано в MVP

- Вход по nickname (пароль опционален), выдача session token
- Курсы: создание, список, join по invite-коду
- Роли: `owner` / `member`, проверка прав на сервере
- Каналы: создание (owner), список
- Чат: REST history + pagination, WebSocket real-time, soft delete
- Видеокомната: join/leave, participants presence, WebRTC mesh сигналинг по WS

## Основные endpoint-ы API

- `POST /api/session`
- `DELETE /api/session`
- `GET /api/me`
- `POST /api/courses`
- `GET /api/courses`
- `GET /api/courses/:id`
- `POST /api/courses/join`
- `GET /api/courses/:id/members`
- `POST /api/courses/:id/channels`
- `GET /api/courses/:id/channels`
- `GET /api/channels/:id/messages`
- `POST /api/channels/:id/messages`
- `DELETE /api/messages/:id`
- `GET /api/courses/:id/video-room`
- `GET /api/video-rooms/:id/participants`

## WebSocket события (namespace `/ws`)

- `chat:join`
- `chat:leave`
- `chat:message`
- `chat:message:new`
- `room:join`
- `room:leave`
- `room:participants`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice`
- `room:error`

## Ограничения текущего MVP

- Без заданий, оценок, уведомлений
- Без refresh-токенов и сложной auth-модели
- Видеосвязь на mesh-топологии (рекомендуется до 6 участников)

## Кодировка

Все исходники сохранены в UTF-8. Если в терминале русские символы отображаются некорректно, используйте:

```bat
chcp 65001
```


