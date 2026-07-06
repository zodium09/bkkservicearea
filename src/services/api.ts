import type { AnalyzeRequest, AnalyzeResponse } from '../types/gis';

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP error ${response.status}`);
  }
  return data;
}

export async function getEngineStatus() {
  return readJson<any>(await fetch('/api/engine/status'));
}

export async function analyzeServiceArea(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  return readJson<AnalyzeResponse>(await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }));
}

export async function getStaticJson<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path));
}
