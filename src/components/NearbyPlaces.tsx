import { Building2, ChevronRight, MapPin, Navigation } from 'lucide-react';
import type { NearbyPlace } from '../types/nearby';

interface NearbyPlacesProps {
  places: NearbyPlace[];
  loading: boolean;
  onSelect: (place: NearbyPlace) => void;
}

const DISPLAY_LIMIT = 20;

function distanceLabel(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000).toLocaleString()} ม.`;
  return `${distanceKm.toFixed(2)} กม.`;
}

export function NearbyPlaces({ places, loading, onSelect }: NearbyPlacesProps) {
  const categoryCounts = Array.from(
    places.reduce((counts, place) => {
      const current = counts.get(place.category) ?? {
        category: place.category,
        name: place.categoryName,
        emoji: place.emoji,
        color: place.color,
        count: 0,
      };
      current.count += 1;
      counts.set(place.category, current);
      return counts;
    }, new Map<string, { category: string; name: string; emoji: string; color: string; count: number }>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count);

  return (
    <section className="nearby-places">
      <div className="nearby-places-head">
        <div>
          <span>สถานที่ที่เดินทางไปถึงได้</span>
          <h2><Building2 size={17} /> สถานที่สำคัญในพื้นที่</h2>
        </div>
        <strong>{places.length.toLocaleString()} แห่ง</strong>
      </div>

      <p className="nearby-method-note">
        แสดงเฉพาะสถานที่ภายในพื้นที่ที่คำนวณได้ · เรียงจากใกล้ไปไกล
      </p>

      {loading ? (
        <div className="nearby-loading"><span /> กำลังตรวจสอบสถานที่ทุกหมวดบริการ...</div>
      ) : places.length ? (
        <>
          <div className="nearby-category-summary">
            {categoryCounts.slice(0, 6).map((category) => (
              <div key={category.category} title={category.name}>
                <i style={{ background: category.color }} />
                <span>{category.emoji} {category.name}</span>
                <strong>{category.count}</strong>
              </div>
            ))}
          </div>

          <div className="nearby-place-list">
            {places.slice(0, DISPLAY_LIMIT).map((place) => (
              <button key={place.id} type="button" onClick={() => onSelect(place)}>
                <span className="nearby-place-icon" style={{ '--place-color': place.color } as React.CSSProperties}>{place.emoji}</span>
                <span className="nearby-place-name">
                  <strong>{place.name}</strong>
                  <small><MapPin size={11} /> เขต{place.district || 'ไม่ระบุ'} · {place.categoryName}</small>
                </span>
                <span className="nearby-place-distance"><Navigation size={11} />{distanceLabel(place.distanceKm)}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>

          {places.length > DISPLAY_LIMIT && (
            <p className="nearby-overflow-note">แสดง {DISPLAY_LIMIT} แห่งที่ใกล้ที่สุด จากทั้งหมด {places.length.toLocaleString()} แห่ง</p>
          )}
        </>
      ) : (
        <div className="nearby-empty">
          <MapPin size={20} />
          <span>ไม่พบสถานที่บริการจากชุดข้อมูลปัจจุบันภายในขอบเขตนี้</span>
        </div>
      )}
    </section>
  );
}
