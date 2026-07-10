interface PlaceLayerOption {
  key: string;
  name: string;
  emoji: string;
  color: string;
  count: number;
}

interface LayerControlProps {
  layers: Record<string, boolean>;
  contours: number[];
  placeLayers: Record<string, boolean>;
  placeOptions: PlaceLayerOption[];
  onChange: (layers: Record<string, boolean>) => void;
  onPlaceChange: (layers: Record<string, boolean>) => void;
}

const CORE_LAYERS = [
  ['startPoint', 'จุดเริ่มต้น'],
  ['reachableRoads', 'โครงข่ายถนนที่เข้าถึงได้'],
  ['snappedNode', 'จุดเชื่อมเข้าถนน'],
] as const;

function contourKey(minutes: number): string {
  return `contour_${minutes}`;
}

export function LayerControl({
  layers,
  contours,
  placeLayers,
  placeOptions,
  onChange,
  onPlaceChange,
}: LayerControlProps) {
  const setAllPlaces = (visible: boolean) => {
    onPlaceChange(Object.fromEntries(placeOptions.map((option) => [option.key, visible])));
  };

  return (
    <div className="analysis-layer-list">
      <section className="analysis-layer-group">
        <h3>ผลจากโครงข่ายถนน</h3>
        {CORE_LAYERS.map(([key, label]) => (
          <label key={key} className="layer-row">
            <input
              type="checkbox"
              checked={layers[key] ?? false}
              onChange={(event) => onChange({ ...layers, [key]: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </section>

      <section className="analysis-layer-group">
        <h3>พื้นที่ตามช่วงเวลา</h3>
        {contours.length ? contours.map((minutes) => {
          const key = contourKey(minutes);
          const color = minutes === 10 ? '#14b8a6' : minutes === 15 ? '#38bdf8' : '#8b5cf6';
          return (
            <label key={key} className="layer-row">
              <input
                type="checkbox"
                checked={layers[key] ?? false}
                onChange={(event) => onChange({ ...layers, [key]: event.target.checked })}
              />
              <i className="analysis-layer-swatch" style={{ background: color }} />
              <span>ขอบเขต {minutes} นาที</span>
            </label>
          );
        }) : (
          <label className="layer-row">
            <input
              type="checkbox"
              checked={layers.serviceArea ?? true}
              onChange={(event) => onChange({ ...layers, serviceArea: event.target.checked })}
            />
            <span>ขอบเขตที่เข้าถึงได้</span>
          </label>
        )}
      </section>

      <section className="analysis-layer-group">
        <div className="analysis-layer-group-head">
          <h3>ประเภทสถานที่บนแผนที่</h3>
          {placeOptions.length > 0 && (
            <div>
              <button type="button" onClick={() => setAllPlaces(true)}>เปิดทั้งหมด</button>
              <button type="button" onClick={() => setAllPlaces(false)}>ปิดทั้งหมด</button>
            </div>
          )}
        </div>
        {placeOptions.length ? placeOptions.map((option) => (
          <label key={option.key} className="layer-row is-place-layer">
            <input
              type="checkbox"
              checked={placeLayers[option.key] ?? false}
              onChange={(event) => onPlaceChange({ ...placeLayers, [option.key]: event.target.checked })}
            />
            <i className="analysis-layer-swatch" style={{ background: option.color }} />
            <span><b>{option.emoji}</b> {option.name}</span>
            <strong>{option.count.toLocaleString()}</strong>
          </label>
        )) : (
          <p className="analysis-layer-empty">วิเคราะห์พื้นที่ก่อนเพื่อเลือกประเภทสถานที่</p>
        )}
      </section>
    </div>
  );
}
