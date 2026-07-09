import type { AnalyzeResponse } from '../types/gis';

interface ResultSummaryProps {
  result: AnalyzeResponse;
}

export function ResultSummary({ result }: ResultSummaryProps) {
  const stats = result.stats;
  if (!stats) return null;

  const limitLabel = stats.costType === 'time'
    ? `${Math.round(stats.limit / 60)} นาที`
    : `${stats.limit.toLocaleString()} เมตร`;
  const isApproximate = result.analysisQuality === 'approximate';
  const engineLabel = result.engine === 'postgis-pgrouting'
    ? 'PostGIS + pgRouting'
    : result.engine === 'js-dijkstra-fallback'
      ? 'โครงข่ายถนน JS Dijkstra'
      : 'รัศมีประมาณการ';
  const modeLabel = stats.mode === 'walk' ? 'เดิน' : stats.mode === 'bike' ? 'จักรยาน' : 'รถยนต์';

  return (
    <div className={`result-summary ${isApproximate ? 'is-approximate' : ''}`}>
      <span>
        พื้นที่เข้าถึงภายใน {limitLabel} · โหมด: {modeLabel} · Engine: {engineLabel}
      </span>
      {isApproximate && (
        <span className="analysis-warning">
          ใช้ผลประมาณการแบบรัศมี เพราะไม่สามารถโหลดโครงข่ายถนนได้ในขณะนี้
        </span>
      )}
    </div>
  );
}
