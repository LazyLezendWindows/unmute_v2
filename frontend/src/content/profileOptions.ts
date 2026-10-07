import type { Diet, FamilyPlans, Language, MaritalStatus, Religion } from '../types';

/** Profile prompt questions; the keys match the server's list (backend validators/profileValidator.ts). */
export const PROMPT_QUESTIONS: Record<string, string> = {
  perfect_sunday: 'My perfect Sunday…',
  green_flag: 'A green flag I look for…',
  simple_pleasures: 'My simple pleasures…',
  together_we_could: 'Together, we could…',
  typical_weekend: 'A typical weekend for me…',
  love_language: 'My love language is…',
  never_shut_up_about: 'I could never shut up about…',
  dating_me_is_like: 'Dating me is like…',
  best_travel_story: 'My best travel story…',
  unpopular_opinion: 'My most unpopular opinion…',
  looking_for_someone: 'I’m looking for someone who…',
  two_truths_one_lie: 'Two truths and a lie…',
  most_spontaneous: 'The most spontaneous thing I’ve done…',
  go_to_karaoke: 'My go-to karaoke song…',
  first_date_idea: 'My ideal first date…',
};
export const MAX_PROMPTS = 3;
export const MAX_LANGUAGES = 6;

export const RELIGIONS: { value: Religion; label: string }[] = [
  { value: 'hindu', label: 'Hindu' },
  { value: 'muslim', label: 'Muslim' },
  { value: 'christian', label: 'Christian' },
  { value: 'sikh', label: 'Sikh' },
  { value: 'buddhist', label: 'Buddhist' },
  { value: 'jain', label: 'Jain' },
  { value: 'parsi', label: 'Parsi' },
  { value: 'jewish', label: 'Jewish' },
  { value: 'spiritual', label: 'Spiritual' },
  { value: 'atheist', label: 'Atheist / agnostic' },
  { value: 'other', label: 'Other' },
];

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'hindi', label: 'Hindi' },
  { value: 'english', label: 'English' },
  { value: 'bengali', label: 'Bengali' },
  { value: 'marathi', label: 'Marathi' },
  { value: 'telugu', label: 'Telugu' },
  { value: 'tamil', label: 'Tamil' },
  { value: 'gujarati', label: 'Gujarati' },
  { value: 'urdu', label: 'Urdu' },
  { value: 'kannada', label: 'Kannada' },
  { value: 'odia', label: 'Odia' },
  { value: 'malayalam', label: 'Malayalam' },
  { value: 'punjabi', label: 'Punjabi' },
  { value: 'assamese', label: 'Assamese' },
  { value: 'konkani', label: 'Konkani' },
  { value: 'other', label: 'Other' },
];

export const DIETS: { value: Diet; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'non_vegetarian', label: 'Non-vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'jain', label: 'Jain food' },
];

export const MARITAL_STATUSES: { value: MaritalStatus; label: string }[] = [
  { value: 'never_married', label: 'Never married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

export const FAMILY_PLANS: { value: FamilyPlans; label: string }[] = [
  { value: 'want_children', label: 'Want children' },
  { value: 'dont_want_children', label: 'Don’t want children' },
  { value: 'have_want_more', label: 'Have kids, want more' },
  { value: 'have_dont_want_more', label: 'Have kids, no more' },
  { value: 'not_sure', label: 'Not sure yet' },
];

const label = <T extends string>(list: { value: T; label: string }[], value: T | null | undefined) =>
  list.find((o) => o.value === value)?.label ?? '';

export const religionLabel = (v?: Religion | null) => label(RELIGIONS, v);
export const languageLabel = (v?: Language | null) => label(LANGUAGES, v);
export const dietLabel = (v?: Diet | null) => label(DIETS, v);
export const maritalLabel = (v?: MaritalStatus | null) => label(MARITAL_STATUSES, v);
export const familyPlansLabel = (v?: FamilyPlans | null) => label(FAMILY_PLANS, v);

/** The background details worth showing on a profile, as icon + text chips. */
export function backgroundChips(p: {
  religion?: Religion | null;
  motherTongue?: Language | null;
  languages?: Language[];
  diet?: Diet | null;
  maritalStatus?: MaritalStatus | null;
  familyPlans?: FamilyPlans | null;
}): { icon: string; text: string }[] {
  const spoken = (p.languages ?? []).filter((l) => l !== p.motherTongue).map(languageLabel);
  return [
    p.religion ? { icon: 'ri-sparkling-line', text: religionLabel(p.religion) } : null,
    p.motherTongue ? { icon: 'ri-chat-voice-line', text: `Speaks ${[languageLabel(p.motherTongue), ...spoken].join(', ')}` } : spoken.length ? { icon: 'ri-chat-voice-line', text: `Speaks ${spoken.join(', ')}` } : null,
    p.diet ? { icon: 'ri-restaurant-2-line', text: dietLabel(p.diet) } : null,
    p.maritalStatus ? { icon: 'ri-heart-2-line', text: maritalLabel(p.maritalStatus) } : null,
    p.familyPlans ? { icon: 'ri-parent-line', text: familyPlansLabel(p.familyPlans) } : null,
  ].filter((c): c is { icon: string; text: string } => c !== null);
}
