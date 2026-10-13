<template>
  <div class="roles-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Roles &amp; Access Control</h1>
        <p class="page-sub">Manage administrator privileges, role-based access, and two-factor authentication.</p>
      </div>
      <div class="head-actions">
        <button v-if="!currentAdmin?.totpEnabled" type="button" class="mfa-setup-btn" @click="openMfaModal">
          <i class="ri-shield-keyhole-line" aria-hidden="true"></i> Set up 2FA for my account
        </button>
        <button v-if="isSuperAdmin" type="button" class="add-btn" @click="openAdd">
          <i class="ri-user-add-line" aria-hidden="true"></i> Add administrator
        </button>
      </div>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <!-- Role Definitions Reference Banner -->
    <div class="roles-info-grid">
      <div class="role-info-card">
        <div class="role-badge super_admin">Super Admin</div>
        <p>Full system access: role assignment, administrator provisioning &amp; removal, audit logs, user management, and moderation.</p>
      </div>
      <div class="role-info-card">
        <div class="role-badge admin">Admin</div>
        <p>Management access: view live analytics, audit logs, suspend/activate users, bans, profile verifications, and reports.</p>
      </div>
      <div class="role-info-card">
        <div class="role-badge moderator">Moderator</div>
        <p>Safety access: review selfie/ID verification queue, resolve user reports, review user details, and remove abusive photos.</p>
      </div>
    </div>

    <div class="table-card">
      <table class="admins-table">
        <thead>
          <tr>
            <th>Administrator</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>2FA / MFA</th>
            <th>Last Sign-In</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in admins" :key="a.id" class="admin-row" :class="{ 'is-disabled': !a.isActive }">
            <td>
              <div class="admin-cell">
                <div class="admin-avatar" aria-hidden="true">{{ initials(a.name) }}</div>
                <div>
                  <strong>{{ a.name }}</strong>
                  <span v-if="a.isYou" class="you-badge">You</span>
                </div>
              </div>
            </td>
            <td class="muted">{{ a.email }}</td>
            <td>
              <span class="role-pill" :class="a.role">
                {{ formatRole(a.role) }}
              </span>
            </td>
            <td>
              <span class="status-pill" :class="a.isActive ? 'is-active' : 'is-suspended'">
                {{ a.isActive ? 'Active' : 'Suspended' }}
              </span>
            </td>
            <td>
              <span v-if="a.totpEnabled" class="mfa-pill is-enabled">
                <i class="ri-shield-check-fill" aria-hidden="true"></i> Enabled
              </span>
              <span v-else class="mfa-pill is-none">
                <i class="ri-shield-line" aria-hidden="true"></i> Not set
              </span>
            </td>
            <td class="muted">{{ a.lastLoginAt ? when(a.lastLoginAt) : 'Never' }}</td>
            <td class="action-col">
              <div v-if="isSuperAdmin" class="action-buttons">
                <button
                  type="button"
                  class="edit-btn"
                  title="Edit Role &amp; Permissions"
                  @click="openEdit(a)"
                >
                  <i class="ri-edit-line"></i> Edit
                </button>
                <button
                  v-if="!a.isYou"
                  type="button"
                  class="remove-btn"
                  title="Remove Administrator"
                  @click="confirmRemove(a)"
                >
                  <i class="ri-delete-bin-line"></i>
                </button>
              </div>
              <span v-else class="muted text-sm">Protected</span>
            </td>
          </tr>
          <tr v-if="!admins.length">
            <td colspan="7" class="empty-row">No administrators found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal: Add New Admin -->
    <UModal :is-open="addOpen" title="Add administrator" max-width="sm" @close="addOpen = false">
      <form id="add-admin" class="d-flex flex-column gap-3" @submit.prevent="addAdmin">
        <UInput v-model="form.name" required placeholder="Full Name" icon="ri-user-line" />
        <UInput v-model="form.email" type="email" required placeholder="Admin Email" icon="ri-mail-line" autocomplete="off" />
        <div class="field-group">
          <label class="field-label">Assigned Role</label>
          <select v-model="form.role" class="form-select role-select">
            <option value="moderator">Moderator (Reports &amp; Verifications)</option>
            <option value="admin">Admin (User Management &amp; Analytics)</option>
            <option value="super_admin">Super Admin (Full Access &amp; Role Management)</option>
          </select>
        </div>
        <UInput
          v-model="form.password"
          type="password"
          required
          :minlength="10"
          placeholder="Password (10+ characters)"
          icon="ri-lock-line"
          autocomplete="new-password"
          hint="Passwords are securely hashed before storage. Share privately with the administrator."
        />
        <p v-if="formError" class="form-error" role="alert"><i class="ri-error-warning-fill"></i> {{ formError }}</p>
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" @click="addOpen = false">Cancel</UButton>
        <UButton type="submit" form="add-admin" variant="primary" size="md" :loading="busy">Create Administrator</UButton>
      </template>
    </UModal>

    <!-- Modal: Edit Admin Role & Status -->
    <UModal :is-open="editOpen" :title="`Edit ${selectedAdmin?.name || 'Admin'}`" max-width="sm" @close="editOpen = false">
      <div v-if="selectedAdmin" class="d-flex flex-column gap-3">
        <div class="field-group">
          <label class="field-label">Role</label>
          <select v-model="editForm.role" class="form-select role-select" :disabled="selectedAdmin.isYou">
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <small v-if="selectedAdmin.isYou" class="form-hint">You cannot change your own role.</small>
        </div>

        <div class="field-group">
          <label class="field-label">Account Status</label>
          <div class="d-flex gap-2">
            <button
              type="button"
              class="status-toggle-btn"
              :class="{ 'is-active': editForm.isActive }"
              @click="editForm.isActive = true"
            >
              <i class="ri-checkbox-circle-fill"></i> Active
            </button>
            <button
              type="button"
              class="status-toggle-btn is-danger"
              :class="{ 'is-active': !editForm.isActive }"
              :disabled="selectedAdmin.isYou"
              @click="editForm.isActive = false"
            >
              <i class="ri-forbid-circle-fill"></i> Suspended
            </button>
          </div>
          <small v-if="selectedAdmin.isYou" class="form-hint">You cannot suspend your own account.</small>
        </div>
        <p v-if="editError" class="form-error" role="alert"><i class="ri-error-warning-fill"></i> {{ editError }}</p>
      </div>
      <template #footer>
        <UButton variant="secondary" size="md" @click="editOpen = false">Cancel</UButton>
        <UButton variant="primary" size="md" :loading="busy" @click="saveEdit">Save Changes</UButton>
      </template>
    </UModal>

    <!-- Modal: 2FA / TOTP Setup for Current Admin -->
    <UModal :is-open="mfaOpen" title="Set Up Two-Factor Authentication" max-width="sm" @close="mfaOpen = false">
      <div class="d-flex flex-column gap-3">
        <p class="text-sm">Scan the QR code below using your authenticator app (e.g. Google Authenticator, 1Password, Authy), then enter the 6-digit confirmation code.</p>

        <div v-if="mfaQr" class="mfa-qr-container">
          <img :src="mfaQr" alt="MFA QR Code" width="200" height="200" class="mfa-qr-img" />
          <code class="mfa-secret-code">{{ mfaSecret }}</code>
        </div>

        <UInput
          v-model="mfaConfirmCode"
          required
          autofocus
          :maxlength="6"
          placeholder="000000"
          icon="ri-shield-keyhole-line"
          hint="Enter the 6-digit code from your authenticator"
        />

        <p v-if="mfaError" class="form-error" role="alert"><i class="ri-error-warning-fill"></i> {{ mfaError }}</p>
      </div>
      <template #footer>
        <UButton variant="secondary" size="md" @click="mfaOpen = false">Cancel</UButton>
        <UButton variant="primary" size="md" :loading="busy" @click="confirmMfa">Verify &amp; Activate 2FA</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import UModal from '../../components/ui/UModal.vue';
import UInput from '../../components/ui/UInput.vue';
import UButton from '../../components/ui/UButton.vue';
import { adminApi, adminSession, AdminRole, AdminUser } from '../../services/adminApi';
import { useToastStore } from '../../stores/toast';

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isYou: boolean;
}

const currentAdmin = ref<AdminUser | null>(null);
const isSuperAdmin = computed(() => currentAdmin.value?.role === 'super_admin');

const admins = ref<AdminItem[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

const addOpen = ref(false);
const formError = ref<string | null>(null);
const form = reactive({ name: '', email: '', password: '', role: 'admin' as AdminRole });

const editOpen = ref(false);
const editError = ref<string | null>(null);
const selectedAdmin = ref<AdminItem | null>(null);
const editForm = reactive({ role: 'admin' as AdminRole, isActive: true });

const mfaOpen = ref(false);
const mfaQr = ref<string | null>(null);
const mfaSecret = ref<string | null>(null);
const mfaConfirmCode = ref('');
const mfaError = ref<string | null>(null);

const toast = useToastStore();

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatRole(role: AdminRole) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'moderator') return 'Moderator';
  return 'Admin';
}

function when(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

async function load() {
  error.value = null;
  try {
    currentAdmin.value = await adminSession();
    const res = await adminApi.get('/admins');
    admins.value = res.data.data;
  } catch (err: any) {
    error.value = err.message || 'Failed to load administrators.';
  }
}

function openAdd() {
  form.name = '';
  form.email = '';
  form.password = '';
  form.role = 'admin';
  formError.value = null;
  addOpen.value = true;
}

async function addAdmin() {
  formError.value = null;
  busy.value = true;
  try {
    await adminApi.post('/admins', form);
    addOpen.value = false;
    toast.success(`Administrator ${form.email} created.`);
    await load();
  } catch (err: any) {
    formError.value = err.message;
  } finally {
    busy.value = false;
  }
}

function openEdit(admin: AdminItem) {
  selectedAdmin.value = admin;
  editForm.role = admin.role;
  editForm.isActive = admin.isActive;
  editError.value = null;
  editOpen.value = true;
}

async function saveEdit() {
  if (!selectedAdmin.value) return;
  editError.value = null;
  busy.value = true;
  try {
    await adminApi.patch(`/roles/${selectedAdmin.value.id}`, {
      role: editForm.role,
      isActive: editForm.isActive,
    });
    editOpen.value = false;
    toast.success(`Updated permissions for ${selectedAdmin.value.name}.`);
    await load();
  } catch (err: any) {
    editError.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function confirmRemove(admin: AdminItem) {
  if (!confirm(`Are you sure you want to remove administrator "${admin.name}" (${admin.email})? This action will revoke all their active sessions.`)) return;
  try {
    await adminApi.delete(`/admins/${admin.id}`);
    toast.success(`Removed admin ${admin.name}.`);
    await load();
  } catch (err: any) {
    alert(err.message || 'Failed to remove admin.');
  }
}

async function openMfaModal() {
  mfaError.value = null;
  mfaConfirmCode.value = '';
  busy.value = true;
  try {
    const res = await adminApi.post('/mfa/setup');
    mfaQr.value = res.data.data.qrCodeDataUrl;
    mfaSecret.value = res.data.data.secret;
    mfaOpen.value = true;
  } catch (err: any) {
    alert(err.message || 'Failed to initiate 2FA setup.');
  } finally {
    busy.value = false;
  }
}

async function confirmMfa() {
  if (mfaConfirmCode.value.trim().length !== 6) {
    mfaError.value = 'Enter a 6-digit code.';
    return;
  }
  mfaError.value = null;
  busy.value = true;
  try {
    await adminApi.post('/mfa/confirm', { code: mfaConfirmCode.value.trim() });
    mfaOpen.value = false;
    toast.success('Two-factor authentication enabled successfully.');
    await load();
  } catch (err: any) {
    mfaError.value = err.message;
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.roles-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-sub   { margin: 0.2rem 0 0; color: #6c647d; font-size: 0.9rem; }

.head-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.mfa-setup-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.95rem;
  border: 1px solid #c4b5fd;
  border-radius: 0.75rem;
  background: #f5f3ff;
  color: #6d28d9;
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;

  &:hover { background: #ede9fe; }
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border: 0;
  border-radius: 0.75rem;
  background: #1d1633;
  color: #fff;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;

  &:hover { opacity: 0.9; }
}

.roles-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

.role-info-card {
  padding: 1.15rem;
  border-radius: 0.85rem;
  background: #fff;
  border: 1px solid #ebe4f5;

  p {
    margin: 0.6rem 0 0;
    font-size: 0.82rem;
    color: #6c647d;
    line-height: 1.45;
  }
}

.role-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &.super_admin { background: #fef3c7; color: #b45309; }
  &.admin       { background: #e0e7ff; color: #4338ca; }
  &.moderator   { background: #ccfbf1; color: #0f766e; }
}

.table-card {
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #ebe4f5;
  overflow-x: auto;
}

.admins-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;

  th {
    padding: 0.85rem 1.15rem;
    text-align: left;
    font-weight: 700;
    color: #6c647d;
    border-bottom: 1px solid #f1ecf8;
    background: #faf8fd;
  }

  td {
    padding: 0.85rem 1.15rem;
    border-bottom: 1px solid #f7f5fa;
    vertical-align: middle;
  }

  tr.is-disabled {
    opacity: 0.6;
    background: #fdfafa;
  }
}

.admin-cell {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.admin-avatar {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #c00078);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
}

.you-badge {
  margin-left: 0.4rem;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
  background: #1d1633;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
}

.role-pill {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;

  &.super_admin { background: #fef3c7; color: #b45309; }
  &.admin       { background: #e0e7ff; color: #4338ca; }
  &.moderator   { background: #ccfbf1; color: #0f766e; }
}

.status-pill {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;

  &.is-active { background: #d1fae5; color: #065f46; }
  &.is-suspended { background: #fee2e2; color: #991b1b; }
}

.mfa-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.76rem;
  font-weight: 700;

  &.is-enabled { color: #059669; }
  &.is-none    { color: #9ca3af; }
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.edit-btn, .remove-btn {
  border: 1px solid #e2d9f3;
  background: #fff;
  border-radius: 0.5rem;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover { background: #f5f2fb; }
}

.remove-btn {
  color: #dc2626;
  &:hover { background: #fee2e2; border-color: #fca5a5; }
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1d1633;
}

.role-select {
  padding: 0.55rem;
  border-radius: 0.6rem;
  border: 1px solid #dcd3eb;
  font-size: 0.88rem;
}

.status-toggle-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.55rem;
  border: 1px solid #dcd3eb;
  border-radius: 0.6rem;
  background: #fff;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;

  &.is-active {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #065f46;
  }

  &.is-danger.is-active {
    background: #fef2f2;
    border-color: #fecaca;
    color: #991b1b;
  }
}

.form-hint {
  font-size: 0.75rem;
  color: #8b8499;
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.5rem;
  background: #fee2e2;
  color: #dc2626;
  font-size: 0.82rem;
}

.mfa-qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: #faf8fd;
  border-radius: 0.75rem;
}

.mfa-qr-img {
  border-radius: 0.5rem;
}

.mfa-secret-code {
  font-family: monospace;
  font-size: 0.85rem;
  background: #f1ecf8;
  padding: 0.2rem 0.5rem;
  border-radius: 0.4rem;
  letter-spacing: 0.1em;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.9rem;
}
</style>
