export interface User {
  id: string;
  /** Null for accounts created with a phone number. */
  email: string | null;
  /** The number the member signs in with (E.164), if any. */
  phone?: string | null;
  profile: Profile | null;
}

export interface Interest {
  id: string;
  name: string;
  category: string;
  icon?: string;
}

export type PlaceKind = 'state' | 'district' | 'subdistrict' | 'city' | 'town' | 'village';
export type LocationPrecision = 'locality' | 'city' | 'state';

/** A place from the location directory. The API never includes coordinates. */
export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  districtName: string | null;
  stateName: string | null;
  displayName: string;
}

export interface Institution {
  id: string;
  name: string;
  shortName: string;
  kind: 'university' | 'college' | 'standalone';
  city: string;
  districtName: string | null;
  stateName: string | null;
  aisheCode: string | null;
}

/** The signed-in member's own area settings. */
export interface OwnLocation {
  placeId: string | null;
  placeName: string;
  placeKind: PlaceKind | null;
  pincode: string | null;
  source: 'place' | 'pincode' | 'device';
  precision: LocationPrecision;
  /** Exactly what other members see. */
  label: string;
}

export interface OwnEducation {
  institutionId: string;
  institutionName: string;
  institutionShortName: string;
  course: string;
  startYear: number | null;
  endYear: number | null;
}

export interface PublicEducation {
  institutionName: string;
  institutionShortName: string;
  course: string;
}

export type Gender = 'woman' | 'man' | 'nonbinary';
export type HabitFrequency = 'never' | 'socially' | 'regularly';
export type WorkoutFrequency = 'never' | 'sometimes' | 'often';
export type EducationLevel = 'high_school' | 'bachelors' | 'masters' | 'phd';
export type ProfessionField = 'it_software' | 'healthcare' | 'business' | 'arts' | 'education' | 'government' | 'finance' | 'other';

export interface Lifestyle {
  drinking: HabitFrequency | null;
  smoking: HabitFrequency | null;
  workout: WorkoutFrequency | null;
}

/** Work, height, lifestyle and extra photos; on every profile, own or public. */
export interface ProfileDetails {
  profession: string;
  heightCm: number | null;
  educationLevel: EducationLevel | null;
  professionField: ProfessionField | null;
  lifestyle: Lifestyle;
  /** Extra https photo links; the avatar is the main photo and is not repeated here. */
  photos: string[];
}

export interface Profile extends ProfileDetails {
  id: string;
  displayName: string;
  dateOfBirth?: string;
  age: number;
  bio: string;
  /** The area label others see (derived from `location` when set). */
  approximateLocation: string;
  avatarUrl: string;
  interactionPreferences: string[];
  interests: Interest[];
  isVerified?: boolean;
  /** A paid (Premium) member. */
  isPremium?: boolean;
  /** Which paid plan: day, week, month, 2months, 3months, 6months or year. */
  premiumPlan?: string | null;
  /** Travel mode: the place they're visiting. */
  travellingTo?: string | null;
  location?: OwnLocation | null;
  education?: OwnEducation | null;
  gender: Gender | null;
  /** Members who like you (own profile only). */
  likesReceived?: number;
}

export interface DiscoveryCandidate extends ProfileDetails {
  id: string;
  displayName: string;
  age: number;
  bio: string;
  approximateLocation: string;
  avatarUrl: string;
  interactionPreferences: string[];
  interests: Interest[];
  commonInterestsCount: number;
  commonInterests: string[];
  /** The day they joined (YYYY-MM-DD). */
  joinedOn?: string | null;
  isVerified: boolean;
  /** A paid (Premium) member. */
  isPremium?: boolean;
  /** Which paid plan: day, week, month, 2months, 3months, 6months or year. */
  premiumPlan?: string | null;
  /** Travel mode: the place they're visiting. */
  travellingTo?: string | null;
  education: PublicEducation | null;
  /** Bucketed upper bound in km (never exact); null when either side has no area. */
  distanceKm: number | null;
  isOnline: boolean;
}

export interface Match {
  matchId: string;
  conversationId: string;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  user: ProfileDetails & {
    id: string;
    displayName: string;
    age: number;
    bio: string;
    approximateLocation: string;
    avatarUrl: string;
    isVerified: boolean;
    /** A paid (Premium) member. */
    isPremium?: boolean;
    /** Which paid plan: day, week, month, 2months, 3months, 6months or year. */
    premiumPlan?: string | null;
    /** Travel mode: the place they're visiting. */
    travellingTo?: string | null;
    isOnline: boolean;
    interests: string[];
    education: PublicEducation | null;
    /** Bucketed upper bound in km; null when either side has no area. */
    distanceKm: number | null;
  };
}

export interface Conversation {
  id: string;
  matchId: string;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
  otherUser: {
    id: string;
    displayName: string;
    age: number;
    avatarUrl: string;
    approximateLocation: string;
    isVerified: boolean;
    /** A paid (Premium) member. */
    isPremium?: boolean;
    /** Which paid plan: day, week, month, 2months, 3months, 6months or year. */
    premiumPlan?: string | null;
    /** Travel mode: the place they're visiting. */
    travellingTo?: string | null;
    isOnline: boolean;
    profession: string;
  };
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  /** 'call' messages record a call ("Missed video call", "Voice call · 3:12"). */
  kind?: 'text' | 'call' | 'image' | 'voice';
  call?: { mode: 'voice' | 'video'; outcome: 'completed' | 'missed' | 'declined'; seconds: number };
}

export interface BlockedUser {
  id: string;
  blockedId: string;
  reason?: string;
  createdAt: string;
  displayName: string;
  age: number;
  avatarUrl?: string;
}

export type NotificationType = 'like' | 'match' | 'message' | 'plan';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  /** Messages folded into one entry; 1 for likes and matches. */
  count: number;
  /** Latest message text, for message entries. */
  preview: string | null;
  conversationId: string | null;
  /** Null for likes, which stay anonymous until they are returned. */
  actor: {
    id: string;
    displayName: string;
    age: number;
    avatarUrl: string;
    isVerified: boolean;
    /** A paid (Premium) member. */
    isPremium?: boolean;
    /** Which paid plan: day, week, month, 2months, 3months, 6months or year. */
    premiumPlan?: string | null;
    /** Travel mode: the place they're visiting. */
    travellingTo?: string | null;
    isOnline: boolean;
  } | null;
}
