import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../services/api';

export interface Plan { id: string; label: string; amount: number }
export interface UpiPlanQr {
  upiUri: string;
  qrCodeDataUrl: string;
}
export interface AccessState {
  active: boolean;
  state: 'trial' | 'paid' | 'expired';
  expiresAt: string | null;
  /** The paid plan bought last (day, week, month, 2months, 3months, 6months, year). */
  plan?: string | null;
  trialEndsAt: string | null;
  plans: Plan[];
  paymentsAvailable: boolean;
  /** 'test' only in local development without Razorpay keys: plans activate with no money taken. */
  paymentMode?: 'razorpay' | 'test' | 'off';
  /** A plan bought during the free trial starts (with Premium) at this time. */
  planStartsAt?: string | null;
  upiId?: string;
  upiPayeeName?: string;
  upiQrByPlan?: Record<string, UpiPlanQr>;
}
export const useSubscriptionStore = defineStore('subscription', () => {
  const access = ref<AccessState | null>(null);
  let generation = 0;
  async function fetchStatus() {
    const requestGeneration = generation;
    const res = await api.get('/subscriptions', { silent: true });
    if (requestGeneration === generation) access.value = res.data.data;
    return res.data.data as AccessState;
  }
  function reset() {
    generation++;
    access.value = null;
  }
  return { access, fetchStatus, reset };
});
