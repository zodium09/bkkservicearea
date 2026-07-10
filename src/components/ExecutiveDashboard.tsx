import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bike,
  Car,
  Clock3,
  Crosshair,
  Footprints,
  Gauge,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type {
  AccessibilityCategoryMeta,
  AccessibilityStats,
  DashboardTravelMode,
  DistrictAccessibilityStats,
} from '../types/dashboard';

interface ExecutiveDashboardProps {
  stats: AccessibilityStats | null;
  mode: DashboardTravelMode;
  focusCategory: string;
  selectedDistrictCode: string | null;
  onModeChange: (mode: DashboardTravelMode) => void;
  onFocusCategoryChange: (category: string) => void;
  onSelectDistrict: (code: string) => void;
  onZoomDistrict: (code: string) => void;
}

export const ACCESSIBILITY_CATEGORIES: AccessibilityCategoryMeta[] = [
  { key: 'bkk_hospitals', shortName: 'รพ. กทม.', name: 'โรงพยาบาลสังกัด กทม.', group: 'health', color: '#10b981' },
  { key: 'gov_hospitals', shortName: 'รพ. รัฐ', name: 'โรงพยาบาลรัฐอื่น ๆ', group: 'health', color: '#3b82f6' },
  { key: 'private_hospitals', shortName: 'รพ. เอกชน', name: 'โรงพยาบาลเอกชน', group: 'health', color: '#0ea5e9' },
  { key: 'health_centers', shortName: 'ศบส.', name: 'ศูนย์บริการสาธารณสุข', group: 'health', color: '#14b8a6' },
  { key: 'schools_bkk', shortName: 'รร. กทม.', name: 'โรงเรียนสังกัด กทม.', group: 'education', color: '#f97316' },
  { key: 'schools_obec', shortName: 'รร. สพฐ.', name: 'โรงเรียนสังกัด สพฐ.', group: 'education', color: '#f59e0b' },
  { key: 'schools_private', shortName: 'รร. เอกชน', name: 'โรงเรียนเอกชน', group: 'education', color: '#d97706' },
  { key: 'transit_train', shortName: 'รถไฟฟ้า', name: 'สถานีรถไฟฟ้า', group: 'transit', color: '#8b5cf6' },
  { key: 'transit_boat', shortName: 'เรือ', name: 'ท่าเรือโดยสาร', group: 'transit', color: '#0284c7' },
  { key: 'transit_bus', shortName: 'รถประจำทาง', name: 'ป้ายรถประจำทาง', group: 'transit', color: '#a855f7' },
  { key: 'fire_stations', shortName: 'ดับเพลิง', name: 'สถานีดับเพลิงและกู้ภัย', group: 'safety', color: '#ef4444' },
  { key: 'police_stations', shortName: 'ตำรวจ', name: 'สถานีตำรวจ', group: 'safety', color: '#2563eb' },
  { key: 'communities', shortName: 'ชุมชน', name: 'พื้นที่ชุมชน', group: 'safety', color: '#ca8a04' },
];

const MODE_META: Record<DashboardTravelMode, { label: string; scope: string; icon: typeof Footprints }> = {
  walk: { label: 'เดิน', scope: '15 นาที', icon: Footprints },
  cycle: { label: 'จักรยาน', scope: '15 นาที', icon: Bike },
  drive: { label: 'รถยนต์', scope: '15 นาที', icon: Car },
};

const TARGET_COVERAGE = 60;

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampCoverage(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatPercent(value: number, digits = 1): string {
  return `${clampCoverage(value).toFixed(digits)}%`;
}

function scoreTone(value: number): 'good' | 'watch' | 'critical' {
  if (value >= 80) return 'good';
  if (value >= TARGET_COVERAGE) return 'watch';
  return 'critical';
}

function districtComposite(district: DistrictAccessibilityStats, mode: DashboardTravelMode): number {
  return mean(ACCESSIBILITY_CATEGORIES.map((category) => district.coverage[`${category.key}_${mode}`] ?? 0));
}

export function ExecutiveDashboard({
  stats,
  mode,
  focusCategory,
  selectedDistrictCode,
  onModeChange,
  onFocusCategoryChange,
  onSelectDistrict,
  onZoomDistrict,
}: ExecutiveDashboardProps) {
  if (!stats) {
    return (
      <div className="executive-loading" role="status">
        <div className="executive-loading-orbit" />
        <strong>กำลังสังเคราะห์ภาพรวมเชิงพื้นที่</strong>
        <span>โหลดตัวชี้วัดการเข้าถึงครบ 50 เขต...</span>
      </div>
    );
  }

  const categories = ACCESSIBILITY_CATEGORIES.filter((category) => stats.overall[category.key]);
  const overallIndex = mean(categories.map((category) => stats.overall[category.key]?.[mode] ?? 0));
  const districtRows = Object.entries(stats.districts)
    .map(([code, district]) => ({
      code,
      district,
      composite: districtComposite(district, mode),
      focus: district.coverage[`${focusCategory}_${mode}`] ?? 0,
    }))
    .sort((left, right) => left.composite - right.composite);
  const belowTargetCount = districtRows.filter((row) => row.composite < TARGET_COVERAGE).length;
  const equityGap = districtRows.length
    ? districtRows[districtRows.length - 1].composite - districtRows[0].composite
    : 0;
  const selectedRow = districtRows.find((row) => row.code === selectedDistrictCode) ?? districtRows[0];
  const selectedRank = districtRows.findIndex((row) => row.code === selectedRow?.code) + 1;
  const focusMeta = categories.find((category) => category.key === focusCategory) ?? categories[0];
  const categoryRanking = categories
    .map((category) => ({ ...category, coverage: stats.overall[category.key]?.[mode] ?? 0 }))
    .sort((left, right) => left.coverage - right.coverage);
  const selectedCategoryRanking = selectedRow
    ? categories
        .map((category) => ({ ...category, coverage: selectedRow.district.coverage[`${category.key}_${mode}`] ?? 0 }))
        .sort((left, right) => left.coverage - right.coverage)
    : [];
  const modeMeta = MODE_META[mode];
  const generatedDate = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(stats.generatedAt));

  return (
    <div className="executive-dashboard">
      <section className="executive-hero">
        <div className="executive-hero-copy">
          <span className="executive-kicker"><Sparkles size={13} /> ภาพรวมสำหรับผู้บริหาร</span>
          <h2>เมืองที่เข้าถึงบริการได้ ใกล้แค่ไหน?</h2>
          <p>สรุปความครอบคลุมตามเส้นทางบนถนนจริง เปรียบเทียบช่องว่างบริการรายเขตเพื่อกำหนดพื้นที่ลงทุน</p>
        </div>
        <div className={`executive-score-ring is-${scoreTone(overallIndex)}`} style={{ '--score': overallIndex } as React.CSSProperties}>
          <div>
            <strong>{overallIndex.toFixed(0)}</strong>
            <span>/100</span>
          </div>
        </div>
      </section>

      <div className="executive-mode-selector" aria-label="รูปแบบการเดินทาง">
        {(Object.keys(MODE_META) as DashboardTravelMode[]).map((modeKey) => {
          const item = MODE_META[modeKey];
          const Icon = item.icon;
          return (
            <button
              key={modeKey}
              type="button"
              className={mode === modeKey ? 'is-active' : ''}
              onClick={() => onModeChange(modeKey)}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <section className="executive-kpi-grid" aria-label="ตัวชี้วัดหลัก">
        <article className="executive-kpi is-primary">
          <div className="executive-kpi-icon"><Gauge size={17} /></div>
          <span>ดัชนีเข้าถึงรวม</span>
          <strong>{formatPercent(overallIndex)}</strong>
          <small>{modeMeta.label} · {categories.length} บริการ</small>
        </article>
        <article className="executive-kpi is-warning">
          <div className="executive-kpi-icon"><Target size={17} /></div>
          <span>เขตต่ำกว่าเป้า</span>
          <strong>{belowTargetCount}<i>/50</i></strong>
          <small>เป้าหมาย ≥ {TARGET_COVERAGE}%</small>
        </article>
        <article className="executive-kpi is-danger">
          <div className="executive-kpi-icon"><TrendingUp size={17} /></div>
          <span>ช่องว่างเชิงพื้นที่</span>
          <strong>{equityGap.toFixed(1)}<i> จุด</i></strong>
          <small>เขตสูงสุด − ต่ำสุด</small>
        </article>
        <article className="executive-kpi is-info">
          <div className="executive-kpi-icon"><Clock3 size={17} /></div>
          <span>กรอบเวลา</span>
          <strong>15<i> นาที</i></strong>
          <small>ตามเวลาการเดินทาง</small>
        </article>
      </section>

      <section className="executive-section">
        <div className="executive-section-head">
          <div>
            <span>ช่องว่างการเข้าถึงบริการ</span>
            <h3>บริการที่ยังเข้าถึงได้น้อย</h3>
          </div>
          <BarChart3 size={18} />
        </div>
        <div className="service-gap-list">
          {categoryRanking.slice(0, 5).map((category) => (
            <button
              type="button"
              key={category.key}
              className={focusCategory === category.key ? 'is-active' : ''}
              onClick={() => onFocusCategoryChange(category.key)}
            >
              <span className="service-gap-dot" style={{ background: category.color }} />
              <span className="service-gap-name">{category.shortName}</span>
              <span className="service-gap-track"><i style={{ width: `${clampCoverage(category.coverage)}%`, background: category.color }} /></span>
              <strong>{formatPercent(category.coverage, 0)}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="executive-section">
        <div className="executive-section-head is-stacked">
          <div>
            <span>พื้นที่ที่ควรให้ความสำคัญ</span>
            <h3>แผนที่ช่องว่างบริการ</h3>
          </div>
          <label className="executive-field">
            <span>ตัวชี้วัดบนแผนที่</span>
            <select value={focusCategory} onChange={(event) => onFocusCategoryChange(event.target.value)}>
              {categories.map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}
            </select>
          </label>
        </div>
        <div className="map-insight-callout">
          <MapPinned size={18} />
          <div>
            <span>กำลังแสดง</span>
            <strong>{focusMeta?.name} · {modeMeta.label}</strong>
          </div>
          <ArrowRight size={16} />
        </div>
      </section>

      <section className="executive-section">
        <div className="executive-section-head">
          <div>
            <span>เขตที่ควรเร่งดำเนินการ</span>
            <h3>5 เขตเร่งด่วนเชิงนโยบาย</h3>
          </div>
          <AlertTriangle size={18} />
        </div>
        <div className="priority-district-list">
          {districtRows.slice(0, 5).map((row, index) => (
            <button
              type="button"
              key={row.code}
              className={selectedRow?.code === row.code ? 'is-active' : ''}
              onClick={() => onSelectDistrict(row.code)}
              onDoubleClick={() => onZoomDistrict(row.code)}
              title="คลิกเพื่อดูรายละเอียด ดับเบิลคลิกเพื่อซูม"
            >
              <span className="priority-rank">{index + 1}</span>
              <span className="priority-name">เขต{row.district.name}<small>{focusMeta?.shortName} {formatPercent(row.focus, 0)}</small></span>
              <strong>{formatPercent(row.composite, 0)}</strong>
              <Crosshair size={14} />
            </button>
          ))}
        </div>
      </section>

      {selectedRow && (
        <section className="executive-section district-drilldown">
          <div className="district-drilldown-head">
            <div>
              <span>สรุปรายเขต · ลำดับเร่งด่วน {selectedRank}/50</span>
              <h3>เขต{selectedRow.district.name}</h3>
            </div>
            <button type="button" onClick={() => onZoomDistrict(selectedRow.code)}><Crosshair size={15} /> ซูม</button>
          </div>
          <div className="district-score-row">
            <div>
              <span>ดัชนีรวม</span>
              <strong className={`is-${scoreTone(selectedRow.composite)}`}>{formatPercent(selectedRow.composite)}</strong>
            </div>
            <div>
              <span>{focusMeta?.shortName}</span>
              <strong>{formatPercent(selectedRow.focus)}</strong>
            </div>
            <div>
              <span>สถานะ</span>
              <strong>{selectedRow.composite >= TARGET_COVERAGE ? 'ผ่านเป้า' : 'เร่งด่วน'}</strong>
            </div>
          </div>
          <div className="district-gap-bars">
            {selectedCategoryRanking.slice(0, 3).map((category) => (
              <div key={category.key}>
                <span>{category.shortName}</span>
                <div><i style={{ width: `${clampCoverage(category.coverage)}%`, background: category.color }} /></div>
                <strong>{formatPercent(category.coverage, 0)}</strong>
              </div>
            ))}
          </div>
          <div className="district-recommendation">
            <ShieldCheck size={17} />
            <p><strong>ข้อเสนอเชิงบริหาร</strong> จัดลำดับการลงทุนใน {selectedCategoryRanking.slice(0, 2).map((item) => item.shortName).join(' และ ')} พร้อมตรวจข้อจำกัดของเส้นทางและการเชื่อมต่อก่อนเพิ่มบริการใหม่</p>
          </div>
        </section>
      )}

      <footer className="executive-method-note">
        <span><span className="live-dot" /> ข้อมูลคำนวณล่าสุด {generatedDate}</span>
        <span>ดัชนีคำนวณจากค่าเฉลี่ยพื้นที่ครอบคลุม {categories.length} บริการ ตามเส้นทางบนถนนจริง</span>
      </footer>
    </div>
  );
}
