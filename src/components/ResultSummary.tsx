import type { AnalyzeResponse } from '../types/gis';

interface ResultSummaryProps {
  result: AnalyzeResponse;
}

export function ResultSummary({ result }: ResultSummaryProps) {
  const stats = result.stats;
  if (!stats) return null;

  const limitLabel = stats.costType === 'time'
    ? `${Math.round(stats.limit / 60)} min`
    : `${stats.limit.toLocaleString()} m`;
  const isApproximate = result.analysisQuality === 'approximate';

  return (
    <div className={`result-summary ${isApproximate ? 'is-approximate' : ''}`}>
      <span>
        Service area within {limitLabel} · Mode: {stats.mode} · Engine: {result.engine}
      </span>
      {isApproximate && (
        <span className="analysis-warning">
          Approximate fallback: road network data was unavailable, so this result uses a straight-line service radius.
        </span>
      )}
    </div>
  );
}
