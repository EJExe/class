const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

function normalizePossibleMojibake(value: string) {
  if (!value || !/[ÐÑРС]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return /[А-Яа-яЁё]/.test(decoded) ? decoded : value;
  } catch {
    return value;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.message)) {
        message = parsed.message.join('; ') || text;
      } else {
        message = parsed.message || text;
      }
    } catch {}
    throw new Error(message || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export async function fetchFileBlob(path: string, token: string): Promise<{ blob: Blob; mimeType: string }> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  return { blob, mimeType };
}

export async function downloadFile(path: string, token: string, fileName: string) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const resolvedFileName = normalizePossibleMojibake(
    utf8Match
      ? decodeURIComponent(utf8Match[1])
      : asciiMatch
        ? asciiMatch[1]
        : fileName,
  );

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = resolvedFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
