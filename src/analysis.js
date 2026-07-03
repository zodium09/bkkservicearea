import * as turf from '@turf/turf';

/**
 * Fetches routing geometry and distances from the public OSRM Routing API.
 * Falls back to straight-line Euclidean distance if the OSRM server is offline or fails.
 * @param {Array} startCoords - Start coordinates [longitude, latitude].
 * @param {Array} endCoords - End coordinates [longitude, latitude].
 * @param {string} [profile='foot'] - Routing profile: 'foot' (walking) or 'car' (driving).
 * @returns {Promise<Object>} Route path geometry, distance, and duration.
 */
export async function fetchOSRMRoute(startCoords, endCoords, profile = 'foot') {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&overview=full`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM API response not OK");
    const data = await res.json();
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates, // Array of [lng, lat]
        distanceKm: route.distance / 1000,
        durationSec: route.duration,
        success: true
      };
    }
  } catch (error) {
    console.warn(`OSRM Routing (${profile}) failed, falling back to straight-line distance:`, error.message);
  }

  // Fallback to straight-line calculation
  const dist = turf.distance(turf.point(startCoords), turf.point(endCoords), { units: 'kilometers' });
  return {
    geometry: [startCoords, endCoords],
    distanceKm: dist,
    durationSec: Math.round(((dist * 1000) / 80) * 60), // Walking speed ~80m/min
    success: false
  };
}

/**
 * Finds the nearest amenity in a FeatureCollection using straight-line distance.
 */
export function findNearestEuclidean(point, amenitiesCollection) {
  if (!amenitiesCollection || !amenitiesCollection.features || amenitiesCollection.features.length === 0) {
    return { feature: null, distanceKm: Infinity };
  }
  
  try {
    const nearest = turf.nearestPoint(point, amenitiesCollection);
    const distance = turf.distance(point, nearest, { units: 'kilometers' });
    return {
      feature: nearest,
      distanceKm: distance
    };
  } catch (error) {
    console.error("Error finding nearest amenity:", error);
    return { feature: null, distanceKm: Infinity };
  }
}

/**
 * Checks if a point is inside any of the flood risk zone polygons.
 */
export function checkFloodRisk(point, floodZonesCollection) {
  if (!floodZonesCollection || !floodZonesCollection.features || floodZonesCollection.features.length === 0) {
    return null;
  }
  
  try {
    for (const zone of floodZonesCollection.features) {
      if (turf.booleanPointInPolygon(point, zone)) {
        return zone;
      }
    }
  } catch (error) {
    console.error("Error checking flood risk:", error);
  }
  return null;
}

/**
 * Asynchronously computes shortest network routes and scores from an inspection point.
 */
export async function analyzeLocationAccessibility(inspectPoint, datasets) {
  const { transit, parks, health, safety, floodZones } = datasets;
  const inspectCoords = inspectPoint.geometry.coordinates;

  // 1. Locate closest amenities using straight-line distance to minimize OSRM calls
  const nearTransit = findNearestEuclidean(inspectPoint, transit);
  const nearPark = findNearestEuclidean(inspectPoint, parks);
  
  // Health subdivisions
  const tertiaryHospitals = {
    type: "FeatureCollection",
    features: health.features.filter(f => f.properties.type === 'Tertiary')
  };
  const primaryClinics = {
    type: "FeatureCollection",
    features: health.features.filter(f => f.properties.type === 'Primary' || f.properties.type === 'Secondary')
  };
  const nearHospital = findNearestEuclidean(inspectPoint, tertiaryHospitals);
  const nearClinic = findNearestEuclidean(inspectPoint, primaryClinics);

  // Safety
  const nearSafety = findNearestEuclidean(inspectPoint, safety);

  // 2. Fetch OSRM street-routing in parallel
  // Fire trucks use 'car' profile, all other walkability metrics use 'foot'
  const [routeTransit, routePark, routeHospital, routeClinic, routeSafety] = await Promise.all([
    nearTransit.feature ? fetchOSRMRoute(inspectCoords, nearTransit.feature.geometry.coordinates, 'foot') : Promise.resolve({ distanceKm: Infinity, durationSec: Infinity, geometry: [] }),
    nearPark.feature ? fetchOSRMRoute(inspectCoords, nearPark.feature.geometry.coordinates, 'foot') : Promise.resolve({ distanceKm: Infinity, durationSec: Infinity, geometry: [] }),
    nearHospital.feature ? fetchOSRMRoute(inspectCoords, nearHospital.feature.geometry.coordinates, 'foot') : Promise.resolve({ distanceKm: Infinity, durationSec: Infinity, geometry: [] }),
    nearClinic.feature ? fetchOSRMRoute(inspectCoords, nearClinic.feature.geometry.coordinates, 'foot') : Promise.resolve({ distanceKm: Infinity, durationSec: Infinity, geometry: [] }),
    nearSafety.feature ? fetchOSRMRoute(inspectCoords, nearSafety.feature.geometry.coordinates, 'car') : Promise.resolve({ distanceKm: Infinity, durationSec: Infinity, geometry: [] })
  ]);

  // 3. Compute Scores based on route distances
  
  // Transit access score
  let transitScore = 0;
  if (routeTransit.distanceKm !== Infinity) {
    const dt = routeTransit.distanceKm * 1000; // meters
    if (dt <= 400) transitScore = 100;
    else if (dt <= 800) transitScore = 80;
    else if (dt <= 1200) transitScore = 60;
    else if (dt <= 2000) transitScore = 30;
    else transitScore = Math.max(10, Math.round(100 - (dt / 35)));
  }

  // Park access score (15-min city ~1.2 km walk along network)
  let parkScore = 0;
  if (routePark.distanceKm !== Infinity) {
    const dp = routePark.distanceKm * 1000;
    if (dp <= 500) parkScore = 100;
    else if (dp <= 900) parkScore = 90;
    else if (dp <= 1200) parkScore = 80; // 15-min city threshold
    else if (dp <= 1800) parkScore = 50;
    else parkScore = Math.max(10, Math.round(100 - (dp / 25)));
  }

  // Health access score
  let hospitalScore = 0;
  if (routeHospital.distanceKm !== Infinity) {
    const dh = routeHospital.distanceKm; // km
    if (dh <= 1.5) hospitalScore = 100;
    else if (dh <= 3.0) hospitalScore = 90;
    else if (dh <= 6.0) hospitalScore = 70;
    else hospitalScore = Math.max(20, Math.round(100 - (dh * 8)));
  }

  let clinicScore = 0;
  if (routeClinic.distanceKm !== Infinity) {
    const dc = routeClinic.distanceKm * 1000;
    if (dc <= 500) clinicScore = 90;
    else if (dc <= 1200) clinicScore = 75;
    else clinicScore = Math.max(20, Math.round(100 - (dc / 22)));
  }

  const healthScore = Math.round(Math.max(hospitalScore, clinicScore));

  // Safety access score
  let safetyScore = 0;
  if (routeSafety.distanceKm !== Infinity) {
    const ds = routeSafety.distanceKm; // km driving
    if (ds <= 1.5) safetyScore = 100;
    else if (ds <= 3.5) safetyScore = 85;
    else if (ds <= 6.0) safetyScore = 60;
    else safetyScore = Math.max(15, Math.round(100 - (ds * 12)));
  }

  // Flood risk check
  const activeFloodZone = checkFloodRisk(inspectPoint, floodZones);
  let floodDeduction = 0;
  if (activeFloodZone) {
    const risk = activeFloodZone.properties.riskLevel;
    floodDeduction = risk === "High" ? 25 : risk === "Moderate" ? 15 : 5;
  }
  const finalSafetyScore = Math.max(0, safetyScore - floodDeduction);

  const overallScore = Math.round((transitScore + parkScore + healthScore + finalSafetyScore) / 4);

  return {
    overall: overallScore,
    categories: {
      transit: {
        score: transitScore,
        distanceKm: routeTransit.distanceKm,
        nearestName: nearTransit.feature.properties.name,
        path: routeTransit.geometry,
        durationSec: routeTransit.durationSec
      },
      park: {
        score: parkScore,
        distanceKm: routePark.distanceKm,
        nearestName: nearPark.feature.properties.name,
        path: routePark.geometry,
        durationSec: routePark.durationSec
      },
      health: {
        score: healthScore,
        distanceKm: routeHospital.distanceKm,
        nearestHospitalName: nearHospital.feature.properties.name,
        nearestClinicName: nearClinic.feature ? nearClinic.feature.properties.name : "N/A",
        path: routeHospital.distanceKm < routeClinic.distanceKm ? routeHospital.geometry : routeClinic.geometry,
        durationSec: routeHospital.distanceKm < routeClinic.distanceKm ? routeHospital.durationSec : routeClinic.durationSec
      },
      safety: {
        score: finalSafetyScore,
        distanceKm: routeSafety.distanceKm,
        nearestName: nearSafety.feature.properties.name,
        floodRisk: activeFloodZone ? activeFloodZone.properties.name : "ไม่มีความเสี่ยงน้ำท่วมขัง",
        floodDeduction,
        path: routeSafety.geometry,
        durationSec: routeSafety.durationSec
      }
    }
  };
}

/**
 * Dynamically generates a hexagonal grid accessibility heatmap over the map viewport.
 */
export function generateViewportHeatmap(bbox, datasets, activeCategory, bufferRanges) {
  const { transit, parks, health, safety, floodZones } = datasets;

  const bboxArray = [bbox.west, bbox.south, bbox.east, bbox.north]; // [minLng, minLat, maxLng, maxLat]
  
  // Calculate dynamic cell size based on viewport width to avoid browser freezes
  const widthKm = turf.distance(turf.point([bbox.west, bbox.south]), turf.point([bbox.east, bbox.south]));
  const cellSize = Math.max(0.15, widthKm / 18); // keep grid size around 15x18 hexagons

  try {
    const hexGrid = turf.hexGrid(bboxArray, cellSize, { units: 'kilometers' });

    // Calculate score for each hexagon center
    hexGrid.features.forEach(cell => {
      const center = turf.center(cell);
      
      let score = 0;

      if (activeCategory === 'transit') {
        const near = findNearestEuclidean(center, transit);
        const d = near.distanceKm; // km
        score = Math.max(0, Math.round(100 - (d * 80)));
      } else if (activeCategory === 'parks') {
        const near = findNearestEuclidean(center, parks);
        const d = near.distanceKm;
        score = Math.max(0, Math.round(100 - (d * 75)));
      } else if (activeCategory === 'health') {
        const nearHosp = findNearestEuclidean(center, health);
        const d = nearHosp.distanceKm;
        score = Math.max(0, Math.round(100 - (d * 50)));
      } else if (activeCategory === 'safety') {
        const nearFire = findNearestEuclidean(center, safety);
        const d = nearFire.distanceKm;
        let s = Math.max(0, Math.round(100 - (d * 35)));
        
        // Flood penalty
        const flood = checkFloodRisk(center, floodZones);
        if (flood) {
          s = Math.max(0, s - (flood.properties.riskLevel === 'High' ? 25 : 15));
        }
        score = s;
      }

      cell.properties = {
        score: score,
        category: activeCategory
      };
    });

    return hexGrid;
  } catch (error) {
    console.error("Error generating hexagonal grid:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

/**
 * Calculates regional statistics on the fly based on population points visible in the viewport.
 */
export function calculateRegionalStats(populationGrid, datasets, bufferRanges) {
  const { transit, parks, health, safety } = datasets;

  let totalPopulation = 0;
  let transitCoveredPop = 0;
  let parkCoveredPop = 0;
  let healthCoveredPop = 0;
  let safetyCoveredPop = 0;
  let fullyCoveredPop = 0;
  let blindSpotsCount = 0;

  populationGrid.features.forEach(popPoint => {
    const pop = popPoint.properties.population || 0;
    totalPopulation += pop;

    const nearT = findNearestEuclidean(popPoint, transit);
    const nearP = findNearestEuclidean(popPoint, parks);
    const nearH = findNearestEuclidean(popPoint, health);
    const nearS = findNearestEuclidean(popPoint, safety);

    const hasTransit = nearT.distanceKm <= bufferRanges.transit;
    const hasPark = nearP.distanceKm <= bufferRanges.park;
    const hasHealth = nearH.distanceKm <= bufferRanges.health;
    const hasSafety = nearS.distanceKm <= bufferRanges.safety;

    if (hasTransit) transitCoveredPop += pop;
    if (hasPark) parkCoveredPop += pop;
    if (hasHealth) healthCoveredPop += pop;
    if (hasSafety) safetyCoveredPop += pop;

    if (hasTransit && hasPark && hasHealth && hasSafety) {
      fullyCoveredPop += pop;
    }

    if (!hasTransit && !hasPark && !hasHealth) {
      blindSpotsCount += pop;
    }
  });

  return {
    totalPopulation,
    transitCoveredPct: totalPopulation > 0 ? Math.round((transitCoveredPop / totalPopulation) * 100) : 0,
    parkCoveredPct: totalPopulation > 0 ? Math.round((parkCoveredPop / totalPopulation) * 100) : 0,
    healthCoveredPct: totalPopulation > 0 ? Math.round((healthCoveredPop / totalPopulation) * 100) : 0,
    safetyCoveredPct: totalPopulation > 0 ? Math.round((safetyCoveredPop / totalPopulation) * 100) : 0,
    fullyCoveredPct: totalPopulation > 0 ? Math.round((fullyCoveredPop / totalPopulation) * 100) : 0,
    blindSpotPct: totalPopulation > 0 ? Math.round((blindSpotsCount / totalPopulation) * 100) : 0
  };
}

/**
 * Calculates concentric walk isochrone polygons (5, 10, 15 mins) around a center coordinate.
 * Uses 8 radial OSRM queries to trace reachable street network coordinates.
 * @param {Array} center - Center coordinate [lng, lat].
 * @returns {Promise<Object>} FeatureCollection of buffered range polygons.
 */
export async function calculateWalkIsochrones(center) {
  const [centerLng, centerLat] = center;
  const directions = [0, 45, 90, 135, 180, 225, 270, 315];
  const targetDistanceKm = 1.4;

  const radialPoints = directions.map(angle => {
    const rad = (angle * Math.PI) / 180;
    const latOffset = (targetDistanceKm * Math.cos(rad)) / 110.574;
    const lngOffset = (targetDistanceKm * Math.sin(rad)) / (111.320 * Math.cos((centerLat * Math.PI) / 180));
    return [centerLng + lngOffset, centerLat + latOffset];
  });

  // Query OSRM in parallel
  const routePromises = radialPoints.map(targetCoords => 
    fetchOSRMRoute([centerLng, centerLat], targetCoords, 'foot')
  );
  
  const routes = await Promise.all(routePromises);

  const greenPoints = [[centerLng, centerLat]];
  const yellowPoints = [[centerLng, centerLat]];
  const redPoints = [[centerLng, centerLat]];

  routes.forEach(route => {
    if (!route || !route.geometry || route.geometry.length < 2) return;
    
    let accumDist = 0;
    const coords = route.geometry;
    
    greenPoints.push(coords[0]);
    yellowPoints.push(coords[0]);
    redPoints.push(coords[0]);

    for (let i = 1; i < coords.length; i++) {
      const p1 = turf.point(coords[i - 1]);
      const p2 = turf.point(coords[i]);
      const segmentDist = turf.distance(p1, p2, { units: 'kilometers' });
      accumDist += segmentDist;

      if (accumDist <= 0.45) {
        greenPoints.push(coords[i]);
        yellowPoints.push(coords[i]);
        redPoints.push(coords[i]);
      } else if (accumDist <= 0.90) {
        yellowPoints.push(coords[i]);
        redPoints.push(coords[i]);
      } else if (accumDist <= 1.40) {
        redPoints.push(coords[i]);
      }
    }
  });

  const features = [];

  const makeIsochrone = (points, radiusKm, rangeName, ThaiLabel) => {
    if (points.length < 2) return null;
    try {
      const mp = turf.multiPoint(points);
      const buffered = turf.buffer(mp, radiusKm, { units: 'kilometers' });
      if (buffered) {
        buffered.properties = {
          range: rangeName,
          label: ThaiLabel,
          centerLng,
          centerLat
        };
        return buffered;
      }
    } catch (e) {
      console.error(`Failed to buffer walk points for ${rangeName}:`, e);
    }
    return null;
  };

  // Stacked order: Red (outermost), Yellow (middle), Green (innermost)
  const redPoly = makeIsochrone(redPoints, 0.075, 'red', 'โซนเดินเท้า 15 นาที (~1.4 กม.)');
  const yellowPoly = makeIsochrone(yellowPoints, 0.065, 'yellow', 'โซนเดินเท้า 10 นาที (~900 ม.)');
  const greenPoly = makeIsochrone(greenPoints, 0.055, 'green', 'โซนเดินเท้า 5 นาที (~450 ม.)');

  if (redPoly) features.push(redPoly);
  if (yellowPoly) features.push(yellowPoly);
  if (greenPoly) features.push(greenPoly);

  return {
    type: "FeatureCollection",
    features: features
  };
}
