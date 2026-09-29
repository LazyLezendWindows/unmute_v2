/** How each paid plan is identified in the app: its name, colour and icon. */
export interface PlanTier {
  id: string;
  name: string;
  /** The length, e.g. "6 months". */
  length: string;
  icon: string;
  /** Badge background. */
  gradient: string;
}

export const PLAN_TIERS: Record<string, PlanTier> = {
  day: { id: 'day', name: 'Day Pass', length: '1 day', icon: 'ri-sun-fill', gradient: 'linear-gradient(135deg, #7fb2ff, #4a7bea)' },
  week: { id: 'week', name: 'Weekly', length: '1 week', icon: 'ri-calendar-event-fill', gradient: 'linear-gradient(135deg, #4fe0c5, #0f9f8c)' },
  month: { id: 'month', name: 'Monthly', length: '1 month', icon: 'ri-heart-3-fill', gradient: 'linear-gradient(135deg, #ff6fa5, #e0147c)' },
  '2months': { id: '2months', name: 'Plus', length: '2 months', icon: 'ri-star-fill', gradient: 'linear-gradient(135deg, #b18cff, #7c3aed)' },
  '3months': { id: '3months', name: 'Silver', length: '3 months', icon: 'ri-medal-fill', gradient: 'linear-gradient(135deg, #e3e7ee, #8d97a8)' },
  '6months': { id: '6months', name: 'Gold', length: '6 months', icon: 'ri-vip-crown-2-fill', gradient: 'linear-gradient(135deg, #ffd66b, #e59a0b)' },
  year: { id: 'year', name: 'Platinum', length: '1 year', icon: 'ri-vip-diamond-fill', gradient: 'linear-gradient(135deg, #6b7cff, #1f1b4d)' },
};

/** The tier for a plan id; unknown or missing plans fall back to the generic Premium crown. */
export function planTier(plan: string | null | undefined): PlanTier {
  return (plan && PLAN_TIERS[plan]) || { id: 'premium', name: 'Premium', length: '', icon: 'ri-vip-crown-2-fill', gradient: 'linear-gradient(135deg, #ffd66b, #f5a524)' };
}
