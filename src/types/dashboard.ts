export type DashboardTravelMode = 'walk' | 'cycle' | 'drive';

export interface DistrictAccessibilityStats {
  code: number | string;
  name: string;
  coverage: Record<string, number>;
}

export interface AccessibilityStats {
  generatedAt: string;
  overall: Record<string, Record<DashboardTravelMode, number>>;
  districts: Record<string, DistrictAccessibilityStats>;
}

export interface AccessibilityCategoryMeta {
  key: string;
  shortName: string;
  name: string;
  group: 'health' | 'education' | 'transit' | 'safety';
  color: string;
}
