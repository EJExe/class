import { Injectable, BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly root = join(process.cwd(), 'uploads');
  private readonly maxFileSize = 50 * 1024 * 1024;
  private readonly allowedExtensions = new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.txt',
    '.zip',
    '.rar',
    '.7z',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
  ]);
  private readonly allowedMimePrefixes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-',
    'application/zip',
    'application/x-rar',
    'application/x-7z-compressed',
    'text/plain',
    'image/',
  ];

  constructor() {
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async saveFile(scope: 'assignment-files' | 'submission-files', file: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException('File is too large');
    }

    const extension = extname(file.originalname || '').toLowerCase();
    const mimeType = file.mimetype || 'application/octet-stream';
    const allowedByExtension = this.allowedExtensions.has(extension);
    const allowedByMime = this.allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix));
    if (!allowedByExtension && !allowedByMime) {
      throw new BadRequestException('File type is not allowed');
    }

    const directory = join(this.root, scope);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    const safeExt = extension.slice(0, 16);
    const storedName = `${randomUUID()}${safeExt}`;
    const filePath = join(directory, storedName);

    await fs.writeFile(filePath, file.buffer);

    return {
      originalName: file.originalname,
      storedName,
      mimeType,
      sizeBytes: file.size,
      path: filePath,
    };
  }

  read(path: string) {
    return fs.readFile(path);
  }

  async remove(path: string) {
    try {
      await fs.unlink(path);
    } catch {
      // file may already be removed
    }
  }
}
