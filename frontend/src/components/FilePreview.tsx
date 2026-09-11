import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';
import { downloadFile, fetchFileBlob } from '../services/apiClient';

interface Props {
  fileId: string;
  fileName: string;
  mimeType: string;
  downloadPath: string;
  token: string;
  onClose: () => void;
  localFile?: File;
}

const DOCX_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const EXCEL_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
];

function isDocx(mimeType: string) {
  return DOCX_MIMES.includes(mimeType);
}

function isExcel(mimeType: string) {
  return EXCEL_MIMES.includes(mimeType);
}

export function FilePreview({ fileId, fileName, mimeType, downloadPath, token, onClose, localFile }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [docxRendered, setDocxRendered] = useState(false);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const minZoom = 0.25;
  const maxZoom = 3;
  const zoomStep = 0.25;

  const zoomIn = () => setZoom((z) => Math.min(z + zoomStep, maxZoom));
  const zoomOut = () => setZoom((z) => Math.max(z - zoomStep, minZoom));

  // Fetch file (from server or local)
  useEffect(() => {
    if (localFile) {
      let cancelled = false;
      const textLike = mimeType.startsWith('text/') || mimeType.includes('json');
      const wordLike = isDocx(mimeType);
      const excelLike = isExcel(mimeType);

      if (textLike) {
        localFile.text().then((text) => {
          if (!cancelled) { setTextContent(text); setLoading(false); }
        }).catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось прочитать файл'); setLoading(false); }
        });
      } else if (wordLike) {
        setDocxBlob(localFile);
        setLoading(false);
      } else if (excelLike) {
        localFile.arrayBuffer().then((buf) => {
          if (!cancelled) {
            const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
            setExcelHtml(XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]));
            setLoading(false);
          }
        }).catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось прочитать файл'); setLoading(false); }
        });
      } else {
        setBlobUrl(URL.createObjectURL(localFile));
        setLoading(false);
      }

      return () => { cancelled = true; };
    }

    let cancelled = false;
    const url = new URL(downloadPath, window.location.origin);
    url.searchParams.set('disposition', 'inline');
    const fetchPath = url.pathname + url.search;

    const textLike = mimeType.startsWith('text/') || mimeType.includes('json');
    const wordLike = isDocx(mimeType);
    const excelLike = isExcel(mimeType);

    if (textLike) {
      fetchFileBlob(fetchPath, token)
        .then(({ blob }) => blob.text())
        .then((text) => {
          if (!cancelled) { setTextContent(text); setLoading(false); }
        })
        .catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось загрузить файл'); setLoading(false); }
        });
    } else if (wordLike) {
      fetchFileBlob(fetchPath, token)
        .then(({ blob }) => {
          if (!cancelled) { setDocxBlob(blob); setLoading(false); }
        })
        .catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось загрузить файл'); setLoading(false); }
        });
    } else if (excelLike) {
      fetchFileBlob(fetchPath, token)
        .then(({ blob }) => blob.arrayBuffer())
        .then((buf) => {
          if (!cancelled) {
            const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
            setExcelHtml(XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]));
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось загрузить файл'); setLoading(false); }
        });
    } else {
      fetchFileBlob(fetchPath, token)
        .then(({ blob }) => {
          if (!cancelled) { setBlobUrl(URL.createObjectURL(blob)); setLoading(false); }
        })
        .catch((err) => {
          if (!cancelled) { setError(err instanceof Error ? err.message : 'Не удалось загрузить файл'); setLoading(false); }
        });
    }

    return () => { cancelled = true; };
  }, [fileId, downloadPath, token, mimeType, localFile]);

  // Render docx after blob loaded and container mounted
  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current) return;

    let cancelled = false;

    renderAsync(docxBlob, docxContainerRef.current, undefined, {
      inWrapper: true,
      ignoreWidth: true,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    })
      .then(() => {
        if (!cancelled) {
          setDocxRendered(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось отобразить файл');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [docxBlob]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDownload = () => {
    if (localFile) {
      const url = URL.createObjectURL(localFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }
    void downloadFile(downloadPath, token, fileName);
  };

  const renderContent = () => {
    if (loading) {
      return <div className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>;
    }

    if (error) {
      return <div className="muted" style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>{error}</div>;
    }

    if (textContent !== null) {
      return <pre className="preview-pre" style={{ fontSize: `${14 * zoom}px` }}>{textContent}</pre>;
    }

    if (isDocx(mimeType)) {
      return (
        <div className="preview-docx-wrapper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}>
          <div ref={docxContainerRef} />
          {!docxRendered && (
            <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Отрисовка документа...</div>
          )}
        </div>
      );
    }

    if (excelHtml !== null) {
      return (
        <div
          className="preview-excel-wrapper"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}
          dangerouslySetInnerHTML={{ __html: excelHtml }}
        />
      );
    }

    if (!blobUrl) return null;

    if (mimeType.startsWith('image/')) {
      return <img src={blobUrl} alt={fileName} className="preview-image" style={{ transform: `scale(${zoom})` }} />;
    }

    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={blobUrl}
          className="preview-iframe"
          title={fileName}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%`, height: `${70 * zoom}vh` }}
        />
      );
    }

    if (mimeType.startsWith('audio/')) {
      return (
        <audio ref={audioRef} controls className="preview-audio" autoPlay={false}>
          <source src={blobUrl} type={mimeType} />
        </audio>
      );
    }

    if (mimeType.startsWith('video/')) {
      return (
        <video ref={videoRef} controls className="preview-video" autoPlay={false}>
          <source src={blobUrl} type={mimeType} />
        </video>
      );
    }

    return (
      <div className="preview-unsupported">
        <i className="bi bi-file-earmark" style={{ fontSize: 48, opacity: 0.3 }} />
        <p>Предпросмотр недоступен для этого типа файлов</p>
        <button className="secondary" onClick={handleDownload}>Скачать</button>
      </div>
    );
  };

  const showZoom = !loading && !error && (
    textContent !== null ||
    isDocx(mimeType) ||
    excelHtml !== null ||
    (blobUrl && (mimeType.startsWith('image/') || mimeType === 'application/pdf'))
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <strong style={{ wordBreak: 'break-word', flex: 1, minWidth: 0 }}>{fileName}</strong>
          <div className="row" style={{ gap: 8, flexShrink: 0, alignItems: 'center' }}>
            {showZoom && (
              <>
                <button className="secondary" onClick={zoomOut} title="Уменьшить" style={{ padding: '4px 10px', fontSize: 14 }}>
                  <i className="bi bi-zoom-out" />
                </button>
                <span className="muted" style={{ fontSize: 13, minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button className="secondary" onClick={zoomIn} title="Увеличить" style={{ padding: '4px 10px', fontSize: 14 }}>
                  <i className="bi bi-zoom-in" />
                </button>
              </>
            )}
            <button className="secondary" onClick={handleDownload}>Скачать</button>
            <button className="icon-ghost-button" onClick={onClose} title="Закрыть">
              <i className="bi bi-x-lg" />
            </button>
          </div>
        </div>
        <div className="preview-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
