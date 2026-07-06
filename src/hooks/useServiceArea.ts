import { useCallback, useState } from 'react';
import { analyzeServiceArea } from '../services/api';
import type { AnalyzeRequest, AnalyzeResponse } from '../types/gis';

export function useServiceArea() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await analyzeServiceArea(request);
      setResult(response);
      return response;
    } catch (err: any) {
      setError(err.message || 'การวิเคราะห์ล้มเหลว');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, analyze, setResult, setError };
}
