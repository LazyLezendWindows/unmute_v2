export interface User {
  id: string;
  email: string;
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
  isVerified: boolean;
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
