import type { AnalyzeRequest, AnalyzeResponse } from '../types/gis';

const LOCAL_API_ORIGIN = 'http://127.0.0.1:5174';

function apiUrl(path: string): string {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
  if (configuredBase) return `${configuredBase}${path}`;

  if (typeof window !== 'undefined' && ['5173', '4173'].includes(window.location.port)) {
    return `${LOCAL_API_ORIGIN}${path}`;
  }

  return path;
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`API returned ${contentType || 'non-JSON'} instead of JSON. ${preview}`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP error ${response.status}`);
  }
  return data;
}

export async function getEngineStatus() {
  return readJson<any>(await fetch(apiUrl('/api/engine/status')));
}

export async function analyzeServiceArea(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  return readJson<AnalyzeResponse>(await fetch(apiUrl('/api/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }));
}

export async function getStaticJson<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path));
}
