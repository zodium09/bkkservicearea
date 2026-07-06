export type TravelMode = 'walk' | 'bike' | 'drive';
export type CostType = 'distance' | 'time';

export interface AnalyzeRequest {
  lat?: number;
  lng?: number;
  facilities?: Array<{
    id?: string;
    name?: string;
    type?: string;
    lat: number;
    lng: number;
  }>;
  mode: TravelMode;
  costType: CostType;
  limit: number;
}

export interface ServiceAreaStats {
  mode: TravelMode;
  costType: CostType;
  limit: number;
  areaSqKm: number;
  roadLengthKm: number;
  reachedNodes: number;
  cacheHit?: boolean;
}

export interface AnalyzeResponse {
  engine: string;
  cacheHit?: boolean;
  stats?: ServiceAreaStats;
  metrics: Record<string, any>;
  serviceArea: any;
  reachableRoads: any;
  networkNodes?: any;
  intersectingDistricts: Array<{ id: string | number; name: string; properties?: Record<string, any> }>;
}
