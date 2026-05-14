import asyncio
import copy
import json
import math
import textwrap
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright


BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "doc_assets"
DIAGRAMS_DIR = ASSETS_DIR / "diagrams"
SCREENSHOTS_DIR = ASSETS_DIR / "screenshots"
EDGE_PATH = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
FRONTEND_URL = "http://127.0.0.1:4173"
TOKEN = "demo-token"


def ensure_dirs() -> None:
    DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\timesbd.ttf" if bold else r"C:\Windows\Fonts\times.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


FONT_TITLE = load_font(30, bold=True)
FONT_SUBTITLE = load_font(22, bold=True)
FONT_TEXT = load_font(18, bold=False)
FONT_SMALL = load_font(15, bold=False)


TEACHER = {
    "id": "teacher1",
    "login": "teacher",
    "email": "teacher@diplom.local",
    "nickname": "ivanov",
    "fullName": "Иванов Илья Сергеевич",
    "birthDate": "1990-02-10T00:00:00.000Z",
    "avatarUrl": None,
}

STUDENT_1 = {
    "id": "student1",
    "nickname": "petrova",
    "fullName": "Петрова Алина Дмитриевна",
    "avatarUrl": None,
}

STUDENT_2 = {
    "id": "student2",
    "nickname": "smirnov",
    "fullName": "Смирнов Кирилл Андреевич",
    "avatarUrl": None,
}

ASSISTANT = {
    "id": "assistant1",
    "nickname": "nikitin",
    "fullName": "Никитин Павел Олегович",
    "avatarUrl": None,
}

GROUP_A = {
    "id": "group-a",
    "name": "Бригада А",
    "members": [
        {"userId": STUDENT_1["id"], "user": STUDENT_1},
        {"userId": STUDENT_2["id"], "user": STUDENT_2},
    ],
}

GROUP_B = {
    "id": "group-b",
    "name": "Бригада Б",
    "members": [],
}

COURSE = {
    "id": "course1",
    "title": "Проектирование веб-систем",
    "description": "Курс для управления материалами, чатами, заданиями и проверкой работ.",
    "inviteCode": "DIPL2026",
    "currentUserRole": "admin",
    "members": [
        {"id": "m1", "role": "admin", "user": TEACHER},
        {"id": "m2", "role": "assistant", "user": ASSISTANT},
        {"id": "m3", "role": "student", "user": STUDENT_1},
        {"id": "m4", "role": "student", "user": STUDENT_2},
    ],
    "groups": [GROUP_A, GROUP_B],
    "videoRoom": {
        "id": "room1",
        "title": "Видеокомната курса",
        "maxParticipants": 6,
    },
}

COURSES_LIST = [
    {
        "id": "course1",
        "title": "Проектирование веб-систем",
        "description": "Курс для управления материалами, чатами, заданиями и проверкой работ.",
        "inviteCode": "DIPL2026",
        "role": "admin",
        "channelsCount": 4,
        "groupsCount": 2,
        "joinedAt": "2026-03-20T08:00:00.000Z",
        "hasUnread": True,
    },
    {
        "id": "course2",
        "title": "Технологии командной разработки",
        "description": "Практика по ролям, репозиториям и ревью.",
        "inviteCode": "TEAM2026",
        "role": "teacher",
        "channelsCount": 3,
        "groupsCount": 1,
        "joinedAt": "2026-03-18T10:30:00.000Z",
        "hasUnread": False,
    },
]

CHANNELS = [
    {
        "id": "ch1",
        "name": "Объявления",
        "type": "text",
        "groupAccess": [],
        "hasUnreadMessages": True,
        "assignment": None,
    },
    {
        "id": "ch2",
        "name": "Обсуждение проекта",
        "type": "text",
        "groupAccess": [{"groupId": "group-a"}],
        "hasUnreadMessages": False,
        "assignment": None,
    },
    {
        "id": "ch3",
        "name": "Лабораторная работа 1",
        "type": "assignment",
        "groupAccess": [],
        "hasUnreadMessages": False,
        "assignment": {
            "id": "assign1",
            "title": "Лабораторная работа 1",
            "hasUnread": True,
        },
    },
    {
        "id": "ch4",
        "name": "Проектный модуль",
        "type": "assignment",
        "groupAccess": [{"groupId": "group-a"}],
        "hasUnreadMessages": False,
        "assignment": {
            "id": "assign2",
            "title": "Проектный модуль",
            "hasUnread": False,
        },
    },
]

MESSAGES = {
    "items": [
        {
            "id": "msg1",
            "channelId": "ch1",
            "authorUserId": TEACHER["id"],
            "content": "Коллеги, до конца недели нужно загрузить черновики и отметить вопросы в канале.",
            "createdAt": "2026-04-05T09:00:00.000Z",
            "editedAt": None,
            "deletedAt": None,
            "author": TEACHER,
            "attachments": [],
            "reactions": [
                {
                    "id": "r1",
                    "messageId": "msg1",
                    "userId": STUDENT_1["id"],
                    "emoji": "👍",
                    "createdAt": "2026-04-05T09:01:00.000Z",
                    "user": STUDENT_1,
                },
                {
                    "id": "r2",
                    "messageId": "msg1",
                    "userId": STUDENT_2["id"],
                    "emoji": "👍",
                    "createdAt": "2026-04-05T09:02:00.000Z",
                    "user": STUDENT_2,
                },
            ],
        },
        {
            "id": "msg2",
            "channelId": "ch1",
            "authorUserId": STUDENT_1["id"],
            "content": "@ivanov черновик почти готов, хочу уточнить критерии оформления пояснительной записки.",
            "createdAt": "2026-04-05T09:15:00.000Z",
            "editedAt": None,
            "deletedAt": None,
            "author": STUDENT_1,
            "attachments": [],
            "reactions": [],
        },
        {
            "id": "msg3",
            "channelId": "ch1",
            "authorUserId": ASSISTANT["id"],
            "content": "Критерии добавлены в описание задания, а примеры файлов лежат в материалах канала.",
            "createdAt": "2026-04-05T09:18:00.000Z",
            "editedAt": "2026-04-05T09:20:00.000Z",
            "deletedAt": None,
            "author": ASSISTANT,
            "attachments": [
                {
                    "id": "file-msg-1",
                    "messageId": "msg3",
                    "originalName": "criteria.pdf",
                    "storedName": "criteria.pdf",
                    "mimeType": "application/pdf",
                    "sizeBytes": 102400,
                    "path": "/uploads/message-files/criteria.pdf",
                    "createdAt": "2026-04-05T09:18:10.000Z",
                }
            ],
            "reactions": [],
        },
    ],
    "nextCursor": None,
}

ASSIGNMENT = {
    "id": "assign1",
    "channelId": "ch3",
    "title": "Лабораторная работа 1",
    "description": "Разработать модуль курсов и assignment-каналы, подготовить отчет и приложить скриншоты интерфейса.",
    "status": "active",
    "deadlineAt": "2026-04-12T18:00:00.000Z",
    "createdByUserId": TEACHER["id"],
    "createdAt": "2026-04-01T10:00:00.000Z",
    "updatedAt": "2026-04-05T11:00:00.000Z",
    "files": [
        {
            "id": "assign-file-1",
            "assignmentId": "assign1",
            "originalName": "task_specification.pdf",
            "storedName": "task_specification.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 250000,
            "path": "/uploads/assignment-files/task_specification.pdf",
            "createdAt": "2026-04-01T10:10:00.000Z",
        },
        {
            "id": "assign-file-2",
            "assignmentId": "assign1",
            "originalName": "report_template.docx",
            "storedName": "report_template.docx",
            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "sizeBytes": 180000,
            "path": "/uploads/assignment-files/report_template.docx",
            "createdAt": "2026-04-01T10:12:00.000Z",
        },
    ],
    "mySubmission": {
        "id": "sub1",
        "status": "reviewed",
        "grade": "зачтено",
        "teacherComment": "Структура работы удачная, но диаграмму вариантов использования лучше укрупнить.",
        "currentFile": {
            "id": "sub-file-2",
            "originalName": "laba1_final.docx",
        },
    },
    "submissionsCount": 2,
    "hasUnread": True,
}

MY_SUBMISSION = {
    "id": "sub1",
    "assignmentId": "assign1",
    "studentUserId": STUDENT_1["id"],
    "status": "reviewed",
    "grade": "зачтено",
    "teacherComment": "Структура работы удачная, но диаграмму вариантов использования лучше укрупнить.",
    "currentFile": {
        "id": "sub-file-2",
        "originalName": "laba1_final.docx",
    },
}

SUBMISSIONS_PAGE = {
    "items": [
        {
            "id": "sub1",
            "assignmentId": "assign1",
            "student": STUDENT_1,
            "studentUserId": STUDENT_1["id"],
            "status": "reviewed",
            "submittedAt": "2026-04-04T15:10:00.000Z",
            "updatedAt": "2026-04-05T12:00:00.000Z",
            "teacherComment": "Структура работы удачная, но диаграмму вариантов использования лучше укрупнить.",
            "grade": "зачтено",
            "currentFile": {
                "id": "sub-file-2",
                "originalName": "laba1_final.docx",
            },
        },
        {
            "id": "sub2",
            "assignmentId": "assign1",
            "student": STUDENT_2,
            "studentUserId": STUDENT_2["id"],
            "status": "submitted",
            "submittedAt": "2026-04-05T13:40:00.000Z",
            "updatedAt": "2026-04-05T13:40:00.000Z",
            "teacherComment": None,
            "grade": None,
            "currentFile": {
                "id": "sub-file-3",
                "originalName": "smirnov_report.docx",
            },
        },
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
}

SELECTED_SUBMISSION = {
    "id": "sub1",
    "assignmentId": "assign1",
    "studentUserId": STUDENT_1["id"],
    "status": "reviewed",
    "grade": "зачтено",
    "teacherComment": "Структура работы удачная, но диаграмму вариантов использования лучше укрупнить.",
    "files": [
        {
            "id": "sub-file-1",
            "originalName": "laba1_draft.docx",
            "uploadedAt": "2026-04-03T17:20:00.000Z",
            "comments": [
                {
                    "id": "comment1",
                    "content": "Хороший старт, но не хватает блока с ограничениями системы.",
                    "author": TEACHER,
                }
            ],
        },
        {
            "id": "sub-file-2",
            "originalName": "laba1_final.docx",
            "uploadedAt": "2026-04-04T15:10:00.000Z",
            "comments": [
                {
                    "id": "comment2",
                    "content": "Финальная версия аккуратнее, проверь подписи рисунков в приложении.",
                    "author": ASSISTANT,
                }
            ],
        },
    ],
}

SUBMISSION_ACTIVITY = {
    "items": [
        {
            "id": "act1",
            "actionType": "file_uploaded",
            "occurredAt": "2026-04-03T17:20:00.000Z",
            "metadataJson": {"originalName": "laba1_draft.docx"},
            "actor": STUDENT_1,
        },
        {
            "id": "act2",
            "actionType": "submission_submitted",
            "occurredAt": "2026-04-04T15:10:00.000Z",
            "metadataJson": {"previousStatus": "draft", "nextStatus": "submitted"},
            "actor": STUDENT_1,
        },
        {
            "id": "act3",
            "actionType": "gradebook_updated",
            "occurredAt": "2026-04-05T12:00:00.000Z",
            "metadataJson": {
                "previousStatus": "submitted",
                "nextStatus": "reviewed",
                "grade": "зачтено",
                "teacherComment": "Структура работы удачная, но диаграмму вариантов использования лучше укрупнить.",
            },
            "actor": TEACHER,
        },
    ],
    "total": 3,
    "page": 1,
    "pageSize": 10,
}

ASSIGNMENT_AUDIT = {
    "items": [
        {
            "id": "audit1",
            "actionType": "assignment.created",
            "createdAt": "2026-04-01T10:00:00.000Z",
            "metadataJson": {"title": "Лабораторная работа 1"},
            "actor": TEACHER,
        },
        {
            "id": "audit2",
            "actionType": "assignment.file_uploaded",
            "createdAt": "2026-04-01T10:12:00.000Z",
            "metadataJson": {"originalName": "report_template.docx"},
            "actor": TEACHER,
        },
        {
            "id": "audit3",
            "actionType": "assignment.updated",
            "createdAt": "2026-04-05T11:00:00.000Z",
            "metadataJson": {"description": "Описание обновлено", "status": "active"},
            "actor": ASSISTANT,
        },
    ],
    "total": 3,
    "page": 1,
    "pageSize": 10,
}

PRIVATE_CHAT = {
    "id": "chat1",
    "assignmentId": "assign1",
    "studentUserId": STUDENT_1["id"],
    "createdAt": "2026-04-01T10:00:00.000Z",
}

PRIVATE_MESSAGES = [
    {
        "id": "pm1",
        "chatId": "chat1",
        "authorUserId": TEACHER["id"],
        "content": "Посмотрите, пожалуйста, раздел с ролями пользователей и допишите ограничения.",
        "createdAt": "2026-04-04T18:00:00.000Z",
        "editedAt": None,
        "author": TEACHER,
    },
    {
        "id": "pm2",
        "chatId": "chat1",
        "authorUserId": STUDENT_1["id"],
        "content": "Исправила, а еще добавила схему экранов и пояснение по очереди проверки.",
        "createdAt": "2026-04-04T18:12:00.000Z",
        "editedAt": "2026-04-04T18:14:00.000Z",
        "author": STUDENT_1,
    },
]

GRADEBOOK = {
    "courseId": "course1",
    "groups": [
        {"id": "group-a", "name": "Бригада А"},
        {"id": "group-b", "name": "Бригада Б"},
    ],
    "assignments": [
        {
            "id": "assign1",
            "title": "Лабораторная работа 1",
            "deadlineAt": "2026-04-12T18:00:00.000Z",
            "status": "active",
            "channelId": "ch3",
        },
        {
            "id": "assign2",
            "title": "Проектный модуль",
            "deadlineAt": "2026-04-18T18:00:00.000Z",
            "status": "active",
            "channelId": "ch4",
        },
    ],
    "rows": [
        {
            "student": {
                **STUDENT_1,
                "groups": [{"id": "group-a", "name": "Бригада А"}],
            },
            "grades": [
                {
                    "assignmentId": "assign1",
                    "submissionId": "sub1",
                    "grade": "зачтено",
                    "status": "reviewed",
                    "teacherComment": "Работа принята, доработать подписи рисунков.",
                    "updatedAt": "2026-04-05T12:00:00.000Z",
                },
                {
                    "assignmentId": "assign2",
                    "submissionId": None,
                    "grade": "",
                    "status": "not_submitted",
                    "teacherComment": "",
                    "updatedAt": None,
                },
            ],
        },
        {
            "student": {
                **STUDENT_2,
                "groups": [{"id": "group-a", "name": "Бригада А"}],
            },
            "grades": [
                {
                    "assignmentId": "assign1",
                    "submissionId": "sub2",
                    "grade": "",
                    "status": "submitted",
                    "teacherComment": "",
                    "updatedAt": "2026-04-05T13:40:00.000Z",
                },
                {
                    "assignmentId": "assign2",
                    "submissionId": None,
                    "grade": "",
                    "status": "not_submitted",
                    "teacherComment": "",
                    "updatedAt": None,
                },
            ],
        },
    ],
}

NOTIFICATIONS = [
    {
        "id": "note1",
        "type": "submission_graded",
        "title": "Оценка обновлена",
        "body": "По заданию \"Лабораторная работа 1\" обновлена оценка и добавлен комментарий преподавателя.",
        "isRead": False,
        "createdAt": "2026-04-05T12:01:00.000Z",
    },
    {
        "id": "note2",
        "type": "assignment_message",
        "title": "Новое сообщение в канале #Объявления",
        "body": "ivanov: До конца недели нужно загрузить черновики и отметить вопросы в канале.",
        "isRead": False,
        "createdAt": "2026-04-05T09:00:00.000Z",
    },
    {
        "id": "note3",
        "type": "assignment_created",
        "title": "Новое задание",
        "body": "Создано задание \"Проектный модуль\".",
        "isRead": True,
        "createdAt": "2026-04-04T11:30:00.000Z",
    },
]

REVIEW_QUEUE = [
    {
        "id": "sub2",
        "assignmentId": "assign1",
        "status": "submitted",
        "needsAttentionSince": "2026-04-05T13:40:00.000Z",
        "student": STUDENT_2,
        "assignment": {
            "id": "assign1",
            "title": "Лабораторная работа 1",
            "channel": {"course": {"id": "course1", "title": COURSE["title"]}},
        },
    }
]

FILES_LIBRARY = [
    {
        "id": "assign-file-1",
        "type": "assignment_material",
        "name": "task_specification.pdf",
        "createdAt": "2026-04-01T10:10:00.000Z",
        "course": {"id": "course1", "title": COURSE["title"]},
        "assignment": {"id": "assign1", "title": ASSIGNMENT["title"]},
    },
    {
        "id": "sub-file-2",
        "type": "submission_file",
        "name": "laba1_final.docx",
        "createdAt": "2026-04-04T15:10:00.000Z",
        "course": {"id": "course1", "title": COURSE["title"]},
        "assignment": {"id": "assign1", "title": ASSIGNMENT["title"]},
        "owner": STUDENT_1,
    },
]


def create_canvas(width: int, height: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    return image, draw


def draw_wrapped_text(draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], font, fill: str) -> None:
    x1, y1, x2, y2 = box
    width = max(20, x2 - x1 - 20)
    avg_char_width = max(8, font.size * 0.6 if hasattr(font, "size") else 10)
    line_length = max(12, int(width / avg_char_width))
    lines = textwrap.wrap(text, width=line_length)
    y = y1 + 10
    for line in lines:
        draw.text((x1 + 10, y), line, font=font, fill=fill)
        y += int(font.size * 1.4 if hasattr(font, "size") else 22)
        if y > y2 - 10:
            break


def rounded_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    body: str,
    fill: str,
    outline: str = "#2f3b52",
) -> None:
    draw.rounded_rectangle(box, radius=22, fill=fill, outline=outline, width=3)
    x1, y1, x2, y2 = box
    draw.text((x1 + 16, y1 + 14), title, font=FONT_SUBTITLE, fill="#14213d")
    draw_wrapped_text(draw, body, (x1 + 6, y1 + 46, x2 - 6, y2 - 10), FONT_TEXT, "#1c1c1c")


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], fill: str = "#1d3557") -> None:
    draw.line([start, end], fill=fill, width=4)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    head = 12
    left = (
        end[0] - head * math.cos(angle - math.pi / 6),
        end[1] - head * math.sin(angle - math.pi / 6),
    )
    right = (
        end[0] - head * math.cos(angle + math.pi / 6),
        end[1] - head * math.sin(angle + math.pi / 6),
    )
    draw.polygon([end, left, right], fill=fill)


def generate_architecture_diagram() -> None:
    image, draw = create_canvas(1600, 950)
    draw.text((60, 40), "Архитектура системы DIPLOM LMS", font=FONT_TITLE, fill="#0b2545")
    draw.text(
        (60, 90),
        "Клиентская часть взаимодействует с сервером по REST API, WebSocket и WebRTC. "
        "Файлы и данные курса хранятся локально.",
        font=FONT_TEXT,
        fill="#33415c",
    )

    rounded_box(draw, (80, 180, 470, 390), "Frontend (React + Vite)",
                "Маршруты страниц, контекст авторизации, экраны курсов, заданий, ведомости, очереди проверки и уведомлений.",
                "#d8f3dc")
    rounded_box(draw, (560, 120, 1020, 320), "Backend (NestJS)",
                "Модули auth, courses, channels, assignments, messages, notifications, audit, video, storage и realtime.",
                "#fde2e4")
    rounded_box(draw, (560, 390, 1020, 580), "Realtime Gateway",
                "События чатов, личных сообщений, уведомлений и видеокомнат через Socket.IO.", "#cde7ff")
    rounded_box(draw, (1110, 120, 1510, 320), "PostgreSQL + Prisma",
                "Хранение курсов, ролей, групп, каналов, заданий, сдач, уведомлений и аудита.", "#fff1c1")
    rounded_box(draw, (1110, 390, 1510, 580), "Локальное хранилище",
                "Материалы заданий, файлы сообщений, студенческие работы и аватары пользователей.", "#f1e3ff")
    rounded_box(draw, (560, 660, 1020, 840), "WebRTC-видеокомната",
                "Участники курса подключаются к комнате, а медиапотоки передаются напрямую между клиентами.", "#e9f5db")

    arrow(draw, (470, 250), (560, 220))
    draw.text((470, 215), "REST API", font=FONT_SMALL, fill="#1d3557")
    arrow(draw, (470, 320), (560, 470))
    draw.text((470, 395), "WebSocket", font=FONT_SMALL, fill="#1d3557")
    arrow(draw, (1020, 220), (1110, 220))
    arrow(draw, (1020, 480), (1110, 480))
    arrow(draw, (750, 580), (790, 660))
    draw.text((820, 610), "события комнаты", font=FONT_SMALL, fill="#1d3557")

    image.save(DIAGRAMS_DIR / "architecture.png")


def generate_use_case_diagram() -> None:
    image, draw = create_canvas(1600, 980)
    draw.text((60, 40), "Диаграмма вариантов использования", font=FONT_TITLE, fill="#0b2545")
    draw.rounded_rectangle((320, 140, 1320, 900), radius=30, outline="#335c67", width=4)
    draw.text((650, 155), "Система DIPLOM LMS", font=FONT_SUBTITLE, fill="#335c67")

    actors = [
        ((90, 260), "Администратор"),
        ((90, 520), "Преподаватель"),
        ((90, 760), "Студент"),
    ]
    for (x, y), label in actors:
        draw.ellipse((x + 30, y, x + 90, y + 60), outline="#1d3557", width=4)
        draw.line((x + 60, y + 60, x + 60, y + 150), fill="#1d3557", width=4)
        draw.line((x + 15, y + 90, x + 105, y + 90), fill="#1d3557", width=4)
        draw.line((x + 60, y + 150, x + 20, y + 215), fill="#1d3557", width=4)
        draw.line((x + 60, y + 150, x + 100, y + 215), fill="#1d3557", width=4)
        draw.text((x - 5, y + 225), label, font=FONT_TEXT, fill="#1d3557")

    use_cases = [
        ((460, 240, 850, 310), "Управлять курсами и ролями"),
        ((460, 360, 850, 430), "Создавать группы и каналы"),
        ((460, 480, 850, 550), "Публиковать задания и материалы"),
        ((460, 600, 850, 670), "Проверять работы и выставлять оценки"),
        ((860, 270, 1240, 340), "Отправлять сообщения и вложения"),
        ((860, 420, 1240, 490), "Сдавать работу и отслеживать статус"),
        ((860, 570, 1240, 640), "Получать уведомления и комментарии"),
        ((860, 720, 1240, 790), "Подключаться к видеокомнате"),
    ]
    for box, label in use_cases:
        draw.ellipse(box, fill="#edf6f9", outline="#457b9d", width=3)
        draw_wrapped_text(draw, label, box, FONT_TEXT, "#1d3557")

    for start, end in [
        ((190, 350), (460, 275)),
        ((190, 350), (460, 395)),
        ((190, 350), (460, 515)),
        ((190, 610), (460, 395)),
        ((190, 610), (460, 515)),
        ((190, 610), (460, 635)),
        ((190, 850), (860, 455)),
        ((190, 850), (860, 605)),
        ((190, 850), (860, 755)),
        ((190, 610), (860, 305)),
    ]:
        arrow(draw, start, end, fill="#457b9d")

    image.save(DIAGRAMS_DIR / "use_cases.png")


def generate_data_model_diagram() -> None:
    image, draw = create_canvas(1650, 1050)
    draw.text((60, 40), "Концептуальная модель данных", font=FONT_TITLE, fill="#0b2545")

    boxes = {
        "user": (80, 170, 380, 320),
        "course": (470, 120, 810, 270),
        "group": (470, 340, 810, 490),
        "channel": (900, 120, 1240, 270),
        "assignment": (900, 340, 1240, 490),
        "submission": (1330, 340, 1600, 490),
        "notification": (900, 580, 1240, 730),
        "audit": (1330, 580, 1600, 730),
    }

    rounded_box(draw, boxes["user"], "User", "Учетная запись, профиль, роль в курсе, состояние присутствия.", "#d8f3dc")
    rounded_box(draw, boxes["course"], "Course", "Курс, описание, код приглашения, видеокомната.", "#fff1c1")
    rounded_box(draw, boxes["group"], "CourseGroup", "Подгруппа внутри курса и ее участники.", "#fefae0")
    rounded_box(draw, boxes["channel"], "Channel", "Текстовый канал или assignment-канал с ограничением доступа.", "#fde2e4")
    rounded_box(draw, boxes["assignment"], "Assignment", "Описание задания, статус, дедлайн, материалы.", "#cde7ff")
    rounded_box(draw, boxes["submission"], "Submission", "Сдача студента, версии файлов, оценка, комментарий.", "#f1e3ff")
    rounded_box(draw, boxes["notification"], "Notification", "Персональные уведомления о новых событиях.", "#e9f5db")
    rounded_box(draw, boxes["audit"], "AuditLog", "История действий пользователей и системы.", "#e5e5e5")

    arrow(draw, (380, 245), (470, 195))
    arrow(draw, (645, 270), (645, 340))
    arrow(draw, (810, 195), (900, 195))
    arrow(draw, (1070, 270), (1070, 340))
    arrow(draw, (1240, 415), (1330, 415))
    arrow(draw, (1070, 490), (1070, 580))
    arrow(draw, (1465, 490), (1465, 580))
    arrow(draw, (290, 320), (540, 490))
    arrow(draw, (290, 320), (980, 730))
    arrow(draw, (290, 320), (1370, 730))

    for coords, label in [
        ((410, 200), "участник курса"),
        ((660, 295), "1:N"),
        ((845, 180), "1:N"),
        ((1085, 300), "1:1"),
        ((1275, 390), "1:N"),
        ((1085, 535), "генерирует"),
        ((1480, 535), "логирует"),
    ]:
        draw.text(coords, label, font=FONT_SMALL, fill="#1d3557")

    image.save(DIAGRAMS_DIR / "data_model.png")


def generate_diagrams() -> None:
    generate_architecture_diagram()
    generate_use_case_diagram()
    generate_data_model_diagram()


def json_response(data) -> dict:
    return {
        "status": 200,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(data, ensure_ascii=False),
    }


async def handle_api(route) -> None:
    request = route.request
    parsed = urlparse(request.url)
    path = parsed.path
    method = request.method.upper()
    _query = parse_qs(parsed.query)

    if not path.startswith("/api/"):
        await route.continue_()
        return

    if path == "/api/me":
        await route.fulfill(**json_response(TEACHER))
        return
    if path == "/api/courses":
        await route.fulfill(**json_response(COURSES_LIST))
        return
    if path == "/api/notifications":
        await route.fulfill(**json_response(NOTIFICATIONS))
        return
    if path == "/api/review-queue":
        await route.fulfill(**json_response(REVIEW_QUEUE))
        return
    if path == "/api/files-library":
        await route.fulfill(**json_response(FILES_LIBRARY))
        return
    if path == "/api/audit-logs":
        await route.fulfill(**json_response(ASSIGNMENT_AUDIT["items"]))
        return
    if path == "/api/courses/course1":
        await route.fulfill(**json_response(COURSE))
        return
    if path == "/api/courses/course1/groups":
        await route.fulfill(**json_response([GROUP_A, GROUP_B]))
        return
    if path == "/api/courses/course1/channels":
        await route.fulfill(**json_response(CHANNELS))
        return
    if path == "/api/courses/course1/gradebook":
        await route.fulfill(**json_response(GRADEBOOK))
        return
    if path == "/api/courses/course1/video-room":
        await route.fulfill(**json_response(COURSE["videoRoom"]))
        return
    if path == "/api/video-rooms/room1/participants":
        await route.fulfill(**json_response([]))
        return
    if path == "/api/channels/ch1/messages":
        await route.fulfill(**json_response(MESSAGES))
        return
    if path == "/api/channels/ch1/read" and method == "PATCH":
        await route.fulfill(**json_response({"ok": True}))
        return
    if path == "/api/assignments/assign1":
        await route.fulfill(**json_response(ASSIGNMENT))
        return
    if path == "/api/assignments/assign1/students":
        await route.fulfill(**json_response([STUDENT_1, STUDENT_2]))
        return
    if path == "/api/assignments/assign1/read" and method == "PATCH":
        await route.fulfill(**json_response({"ok": True}))
        return
    if path == "/api/assignments/assign1/my-submission":
        await route.fulfill(**json_response(MY_SUBMISSION))
        return
    if path == "/api/assignments/assign1/submissions":
        await route.fulfill(**json_response(SUBMISSIONS_PAGE))
        return
    if path == "/api/assignments/assign1/audit-logs":
        await route.fulfill(**json_response(ASSIGNMENT_AUDIT))
        return
    if path == "/api/assignments/assign1/private-chat":
        await route.fulfill(**json_response(PRIVATE_CHAT))
        return
    if path == "/api/private-chats/chat1/messages":
        await route.fulfill(**json_response(PRIVATE_MESSAGES))
        return
    if path == "/api/submissions/sub1":
        await route.fulfill(**json_response(SELECTED_SUBMISSION))
        return
    if path == "/api/submissions/sub1/activity":
        await route.fulfill(**json_response(SUBMISSION_ACTIVITY))
        return
    if path.startswith("/api/") and method in {"PATCH", "POST", "DELETE"}:
        await route.fulfill(**json_response({"ok": True}))
        return

    await route.fulfill(**json_response({}))


def make_student_course():
    course = copy.deepcopy(COURSE)
    course["currentUserRole"] = "student"
    return course


def make_student_courses():
    items = copy.deepcopy(COURSES_LIST)
    if items:
        items[0]["role"] = "student"
    return items


def make_handle_api(mode: str = "admin"):
    async def _handler(route) -> None:
        request = route.request
        parsed = urlparse(request.url)
        path = parsed.path
        method = request.method.upper()
        _query = parse_qs(parsed.query)

        if not path.startswith("/api/"):
            await route.continue_()
            return

        current_user = TEACHER if mode == "admin" else {
            **STUDENT_1,
            "login": "petrova",
            "email": "petrova@diplom.local",
            "birthDate": "2004-04-16T00:00:00.000Z",
        }
        current_course = COURSE if mode == "admin" else make_student_course()
        current_courses = COURSES_LIST if mode == "admin" else make_student_courses()

        if path == "/api/me":
            await route.fulfill(**json_response(current_user))
            return
        if path == "/api/courses":
            await route.fulfill(**json_response(current_courses))
            return
        if path == "/api/notifications":
            await route.fulfill(**json_response(NOTIFICATIONS))
            return
        if path == "/api/review-queue":
            await route.fulfill(**json_response(REVIEW_QUEUE if mode == "admin" else []))
            return
        if path == "/api/files-library":
            await route.fulfill(**json_response(FILES_LIBRARY))
            return
        if path == "/api/audit-logs":
            await route.fulfill(**json_response(ASSIGNMENT_AUDIT["items"] if mode == "admin" else []))
            return
        if path == "/api/courses/course1":
            await route.fulfill(**json_response(current_course))
            return
        if path == "/api/courses/course1/groups":
            await route.fulfill(**json_response([GROUP_A, GROUP_B]))
            return
        if path == "/api/courses/course1/members":
            await route.fulfill(**json_response(current_course["members"]))
            return
        if path == "/api/courses/course1/channels":
            await route.fulfill(**json_response(CHANNELS))
            return
        if path == "/api/courses/course1/gradebook":
            await route.fulfill(**json_response(GRADEBOOK if mode == "admin" else {"courseId": "course1", "groups": [], "assignments": [], "rows": []}))
            return
        if path == "/api/courses/course1/video-room":
            await route.fulfill(**json_response(COURSE["videoRoom"]))
            return
        if path == "/api/video-rooms/room1/participants":
            await route.fulfill(**json_response([]))
            return
        if path == "/api/channels/ch1/messages":
            await route.fulfill(**json_response(MESSAGES))
            return
        if path == "/api/channels/ch1/read" and method == "PATCH":
            await route.fulfill(**json_response({"ok": True}))
            return
        if path == "/api/assignments/assign1":
            await route.fulfill(**json_response(ASSIGNMENT))
            return
        if path == "/api/assignments/assign1/students":
            await route.fulfill(**json_response([STUDENT_1, STUDENT_2]))
            return
        if path == "/api/assignments/assign1/read" and method == "PATCH":
            await route.fulfill(**json_response({"ok": True}))
            return
        if path == "/api/assignments/assign1/my-submission":
            await route.fulfill(**json_response(MY_SUBMISSION))
            return
        if path == "/api/assignments/assign1/submissions":
            await route.fulfill(**json_response(SUBMISSIONS_PAGE if mode == "admin" else {"items": [], "total": 0, "page": 1, "pageSize": 20}))
            return
        if path == "/api/assignments/assign1/audit-logs":
            await route.fulfill(**json_response(ASSIGNMENT_AUDIT if mode == "admin" else {"items": [], "total": 0, "page": 1, "pageSize": 10}))
            return
        if path == "/api/assignments/assign1/private-chat":
            await route.fulfill(**json_response(PRIVATE_CHAT))
            return
        if path == "/api/private-chats/chat1/messages":
            await route.fulfill(**json_response(PRIVATE_MESSAGES))
            return
        if path == "/api/submissions/sub1":
            await route.fulfill(**json_response(SELECTED_SUBMISSION))
            return
        if path == "/api/submissions/sub1/activity":
            await route.fulfill(**json_response(SUBMISSION_ACTIVITY if mode == "admin" else {"items": [], "total": 0, "page": 1, "pageSize": 10}))
            return
        if path.startswith("/api/") and method in {"PATCH", "POST", "DELETE"}:
            await route.fulfill(**json_response({"ok": True}))
            return

        await route.fulfill(**json_response({}))

    return _handler


async def take_screenshot(page, path: str, output_file: Path, selector: str = "body") -> None:
    await page.goto(f"{FRONTEND_URL}{path}", wait_until="networkidle")
    await page.wait_for_selector(selector)
    await page.wait_for_timeout(1200)
    await page.screenshot(path=str(output_file))


async def generate_screenshots() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=str(EDGE_PATH),
            headless=True,
            args=["--disable-web-security"],
        )

        login_context = await browser.new_context(viewport={"width": 1480, "height": 1400}, locale="ru-RU")
        login_page = await login_context.new_page()
        await take_screenshot(login_page, "/login", SCREENSHOTS_DIR / "00_authorization.png", ".page.page-narrow")
        await login_context.close()

        app_context = await browser.new_context(viewport={"width": 1480, "height": 1700}, locale="ru-RU")
        await app_context.add_init_script(
            f"window.localStorage.setItem('diplom_token', '{TOKEN}');"
        )
        await app_context.route("**/api/**", make_handle_api("admin"))

        page = await app_context.new_page()
        await take_screenshot(page, "/courses", SCREENSHOTS_DIR / "01_courses.png")
        await take_screenshot(page, "/profile", SCREENSHOTS_DIR / "02_profile.png", ".page.page-narrow")
        await take_screenshot(page, "/notifications", SCREENSHOTS_DIR / "03_notifications.png")
        await take_screenshot(page, "/courses/course1", SCREENSHOTS_DIR / "04_course_admin_chat.png")
        await take_screenshot(page, "/courses/course1/groups", SCREENSHOTS_DIR / "05_groups.png")
        await take_screenshot(page, "/courses/course1/assignments/assign1", SCREENSHOTS_DIR / "06_assignment_admin.png")
        await take_screenshot(page, "/courses/course1/gradebook", SCREENSHOTS_DIR / "07_gradebook.png")
        await take_screenshot(page, "/review-queue", SCREENSHOTS_DIR / "08_review_queue.png")
        await take_screenshot(page, "/audit", SCREENSHOTS_DIR / "09_audit_logs.png")
        await take_screenshot(page, "/files", SCREENSHOTS_DIR / "10_files_library.png")
        await take_screenshot(page, "/courses/course1/video", SCREENSHOTS_DIR / "11_video_room.png")

        await app_context.close()

        student_context = await browser.new_context(viewport={"width": 1480, "height": 1700}, locale="ru-RU")
        await student_context.add_init_script(
            f"window.localStorage.setItem('diplom_token', '{TOKEN}');"
        )
        await student_context.route("**/api/**", make_handle_api("student"))

        student_page = await student_context.new_page()
        await take_screenshot(student_page, "/courses/course1", SCREENSHOTS_DIR / "12_course_student.png")
        await take_screenshot(student_page, "/courses/course1/assignments/assign1", SCREENSHOTS_DIR / "13_assignment_student.png")

        await student_context.close()
        await browser.close()


def main() -> None:
    ensure_dirs()
    generate_diagrams()
    asyncio.run(generate_screenshots())
    print(f"Assets generated in {ASSETS_DIR}")


if __name__ == "__main__":
    main()
