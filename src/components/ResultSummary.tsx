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
  const isJsFallback = result.engine === 'js-dijkstra-fallback';
  const topology = result.metrics?.fallbackTopology;
  const usesVirtualConnectors = Number(topology?.virtualConnectorCount || 0) > 0;
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
      {isJsFallback && (
        <span className="analysis-warning">
          ใช้โครงข่าย fallback จาก ArcGIS + JS Dijkstra ผลใกล้เคียงการหา service area แต่ยังไม่ละเอียดเท่า Google Maps/pgRouting
          {usesVirtualConnectors ? ' และมีการเชื่อม component ถนนใกล้เคียงเพื่อแก้กราฟขาด' : ''}
        </span>
      )}
    </div>
  );
}
