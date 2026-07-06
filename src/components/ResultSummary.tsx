import type { AnalyzeResponse } from '../types/gis';

interface ResultSummaryProps {
  result: AnalyzeResponse;
}

export function ResultSummary({ result }: ResultSummaryProps) {
  const stats = result.stats;
  if (!stats) return null;
  return (
    <div className="result-summary">
      พื้นที่ที่เข้าถึงได้ภายใน {stats.costType === 'time' ? `${Math.round(stats.limit / 60)} นาที` : `${stats.limit.toLocaleString()} เมตร`}
      {' '}โดยคำนวณตามโครงข่ายถนนจริง · Mode: {stats.mode} · Speed model: OSM road type + default speed · ข้อจำกัด: ยังไม่รวม live traffic
    </div>
  );
}
