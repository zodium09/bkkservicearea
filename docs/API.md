# API

## `GET /api/engine/status`

Returns database, PostGIS, pgRouting, QGIS, and supported mode status.

## `POST /api/analyze`

Request:

```json
{
  "lat": 13.7563,
  "lng": 100.5018,
  "mode": "walk",
  "costType": "time",
  "limit": 900
}
```

`mode` is `walk`, `bike`, or `drive`.

`costType` is:

- `time`: `limit` is seconds.
- `distance`: `limit` is meters.

Response includes:

- `serviceArea`
- `reachableRoads`
- `networkNodes`
- `stats`
- `metrics`
- `cacheHit`

Invalid inputs return:

```json
{
  "error": true,
  "code": "INVALID_LOCATION",
  "message": "ตำแหน่งอยู่นอกพื้นที่กรุงเทพมหานคร"
}
```
