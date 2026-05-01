import type { SocialSlide, Zone } from '../../../shared/types/slide';

export function updateZone(slides: SocialSlide[], slideIdx: number, zone: Zone): SocialSlide[] {
  return slides.map((s, i) =>
    i !== slideIdx ? s : { ...s, zones: s.zones.map((z) => (z.id === zone.id ? zone : z)) },
  );
}
