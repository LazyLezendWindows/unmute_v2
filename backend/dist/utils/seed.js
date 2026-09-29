"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INTERESTS = void 0;
exports.seedInterests = seedInterests;
exports.seedReferenceData = seedReferenceData;
exports.seedDemoUsersIfEmpty = seedDemoUsersIfEmpty;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const authAccountRepository_1 = require("../repositories/authAccountRepository");
const placeRepository_1 = require("../repositories/placeRepository");
const pincodeRepository_1 = require("../repositories/pincodeRepository");
const institutionRepository_1 = require("../repositories/institutionRepository");
const indianLocations_1 = require("./indianLocations");
const indianInstitutions_1 = require("./indianInstitutions");
exports.DEFAULT_INTERESTS = [
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
async function seedInterests() {
    const db = (0, database_1.getDatabase)();
    for (const item of exports.DEFAULT_INTERESTS) {
        const existing = await db.get('SELECT id FROM interests WHERE name = $1', [item.name]);
        if (!existing) {
            const id = crypto_1.default.randomUUID();
            await db.run('INSERT INTO interests (id, name, category, icon) VALUES ($1, $2, $3, $4)', [id, item.name, item.category, item.icon]);
        }
    }
}
/**
 * Loads the bundled sample of states, districts, settlements, PIN codes and institutions.
 * Idempotent: it matches existing rows (including ones from a full LGD/AISHE import) instead of
 * duplicating them, so it is safe to run on every start.
 */
async function seedReferenceData() {
    await (0, database_1.getDatabase)().transaction(async (tx) => {
        const stateIds = new Map();
        for (const state of indianLocations_1.SAMPLE_STATES) {
            stateIds.set(state.lgd, await placeRepository_1.PlaceRepository.ensure(tx, {
                kind: 'state',
                name: state.name,
                parentId: null,
                stateId: null,
                districtId: null,
                lgdCode: state.lgd,
            }));
        }
        const districtIds = new Map();
        const districtId = async (stateCode, name, lat, lng) => {
            const key = `${stateCode}:${name}`;
            let id = districtIds.get(key);
            if (!id) {
                const stateId = stateIds.get(stateCode);
                id = await placeRepository_1.PlaceRepository.ensure(tx, {
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
        for (const s of indianLocations_1.SAMPLE_SETTLEMENTS) {
            const stateId = stateIds.get(s.state);
            const district = await districtId(s.state, s.district, s.lat, s.lng);
            const parentId = s.subdistrict
                ? await placeRepository_1.PlaceRepository.ensure(tx, {
                    kind: 'subdistrict',
                    name: s.subdistrict,
                    parentId: district,
                    stateId,
                    districtId: district,
                })
                : district;
            await placeRepository_1.PlaceRepository.ensure(tx, {
                kind: s.kind,
                name: s.name,
                parentId,
                stateId,
                districtId: district,
                latitude: s.lat,
                longitude: s.lng,
            });
        }
        for (const pin of indianLocations_1.SAMPLE_PINCODES) {
            await pincodeRepository_1.PincodeRepository.upsert(tx, {
                pincode: pin.pincode,
                areaName: pin.area,
                districtId: await districtId(pin.state, pin.district, pin.lat, pin.lng),
                stateId: stateIds.get(pin.state),
                latitude: pin.lat,
                longitude: pin.lng,
            });
        }
        for (const inst of indianInstitutions_1.SAMPLE_INSTITUTIONS) {
            await institutionRepository_1.InstitutionRepository.ensure(tx, {
                aisheCode: null,
                name: inst.name,
                shortName: inst.shortName,
                kind: inst.kind,
                stateId: stateIds.get(inst.state),
                districtId: inst.district ? districtIds.get(`${inst.state}:${inst.district}`) ?? null : null,
                city: inst.city,
            });
        }
    });
}
async function seedDemoUsersIfEmpty() {
    const db = (0, database_1.getDatabase)();
    const countRes = await db.get('SELECT COUNT(*) as count FROM users');
    const count = parseInt(countRes?.count || '0', 10);
    if (count > 0) {
        return; // Already populated
    }
    console.log('[Seed] Seeding demo connection-first profiles...');
    const demoPasswordHash = await bcryptjs_1.default.hash('UnmutePassword123!', 10);
    const now = new Date().toISOString();
    const demoUsers = [
        {
            email: 'aanya.sharma@example.com',
            displayName: 'Aanya',
            dob: '1998-04-12',
            bio: 'Lover of quiet corners, dark roast coffee, and debating whether digital books can ever match the smell of yellowed paperbacks. Always up for late-night deep talks.',
            location: 'Hyderabad',
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
            preferences: ['Serious Relationship', 'Friendship'],
            gender: 'woman',
            profession: 'Product Designer',
            educationLevel: 'bachelors',
            professionField: 'arts',
            heightCm: 162,
            lifestyle: { drinking: 'socially', smoking: 'never', workout: 'sometimes' },
            photos: ['https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80'],
            interests: ['Reading', 'Coffee', 'Spirituality', 'Travel'],
        },
        {
            email: 'rohit.verma@example.com',
            displayName: 'Rohit',
            dob: '1996-09-28',
            bio: 'Systems engineer by day, indie film nerd and amateur astrophotographer by night. If you love discussing Denis Villeneuve films or space anomalies, say hi!',
            location: 'Bengaluru',
            avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
            preferences: ['Long Term', 'Friendship'],
            gender: 'man',
            profession: 'Software Engineer',
            educationLevel: 'bachelors',
            professionField: 'it_software',
            heightCm: 178,
            lifestyle: { drinking: 'socially', smoking: 'never', workout: 'often' },
            photos: ['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&auto=format&fit=crop&q=80'],
            interests: ['Movies', 'Tech', 'Nature', 'Music'],
        },
        {
            email: 'meera.iyer@example.com',
            displayName: 'Meera',
            dob: '2000-02-15',
            bio: 'Architectural designer capturing quiet city textures on 35mm film. Big believer that conversations without pretense are the best kind of art.',
            location: 'Mumbai',
            avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
            preferences: ['Serious Relationship', 'Just Chat'],
            gender: 'woman',
            profession: 'Architect',
            educationLevel: 'masters',
            professionField: 'arts',
            heightCm: 165,
            lifestyle: { drinking: 'never', smoking: 'never', workout: 'sometimes' },
            photos: ['https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&auto=format&fit=crop&q=80'],
            interests: ['Photography', 'Art', 'Music', 'Coffee'],
        },
        {
            email: 'kabir.patel@example.com',
            displayName: 'Kabir',
            dob: '1995-11-04',
            bio: 'Exploring mountain trails on weekends, baking sourdough experiments on weekdays. No pressure, just honest conversation and good vibes.',
            location: 'Secunderabad',
            avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
            preferences: ['Casual Dating', 'Friendship'],
            gender: 'man',
            profession: 'Chef',
            educationLevel: 'high_school',
            professionField: 'business',
            heightCm: 180,
            lifestyle: { drinking: 'socially', smoking: 'socially', workout: 'often' },
            photos: ['https://images.unsplash.com/photo-1463453091185-61582044d556?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80'],
            interests: ['Hiking & Trails', 'Cooking & Recipes', 'Biking & Cycling', 'Board Games'],
        },
        {
            email: 'priya.nair@example.com',
            displayName: 'Priya',
            dob: '1999-07-21',
            bio: 'Folk music enthusiast and podcast hoarder. Constantly searching for the coziest rainy evening playlists and meaningful chats.',
            location: 'Bengaluru',
            avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80',
            preferences: ['Serious Relationship', 'Long Term'],
            gender: 'woman',
            profession: 'Content Creator',
            educationLevel: 'masters',
            professionField: 'arts',
            heightCm: 160,
            lifestyle: { drinking: 'never', smoking: 'never', workout: 'sometimes' },
            photos: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=600&auto=format&fit=crop&q=80'],
            interests: ['Music', 'Reading', 'Spirituality', 'Food'],
        },
    ];
    for (const demo of demoUsers) {
        const userId = crypto_1.default.randomUUID();
        const profileId = crypto_1.default.randomUUID();
        await db.run('INSERT INTO users (id, email, is_active, created_at) VALUES ($1, $2, 1, $3)', [userId, demo.email, now]);
        await authAccountRepository_1.AuthAccountRepository.insert(db, { userId, provider: 'password', passwordHash: demoPasswordHash });
        await db.run(`INSERT INTO profiles (
        id, user_id, display_name, date_of_birth, bio, approximate_location,
        avatar_url, interaction_preferences, is_verified, created_at, updated_at,
        gender, profession, height_cm, drinking, smoking, workout, photos, education_level, profession_field
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`, [
            profileId,
            userId,
            demo.displayName,
            demo.dob,
            demo.bio,
            demo.location,
            demo.avatarUrl,
            JSON.stringify(demo.preferences),
            now,
            demo.gender,
            demo.profession,
            demo.heightCm,
            demo.lifestyle.drinking,
            demo.lifestyle.smoking,
            demo.lifestyle.workout,
            JSON.stringify(demo.photos),
            demo.educationLevel,
            demo.professionField,
        ]);
        // Structured area (a sample city), shown to others at city precision
        const city = await db.get(`SELECT id, latitude, longitude FROM places WHERE kind = 'city' AND name = $1 LIMIT 1`, [demo.location]);
        if (city) {
            await db.run(`INSERT INTO user_locations (user_id, place_id, latitude, longitude, source, label_precision)
         VALUES ($1, $2, $3, $4, 'place', 'city')`, [userId, city.id, city.latitude, city.longitude]);
        }
        // Link interests
        for (const intName of demo.interests) {
            const intRow = await db.get('SELECT id FROM interests WHERE name = $1', [intName]);
            if (intRow) {
                await db.run('INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)', [userId, intRow.id]);
            }
        }
    }
    console.log('[Seed] Demo users seeded successfully.');
}
