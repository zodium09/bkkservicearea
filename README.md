# Bangkok Service Area Analysis

เว็บแอปพลิเคชัน GIS สำหรับวิเคราะห์พื้นที่บริการ (Service Area) ในกรุงเทพมหานคร โดยใช้โครงข่ายถนนจริง

## GIS Architecture: PostGIS + pgRouting

ระบบนี้ทำงานด้วยสถาปัตยกรรม **PostGIS + pgRouting** เป็นหลักในการวิเคราะห์หาขอบเขตพื้นที่บริการแบบไดนามิก โดยรันการทำงานร่วมกันบน Docker Container:

```
                       [ FRONTEND ]
              Vite + React + TypeScript (TSX)
           (Interactive Leaflet Map rendering)
                            │
                  HTTP REST API Requests
                            │
                            ▼
                     [ BACKEND API ]
               Node.js Express Web Server
                            │
                   SQL Queries & pgRouting
                            │
                            ▼
                  [ DATABASE ENGINE ]
            PostgreSQL 15 + PostGIS + pgRouting
```

- **Runtime Engine (PostGIS + pgRouting)**: รับจุดบริการ แปลง Snap ไปยังจุดร่วมแยกเครือข่ายถนนที่ใกล้ที่สุด หาช่วงเส้นทางที่เข้าถึงได้ด้วย pgRouting (`pgr_drivingDistance`) และทำการสร้างขอบเขต Service Area Polygon ด้วย `ST_UnaryUnion` + `ST_Buffer` บน PostgreSQL
- **QGIS Role (ETL Only)**: ปรับบทบาทของ QGIS ไปเป็นเครื่องมือเตรียมข้อมูล (ETL) ตรวจ Geometry และดาวน์โหลดข้อมูลนำเข้าออฟไลน์เท่านั้น ไม่ได้ใช้งานเป็นตัวรันวิเคราะห์แบบ Dynamic runtime อีกต่อไป

---

## ขั้นตอนการติดตั้งและใช้งาน (Local Setup)

### 1. โคลนโปรเจกต์และติดตั้ง Dependencies
```bash
npm install
```

### 2. เริ่มต้นฐานข้อมูลระบบด้วย Docker
เปิดโปรแกรม Docker (หรือ Docker Desktop) และรันคำสั่งเพื่อสตาร์ทฐานข้อมูล PostGIS + pgRouting:
```bash
docker-compose up -d db
```
*ตัวแปรสภาพแวดล้อมต่าง ๆ (เช่น รหัสผ่าน โฮสต์ พอร์ต) จะถูกดึงจากไฟล์ `.env` โดยอัตโนมัติ*

### 3. นำเข้าข้อมูลเครือข่ายถนนเข้าสู่ PostGIS
ดึงข้อมูลถนนที่จัดเตรียมไว้แบบออฟไลน์มาใส่ในตาราง `roads_raw`:
```bash
node scripts/import-roads-to-postgis.js
```

### 4. สร้างโครงข่ายเน็ตเวิร์กและโทโพโลยี (Topology)
สร้างตาราง Node-Vertex เชื่อมต่อจุดแยกถนน พร้อมสร้างดัชนีพิกัดเชิงพื้นที่ (Spatial Index) เพื่อเร่งความเร็วในการคิวรี:
```bash
npm run db:topology
```

### 5. รันและทดสอบระบบ

#### รันหน้าเว็บและ Express API คู่กัน (Development Mode):
```bash
npm run dev
```
- หน้าเว็บของแอปพลิเคชันจะรันอยู่ที่: `http://127.0.0.1:5173` (พอร์ต `5173`)
- ตัว Express API สำหรับรับวิเคราะห์จะทำงานที่พอร์ต `5174` (พอร์ต `5174`)

#### ทดสอบระบบการวิเคราะห์เครือข่ายถนน (API Integration Tests):
```bash
npm run test:api
```

---

## ฟีเจอร์ของระบบ (Features)

1. **โหมดแผนที่เมือง 15 นาที (15-Min City Dashboard)**
   - แสดงชั้นข้อมูลความเข้าถึงพื้นที่บริการ 5 ด้านหลัก (โรงพยาบาล กทม., โรงพยาบาลรัฐอื่น ๆ, ศบส., โรงเรียน, ขนส่งสาธารณะ) พร้อมสัญลักษณ์ที่สื่อถึงชั้นข้อมูลแบบ Web Map
   - แสดงเส้นทางวิ่งของรถประจำทาง (Bus Routes)
   - จัดอันดับเขตการปกครอง (District Leaderboard) ตามความครอบคลุม พร้อมฟิลเตอร์ค้นหาและซูมแผนที่รายเขต
2. **โหมดวิเคราะห์เข้าถึงรายจุด (Dynamic Routing Analysis)**
   - ปักหมุดจำลองตำแหน่งบนแผนที่ด้วยการคลิกเมาส์
   - ปรับระยะทางค้นหาได้ตามต้องการ (300 ม. ถึง 5,000 ม.)
   - ประมวลผลหาพื้นที่และขอบเขตเข้าถึงจริงตามระบบเครือข่ายถนนกรุงเทพฯ ผ่าน pgRouting ความละเอียดสูงภายในเวลาเสี้ยววินาที
   - แสดงสถิติเชิงปริมาณ (ขนาดพื้นที่ ตร.กม., ความยาวถนนรวมที่เข้าถึง กม., จำนวนทางร่วมแยก) และแสดงรายชื่อเขตทั้งหมดที่ขอบเขตบริการนี้คาบเกี่ยวพาดผ่าน
   - **ส่งออกข้อมูล (Export GeoJSON)**: ดาวน์โหลดผลลัพธ์ขอบเขตพื้นที่บริการไปเปิดในโปรแกรม GIS อื่น ๆ ได้ทันที

## Phase 1 Accessibility Intelligence

- พื้นที่เข้าถึงซ้อนกัน 10/15/30 นาที และสลับดูสรุปแต่ละช่วงเวลาได้
- ประมาณประชากรที่เข้าถึงได้จากข้อมูลประชากรรายเขตของกรุงเทพมหานคร ปี 2566
- แสดงจำนวนและตำแหน่งสถานที่สำคัญภายในพื้นที่เข้าถึง
- มี data catalog ระบุแหล่งข้อมูล ผู้เผยแพร่ ความถี่ และหมายเหตุด้าน license
- เชื่อม traffic overlay ผ่าน GeoJSON feed ที่ได้รับอนุญาต และ fallback ไปยัง BMA Traffic viewer
- มีชุด golden service-area สำหรับ regression test จุดตัวอย่างในกรุงเทพฯ

### เตรียมฐานข้อมูล Phase 1

```bash
npm run db:migrate
npm run import:phase1-data
```

### Realtime traffic

ระบบไม่ scrape endpoint ที่ไม่ได้เผยแพร่เป็น API หากได้รับ GeoJSON feed ที่มีสิทธิใช้งาน ให้กำหนด:

```bash
TRAFFIC_GEOJSON_URL=https://provider.example/traffic.geojson
TRAFFIC_CACHE_TTL_SECONDS=60
TRAFFIC_FETCH_TIMEOUT_MS=8000
```

GeoJSON ควรเป็น `FeatureCollection` ของเส้นถนน และอาจมี `speed_kph`, `congestion`, `level`, `status` หรือ `color` ใน properties

### Golden service-area QA

เปิด API ที่พอร์ต 5174 แล้วรัน:

```bash
npm run test:golden
```
