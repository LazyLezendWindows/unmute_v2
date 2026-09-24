import { useToastStore } from '../stores/toast';
import { EducationLevel, Lifestyle, ProfessionField } from '../types';

export const LIFESTYLE_OPTIONS = {
  drinking: [
    { value: 'never', label: 'Non-drinker' },
    { value: 'socially', label: 'Socially' },
    { value: 'regularly', label: 'Regularly' },
  ],
  smoking: [
    { value: 'never', label: 'Non-smoker' },
    { value: 'socially', label: 'Social smoker' },
    { value: 'regularly', label: 'Smoker' },
  ],
  workout: [
    { value: 'never', label: 'Never' },
    { value: 'sometimes', label: 'Sometimes' },
    { value: 'often', label: 'Often' },
  ],
} as const;

/** What members can say they are looking for (the backend filters on these exact values). */
export const LOOKING_FOR = ['Serious Relationship', 'Long Term', 'Friendship', 'Casual Dating', 'Just Chat'] as const;

/** For buttons the mockups show but the app can't do yet (calls, voice notes, super likes…). */
export function comingSoon(feature: string): void {
  useToastStore().show(`${feature} is coming soon.`);
}

export const EDUCATION_LEVELS: { value: EducationLevel; label: string }[] = [
  { value: 'high_school', label: 'High School' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD' },
];

export const PROFESSION_FIELDS: { value: ProfessionField; label: string }[] = [
  { value: 'it_software', label: 'IT/Software' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'business', label: 'Business' },
  { value: 'arts', label: 'Arts' },
  { value: 'education', label: 'Education' },
  { value: 'government', label: 'Government' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' },
];

export const educationLevelLabel = (value: EducationLevel | null | undefined) =>
  EDUCATION_LEVELS.find((l) => l.value === value)?.label ?? '';

/**
 * How much two people's interests overlap: shared interests as a share of the shorter list, so
 * someone who picked 3 and shares all 3 is 100%. Null when nothing is shared (no badge shown).
 */
export function matchPercent(shared: number, mine: number, theirs: number): number | null {
  if (shared <= 0) return null;
  return Math.min(100, Math.round((shared / Math.max(1, Math.min(mine, theirs))) * 100));
}

/** A person's study line: course, else college, else degree level. */
export function educationLine(person: {
  education?: { course: string; institutionShortName: string; institutionName: string } | null;
  educationLevel?: EducationLevel | null;
}): string {
  const edu = person.education;
  return edu?.course || edu?.institutionShortName || edu?.institutionName || educationLevelLabel(person.educationLevel);
}

const LIFESTYLE_META = {
  drinking: { icon: 'ri-goblet-line' },
  smoking: { icon: 'ri-prohibited-line' },
  workout: { icon: 'ri-boxing-line' },
} as const;

/** The lifestyle answers someone gave, as icon + label. */
export function lifestyleItems(lifestyle: Lifestyle | null | undefined) {
  if (!lifestyle) return [];
  return (Object.keys(LIFESTYLE_META) as (keyof Lifestyle)[]).flatMap((key) => {
    const option = LIFESTYLE_OPTIONS[key].find((o) => o.value === lifestyle[key]);
    const label = key === 'workout' && option ? `Workout: ${option.label}` : option?.label;
    return label ? [{ key, label, icon: LIFESTYLE_META[key].icon }] : [];
  });
}
