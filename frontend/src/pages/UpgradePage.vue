<template>
  <section class="upgrade-page">
    <div class="upgrade-card">
      <span class="eyebrow">UNMUTE MEMBERSHIP</span>
      <h1>{{ sub.access?.active ? 'Keep connecting' : 'Upgrade to continue' }}</h1>
      <p v-if="sub.access?.active">Your {{ sub.access.state === 'trial' ? 'free trial' : 'access' }} lasts until {{ expiry }}.</p>
      <p v-else>Your seven-day free trial or paid plan has ended. Choose a plan to unlock the app.</p>
      <p>Every plan includes all app features. One-time payment, no automatic renewal. Any remaining access time is kept.</p>
      <fieldset :disabled="busy" class="plans">
        <legend class="visually-hidden">Choose your plan</legend>
        <label v-for="plan in sub.access?.plans || []" :key="plan.id" class="plan" :class="{ selected: selected === plan.id }">
          <input v-model="selected" type="radio" name="plan" :value="plan.id" />
          <span>{{ plan.label }}</span><strong>₹{{ plan.amount / 100 }}</strong>
        </label>
      </fieldset>
      <p v-if="sub.access && !sub.access.paymentsAvailable" role="status">Payments are not available yet. Please check again later.</p>
      <p v-if="testMode" class="test-note" role="note">
        <i class="ri-flask-line" aria-hidden="true"></i>
        Test mode (local development): the plan is activated without taking any money. Add Razorpay keys to the server to take real payments.
      </p>
      <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <UButton block :disabled="!selected || !sub.access?.paymentsAvailable" :loading="busy" @click="pay">
        {{ testMode ? `Activate ${planLabel} (test, no charge)` : `Pay ₹${price} with Razorpay` }}
      </UButton>
      <UButton v-if="!testMode" variant="secondary" :disabled="busy" @click="checkPayment">Already paid? Check payment status</UButton>
      <router-link v-if="sub.access?.active" to="/discover">Continue to the app</router-link>
      <router-link to="/safety">Privacy &amp; safety</router-link>
      <button class="signout" :disabled="busy" @click="auth.logout()">Sign out</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSubscriptionStore } from '../stores/subscription';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { loadCheckout, PaymentResult } from '../services/checkout';
import UButton from '../components/ui/UButton.vue';
const sub = useSubscriptionStore();
const auth = useAuthStore();
const selected = ref('month');
const busy = ref(false);
const error = ref('');
const message = ref('');
const price = computed(() => (sub.access?.plans.find(p => p.id === selected.value)?.amount || 0) / 100);
const planLabel = computed(() => sub.access?.plans.find(p => p.id === selected.value)?.label || 'plan');
const testMode = computed(() => sub.access?.paymentMode === 'test');
const expiry = computed(() => sub.access?.expiresAt ? new Date(sub.access.expiresAt).toLocaleString() : '');
onMounted(async () => { try { await sub.fetchStatus(); } catch (err) { error.value = (err as Error).message; } });
async function refresh() {
  await sub.fetchStatus();
  if (sub.access?.active) { disconnectSocket(); connectSocket(); message.value = 'Your access is ready. Continue to the app.'; }
  else message.value = 'No confirmed payment yet. If money was deducted, please check again shortly.';
}
async function checkPayment() {
  busy.value = true; error.value = ''; message.value = '';
  try { await api.post('/subscriptions/reconcile'); await refresh(); }
  catch (err) { error.value = (err as Error).message; }
  finally { busy.value = false; }
}
async function pay() {
  busy.value = true; error.value = ''; message.value = '';
  if (testMode.value) {
    try { await api.post('/subscriptions/test-purchase', { planId: selected.value }); await refresh(); }
    catch (err) { error.value = (err as Error).message; }
    finally { busy.value = false; }
    return;
  }
  try {
    await loadCheckout();
    const { data } = await api.post('/subscriptions/orders', { planId: selected.value });
    const order = data.data;
    const checkout = new window.Razorpay!({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: 'Unmute', description: `${order.label} of full access`,
      prefill: { name: auth.profile?.displayName, email: auth.user?.email || undefined, contact: auth.user?.phone || undefined },
      handler: async (result: PaymentResult) => {
        try { await api.post('/subscriptions/verify', result); await refresh(); }
        catch (err) { error.value = `${(err as Error).message} Use “Check payment status” before paying again.`; }
        finally { busy.value = false; }
      },
      modal: { ondismiss: () => { busy.value = false; } },
    });
    checkout.on('payment.failed', event => { error.value = event.error?.description || 'Payment failed. Please try again.'; });
    checkout.open();
  } catch (err) { error.value = (err as Error).message; busy.value = false; }
}
</script>
<style scoped>
.upgrade-page { padding: 2rem 1rem; }
.upgrade-card { max-width: 560px; margin: auto; padding: 2rem; display: grid; gap: 1rem; border-radius: 1.5rem; background: var(--unmute-surface); border: 1px solid var(--unmute-glass-border); }
h1, p { margin: 0; }
p { color: var(--unmute-text-muted); }
.eyebrow { font-size: .75rem; font-weight: 700; letter-spacing: .12em; }
.plans { border: 0; padding: 0; display: grid; gap: .65rem; }
.plan { display: flex; align-items: center; gap: .75rem; padding: 1rem; border: 2px solid var(--unmute-glass-border); border-radius: 1rem; cursor: pointer; }
.plan strong { margin-left: auto; }
.plan.selected { border-color: var(--unmute-primary, #e94057); }
.test-note { display: flex; gap: .5rem; padding: .75rem 1rem; border-radius: 1rem; background: #fff4dc; color: #7a4d00; font-size: .88rem; }
.signout { border: 0; background: transparent; color: inherit; padding: .5rem; }
</style>
