const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'data', 'processed', 'accessibility', 'bus-routes.geojson');

const routes = [
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.4981, 13.7432], // Memorial Bridge (สะพานพุทธ)
        [100.5028, 13.7445], // Worachak
        [100.5132, 13.7501], // Lan Luang
        [100.5292, 13.7525], // Phetchaburi Road
        [100.5348, 13.7569], // Phaya Thai
        [100.5372, 13.7649], // Victory Monument (อนุสาวรีย์ชัยฯ)
        [100.5447, 13.7797], // Ari
        [100.5496, 13.7893], // Saphan Khwai
        [100.5538, 13.8023], // Mo Chit
        [100.5613, 13.8129], // Ha Yaek Lat Phrao
        [100.5732, 13.8062], // Lat Phrao Road
        [100.6125, 13.7895], // Chok Chai 4
        [100.6438, 13.7654], // Bang Kapi (บางกะปิ)
        [100.6475, 13.7758]  // Happy Land (แฮปปี้แลนด์)
      ]
    },
    properties: {
      ref: 'สาย 8',
      name: 'แฮปปี้แลนด์ - สะพานพุทธ',
      color: '#ef4444', // Red bus
      type: 'Regular Bus'
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.5164, 13.7371], // Hua Lamphong (หัวลำโพง)
        [100.5292, 13.7317], // Sam Yan
        [100.5347, 13.7456], // Siam / MBK
        [100.5348, 13.7569], // Phaya Thai
        [100.5372, 13.7649], // Victory Monument
        [100.5447, 13.7797], // Ari
        [100.5496, 13.7893], // Saphan Khwai
        [100.5538, 13.8023], // Mo Chit
        [100.5613, 13.8129], // Ha Yaek Lat Phrao
        [100.5724, 13.8402], // Ratchayothin
        [100.5684, 13.8821], // Lak Si
        [100.6015, 13.9198], // Don Mueang (ดอนเมือง)
        [100.6135, 13.9852]  // Rangsit (รังสิต)
      ]
    },
    properties: {
      ref: 'สาย 29 (1-1)',
      name: 'หัวลำโพง - รังสิต',
      color: '#3b82f6', // Blue/Cream bus
      type: 'Air Conditioned Bus'
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.6046, 13.6678], // Bang Na (บางนา)
        [100.6011, 13.7056], // On Nut
        [100.5852, 13.7194], // Ekkamai
        [100.5778, 13.7252], // Thong Lo
        [100.5698, 13.7303], // Phrom Phong
        [100.5612, 13.7374], // Asok
        [100.5559, 13.7402], // Nana
        [100.5491, 13.7431], // Ploen Chit
        [100.5428, 13.7441], // Chit Lom
        [100.5347, 13.7456], // Siam
        [100.5292, 13.7525], // Phetchaburi Road
        [100.5132, 13.7562], // Lan Luang
        [100.5028, 13.7568], // Democracy Monument (อนุสาวรีย์ประชาธิปไตย)
        [100.4891, 13.7578], // Sanam Luang (สนามหลวง)
        [100.4789, 13.7562], // Pinklao Bridge
        [100.4589, 13.7825], // Taling Chan
        [100.3852, 13.7848]  // Southern Bus Terminal (สายใต้ใหม่)
      ]
    },
    properties: {
      ref: 'สาย 511',
      name: 'ปากน้ำ - สายใต้ใหม่',
      color: '#10b981', // Green eco-bus (TSB)
      type: 'Electric Air-Con Bus'
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.5538, 13.8045], // Mo Chit 2 Terminal (หมอชิต 2)
        [100.5613, 13.8129], // Ha Yaek Lat Phrao
        [100.5732, 13.8062], // Lat Phrao Road
        [100.6125, 13.7895], // Chok Chai 4
        [100.6438, 13.7654], // Bang Kapi
        [100.6482, 13.7402], // Lam Sali
        [100.6450, 13.6625]  // Si Iam / Srinakarin (ศรีเอี่ยม)
      ]
    },
    properties: {
      ref: 'สาย 145',
      name: 'อู่หมอชิต 2 - ปากน้ำ',
      color: '#ef4444',
      type: 'Regular Bus'
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.6046, 13.6678], // Bang Na
        [100.6011, 13.7056], // On Nut
        [100.5852, 13.7194], // Ekkamai
        [100.5778, 13.7252], // Thong Lo
        [100.5698, 13.7303], // Phrom Phong
        [100.5612, 13.7374], // Asok
        [100.5559, 13.7402], // Nana
        [100.5491, 13.7431], // Ploen Chit
        [100.5428, 13.7441], // Chit Lom
        [100.5347, 13.7456], // Siam
        [100.5292, 13.7317], // Sam Yan
        [100.5164, 13.7371], // Hua Lamphong
        [100.5025, 13.7421]  // Tha Ratchaworadit / Grand Palace (ท่าราชวรดิษฐ์)
      ]
    },
    properties: {
      ref: 'สาย 508',
      name: 'ปากน้ำ - ท่าราชวรดิษฐ์',
      color: '#f59e0b', // Yellow bus
      type: 'Air Conditioned Bus'
    }
  }
];

const geojson = {
  type: 'FeatureCollection',
  features: routes
};

console.log(`Writing bus routes to ${outputPath}...`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2), 'utf8');
console.log('Successfully generated bus routes GeoJSON!');
