import type { AnalyzeContoursResponse, AnalyzeRequest, AnalyzeResponse, TrafficStatus } from '../types/gis';

const LOCAL_API_ORIGIN = 'http://127.0.0.1:5174';

function configuredApiBase(): string | null {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
  return configuredBase || null;
}

function apiBases(): string[] {
  const configuredBase = configuredApiBase();
  if (configuredBase) return [configuredBase];
  if (typeof window === 'undefined') return [''];

  const isLocalFrontend = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isVitePort = ['5173', '4173'].includes(window.location.port);
  if (isLocalFrontend && isVitePort) {
    return [LOCAL_API_ORIGIN, ''];
  }

  if (window.location.hostname.endsWith('.vercel.app')) {
    return [''];
  }

  return [''];
}

function apiUrl(base: string, path: string): string {
  return `${base}${path}`;
}

async function readJson<T>(response: Response, url: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`API ${url} returned ${contentType || 'non-JSON'} instead of JSON. ${preview}`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP error ${response.status}`);
  }
  return data;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const errors: string[] = [];
  for (const base of apiBases()) {
    const url = apiUrl(base, path);
    try {
      const response = await fetch(url, init);
      return await readJson<T>(response, url);
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(errors[errors.length - 1] || 'API request failed');
}

export async function getEngineStatus() {
  return requestJson<any>('/api/engine/status');
}

export async function analyzeServiceArea(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  return requestJson<AnalyzeResponse>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function analyzeServiceAreaContours(request: AnalyzeRequest): Promise<AnalyzeContoursResponse> {
  try {
    return await requestJson<AnalyzeContoursResponse>('/api/analyze/contours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, contoursMinutes: [10, 15, 30] }),
    });
  } catch (contourError) {
    // Keep the core analysis usable while an older or resource-constrained API
    // deployment is being upgraded. The UI receives the selected contour only.
    try {
      const result = await analyzeServiceArea(request);
      return {
        type: 'ServiceAreaContours',
        generatedAt: new Date().toISOString(),
        contours: [{ minutes: result.metrics.travelMinutes, result }],
      };
    } catch {
      throw contourError;
    }
  }
}

export async function getTrafficStatus(): Promise<TrafficStatus> {
  return requestJson<TrafficStatus>('/api/traffic/status');
}

export async function getTrafficSegments(): Promise<any> {
  return requestJson<any>('/api/traffic/segments');
}

export async function getStaticJson<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path), path);
}
