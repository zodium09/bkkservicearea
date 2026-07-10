import { Bike, Car, Footprints, Sliders } from 'lucide-react';
import type { CostType, TravelMode } from '../types/gis';

interface AnalyzePanelProps {
  mode: TravelMode;
  costType: CostType;
  limit: number;
  disabled: boolean;
  loading: boolean;
  onModeChange: (mode: TravelMode) => void;
  onCostTypeChange: (costType: CostType) => void;
  onLimitChange: (limit: number) => void;
  onAnalyze: () => void;
}

const modeOptions: Array<{ id: TravelMode; label: string; icon: any }> = [
  { id: 'walk', label: 'เดิน', icon: Footprints },
  { id: 'bike', label: 'จักรยาน', icon: Bike },
  { id: 'drive', label: 'รถยนต์', icon: Car },
];

export function AnalyzePanel(props: AnalyzePanelProps) {
  const limitLabel = props.costType === 'time'
    ? `${Math.round(props.limit / 60)} นาที`
    : `${props.limit.toLocaleString()} เมตร`;

  return (
    <>
      <div className="mode-toggle" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
        {modeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button key={option.id} className={props.mode === option.id ? 'chip active' : 'chip'} onClick={() => props.onModeChange(option.id)} type="button">
              <Icon size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <button className={props.costType === 'time' ? 'chip active' : 'chip'} onClick={() => props.onCostTypeChange('time')} type="button">เวลา</button>
        <button className={props.costType === 'distance' ? 'chip active' : 'chip'} onClick={() => props.onCostTypeChange('distance')} type="button">ระยะทาง</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
        <span>เดินทางได้ภายใน</span>
        <span style={{ color: '#0f766e' }}>{limitLabel}</span>
      </div>
      {props.costType === 'time' ? (
        <div className="contour-time-options">
          {[10, 15, 30].map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={props.limit === minutes * 60 ? 'is-active' : ''}
              onClick={() => props.onLimitChange(minutes * 60)}
            >
              {minutes} นาที
            </button>
          ))}
        </div>
      ) : (
        <input
          type="range"
          min={300}
          max={10000}
          step={100}
          value={props.limit}
          onChange={(event) => props.onLimitChange(Number(event.target.value))}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#0f766e' }}
        />
      )}

      <button onClick={props.onAnalyze} disabled={props.loading || props.disabled} className="primary-action" type="button">
        <Sliders size={18} />
        <span>{props.loading ? 'กำลังคำนวณ...' : props.disabled ? 'เลือกจุดบนแผนที่ก่อน' : 'แสดงพื้นที่ที่เข้าถึงได้'}</span>
      </button>
    </>
  );
}
