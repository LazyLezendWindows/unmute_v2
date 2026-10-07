<template>
  <section class="upgrade-page">
    <div class="upgrade-card">
      <span class="eyebrow">UNMUTE MEMBERSHIP</span>
      <h1>{{ sub.access?.active ? 'Keep connecting' : 'Upgrade to continue' }}</h1>
      <p v-if="sub.access?.state === 'paid'" class="current-plan">You're on <PremiumBadge :plan="sub.access.plan" label /> until {{ expiry }}.</p>
      <p v-else-if="sub.access?.planStartsAt">Your <strong>{{ planTier(sub.access.plan).name }}</strong> plan starts when your free trial ends, on {{ new Date(sub.access.planStartsAt).toLocaleString() }}.</p>
      <p v-else-if="sub.access?.active">Your free trial lasts until {{ expiry }}.</p>
      <p v-else>Your seven-day free trial or paid plan has ended. Choose a plan to unlock the app.</p>
      <ReferralBanner
        :title="sub.access?.active ? 'Or get 2 weeks free' : 'No plan? Get 2 weeks free'"
        text="Invite a friend. When they join with your code and verify their number, you both get 2 weeks."
        cta="Invite friends"
      />
      <p>Every paid plan unlocks the whole app plus these Premium extras. One-time payment, no automatic renewal. Any remaining access time is kept.</p>
      <ul class="perks" aria-label="Premium extras">
        <li><i class="ri-vip-crown-2-fill" aria-hidden="true"></i><span><strong>Plan badge</strong>Your plan’s badge (Weekly, Gold, Platinum…) next to your name, everywhere</span></li>
        <li><i class="ri-flashlight-fill" aria-hidden="true"></i><span><strong>Weekly Boost</strong>Be the top profile in Discover for 30 minutes</span></li>
        <li><i class="ri-star-fill" aria-hidden="true"></i><span><strong>25 Super Likes a day</strong>Instead of 5</span></li>
        <li><i class="ri-heart-add-fill" aria-hidden="true"></i><span><strong>Priority likes</strong>Your likes show first in their "Liked You"</span></li>
        <li><i class="ri-equalizer-2-fill" aria-hidden="true"></i><span><strong>Advanced filters</strong>Verified only, lifestyle, education and profession</span></li>
        <li><i class="ri-plane-fill" aria-hidden="true"></i><span><strong>Travel mode</strong>Meet people in another city before you go</span></li>
      </ul>
      <!-- Phone apps: Google Play and the App Store only allow selling subscriptions through their own
           billing, so the app doesn't sell plans (a plan bought elsewhere still works here). -->
      <template v-if="inStoreApp">
        <p class="test-note" role="note">
          <i class="ri-information-line" aria-hidden="true"></i>
          Plans can’t be bought in this app. If you already have a plan, it works here too.
        </p>
        <UButton variant="secondary" :disabled="busy" @click="checkPayment">Refresh my membership</UButton>
      </template>
      <template v-else>
        <fieldset :disabled="busy" class="plans">
          <legend class="visually-hidden">Choose your plan</legend>
          <label v-for="plan in sub.access?.plans || []" :key="plan.id" class="plan" :class="{ selected: selected === plan.id }">
            <input v-model="selected" type="radio" name="plan" :value="plan.id" />
            <PremiumBadge :plan="plan.id" /><span>{{ plan.label }} <small class="tier">{{ planTier(plan.id).name }}</small></span><strong>₹{{ plan.amount / 100 }}</strong>
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
      </template>
      <router-link v-if="sub.access?.active" to="/discover">Continue to the app</router-link>
      <router-link to="/safety">Privacy &amp; safety</router-link>
      <button class="signout" :disabled="busy" @click="auth.logout()">Sign out</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import ReferralBanner from '../components/referral/ReferralBanner.vue';
import { Capacitor } from '@capacitor/core';
import { computed, onMounted, ref } from 'vue';
import { useSubscriptionStore } from '../stores/subscription';
import { useAuthStore } from '../stores/auth';
import { usePremiumStore } from '../stores/premium';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { loadCheckout, PaymentResult } from '../services/checkout';
import UButton from '../components/ui/UButton.vue';
import PremiumBadge from '../components/premium/PremiumBadge.vue';
import { planTier } from '../utils/plans';
const sub = useSubscriptionStore();
const auth = useAuthStore();
const premium = usePremiumStore();
const selected = ref('month');
const busy = ref(false);
const error = ref('');
const message = ref('');
const price = computed(() => (sub.access?.plans.find(p => p.id === selected.value)?.amount || 0) / 100);
const planLabel = computed(() => sub.access?.plans.find(p => p.id === selected.value)?.label || 'plan');
const testMode = computed(() => sub.access?.paymentMode === 'test');
/** Android/iOS app build: no in-app selling unless store billing is set up (VITE_NATIVE_PURCHASES=razorpay to override). */
const inStoreApp = Capacitor.isNativePlatform() && import.meta.env.VITE_NATIVE_PURCHASES !== 'razorpay';
const expiry = computed(() => sub.access?.expiresAt ? new Date(sub.access.expiresAt).toLocaleString() : '');
onMounted(async () => { try { await sub.fetchStatus(); } catch (err) { error.value = (err as Error).message; } });
async function refresh() {
  await sub.fetchStatus();
  if (sub.access?.active) { disconnectSocket(); connectSocket(); await premium.load(); message.value = 'Your access is ready. Continue to the app.'; }
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
.current-plan { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.tier { color: var(--unmute-text-muted); font-weight: 600; }
.perks { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
.perks li { display: flex; align-items: center; gap: .75rem; font-size: .88rem; color: var(--unmute-text-muted); }
.perks li span { display: flex; flex-direction: column; }
.perks li strong { color: var(--unmute-text-heading); font-size: .95rem; }
.perks i { display: grid; place-items: center; flex-shrink: 0; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: linear-gradient(135deg, #ffd66b, #f5a524); color: #fff; }
.signout { border: 0; background: transparent; color: inherit; padding: .5rem; }
@media (max-width: 480px) { .upgrade-page { padding: 1rem .75rem; } .upgrade-card { padding: 1.25rem; } }
</style>
