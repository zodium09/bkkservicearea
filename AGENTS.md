# Developer & AI Agent Guide (AGENTS.md)

Welcome! This guide outlines the architecture, directory layout, development workflow, and coding guidelines of the Bangkok 15-Minute City Dashboard.

---

## 1. Architecture Overview

The application uses a **Hybrid Web GIS Architecture**:

```
                       [ FRONTEND ]
              Vite + React + TypeScript (TSX)
           (Interactive Leaflet Map rendering)
              - Deployed to: Vercel Static
                            │
                  HTTP REST API Requests
                            │
                            ▼
                     [ BACKEND API ]
              Python + FastAPI + Uvicorn
        (Handles GIS operations and Dijkstra)
            - Deployed to: Render/Railway (Docker)
```

- **Frontend**: Vite + React + TypeScript. Renders base maps, polygons, markers, and tooltips using Leaflet.js.
- **Backend**: Python + FastAPI. Performs heavy graph traversal (NetworkX), polygon buffering (Shapely), and spatial intersections (GeoPandas).
- **Caching**: 15-minute walk/cycle accessibility overlays and district stats are precomputed and cached inside `data/processed/accessibility/` as GeoJSON/JSON files.

---

## 2. Directory Structure

- `data/`
  - `raw/` - Raw GIS shapefiles or GeoJSON layers downloaded from MapServer (ignored by Git).
  - `processed/`
    - `bma-layers/` - Processed base layers (like boundaries and roads). Only `layer-13.geojson` (districts) is whitelisted and committed to Git.
    - `accessibility/` - **Whitelisted and committed**. Contains the precomputed 15-minute city layers and `stats.json`.
- `scripts/` - Python precomputation pipelines (`precompute.py`).
- `src/` - React frontend source code in TypeScript.
  - `main.tsx` - App entry point, interactive Leaflet logic, and dashboard.
  - `types.ts` - Strict TypeScript declarations.
  - `styles.css` - Visual styling, glassmorphism UI, sidebars, and responsive classes.
- `Dockerfile` - Backend environment configuration.

---

## 3. Development Workflow

### Frontend Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   (Proxies API calls to `http://127.0.0.1:8000` via `vite.config.js`).

### Backend Setup (Python)
1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the FastAPI server:
   ```bash
   python main.py
   ```

### Running via Docker

#### Build the image:
```bash
docker build -t bkk-gis-backend .
```

#### Run the API Backend:
```bash
docker run -p 8000:8000 bkk-gis-backend
```

#### Run the Precomputation Pipeline (mounting local data directory):
```bash
docker run --rm -v ${PWD}/data:/app/data bkk-gis-backend python scripts/precompute.py
```

---

## 4. Coding & GIS Guidelines for AI Agents

- **Defensive GeoJSON Rendering**: Never pass API responses directly to `L.geoJSON()` without checking if the data is a valid GeoJSON object (e.g. `type === 'FeatureCollection'`). This prevents React from crashing (black screen) if an API returns a 500 error structure.
- **Large Dataset Ignorance**: Never commit large geographic datasets (like `layer-7.geojson` - 300MB) to Git. Keep them in `.gitignore`. Only whitelist lightweight result datasets.
- **QGIS/Python Processing**: Use GeoPandas and Shapely for any complex GIS analysis (buffering, union, dissolve) instead of Turf.js on the client/node side. Python handles geometry computation much faster and avoids memory limit crashes.
