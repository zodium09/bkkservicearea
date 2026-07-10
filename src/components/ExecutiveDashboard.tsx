import {
  AlertTriangle,
  Bike,
  Car,
  Crosshair,
  Footprints,
  Info,
  MapPinned,
} from 'lucide-react';
import type {
  AccessibilityDomainMeta,
  AccessibilityStats,
  DashboardTravelMode,
  DistrictAccessibilityStats,
} from '../types/dashboard';

interface ExecutiveDashboardProps {
  stats: AccessibilityStats | null;
  mode: DashboardTravelMode;
  focusDomain: string;
  selectedDistrictCode: string | null;
  onModeChange: (mode: DashboardTravelMode) => void;
  onFocusDomainChange: (domain: string) => void;
  onSelectDistrict: (code: string) => void;
  onZoomDistrict: (code: string) => void;
}

export const ACCESSIBILITY_DOMAINS: AccessibilityDomainMeta[] = [
  {
    key: 'health',
    shortName: 'สาธารณสุข',
    name: 'สุขภาพและสาธารณสุข',
    description: 'โรงพยาบาลและบริการสุขภาพปฐมภูมิ',
    color: '#14b8a6',
    categoryKeys: ['bkk_hospitals', 'gov_hospitals', 'private_hospitals', 'health_centers'],
  },
  {
    key: 'education',
    shortName: 'การศึกษา',
    name: 'การศึกษา',
    description: 'สถานศึกษาขั้นพื้นฐานทุกสังกัด',
    color: '#f59e0b',
    categoryKeys: ['schools_bkk', 'schools_obec', 'schools_private'],
  },
  {
    key: 'transit',
    shortName: 'ขนส่ง',
    name: 'ขนส่งสาธารณะ',
    description: 'รถไฟฟ้า เรือ และรถประจำทาง',
    color: '#38bdf8',
    categoryKeys: ['transit_train', 'transit_boat', 'transit_bus'],
  },
  {
    key: 'safety',
    shortName: 'ความปลอดภัย',
    name: 'ความปลอดภัยและฉุกเฉิน',
    description: 'ตำรวจ ดับเพลิง และกู้ภัย',
    color: '#fb7185',
    categoryKeys: ['fire_stations', 'police_stations'],
  },
];

const MODE_META: Record<DashboardTravelMode, { label: string; scope: string; icon: typeof Footprints }> = {
  walk: { label: 'เดิน', scope: 'แนวคิดเมือง 15 นาที', icon: Footprints },
  cycle: { label: 'จักรยาน', scope: 'แนวคิดเมือง 15 นาที', icon: Bike },
  drive: { label: 'รถยนต์', scope: 'สถานการณ์เปรียบเทียบ', icon: Car },
};

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

function percentile(sortedValues: number[], probability: number): number {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

export function domainCoverageFromRecord(
  coverage: Record<string, number>,
  domainKey: string,
  mode: DashboardTravelMode,
): number {
  const domain = ACCESSIBILITY_DOMAINS.find((item) => item.key === domainKey);
  if (!domain) return 0;
  return mean(domain.categoryKeys.map((category) => coverage[`${category}_${mode}`] ?? 0));
}

function districtComposite(district: DistrictAccessibilityStats, mode: DashboardTravelMode): number {
  return mean(ACCESSIBILITY_DOMAINS.map((domain) => domainCoverageFromRecord(district.coverage, domain.key, mode)));
}

function overallDomainCoverage(stats: AccessibilityStats, domain: AccessibilityDomainMeta, mode: DashboardTravelMode): number {
  return mean(domain.categoryKeys.map((category) => stats.overall[category]?.[mode] ?? 0));
}

export function ExecutiveDashboard({
  stats,
  mode,
  focusDomain,
  selectedDistrictCode,
  onModeChange,
  onFocusDomainChange,
  onSelectDistrict,
  onZoomDistrict,
}: ExecutiveDashboardProps) {
  if (!stats) {
    return (
      <div className="executive-loading" role="status">
        <div className="executive-loading-orbit" />
        <strong>กำลังเตรียมสถิติ 4 ด้าน</strong>
        <span>ตรวจข้อมูลความครอบคลุมครบ 50 เขต</span>
      </div>
    );
  }

  const domainRows = ACCESSIBILITY_DOMAINS.map((domain) => ({
    ...domain,
    coverage: overallDomainCoverage(stats, domain, mode),
  }));
  const overallIndex = mean(domainRows.map((domain) => domain.coverage));
  const districtRows = Object.entries(stats.districts)
    .map(([code, district]) => ({
      code,
      district,
      composite: districtComposite(district, mode),
      focus: domainCoverageFromRecord(district.coverage, focusDomain, mode),
    }))
    .sort((left, right) => left.composite - right.composite);
  const belowBangkokAverageCount = districtRows.filter((row) => row.composite < overallIndex).length;
  const sortedScores = districtRows.map((row) => row.composite);
  const robustGap = percentile(sortedScores, 0.9) - percentile(sortedScores, 0.1);
  const selectedRow = districtRows.find((row) => row.code === selectedDistrictCode) ?? districtRows[0];
  const selectedRank = districtRows.findIndex((row) => row.code === selectedRow?.code) + 1;
  const focusMeta = ACCESSIBILITY_DOMAINS.find((domain) => domain.key === focusDomain) ?? ACCESSIBILITY_DOMAINS[0];
  const modeMeta = MODE_META[mode];
  const generatedDate = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(stats.generatedAt));

  return (
    <div className="executive-dashboard is-domain-dashboard">
      <header className="domain-dashboard-header">
        <div>
          <h2>ภาพรวมการเข้าถึง 15 นาที</h2>
          <p>4 ด้านบริการ จาก 12 ชุดข้อมูล</p>
        </div>
        <span title="คำนวณจากสัดส่วนพื้นที่เขตที่อยู่ในขอบเขตการเดินทางบนโครงข่ายถนน">
          <Info size={15} /> วิธีคำนวณ
        </span>
      </header>

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
              title={item.scope}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <section className="balanced-index" aria-label="ดัชนีภาพรวมแบบสมดุล">
        <div className="balanced-index-main">
          <span>ดัชนี 4 ด้านแบบน้ำหนักเท่ากัน</span>
          <strong>{formatPercent(overallIndex)}</strong>
          <small>ค่าเฉลี่ยความครอบคลุมเชิงพื้นที่ ไม่ใช่สัดส่วนประชากร</small>
        </div>
        <div className="balanced-index-facts">
          <div>
            <span>ต่ำกว่าค่าเฉลี่ย กทม.</span>
            <strong>{belowBangkokAverageCount}<i>/50 เขต</i></strong>
          </div>
          <div>
            <span>ช่องว่าง P90 ถึง P10</span>
            <strong>{robustGap.toFixed(1)}<i> จุด</i></strong>
          </div>
        </div>
      </section>

      <section className="domain-section">
        <div className="domain-section-title">
          <div>
            <h3>ความครอบคลุมเฉลี่ยรายด้าน</h3>
            <p>เลือกด้านเพื่อเปรียบเทียบเขต แล้วเปิดสีจากเมนูชั้นข้อมูลบนแผนที่</p>
          </div>
          <MapPinned size={18} />
        </div>
        <div className="domain-coverage-list">
          {domainRows.map((domain) => (
            <button
              type="button"
              key={domain.key}
              className={focusDomain === domain.key ? 'is-active' : ''}
              onClick={() => onFocusDomainChange(domain.key)}
              aria-pressed={focusDomain === domain.key}
            >
              <i className="domain-color" style={{ background: domain.color }} />
              <span className="domain-copy">
                <strong>{domain.name}</strong>
                <small>{domain.description}</small>
              </span>
              <span className="domain-bar" aria-hidden="true">
                <i style={{ width: `${clampCoverage(domain.coverage)}%`, background: domain.color }} />
              </span>
              <b>{formatPercent(domain.coverage, 0)}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="domain-section priority-section">
        <div className="domain-section-title">
          <div>
            <h3>เขตที่ควรตรวจสอบก่อน</h3>
            <p>เรียงจากดัชนี 4 ด้านต่ำสุด ใช้เพื่อคัดกรอง ไม่ใช่อันดับผลการดำเนินงาน</p>
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
              <span className="priority-name">เขต{row.district.name}<small>{focusMeta.shortName} {formatPercent(row.focus, 0)}</small></span>
              <strong>{formatPercent(row.composite, 0)}</strong>
              <Crosshair size={14} />
            </button>
          ))}
        </div>
      </section>

      {selectedRow && (
        <section className="domain-section district-drilldown">
          <div className="district-drilldown-head">
            <div>
              <span>รายละเอียดเขต ลำดับคัดกรอง {selectedRank}/50</span>
              <h3>เขต{selectedRow.district.name}</h3>
            </div>
            <button type="button" onClick={() => onZoomDistrict(selectedRow.code)}><Crosshair size={15} /> ซูมแผนที่</button>
          </div>
          <div className="district-domain-list">
            {ACCESSIBILITY_DOMAINS.map((domain) => {
              const value = domainCoverageFromRecord(selectedRow.district.coverage, domain.key, mode);
              return (
                <div key={domain.key}>
                  <span><i style={{ background: domain.color }} />{domain.shortName}</span>
                  <div><i style={{ width: `${clampCoverage(value)}%`, background: domain.color }} /></div>
                  <strong>{formatPercent(value, 0)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="executive-method-note domain-method-note">
        <span>ปรับปรุง {generatedDate} เวลาเดินทาง 15 นาที โหมด{modeMeta.label}</span>
        <span>แต่ละด้านมีน้ำหนัก 25% และเฉลี่ยชุดข้อมูลภายในด้านเท่ากัน พื้นที่ชุมชนใช้เป็นบริบทและไม่รวมในดัชนี</span>
        {mode === 'drive' && <span>รถยนต์เป็นสถานการณ์เปรียบเทียบ ไม่ใช่ตัวชี้วัดหลักของแนวคิดเมือง 15 นาที</span>}
        <span>ข้อจำกัด: ยังไม่รวมคุณภาพทางเท้า ความพิการ ความถี่บริการ ความจุ คุณภาพ และความสามารถในการจ่าย</span>
      </footer>
    </div>
  );
}
