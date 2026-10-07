import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { PlaceRepository } from '../repositories/placeRepository';
import { PincodeRepository } from '../repositories/pincodeRepository';
import { InstitutionRepository } from '../repositories/institutionRepository';
import { SAMPLE_STATES, SAMPLE_SETTLEMENTS, SAMPLE_PINCODES } from './indianLocations';
import { SAMPLE_INSTITUTIONS } from './indianInstitutions';

export const DEFAULT_INTERESTS = [
  // The picture tiles on the Interests screen, in the order shown there.
  { name: 'Travel', category: 'Lifestyle', icon: 'Plane' },
  { name: 'Food', category: 'Lifestyle', icon: 'Utensils' },
  { name: 'Movies', category: 'Cinema', icon: 'Film' },
  { name: 'Music', category: 'Music', icon: 'Music' },
  { name: 'Fitness', category: 'Health', icon: 'Dumbbell' },
  { name: 'Reading', category: 'Culture', icon: 'BookOpen' },
  { name: 'Photography', category: 'Arts', icon: 'Camera' },
  { name: 'Pets', category: 'Lifestyle', icon: 'PawPrint' },
  { name: 'Nature', category: 'Outdoors', icon: 'Mountain' },
  { name: 'Tech', category: 'Tech', icon: 'Laptop' },
  { name: 'Art', category: 'Arts', icon: 'Palette' },
  { name: 'Gaming', category: 'Gaming', icon: 'Gamepad2' },
  { name: 'Cooking', category: 'Lifestyle', icon: 'CookingPot' },
  { name: 'Adventures', category: 'Outdoors', icon: 'Compass' },
  { name: 'Coffee', category: 'Lifestyle', icon: 'Coffee' },
  { name: 'Shopping', category: 'Lifestyle', icon: 'ShoppingBag' },
  { name: 'Sports', category: 'Health', icon: 'Trophy' },
  { name: 'Spirituality', category: 'Mind', icon: 'Sun' },
  { name: 'Fashion', category: 'Lifestyle', icon: 'Shirt' },
  { name: 'Dance', category: 'Music', icon: 'Music' },
  { name: 'Anime', category: 'Culture', icon: 'Tv' },
  { name: 'Cars', category: 'Lifestyle', icon: 'Car' },
  { name: 'DIY', category: 'Arts', icon: 'Wrench' },
];

export async function seedInterests() {
  const db = getDatabase();
  for (const item of DEFAULT_INTERESTS) {
    const existing = await db.get('SELECT id FROM interests WHERE name = $1', [item.name]);
    if (!existing) {
      const id = crypto.randomUUID();
      await db.run(
        'INSERT INTO interests (id, name, category, icon) VALUES ($1, $2, $3, $4)',
        [id, item.name, item.category, item.icon]
      );
    }
  }
}

/**
 * Loads the bundled sample of states, districts, settlements, PIN codes and institutions.
 * Idempotent: it matches existing rows (including ones from a full LGD/AISHE import) instead of
 * duplicating them, so it is safe to run on every start.
 */
export async function seedReferenceData() {
  await getDatabase().transaction(async (tx) => {
    const stateIds = new Map<number, string>();
    for (const state of SAMPLE_STATES) {
      stateIds.set(
        state.lgd,
        await PlaceRepository.ensure(tx, {
          kind: 'state',
          name: state.name,
          parentId: null,
          stateId: null,
          districtId: null,
          lgdCode: state.lgd,
        })
      );
    }

    const districtIds = new Map<string, string>();
    const districtId = async (stateCode: number, name: string, lat: number, lng: number) => {
      const key = `${stateCode}:${name}`;
      let id = districtIds.get(key);
      if (!id) {
        const stateId = stateIds.get(stateCode)!;
        id = await PlaceRepository.ensure(tx, {
          kind: 'district',
          name,
          parentId: stateId,
          stateId,
          districtId: null,
          latitude: lat,
          longitude: lng,
        });
        districtIds.set(key, id);
      }
      return id;
    };

    for (const s of SAMPLE_SETTLEMENTS) {
      const stateId = stateIds.get(s.state)!;
      const district = await districtId(s.state, s.district, s.lat, s.lng);
      const parentId = s.subdistrict
        ? await PlaceRepository.ensure(tx, {
            kind: 'subdistrict',
            name: s.subdistrict,
            parentId: district,
            stateId,
            districtId: district,
          })
        : district;
      await PlaceRepository.ensure(tx, {
        kind: s.kind,
        name: s.name,
        parentId,
        stateId,
        districtId: district,
        latitude: s.lat,
        longitude: s.lng,
      });
    }

    for (const pin of SAMPLE_PINCODES) {
      await PincodeRepository.upsert(tx, {
        pincode: pin.pincode,
        areaName: pin.area,
        districtId: await districtId(pin.state, pin.district, pin.lat, pin.lng),
        stateId: stateIds.get(pin.state)!,
        latitude: pin.lat,
        longitude: pin.lng,
      });
    }

    for (const inst of SAMPLE_INSTITUTIONS) {
      await InstitutionRepository.ensure(tx, {
        aisheCode: null,
        name: inst.name,
        shortName: inst.shortName,
        kind: inst.kind,
        stateId: stateIds.get(inst.state)!,
        districtId: inst.district ? districtIds.get(`${inst.state}:${inst.district}`) ?? null : null,
        city: inst.city,
      });
    }
  });
}
