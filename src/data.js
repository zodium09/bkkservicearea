// Real GIS data representing the entire Bangkok Metropolitan Area (กทม.)
// Coordinate Reference System: WGS 84 (EPSG:4326) - [Longitude, Latitude]

export const MAP_CENTER = [13.7456, 100.5347]; // Siam (Bangkok Center)
export const MAP_BOUNDS = [
  [13.630, 100.400], // South-West corner of Bangkok
  [13.950, 100.800]  // North-East corner of Bangkok
];

// 1. Real Transit Stations in Bangkok (BTS, MRT, ARL, SRT)
export const transitData = {
  type: "FeatureCollection",
  features: [
    // BTS Sukhumvit Line
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5347, 13.7456] }, properties: { id: "t_siam", name: "BTS สยาม (Siam)", type: "BTS", lines: ["Sukhumvit Line", "Silom Line"], passengersDaily: 110000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5348, 13.7569] }, properties: { id: "t_pht", name: "BTS พญาไท (Phaya Thai)", type: "BTS/ARL", lines: ["Sukhumvit Line", "Airport Rail Link"], passengersDaily: 55000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5372, 13.7649] }, properties: { id: "t_vic", name: "BTS อนุสาวรีย์ชัยฯ (Victory Monument)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 68000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5447, 13.7797] }, properties: { id: "t_ari", name: "BTS อารีย์ (Ari)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 35000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5496, 13.7893] }, properties: { id: "t_spk", name: "BTS สะพานควาย (Saphan Khwai)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 22000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5538, 13.8023] }, properties: { id: "t_mct", name: "BTS หมอชิต / MRT จตุจักร (Mo Chit / Chatuchak)", type: "BTS/MRT", lines: ["Sukhumvit Line", "Blue Line"], passengersDaily: 85000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5613, 13.8129] }, properties: { id: "t_hyl", name: "BTS ห้าแยกลาดพร้าว / MRT พหลโยธิน", type: "BTS/MRT", lines: ["Sukhumvit Line", "Blue Line"], passengersDaily: 75000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5428, 13.7441] }, properties: { id: "t_clm", name: "BTS ชิดลม (Chit Lom)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 48000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5491, 13.7431] }, properties: { id: "t_plc", name: "BTS เพลินจิต (Phloen Chit)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 31000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5559, 13.7402] }, properties: { id: "t_nan", name: "BTS นานา (Nana)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 33000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5612, 13.7374] }, properties: { id: "t_ask", name: "BTS อโศก / MRT สุขุมวิท (Asok / Sukhumvit)", type: "BTS/MRT", lines: ["Sukhumvit Line", "Blue Line"], passengersDaily: 98000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5698, 13.7303] }, properties: { id: "t_ppg", name: "BTS พร้อมพงษ์ (Phrom Phong)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 44000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5778, 13.7252] }, properties: { id: "t_tnl", name: "BTS ทองหล่อ (Thong Lo)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 38000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5852, 13.7194] }, properties: { id: "t_ekm", name: "BTS เอกมัย (Ekkamai)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 32000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6011, 13.7056] }, properties: { id: "t_onut", name: "BTS อ่อนนุช (On Nut)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 52000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6046, 13.6678] }, properties: { id: "t_bna", name: "BTS บางนา (Bang Na)", type: "BTS", lines: ["Sukhumvit Line"], passengersDaily: 19000 } },

    // BTS Silom Line
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5383, 13.7293] }, properties: { id: "t_slm", name: "BTS ศาลาแดง / MRT สีลม (Sala Daeng / Silom)", type: "BTS/MRT", lines: ["Silom Line", "Blue Line"], passengersDaily: 70000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5292, 13.7317] }, properties: { id: "t_sym", name: "MRT สามย่าน (Sam Yan)", type: "MRT", lines: ["Blue Line"], passengersDaily: 34000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5164, 13.7371] }, properties: { id: "t_hlp", name: "MRT หัวลำโพง (Hua Lamphong)", type: "MRT", lines: ["Blue Line"], passengersDaily: 28000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5176, 13.7188] }, properties: { id: "t_spt", name: "BTS สะพานตากสิน (Saphan Taksin)", type: "BTS", lines: ["Silom Line"], passengersDaily: 42000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5042, 13.7208] }, properties: { id: "t_ktb", name: "BTS กรุงธนบุรี (Krung Thon Buri)", type: "BTS", lines: ["Silom Line", "Gold Line"], passengersDaily: 21000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.4939, 13.7207] }, properties: { id: "t_wwy", name: "BTS วงเวียนใหญ่ (Wongwian Yai)", type: "BTS", lines: ["Silom Line"], passengersDaily: 36000 } },

    // MRT Blue Line (Ratchada Corridor)
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5475, 13.7254] }, properties: { id: "t_lpn", name: "MRT ลุมพินี (Lumphini)", type: "MRT", lines: ["Blue Line"], passengersDaily: 24000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5539, 13.7228] }, properties: { id: "t_kty", name: "MRT คลองเตย (Khlong Toei)", type: "MRT", lines: ["Blue Line"], passengersDaily: 14000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5599, 13.7238] }, properties: { id: "t_qsn", name: "MRT ศูนย์ฯ สิริกิติ์ (QSNCC)", type: "MRT", lines: ["Blue Line"], passengersDaily: 18000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5633, 13.7489] }, properties: { id: "t_pet", name: "MRT เพชรบุรี / ARL มักกะสัน (Phetchaburi / Makkasan)", type: "MRT/ARL", lines: ["Blue Line", "Airport Rail Link"], passengersDaily: 46000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5646, 13.7571] }, properties: { id: "t_pr9", name: "MRT พระราม 9 (Phra Ram 9)", type: "MRT", lines: ["Blue Line"], passengersDaily: 54000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5702, 13.7659] }, properties: { id: "t_tcc", name: "MRT ศูนย์วัฒนธรรมฯ (Thailand Cultural Centre)", type: "MRT", lines: ["Blue Line", "Orange Line"], passengersDaily: 38000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5739, 13.7785] }, properties: { id: "t_hwk", name: "MRT ห้วยขวาง (Huai Khwang)", type: "MRT", lines: ["Blue Line"], passengersDaily: 39000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5741, 13.7898] }, properties: { id: "t_sts", name: "MRT สุทธิสาร (Sutthisan)", type: "MRT", lines: ["Blue Line"], passengersDaily: 28000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5746, 13.8001] }, properties: { id: "t_rcd", name: "MRT รัชดาภิเษก (Ratchadaphisek)", type: "MRT", lines: ["Blue Line"], passengersDaily: 11000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5732, 13.8062] }, properties: { id: "t_ltp", name: "MRT ลาดพร้าว (Lat Phrao)", type: "MRT", lines: ["Blue Line", "Yellow Line"], passengersDaily: 41000 } },
    
    // Northern / Western Interchanges
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5401, 13.8037] }, properties: { id: "t_kta", name: "SRT/MRT สถานีกลางกรุงเทพอภิวัฒน์ (Krung Thep Aphiwat)", type: "SRT/MRT", lines: ["Blue Line", "Red Line", "Long Distance"], passengersDaily: 60000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5308, 13.8059] }, properties: { id: "t_tpn", name: "MRT เตาปูน (Tao Poon)", type: "MRT", lines: ["Blue Line", "Purple Line"], passengersDaily: 42000 } },

    // Outer Districts Rail
    { type: "Feature", geometry: { type: "Point", coordinates: [100.7753, 13.7275] }, properties: { id: "t_lkb", name: "ARL ลาดกระบัง (Lat Krabang)", type: "ARL", lines: ["Airport Rail Link"], passengersDaily: 12000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.7220, 13.8130] }, properties: { id: "t_mnb", name: "MRT มีนบุรี (Min Buri)", type: "MRT", lines: ["Pink Line"], passengersDaily: 15000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5975, 13.8824] }, properties: { id: "t_lks", name: "MRT หลักสี่ (Lak Si)", type: "MRT/SRT", lines: ["Pink Line", "Red Line"], passengersDaily: 18000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6015, 13.9198] }, properties: { id: "t_dmg", name: "SRT ดอนเมือง (Don Mueang)", type: "SRT", lines: ["Red Line"], passengersDaily: 14000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6438, 13.7654] }, properties: { id: "t_bkp", name: "MRT บางกะปิ (Bang Kapi)", type: "MRT", lines: ["Yellow Line"], passengersDaily: 25000 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6450, 13.6625] }, properties: { id: "t_sim", name: "MRT ศรีเอี่ยม (Si Iam)", type: "MRT", lines: ["Yellow Line"], passengersDaily: 16000 } }
  ]
};

// 2. Real Public Parks in Bangkok (BMA Green Spaces)
export const parkData = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5411, 13.7302] }, properties: { id: "p_lpn", name: "สวนลุมพินี (Lumpini Park)", areaRai: 360, type: "District Park", facilities: ["Boating Lake", "Jogging Track", "Indoor Gym"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5592, 13.7285] }, properties: { id: "p_bjk", name: "สวนเบญจกิติ (Benjakitti Park)", areaRai: 450, type: "Urban Forest Park", facilities: ["Skywalk", "Retention Wetland", "Bicycle Lane"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5538, 13.8045] }, properties: { id: "p_ctc", name: "สวนจตุจักร (Chatuchak Park)", areaRai: 190, type: "District Park", facilities: ["Jogging Track", "Pond", "Train Access"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5540, 13.8132] }, properties: { id: "p_srf", name: "สวนวชิรเบญจทัศ / สวนรถไฟ (Wachirabenchathat Park)", areaRai: 375, type: "Regional Park", facilities: ["Butterfly Garden", "Bicycle Renting", "Golf Course"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5492, 13.8085] }, properties: { id: "p_srk", name: "สวนสมเด็จพระนางเจ้าสิริกิติ์ฯ", areaRai: 140, type: "Botanical Garden", facilities: ["Lotus Pond", "Medicinal Plants Collection"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6631, 13.6872] }, properties: { id: "p_sl9", name: "สวนหลวง ร.9 (Suan Luang Rama IX)", areaRai: 500, type: "Botanical/Regional Park", facilities: ["Chinese Garden", "King Dome Exhibit", "Water Sports"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5030, 13.7485] }, properties: { id: "p_rmn", name: "สวนรมณียนาถ (Rommaninat Park)", areaRai: 29, type: "Neighborhood Park", facilities: ["Outdoor Exercise", "Historical Prison Museum"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.4947, 13.7495] }, properties: { id: "p_srm", name: "สวนสราญรมย์ (Saranrom Park)", areaRai: 23, type: "Historical Park", facilities: ["Orangery", "Royal Monument", "Jogging"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5422, 13.7595] }, properties: { id: "p_stp", name: "สวนสันติภาพ (Santiphap Park)", areaRai: 20, type: "Neighborhood Park", facilities: ["Music Pavilion", "Pond", "Jogging"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5262, 13.7397] }, properties: { id: "p_cu100", name: "อุทยาน 100 ปี จุฬาฯ (Chulalongkorn Centenary Park)", areaRai: 28, type: "Pocket Park", facilities: ["Rain Garden", "Underground Water Retention"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5402, 13.7482] }, properties: { id: "p_ptw", name: "สวนปทุมวนานุรักษ์ (Pathumwananurak Park)", areaRai: 40, type: "Urban Park", facilities: ["Retention Pond", "Amphitheater"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5675, 13.7305] }, properties: { id: "p_bjs", name: "สวนเบญจสิริ (Benjasiri Park)", areaRai: 29, type: "Neighborhood Park", facilities: ["Sculptures", "Basketball Court", "Skate Park"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6720, 13.7845] }, properties: { id: "p_stt", name: "สวนเสรีไทย (Seri Thai Park)", areaRai: 350, type: "Water Reservoir Park", facilities: ["Library", "Pond", "Jogging"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.7745, 13.8210] }, properties: { id: "p_wrp", name: "สวนวารีภิรมย์ (Wareephirom Park)", areaRai: 120, type: "Suburban Park", facilities: ["Bicycle Circuit", "Pond"] } }
  ]
};

// 3. Real Major Hospitals in Bangkok (Public & Private)
export const healthData = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [100.4859, 13.7554] }, properties: { id: "h_siriraj", name: "โรงพยาบาลศิริราช (Siriraj Hospital)", type: "Tertiary", beds: 2000, spec: "General/Medical School", ownership: "Public (Mahidol)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5370, 13.7320] }, properties: { id: "h_chula", name: "โรงพยาบาลจุฬาลงกรณ์ (Chulalongkorn Hospital)", type: "Tertiary", beds: 1500, spec: "General/Red Cross", ownership: "Public (Chula)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5273, 13.7663] }, properties: { id: "h_rama", name: "โรงพยาบาลรามาธิบดี (Ramathibodi Hospital)", type: "Tertiary", beds: 1300, spec: "General/Medical School", ownership: "Public (Mahidol)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5350, 13.7650] }, properties: { id: "h_rjv", name: "โรงพยาบาลราชวิถี (Rajavithi Hospital)", type: "Tertiary", beds: 1200, spec: "General/Trauma Center", ownership: "Public (MOPH)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5320, 13.7665] }, properties: { id: "h_pmk", name: "โรงพยาบาลพระมงกุฎเกล้า (Phramongkutklao Hospital)", type: "Tertiary", beds: 1400, spec: "Military/General", ownership: "Public (Royal Thai Army)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5365, 13.7445] }, properties: { id: "h_police", name: "โรงพยาบาลตำรวจ (Police General Hospital)", type: "Tertiary", beds: 800, spec: "General/Forensics", ownership: "Public (RTP)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5532, 13.7460] }, properties: { id: "h_bumrung", name: "โรงพยาบาลบำรุงราษฎร์ (Bumrungrad Hospital)", type: "Tertiary", beds: 580, spec: "General/JCI Accredited", ownership: "Private" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5755, 13.7325] }, properties: { id: "h_samitivej", name: "โรงพยาบาลสมิติเวช สุขุมวิท (Samitivej Hospital)", type: "Tertiary", beds: 400, spec: "Pediatrics/General", ownership: "Private" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5828, 13.7483] }, properties: { id: "h_bgh", name: "โรงพยาบาลกรุงเทพ (Bangkok Hospital)", type: "Tertiary", beds: 500, spec: "Cardiology/Oncology", ownership: "Private" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5085, 13.7745] }, properties: { id: "h_vjr", name: "โรงพยาบาลวชิรพยาบาล (Vajira Hospital)", type: "Tertiary", beds: 900, spec: "General/Medical School", ownership: "Public (BMA)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5192, 13.7228] }, properties: { id: "h_lds", name: "โรงพยาบาลเลิดสิน (Lerdsin Hospital)", type: "Tertiary", beds: 600, spec: "Orthopedics/General", ownership: "Public (MOPH)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5090, 13.7295] }, properties: { id: "h_tks", name: "โรงพยาบาลตากสิน (Taksin Hospital)", type: "Tertiary", beds: 500, spec: "General Practice", ownership: "Public (BMA)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6865, 13.8185] }, properties: { id: "h_npr", name: "โรงพยาบาลนพรัตนราชธานี (Nopparat Hospital)", type: "Tertiary", beds: 800, spec: "Occupational Medicine/General", ownership: "Public (MOPH)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5078, 13.7465] }, properties: { id: "h_klg", name: "โรงพยาบาลกลาง (Klang Hospital)", type: "Tertiary", beds: 600, spec: "General Practice", ownership: "Public (BMA)" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.4935, 13.6980] }, properties: { id: "h_cjp", name: "โรงพยาบาลเจริญกรุงประชารักษ์", type: "Tertiary", beds: 700, spec: "OBGYN/General", ownership: "Public (BMA)" } }
  ]
};

// 4. Real Fire Stations in Bangkok (BMA Disaster Prevention & Mitigation)
export const safetyData = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5298, 13.7592] }, properties: { id: "s_pyt", name: "สถานีดับเพลิงพญาไท (Phaya Thai Fire Station)", fireTrucks: 8, personnel: 45 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5240, 13.7420] }, properties: { id: "s_btt", name: "สถานีดับเพลิงบรรทัดทอง (Ban That Thong Fire Station)", fireTrucks: 5, personnel: 30 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5180, 13.7740] }, properties: { id: "s_sms", name: "สถานีดับเพลิงสามเสน (Samsen Fire Station)", fireTrucks: 6, personnel: 35 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5600, 13.7680] }, properties: { id: "s_hwk", name: "สถานีดับเพลิงห้วยขวาง (Huai Khwang Fire Station)", fireTrucks: 7, personnel: 40 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5630, 13.7125] }, properties: { id: "s_kt", name: "สถานีดับเพลิงคลองเตย (Klong Toey Fire Station)", fireTrucks: 9, personnel: 48 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5165, 13.7245] }, properties: { id: "s_br", name: "สถานีดับเพลิงบางรัก (Bang Rak Fire Station)", fireTrucks: 5, personnel: 28 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5312, 13.7025] }, properties: { id: "s_ynw", name: "สถานีดับเพลิงยานนาวา (Yannawa Fire Station)", fireTrucks: 6, personnel: 32 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.7712, 13.7235] }, properties: { id: "s_lkb", name: "สถานีดับเพลิงลาดกระบัง (Lat Krabang Fire Station)", fireTrucks: 6, personnel: 34 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.6120, 13.6745] }, properties: { id: "s_bn", name: "สถานีดับเพลิงบางนา (Bang Na Fire Station)", fireTrucks: 5, personnel: 30 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.4855, 13.7295] }, properties: { id: "s_tb", name: "สถานีดับเพลิงธนบุรี (Thonburi Fire Station)", fireTrucks: 8, personnel: 42 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.7180, 13.8185] }, properties: { id: "s_mb", name: "สถานีดับเพลิงมีนบุรี (Min Buri Fire Station)", fireTrucks: 7, personnel: 38 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [100.5980, 13.9165] }, properties: { id: "s_dm", name: "สถานีดับเพลิงดอนเมือง (Don Mueang Fire Station)", fireTrucks: 6, personnel: 32 } }
  ]
};

// 5. Real Flood Hazard Hotspots in Bangkok (Polygons)
export const floodZonesData = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [100.5580, 13.7250],
          [100.5880, 13.7200],
          [100.5920, 13.7450],
          [100.5550, 13.7420],
          [100.5580, 13.7250]
        ]]
      },
      properties: { id: "f_skv", name: "เขตพื้นที่น้ำท่วมขัง ถนนสุขุมวิท (อโศก-เอกมัย)", riskLevel: "High", avgFloodDepthCm: 35, drainTimeMins: 180 }
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [100.5650, 13.7900],
          [100.5850, 13.7900],
          [100.5850, 13.8200],
          [100.5620, 13.8180],
          [100.5650, 13.7900]
        ]]
      },
      properties: { id: "f_rcd", name: "เขตพื้นที่น้ำท่วมขัง ถนนรัชดาภิเษก-ลาดพร้าว", riskLevel: "High", avgFloodDepthCm: 40, drainTimeMins: 150 }
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [100.5420, 13.7650],
          [100.5580, 13.7620],
          [100.5620, 13.7820],
          [100.5440, 13.7800],
          [100.5420, 13.7650]
        ]]
      },
      properties: { id: "f_ddg", name: "เขตพื้นที่น้ำท่วมขัง ดินแดง-วิภาวดีรังสิต", riskLevel: "Moderate", avgFloodDepthCm: 25, drainTimeMins: 90 }
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [100.5360, 13.7510],
          [100.5480, 13.7520],
          [100.5490, 13.7580],
          [100.5350, 13.7585],
          [100.5360, 13.7510]
        ]]
      },
      properties: { id: "f_prn", name: "เขตพื้นที่น้ำท่วมขัง ศรีอยุธยา-ราชปรารภ (ประตูน้ำ)", riskLevel: "High", avgFloodDepthCm: 30, drainTimeMins: 120 }
    }
  ]
};

// 6. Real Road Network (LineStrings)
// Since we use OSRM routing API, we don't need a heavy static road dataset.
// Instead, we will store a simplified "Avenue Backbone" grid representing the main transit lines
// so that the map starts with a nice-looking baseline road grid representing Bangkok's layout.
export const roadNetworkData = {
  type: "FeatureCollection",
  features: [
    // Phaholyothin - Phaya Thai backbone (Mo Chit -> Siam -> Sam Yan)
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [100.5538, 13.8023], // Mo Chit
          [100.5496, 13.7893], // Saphan Khwai
          [100.5447, 13.7797], // Ari
          [100.5372, 13.7649], // Victory Monument
          [100.5348, 13.7569], // Phaya Thai
          [100.5347, 13.7456], // Siam
          [100.5292, 13.7317]  // Sam Yan
        ]
      },
      properties: { id: "br_pht", name: "ถนนพหลโยธิน - ถนนพญาไท", type: "Backbone", speedLimitKmh: 50 }
    },
    // Sukhumvit backbone (Siam -> Asok -> Bang Na)
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [100.5347, 13.7456], // Siam
          [100.5428, 13.7441], // Chit Lom
          [100.5491, 13.7431], // Ploen Chit
          [100.5559, 13.7402], // Nana
          [100.5612, 13.7374], // Asok
          [100.5698, 13.7303], // Phrom Phong
          [100.5778, 13.7252], // Thong Lo
          [100.5852, 13.7194], // Ekkamai
          [100.6011, 13.7056], // On Nut
          [100.6046, 13.6678]  // Bang Na
        ]
      },
      properties: { id: "br_skv", name: "ถนนสุขุมวิท", type: "Backbone", speedLimitKmh: 60 }
    },
    // Rama IV backbone (Sam Yan -> Silom -> Khlong Toei -> Sukhumvit)
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [100.5164, 13.7371], // Hua Lamphong
          [100.5292, 13.7317], // Sam Yan
          [100.5383, 13.7293], // Silom
          [100.5475, 13.7254], // Lumphini
          [100.5539, 13.7228], // Khlong Toei
          [100.5599, 13.7238], // QSNCC
          [100.5612, 13.7374]  // Asok (link)
        ]
      },
      properties: { id: "br_rm4", name: "ถนนพระราม 4", type: "Backbone", speedLimitKmh: 60 }
    },
    // Ratchadapisek Backbone (Asok -> Rama 9 -> Lat Phrao)
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [100.5612, 13.7374], // Asok
          [100.5633, 13.7489], // Phetchaburi
          [100.5646, 13.7571], // Phra Ram 9
          [100.5702, 13.7659], // Cultural Centre
          [100.5739, 13.7785], // Huai Khwang
          [100.5741, 13.7898], // Sutthisan
          [100.5746, 13.8001], // Ratchadapisek
          [100.5732, 13.8062], // Lat Phrao
          [100.5613, 13.8129]  // Ha Yaek Lat Phrao
        ]
      },
      properties: { id: "br_rcd", name: "ถนนรัชดาภิเษก", type: "Backbone", speedLimitKmh: 60 }
    }
  ]
};

// Generates population grid points dynamically across Bangkok Metropolitan Area
export function generatePopulationGrid() {
  const features = [];
  const startLng = 100.460;
  const endLng = 100.740;
  const startLat = 13.660;
  const endLat = 13.910;
  
  // Grid resolution (10 columns, 10 rows covering Bangkok)
  const stepsLng = 12;
  const stepsLat = 12;
  const dLng = (endLng - startLng) / stepsLng;
  const dLat = (endLat - startLat) / stepsLat;
  
  let id = 1;
  for (let i = 0; i <= stepsLng; i++) {
    for (let j = 0; j <= stepsLat; j++) {
      const lng = startLng + i * dLng;
      const lat = startLat + j * dLat;
      
      // Density multipliers around Siam (center) and Mo Chit (north)
      const distToSiam = Math.sqrt(Math.pow(lng - 100.5347, 2) + Math.pow(lat - 13.7456, 2));
      const distToMoChit = Math.sqrt(Math.pow(lng - 100.5538, 2) + Math.pow(lat - 13.8023, 2));
      const minDist = Math.min(distToSiam, distToMoChit);
      
      let density = Math.round(1200 + 8800 * Math.exp(-minDist * 18));
      density += Math.round((Math.random() - 0.5) * 400);
      density = Math.max(800, density);
      
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { id: `pop_bkk_${id++}`, population: density }
      });
    }
  }
  
  return {
    type: "FeatureCollection",
    features: features
  };
}

export const populationGridData = generatePopulationGrid();
