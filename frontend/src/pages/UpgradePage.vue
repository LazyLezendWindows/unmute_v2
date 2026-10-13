<template>
  <section class="upgrade-page">
    <div class="upgrade-card">
      <span class="eyebrow">UNMUTE MEMBERSHIP</span>
      <h1>{{ sub.access?.active ? 'Keep connecting' : 'Upgrade to continue' }}</h1>
      <p v-if="sub.access?.state === 'paid'" class="current-plan">You're on <PremiumBadge :plan="sub.access.plan" label /> until {{ expiry }}.</p>
      <p v-else-if="sub.access?.planStartsAt">Your <strong>{{ planTier(sub.access.plan).name }}</strong> plan starts when your free trial ends, on {{ new Date(sub.access.planStartsAt).toLocaleString() }}.</p>
      <p v-else-if="sub.access?.active">Your free trial lasts until {{ expiry }}.</p>
      <p v-else>Your one-day free trial or paid plan has ended. Choose a plan to unlock the app.</p>
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

        <!-- Primary Direct Pay Button -->
        <UButton block :disabled="!selected" :loading="busy" class="direct-pay-btn" @click="handlePayDirect">
          <i class="ri-secure-payment-line" aria-hidden="true"></i>
          Pay ₹{{ price }} Directly
        </UButton>

        <!-- UPI QR Code & Direct Payment Section for unmutebandari007@slc -->
        <div v-if="currentUpiQr" class="upi-qr-box">
          <div class="upi-qr-header">
            <i class="ri-qr-code-line" aria-hidden="true"></i>
            <div>
              <strong>Scan QR or Pay Directly via Any UPI App</strong>
              <span>Google Pay, PhonePe, Paytm, BHIM, Cred &amp; all UPI apps</span>
            </div>
          </div>

          <div class="upi-qr-frame">
            <img :src="currentUpiQr.qrCodeDataUrl" :alt="`UPI QR code to pay ₹${price} to ${upiId}`" width="210" height="210" />
            <span class="upi-amount-pill">₹{{ price }} · {{ selectedLabel }}</span>
          </div>

          <div class="upi-id-row">
            <span class="upi-id-label">UPI ID:</span>
            <code class="upi-id-code">{{ upiId }}</code>
            <button type="button" class="upi-copy-btn" @click="copyUpiId">
              <i :class="copiedUpi ? 'ri-check-line' : 'ri-file-copy-line'" aria-hidden="true"></i>
              {{ copiedUpi ? 'Copied' : 'Copy' }}
            </button>
          </div>

          <a :href="currentUpiQr.upiUri" class="upi-open-link" @click="onUpiLinkClick">
            <i class="ri-smartphone-line" aria-hidden="true"></i>
            Open UPI App to Pay ₹{{ price }} Directly
          </a>

          <div class="upi-confirm-group">
            <label for="upi-utr-input" class="upi-utr-label">
              After paying ₹{{ price }}, enter your 12-digit UPI UTR / Ref number to unlock:
            </label>
            <input
              id="upi-utr-input"
              v-model="utr"
              type="text"
              inputmode="numeric"
              maxlength="12"
              class="upi-utr-input"
              :placeholder="testMode ? '12-digit UPI UTR (optional in dev mode)' : 'Enter 12-digit UPI UTR / Ref No.'"
              :disabled="busy"
            />
            <UButton block :disabled="!selected" :loading="busy" @click="confirmUpi">
              I've Paid ₹{{ price }} — Unlock Plan
            </UButton>
          </div>
        </div>

        <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
        <p v-if="message" role="status" class="text-success">{{ message }}</p>
        <UButton v-if="sub.access?.paymentMode === 'razorpay'" block variant="secondary" :disabled="!selected" :loading="busy" @click="pay">
          Or pay ₹{{ price }} with Card / Netbanking (Razorpay)
        </UButton>
        <UButton v-if="!testMode && sub.access?.paymentMode === 'razorpay'" variant="secondary" :disabled="busy" @click="checkPayment">Already paid? Check payment status</UButton>
      </template>
      <router-link v-if="sub.access?.active" to="/discover">Continue to the app</router-link>
      <router-link to="/safety">Privacy &amp; safety</router-link>
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
const selected = ref('1hour');
const busy = ref(false);
const error = ref('');
const message = ref('');
const utr = ref('');
const copiedUpi = ref(false);
const selectedPlan = computed(() => sub.access?.plans.find(p => p.id === selected.value));
const price = computed(() => (selectedPlan.value?.amount || 0) / 100);
const selectedLabel = computed(() => selectedPlan.value?.label || '');
const upiId = computed(() => sub.access?.upiId || 'unmutebandari007@slc');
const currentUpiQr = computed(() => sub.access?.upiQrByPlan?.[selected.value] || null);
const testMode = computed(() => sub.access?.paymentMode === 'test');
/** Android/iOS app build: no in-app selling unless store billing is set up (VITE_NATIVE_PURCHASES=razorpay to override). */
const inStoreApp = Capacitor.isNativePlatform() && import.meta.env.VITE_NATIVE_PURCHASES !== 'razorpay';
const expiry = computed(() => sub.access?.expiresAt ? new Date(sub.access.expiresAt).toLocaleString() : '');
onMounted(async () => { try { await sub.fetchStatus(); } catch (err) { error.value = (err as Error).message; } });
async function copyUpiId() {
  try {
    await navigator.clipboard.writeText(upiId.value);
    copiedUpi.value = true;
    setTimeout(() => { copiedUpi.value = false; }, 2000);
  } catch {
    // Fallback ignored if clipboard blocked
  }
}
async function refresh() {
  await sub.fetchStatus();
  if (sub.access?.active) { disconnectSocket(); connectSocket(); await premium.load(); message.value = 'Your access is ready. Continue to the app.'; }
  else message.value = 'No confirmed payment yet. If money was deducted, please check again shortly.';
}
function onUpiLinkClick() {
  message.value = `Opening UPI app to pay ₹${price.value} to ${upiId.value}. Once completed, enter your 12-digit UTR below to unlock.`;
}
function handlePayDirect() {
  error.value = '';
  message.value = '';
  if (currentUpiQr.value?.upiUri) {
    message.value = `Opening UPI app for ₹${price.value} to ${upiId.value}... After completing payment, enter your 12-digit UTR below to unlock.`;
    window.location.href = currentUpiQr.value.upiUri;
  } else if (sub.access?.paymentMode === 'razorpay') {
    void pay();
  } else {
    error.value = 'UPI payment link is unavailable. Please scan the QR code to pay.';
  }
}
async function confirmUpi() {
  busy.value = true; error.value = ''; message.value = '';
  try {
    await api.post('/subscriptions/upi-confirm', { planId: selected.value, utr: utr.value.trim() || undefined });
    utr.value = '';
    await refresh();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
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
.direct-pay-btn { font-size: 1rem; font-weight: 700; padding: .85rem 1.25rem; }
.upi-qr-box { display: grid; gap: .9rem; padding: 1.25rem; border-radius: 1.25rem; border: 1px solid var(--unmute-glass-border); background: rgba(255, 255, 255, 0.03); text-align: center; }
.upi-qr-header { display: flex; align-items: center; justify-content: center; gap: .6rem; text-align: left; }
.upi-qr-header i { font-size: 1.6rem; color: var(--unmute-primary, #e94057); }
.upi-qr-header div { display: flex; flex-direction: column; }
.upi-qr-header strong { color: var(--unmute-text-heading); font-size: 1rem; }
.upi-qr-header span { font-size: .8rem; color: var(--unmute-text-muted); }
.upi-qr-frame { display: inline-flex; flex-direction: column; align-items: center; gap: .5rem; margin: 0 auto; padding: .85rem; border-radius: 1rem; background: #ffffff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }
.upi-qr-frame img { display: block; border-radius: .5rem; }
.upi-amount-pill { font-size: .82rem; font-weight: 700; color: #111827; background: #f3f4f6; padding: .25rem .75rem; border-radius: 999px; }
.upi-id-row { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: .5rem; font-size: .88rem; }
.upi-id-label { color: var(--unmute-text-muted); }
.upi-id-code { padding: .25rem .6rem; border-radius: .5rem; background: rgba(233, 64, 87, 0.1); color: var(--unmute-text-heading); font-weight: 600; }
.upi-copy-btn { display: inline-flex; align-items: center; gap: .25rem; padding: .25rem .65rem; border-radius: .5rem; border: 1px solid var(--unmute-glass-border); background: transparent; color: var(--unmute-text-heading); font-size: .8rem; cursor: pointer; }
.upi-open-link { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; padding: .6rem 1rem; border-radius: .85rem; background: rgba(233, 64, 87, 0.12); color: var(--unmute-primary, #e94057); font-weight: 600; font-size: .88rem; text-decoration: none; }
.upi-confirm-group { display: grid; gap: .6rem; text-align: left; border-top: 1px solid var(--unmute-glass-border); padding-top: .85rem; }
.upi-utr-label { font-size: .82rem; color: var(--unmute-text-muted); }
.upi-utr-input { width: 100%; padding: .7rem .9rem; border-radius: .75rem; border: 1px solid var(--unmute-glass-border); background: var(--unmute-surface); color: var(--unmute-text-heading); font-size: .92rem; }
.test-note { display: flex; gap: .5rem; padding: .75rem 1rem; border-radius: 1rem; background: var(--unmute-warn-surface); color: var(--unmute-warn-text); font-size: .88rem; }
.current-plan { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.tier { color: var(--unmute-text-muted); font-weight: 600; }
.perks { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
.perks li { display: flex; align-items: center; gap: .75rem; font-size: .88rem; color: var(--unmute-text-muted); }
.perks li span { display: flex; flex-direction: column; }
.perks li strong { color: var(--unmute-text-heading); font-size: .95rem; }
.perks i { display: grid; place-items: center; flex-shrink: 0; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: linear-gradient(135deg, #ffd66b, #f5a524); color: #fff; }
@media (max-width: 480px) { .upgrade-page { padding: 1rem .75rem; } .upgrade-card { padding: 1.25rem; } }
</style>
