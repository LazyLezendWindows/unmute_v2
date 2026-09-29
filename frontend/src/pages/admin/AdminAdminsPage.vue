<template>
  <div class="admins-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Admins</h1>
        <p class="page-sub">Admins can view all member data, disable accounts, and verify profiles.</p>
      </div>
      <button type="button" class="add-btn" @click="openAdd">
        <i class="ri-user-add-line" aria-hidden="true"></i> Add admin
      </button>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div class="table-card">
      <table class="admins-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Added</th>
            <th>Last sign-in</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in admins" :key="a.id" class="admin-row">
            <td>
              <div class="admin-cell">
                <div class="admin-avatar" aria-hidden="true">{{ initials(a.name) }}</div>
                <strong>{{ a.name }}</strong>
                <span v-if="a.isYou" class="you-badge">You</span>
              </div>
            </td>
            <td class="muted">{{ a.email }}</td>
            <td class="muted">{{ when(a.createdAt) }}</td>
            <td class="muted">{{ a.lastLoginAt ? when(a.lastLoginAt) : 'Never' }}</td>
            <td class="action-col">
              <button
                v-if="!a.isYou && admins.length > 1"
                type="button"
                class="remove-btn"
                @click="remove(a)"
              >
                Remove
              </button>
            </td>
          </tr>
          <tr v-if="!admins.length">
            <td colspan="5" class="empty-row">No admins found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal :is-open="addOpen" title="Add an admin" max-width="sm" @close="addOpen = false">
      <form id="add-admin" class="d-flex flex-column gap-3" @submit.prevent="add">
        <UInput v-model="form.name" required placeholder="Name" icon="ri-user-line" />
        <UInput v-model="form.email" type="email" required placeholder="Email" icon="ri-mail-line" autocomplete="off" />
        <UInput
          v-model="form.password"
          type="password"
          required
          :minlength="10"
          placeholder="Password (10+ characters)"
          icon="ri-lock-line"
          autocomplete="new-password"
          hint="Share it with them privately; they sign in at /admin."
        />
        <p v-if="formError" class="form-error" role="alert"><i class="ri-error-warning-fill"></i> {{ formError }}</p>
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" @click="addOpen = false">Cancel</UButton>
        <UButton type="submit" form="add-admin" variant="primary" size="md" :loading="busy">Create admin</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import UModal from '../../components/ui/UModal.vue';
import UInput from '../../components/ui/UInput.vue';
import UButton from '../../components/ui/UButton.vue';
import { adminApi } from '../../services/adminApi';
import { useToastStore } from '../../stores/toast';

interface Admin { id: string; email: string; name: string; createdAt: string; lastLoginAt: string | null; isYou: boolean }

const admins = ref<Admin[]>([]);
const error = ref<string | null>(null);
const addOpen = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const form = reactive({ name: '', email: '', password: '' });

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

async function load() {
  try { admins.value = (await adminApi.get('/admins')).data.data; }
  catch (err: any) { error.value = err.message; }
}

function openAdd() {
  Object.assign(form, { name: '', email: '', password: '' });
  formError.value = null;
  addOpen.value = true;
}

async function add() {
  busy.value = true; formError.value = null;
  try {
    await adminApi.post('/admins', { name: form.name.trim(), email: form.email.trim(), password: form.password });
    addOpen.value = false;
    useToastStore().success(`${form.name.trim()} can now sign in to the admin panel.`);
    await load();
  } catch (err: any) { formError.value = err.message; }
  finally { busy.value = false; }
}

async function remove(a: Admin) {
  if (!confirm(`Remove ${a.name} (${a.email}) as an admin? They'll be signed out immediately.`)) return;
  try {
    await adminApi.delete(`/admins/${a.id}`);
    useToastStore().success(`${a.name} is no longer an admin.`);
    await load();
  } catch (err: any) { useToastStore().error(err.message); }
}

function when(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped lang="scss">
.admins-page { max-width: 60rem; }

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-sub   { margin: 0.15rem 0 0; color: #8b8499; font-size: 0.9rem; }

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: 0.75rem;
  background: #1d1633;
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  transition: opacity 0.12s;

  &:hover { opacity: 0.85; }
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.9rem;
}

.table-card {
  overflow-x: auto;
  border: 1px solid #ece7f5;
  border-radius: 1.1rem;
  background: #fff;
}

.admins-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;

  th {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #ece7f5;
    color: #8b8499;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    padding: 0.8rem 1rem;
    border-bottom: 1px solid #f3eff9;
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: 0; }
}

.admin-row { transition: background 0.1s; &:hover { background: #faf8fd; } }

.admin-cell {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.admin-avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #c00078, #7c3aed);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
}

.you-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #fbe4f2;
  color: #c00078;
  font-size: 0.7rem;
  font-weight: 700;
}

.muted { color: #8b8499; }
.empty-row { padding: 2.5rem; text-align: center; color: #8b8499; }
.action-col { text-align: right; }

.remove-btn {
  padding: 0.35rem 0.85rem;
  border: 1px solid #f3c7cd;
  border-radius: 9999px;
  background: #fff;
  color: #c62839;
  font-weight: 600;
  font-size: 0.82rem;
  transition: background 0.12s;

  &:hover { background: #fde7e9; }
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.6rem 0.85rem;
  border-radius: 0.7rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.85rem;
}

/* Phones: title above the button, and each admin as a card. */
@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }

  .admins-table thead { display: none; }

  .admins-table,
  .admins-table tbody { display: block; }

  .admins-table .admin-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.3rem 0.75rem;
    padding: 0.85rem 0.9rem;
    border-bottom: 1px solid #f0ecf7;
  }

  .admins-table .admin-row td {
    display: block;
    padding: 0;
    border: 0;
    font-size: 0.82rem;
  }

  .admins-table .admin-row td:nth-child(1) { grid-column: 1; }
  .admins-table .admin-row td:nth-child(5) { grid-column: 2; grid-row: 1; align-self: center; }
  .admins-table .admin-row td:nth-child(2) { grid-column: 1 / -1; overflow-wrap: anywhere; }
  .admins-table .admin-row td:nth-child(3)::before { content: 'Added '; }
  .admins-table .admin-row td:nth-child(4)::before { content: 'Last sign-in '; }
  .admins-table .admin-row td:nth-child(3),
  .admins-table .admin-row td:nth-child(4) { grid-column: 1 / -1; }
}
</style>
