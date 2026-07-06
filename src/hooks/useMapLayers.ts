import { useCallback, useState } from 'react';

export function useMapLayers(initialLayers: Record<string, boolean>) {
  const [layers, setLayers] = useState(initialLayers);
  const toggleLayer = useCallback((key: string) => {
    setLayers((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);
  return { layers, setLayers, toggleLayer };
}
