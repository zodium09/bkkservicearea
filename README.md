# Bangkok Service Area Analysis

เว็บแอป GIS สำหรับวิเคราะห์พื้นที่บริการในกรุงเทพมหานคร โดยใช้ BMA CityMap basemap:

`https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer`

## Analysis model

Service area analysis ในโปรเจกต์นี้หมายถึงการวิเคราะห์ระยะเข้าถึงตามโครงข่ายถนน ไม่ใช่การวาด buffer วงกลมรอบจุดบริการ ระยะที่ผู้ใช้เลือกจะถูกใช้เป็น cost/distance limit บน road network แล้วคำนวณพื้นที่ที่เข้าถึงได้จากเส้นทางถนนจริง

แนวทางนี้ทำให้ผลลัพธ์สะท้อนข้อจำกัดของถนน สะพาน ทางตัน และรูปแบบโครงข่ายเมือง มากกว่ารัศมีทางอากาศแบบวงกลม ดังนั้น polygon ที่ได้อาจไม่สมมาตร และอาจไม่ครอบคลุมพื้นที่ที่อยู่ใกล้ในเชิงระยะตรงแต่เข้าถึงไม่ได้ตามถนน

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

เปิดเว็บที่ `http://127.0.0.1:5173`

Express API จะรันที่ `http://127.0.0.1:5174` ตามค่าเริ่มต้น และ Vite dev server จะ proxy request จากหน้าเว็บไปยัง API ภายในโปรเจกต์

## Features

- แสดงแผนที่ฐานจาก ArcGIS REST service ของกรุงเทพมหานครผ่าน proxy ภายใน
- เพิ่มจุดบริการด้วยการคลิกบนแผนที่
- ปรับระยะเข้าถึงและสร้าง service area จาก network analysis บนโครงข่ายถนน
- วิเคราะห์เขตที่ intersect กับพื้นที่บริการจาก layer เขตการปกครอง
- ตรวจสถานะ `qgis_process` เพื่อใช้ QGIS Processing เป็น native network-analysis engine เมื่อพร้อมใช้งาน
- ใช้ JS fallback network engine เมื่อยังไม่มี QGIS หรือยังไม่สามารถเรียก `qgis_process` ได้
- ส่งออกผลเป็น GeoJSON

## Network analysis engines

### QGIS/qgis_process hook

โปรเจกต์มี hook สำหรับตรวจและเรียกใช้ `qgis_process` ผ่าน API `/api/qgis/status` และ `/api/analyze` เพื่อเปิดทางให้ใช้ QGIS Processing algorithms สำหรับงาน network analysis เช่น shortest path, service area, หรือ reachable area บน road layer

ถ้าติดตั้ง QGIS แล้วแต่ระบบหา `qgis_process` ไม่เจอ ให้ตั้ง environment variable:


```powershell
$env:QGIS_PROCESS="C:\Program Files\QGIS 3.40.0\bin\qgis_process-qgis.bat"
npm.cmd run dev
```

เมื่อตรวจพบ QGIS แล้ว response จาก `/api/analyze` จะระบุ engine ที่พร้อมใช้งานและสามารถต่อยอดไปใช้ processing pipeline ของ QGIS ได้ โดยยังคงส่งผลลัพธ์กลับเป็น GeoJSON ให้ frontend แสดงบน Leaflet

### JS fallback network engine

หากไม่มี QGIS หรือ `qgis_process` ไม่พร้อมใช้งาน ระบบจะใช้ JS fallback network engine แทน โดยโหลด features ของถนนจาก ArcGIS REST, สร้างกราฟจาก geometry ของเส้นถนน, snap จุดบริการเข้ากับโหนดหรือ segment ที่ใกล้ที่สุด, แล้วคำนวณ reachable network ตามระยะทางที่กำหนด

fallback นี้มีไว้เพื่อให้พัฒนาและทดสอบได้โดยไม่ต้องติดตั้ง QGIS แต่ยังยึดหลัก network analysis จากโครงข่ายถนนเหมือนกัน ไม่ควรตีความผลลัพธ์เป็น circular buffer

## ArcGIS REST road loading limitations

การโหลดถนนจาก ArcGIS REST มีข้อจำกัดที่ต้องระวัง:

- service อาจจำกัดจำนวน feature ต่อ request จึงอาจต้องแบ่ง extent, pagination, หรือ query ซ้ำหลายรอบ
- layer ถนนบางชุดอาจไม่ได้เปิด `query` หรือไม่ได้ส่ง geometry ครบถ้วนในรูปแบบที่ต้องใช้สร้าง network graph
- geometry จาก REST อาจขาด topology ที่จำเป็น เช่น จุดตัดถนนที่ไม่ได้ถูก split เป็นโหนดเดียวกัน ต้องมีขั้นตอน clean/snap ก่อนวิเคราะห์
- เครือข่ายถนนที่โหลดแบบ live มีโอกาสช้า ล้มเหลว หรือได้ข้อมูลไม่ครบจาก timeout/rate limit ของ upstream service
- หากโหลด road network ไม่สำเร็จ ผล service area ควรแสดงสถานะข้อจำกัดให้ผู้ใช้ทราบ แทนการสื่อว่าเป็นพื้นที่เข้าถึงจริงจากถนน
