<template>
  <section class="a-card" aria-labelledby="twofactor-title">
    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
      <div>
        <h2 id="twofactor-title" class="a-title mb-1">
          <i class="ri-shield-keyhole-line" aria-hidden="true"></i>Two-factor authentication (2FA)
        </h2>
        <p class="a-hint mb-0">
          Protect your account with a 6-digit code from Google Authenticator, Microsoft Authenticator, or any TOTP app. Works offline after setup.
        </p>
      </div>
      <span class="a-badge" :class="status.enabled ? 'is-ok' : 'is-warn'">
        {{ status.enabled ? 'Enabled' : 'Off' }}
      </span>
    </div>

    <div class="a-row mt-2">
      <i class="ri-smartphone-line a-icon" aria-hidden="true"></i>
      <span class="a-text">
        <small>Authenticator app</small>
        <span v-if="status.enabled">
          Active · {{ status.recoveryCodesRemaining }} backup recovery {{ status.recoveryCodesRemaining === 1 ? 'code' : 'codes' }} remaining
        </span>
        <span v-else>Not configured</span>
      </span>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <template v-if="!status.enabled">
          <button type="button" class="a-btn" :disabled="setupBusy" @click="openSetup">
            {{ setupBusy ? 'Starting…' : 'Set up 2FA' }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="a-btn" @click="openReauth('regenerate')">New recovery codes</button>
          <button type="button" class="a-btn is-danger" @click="openReauth('disable')">Turn off</button>
        </template>
      </div>
    </div>

    <!-- Setup Modal: Step 1 (QR + Manual Key + Verify Code) or Step 2 (One-time Recovery Codes) -->
    <UModal
      :is-open="setupOpen"
      :title="recoveryCodesToDisplay.length ? 'Save your recovery codes' : 'Set up authenticator app'"
      max-width="md"
      :close-on-backdrop="false"
      @close="closeSetup"
    >
      <div v-if="recoveryCodesToDisplay.length" class="d-flex flex-column gap-3">
        <div class="recovery-banner p-3 rounded-4">
          <strong class="d-block mb-1"><i class="ri-Alert-line me-1" aria-hidden="true"></i>Save these backup codes now</strong>
          <p class="small mb-0 u-text-secondary">
            Each code can be used once to sign in if you lose your phone or authenticator app. For your security, they will <strong>never be shown again</strong> after you close this window.
          </p>
        </div>

        <div class="recovery-grid" aria-label="One-time recovery codes">
          <code v-for="rc in recoveryCodesToDisplay" :key="rc" class="recovery-chip">{{ rc }}</code>
        </div>

        <div class="d-flex gap-2 flex-wrap">
          <UButton variant="secondary" size="sm" @click="copyRecoveryCodes">
            <i class="ri-file-copy-line me-1" aria-hidden="true"></i>Copy codes
          </UButton>
          <UButton variant="secondary" size="sm" @click="downloadRecoveryCodes">
            <i class="ri-download-2-line me-1" aria-hidden="true"></i>Download .txt
          </UButton>
        </div>
      </div>

      <form v-else-if="setupData" id="totp-setup-form" class="d-flex flex-column gap-3" @submit.prevent="confirmSetup">
        <p class="small mb-0 u-text-secondary">
          1. Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> and scan this QR code:
        </p>

        <div class="qr-box align-self-center p-3 rounded-4">
          <img :src="setupData.qrCodeDataUrl" alt="QR code for authenticator app setup" width="200" height="200" />
        </div>

        <div class="manual-key-box p-3 rounded-4">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="small fw-bold u-text-secondary">Can't scan? Enter this setup key manually:</span>
            <button type="button" class="copy-link" @click="copyManualKey">
              <i class="ri-file-copy-line me-1" aria-hidden="true"></i>Copy key
            </button>
          </div>
          <code class="manual-key-code d-block text-break">{{ formattedManualKey }}</code>
          <small class="u-text-muted d-block mt-1">Account: {{ setupData.accountName }} · Time-based (TOTP)</small>
        </div>

        <div>
          <label for="totp-setup-code" class="small fw-semibold u-text-secondary d-block mb-1">
            2. Enter the 6-digit code shown in your app to verify and enable:
          </label>
          <input
            id="totp-setup-code"
            v-model="setupCode"
            class="code-input w-100"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="••••••"
            required
            :aria-invalid="setupError ? 'true' : undefined"
            @input="onSetupCodeInput"
          />
        </div>

        <p v-if="setupError" class="small text-danger fw-medium mb-0" role="alert">{{ setupError }}</p>
      </form>

      <template #footer>
        <template v-if="recoveryCodesToDisplay.length">
          <UButton variant="primary" size="md" @click="closeSetup">I have saved these codes</UButton>
        </template>
        <template v-else>
          <UButton variant="secondary" size="md" :disabled="verifyingSetup" @click="closeSetup">Cancel</UButton>
          <UButton
            type="submit"
            form="totp-setup-form"
            variant="primary"
            size="md"
            :loading="verifyingSetup"
            :disabled="!/^\d{6}$/.test(setupCode)"
          >
            Verify &amp; enable
          </UButton>
        </template>
      </template>
    </UModal>

    <!-- Reauthentication Modal for Disabling 2FA or Regenerating Recovery Codes -->
    <UModal
      :is-open="reauthMode !== null"
      :title="reauthMode === 'disable' ? 'Turn off two-factor authentication' : 'Generate new recovery codes'"
      max-width="sm"
      :close-on-backdrop="false"
      @close="closeReauth"
    >
      <form id="totp-reauth-form" class="d-flex flex-column gap-3" @submit.prevent="submitReauth">
        <p class="small mb-0 u-text-secondary">
          <template v-if="reauthMode === 'disable'">
            Turning off 2FA removes the extra security check from your account and invalidates your current recovery codes. Confirm your identity to continue.
          </template>
          <template v-else>
            Generating new recovery codes immediately invalidates your previous recovery codes. Confirm your identity to continue.
          </template>
        </p>

        <UInput
          v-if="hasPassword"
          v-model="reauthPassword"
          type="password"
          placeholder="Current password"
          icon="ri-lock-line"
          autocomplete="current-password"
        />

        <UInput
          v-model="reauthCode"
          type="text"
          :maxlength="9"
          placeholder="6-digit authenticator or recovery code"
          icon="ri-shield-keyhole-line"
          autocomplete="one-time-code"
        />

        <p v-if="reauthError" class="small text-danger fw-medium mb-0" role="alert">{{ reauthError }}</p>
      </form>

      <template #footer>
        <UButton variant="secondary" size="md" :disabled="reauthBusy" @click="closeReauth">Cancel</UButton>
        <UButton
          type="submit"
          form="totp-reauth-form"
          :variant="reauthMode === 'disable' ? 'danger' : 'primary'"
          size="md"
          :loading="reauthBusy"
          :disabled="!canSubmitReauth"
        >
          {{ reauthMode === 'disable' ? 'Turn off 2FA' : 'Generate new codes' }}
        </UButton>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import UModal from '../ui/UModal.vue';
import UInput from '../ui/UInput.vue';
import UButton from '../ui/UButton.vue';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';
import { TwoFactorSetupData, TwoFactorStatus } from '../../types';

const authStore = useAuthStore();
const toast = useToastStore();

const hasPassword = computed(() => Boolean(authStore.user?.hasPassword));

const status = ref<TwoFactorStatus>({
  enabled: Boolean(authStore.user?.twoFactorEnabled),
  enabledAt: null,
  recoveryCodesRemaining: 0,
});

const setupBusy = ref(false);
const setupOpen = ref(false);
const setupData = ref<TwoFactorSetupData | null>(null);
const setupCode = ref('');
const setupError = ref<string | null>(null);
const verifyingSetup = ref(false);
const recoveryCodesToDisplay = ref<string[]>([]);

const reauthMode = ref<'disable' | 'regenerate' | null>(null);
const reauthPassword = ref('');
const reauthCode = ref('');
const reauthBusy = ref(false);
const reauthError = ref<string | null>(null);

const formattedManualKey = computed(() => {
  const raw = setupData.value?.manualEntryKey || '';
  return raw.replace(/(.{4})/g, '$1 ').trim();
});

const canSubmitReauth = computed(() => {
  return Boolean(reauthPassword.value.trim().length > 0 || reauthCode.value.trim().length >= 6);
});

async function loadStatus() {
  try {
    status.value = await authStore.fetchTwoFactorStatus();
  } catch {
    // Fallback to user flag if status call fails
  }
}

onMounted(loadStatus);

async function openSetup() {
  setupBusy.value = true;
  setupError.value = null;
  try {
    setupData.value = await authStore.startTwoFactorSetup();
    setupCode.value = '';
    recoveryCodesToDisplay.value = [];
    setupOpen.value = true;
  } catch (err: any) {
    toast.error(err.message || 'Could not start 2FA setup.');
  } finally {
    setupBusy.value = false;
  }
}

function closeSetup() {
  if (verifyingSetup.value) return;
  setupOpen.value = false;
  setupData.value = null;
  setupCode.value = '';
  setupError.value = null;
  recoveryCodesToDisplay.value = [];
}

function onSetupCodeInput() {
  setupCode.value = setupCode.value.replace(/\D/g, '').slice(0, 6);
}

async function confirmSetup() {
  if (!/^\d{6}$/.test(setupCode.value) || verifyingSetup.value) return;
  verifyingSetup.value = true;
  setupError.value = null;
  try {
    const res = await authStore.enableTwoFactor(setupCode.value);
    recoveryCodesToDisplay.value = res.recoveryCodes;
    await loadStatus();
    toast.success('Two-factor authentication enabled.');
  } catch (err: any) {
    setupError.value = err.message || 'Invalid verification code. Try again.';
  } finally {
    verifyingSetup.value = false;
  }
}

function openReauth(mode: 'disable' | 'regenerate') {
  reauthMode.value = mode;
  reauthPassword.value = '';
  reauthCode.value = '';
  reauthError.value = null;
}

function closeReauth() {
  if (reauthBusy.value) return;
  reauthMode.value = null;
  reauthPassword.value = '';
  reauthCode.value = '';
  reauthError.value = null;
}

async function submitReauth() {
  if (!canSubmitReauth.value || !reauthMode.value || reauthBusy.value) return;
  reauthBusy.value = true;
  reauthError.value = null;
  const payload = {
    ...(reauthPassword.value ? { password: reauthPassword.value } : {}),
    ...(reauthCode.value.trim() ? { code: reauthCode.value.trim() } : {}),
  };
  try {
    if (reauthMode.value === 'disable') {
      await authStore.disableTwoFactor(payload);
      await loadStatus();
      reauthBusy.value = false;
      closeReauth();
      toast.success('Two-factor authentication turned off.');
    } else {
      const res = await authStore.regenerateRecoveryCodes(payload);
      await loadStatus();
      reauthBusy.value = false;
      closeReauth();
      recoveryCodesToDisplay.value = res.recoveryCodes;
      setupOpen.value = true;
      toast.success('New recovery codes generated.');
    }
  } catch (err: any) {
    reauthError.value = err.message || 'Could not verify your credentials.';
  } finally {
    reauthBusy.value = false;
  }
}

async function copyManualKey() {
  if (!setupData.value?.manualEntryKey) return;
  try {
    await navigator.clipboard.writeText(setupData.value.manualEntryKey);
    toast.success('Setup key copied to clipboard.');
  } catch {
    toast.error('Could not copy automatically. Select and copy the key manually.');
  }
}

async function copyRecoveryCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodesToDisplay.value.join('\n'));
    toast.success('Recovery codes copied to clipboard.');
  } catch {
    toast.error('Could not copy automatically.');
  }
}

function downloadRecoveryCodes() {
  const content = [
    'Unmute — Two-Factor Authentication Recovery Codes',
    `Generated: ${new Date().toISOString()}`,
    'Each code can only be used once. Keep them in a safe place.',
    '',
    ...recoveryCodesToDisplay.value,
    '',
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'unmute-recovery-codes.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<style scoped lang="scss">
.a-card {
  padding: 1.1rem 1.15rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}

.a-title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--unmute-text-heading);

  i {
    font-size: 1.3rem;
    color: var(--unmute-cta);
  }
}

.a-hint {
  font-size: 0.85rem;
  color: var(--unmute-text-muted);
}

.a-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0 0.2rem;
  border-top: 1px solid var(--unmute-glass-border);
}

.a-icon {
  flex-shrink: 0;
  font-size: 1.3rem;
  color: var(--unmute-brand-plum);
}

.a-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  color: var(--unmute-text-heading);

  small {
    color: var(--unmute-text-muted);
    font-size: 0.78rem;
  }

  > span {
    font-size: 0.92rem;
    color: var(--unmute-text-heading);
  }
}

.a-badge {
  align-self: flex-start;
  padding: 0.15rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;

  &.is-ok {
    background: var(--unmute-success-surface);
    color: var(--unmute-success-text);
  }

  &.is-warn {
    background: var(--unmute-warn-surface);
    color: var(--unmute-warn-text);
  }
}

.a-btn {
  flex-shrink: 0;
  padding: 0.4rem 1rem;
  border: 1px solid var(--unmute-glass-border);
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-primary-surface);
  color: var(--unmute-cta);
  font-size: 0.88rem;
  font-weight: 700;

  &.is-danger {
    color: var(--unmute-danger);
    background: color-mix(in srgb, var(--unmute-danger) 10%, transparent);
  }
}

.qr-box {
  background: #ffffff;
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);

  img {
    display: block;
    border-radius: 0.5rem;
  }
}

.manual-key-box {
  background: var(--unmute-surface-overlay);
  border: 1px solid var(--unmute-glass-border);
}

.manual-key-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--unmute-text-heading);
  letter-spacing: 0.06em;
}

.copy-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--unmute-cta);
  font-size: 0.8rem;
  font-weight: 700;
}

.code-input {
  height: 3.4rem;
  border: 1px solid var(--unmute-input-border);
  border-radius: var(--unmute-radius-sm);
  background: var(--unmute-input-bg);
  color: var(--unmute-text-heading);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.55em;
  text-indent: 0.55em;
  text-align: center;
  outline: none;

  &:focus {
    border-color: var(--unmute-primary);
    box-shadow: 0 0 0 4px var(--unmute-primary-surface);
  }
}

.recovery-banner {
  background: var(--unmute-warn-surface);
  color: var(--unmute-warn-text);
  border: 1px solid var(--unmute-glass-border);
}

.recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.recovery-chip {
  padding: 0.55rem 0.75rem;
  border-radius: 0.75rem;
  background: var(--unmute-input-bg);
  border: 1px solid var(--unmute-input-border);
  color: var(--unmute-text-heading);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.95rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.08em;
}
</style>

