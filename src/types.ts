import { Feature, Geometry } from 'geojson';

export interface BmaLayer {
  id: number;
  name: string;
  geometryType: string;
  url: string;
  groupName: string;
}

export interface BmaDimension {
  name: string;
  layers: BmaLayer[];
}

export interface BmaLayerCatalog {
  dimensions: BmaDimension[];
  layers: BmaLayer[];
}

export interface Facility {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface TravelCost {
  travelMinutes: number;
  speedKmh: number;
  distanceMeters: number;
}

export interface DistrictCoverage {
  code: string | number;
  name: string;
  coverage: Record<string, number>; // e.g., "health_walk": 3.24
}

export interface DashboardStats {
  generatedAt: string;
  overall: Record<string, Record<string, number>>; // e.g., { "health": { "walk": 3.24 } }
  districts: Record<string, DistrictCoverage>;
}

export interface AccessibilityConfig {
  primary: string;
  light: string;
  fill: string;
  name: string;
  emoji: string;
}

export interface DistrictLeaderboardItem {
  code: string | number;
  name: string;
  score: number;
}

export interface LayerLoadStatus {
  loading: boolean;
  returned: number;
  exceeded?: boolean;
  source?: string;
  error?: string;
}
