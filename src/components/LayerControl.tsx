interface LayerControlProps {
  layers: Record<string, boolean>;
  onChange: (layers: Record<string, boolean>) => void;
}

const ANALYSIS_LAYERS = [
  ['serviceArea', 'Service Area Polygon'],
  ['reachableRoads', 'Reachable Roads'],
  ['startPoint', 'Start Point'],
  ['snappedNode', 'Snapped Node'],
  ['barriers', 'Barriers'],
  ['onewayRoads', 'One-way Roads'],
] as const;

export function LayerControl({ layers, onChange }: LayerControlProps) {
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      {ANALYSIS_LAYERS.map(([key, label]) => (
        <label key={key} className="layer-row">
          <input
            type="checkbox"
            checked={layers[key] ?? true}
            onChange={(event) => onChange({ ...layers, [key]: event.target.checked })}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
