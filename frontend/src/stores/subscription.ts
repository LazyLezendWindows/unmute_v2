import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../services/api';

export interface Plan { id: string; label: string; amount: number }
export interface AccessState {
  active: boolean;
  state: 'trial' | 'paid' | 'expired';
  expiresAt: string | null;
  trialEndsAt: string | null;
  plans: Plan[];
  paymentsAvailable: boolean;
  /** 'test' only in local development without Razorpay keys: plans activate with no money taken. */
  paymentMode?: 'razorpay' | 'test' | 'off';
}
export const useSubscriptionStore = defineStore('subscription', () => {
  const access = ref<AccessState | null>(null);
  async function fetchStatus() {
    const res = await api.get('/subscriptions', { silent: true });
    access.value = res.data.data;
    return access.value!;
  }
  return { access, fetchStatus };
});
