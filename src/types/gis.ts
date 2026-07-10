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
  analysisQuality?: 'network' | 'approximate';
  fallbackReason?: string;
  cacheHit?: boolean;
  stats?: ServiceAreaStats;
  metrics: Record<string, any>;
  facilities?: any;
  snappedFacilities?: any;
  serviceArea: any;
  reachableRoads: any;
  networkNodes?: any;
  intersectingDistricts: Array<{ id: string | number; name: string; properties?: Record<string, any> }>;
  population?: {
    reachedEstimate: number;
    coveredDistrictPopulation: number;
    bangkokPopulation: number;
    referenceYear: number | null;
    method: string;
    caveat: string;
  };
}

export interface AnalyzeContoursResponse {
  type: 'ServiceAreaContours';
  generatedAt: string;
  contours: Array<{ minutes: number; result: AnalyzeResponse }>;
  traffic?: TrafficStatus;
}

export interface TrafficStatus {
  configured: boolean;
  available: boolean;
  provider: string;
  viewerUrl: string;
  lastUpdated: string | null;
  featureCount: number;
  refreshSeconds: number;
  error?: string | null;
  note?: string;
}
