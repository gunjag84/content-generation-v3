import { describe, it, expect } from 'vitest';
import { resolvePhotoTransform, DEFAULT_PHOTO_TRANSFORM } from '../photoTransform';
import type { Zone } from '../../../../shared/types/slide';

// Minimal Zone factory
function zone(overrides: Partial<Zone> & { id: string }): Zone {
  return {
    type: 'text',
    text: '',
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    fontSize: 16,
    fontWeight: 400,
    fontFamily: 'sans-serif',
    color: '#000',
    lineHeight: 1.2,
    textAlign: 'left',
    overlayOpacity: 0,
    ...overrides,
  } as Zone;
}

const emptyBrand: Record<string, { rotation: number; scale: number; x?: number; y?: number }> = {};

describe('resolvePhotoTransform', () => {
  it('returns zone-level photoTransform when set (highest priority)', () => {
    const pt = { x: 20, y: 30, scale: 1.5, rotation: 45 };
    const z = zone({ id: 'z1', photoTransform: pt });
    const result = resolvePhotoTransform(z, emptyBrand, 'photo-1');
    expect(result).toEqual(pt);
  });

  it('zone photoTransform beats a matching brand entry', () => {
    const pt = { x: 10, y: 20, scale: 2, rotation: 0 };
    const z = zone({ id: 'z2', photoTransform: pt });
    const brand = { 'photo-1': { rotation: 90, scale: 3, x: 60, y: 70 } };
    expect(resolvePhotoTransform(z, brand, 'photo-1')).toEqual(pt);
  });

  it('returns brand-level transform when zone has no override', () => {
    const z = zone({ id: 'z3' }); // no photoTransform
    const brand = { 'photo-1': { rotation: 15, scale: 1.2, x: 60, y: 40 } };
    expect(resolvePhotoTransform(z, brand, 'photo-1')).toEqual({ x: 60, y: 40, scale: 1.2, rotation: 15 });
  });

  it('defaults x/y to 50 when brand entry omits them', () => {
    const z = zone({ id: 'z4' });
    const brand = { 'photo-1': { rotation: 10, scale: 1.5 } }; // no x, no y
    const result = resolvePhotoTransform(z, brand, 'photo-1');
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
    expect(result.scale).toBe(1.5);
    expect(result.rotation).toBe(10);
  });

  it('returns DEFAULT_PHOTO_TRANSFORM when zone has no override and brand has no entry', () => {
    const z = zone({ id: 'z5' });
    expect(resolvePhotoTransform(z, emptyBrand, 'photo-1')).toEqual(DEFAULT_PHOTO_TRANSFORM);
  });

  it('returns DEFAULT_PHOTO_TRANSFORM when photoId is undefined', () => {
    const z = zone({ id: 'z6' });
    expect(resolvePhotoTransform(z, emptyBrand, undefined)).toEqual(DEFAULT_PHOTO_TRANSFORM);
  });

  it('returns DEFAULT_PHOTO_TRANSFORM when zone is null', () => {
    expect(resolvePhotoTransform(null, emptyBrand, undefined)).toEqual(DEFAULT_PHOTO_TRANSFORM);
  });

  it('returns DEFAULT_PHOTO_TRANSFORM when zone is undefined', () => {
    expect(resolvePhotoTransform(undefined, emptyBrand, undefined)).toEqual(DEFAULT_PHOTO_TRANSFORM);
  });

  it('photoId missing from brand (brand non-empty, but different key) → default', () => {
    const z = zone({ id: 'z7' });
    const brand = { 'other-photo': { rotation: 0, scale: 2, x: 30, y: 70 } };
    expect(resolvePhotoTransform(z, brand, 'photo-99')).toEqual(DEFAULT_PHOTO_TRANSFORM);
  });

  it('default transform is a copy, not the shared constant (mutation safety)', () => {
    const z = zone({ id: 'z8' });
    const result = resolvePhotoTransform(z, emptyBrand, undefined);
    result.x = 99;
    expect(DEFAULT_PHOTO_TRANSFORM.x).toBe(50); // constant unchanged
  });
});
