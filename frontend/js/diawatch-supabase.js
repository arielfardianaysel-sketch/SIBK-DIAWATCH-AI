import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';

const SUPABASE_URL = 'https://vdtrtpqktkijqfmpcyow.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7FQjlgJ5ObasKROlTWZynQ_73KSN3u9';
export const API_BASE_URL = 'http://127.0.0.1:8000';

if (!SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') || SUPABASE_PUBLISHABLE_KEY.includes('GANTI_')) {
  console.warn('DiaWatch: isi SUPABASE_PUBLISHABLE_KEY dalam frontend/js/diawatch-supabase.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export async function registerUser(email, password, displayName, birthDate) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        ...(birthDate ? { birth_date: birthDate } : {}),
      },
      emailRedirectTo: `${location.origin}/integration-test.html`,
    },
  });
  if (error) throw error;
  // A verified email may be required before login (project's auth settings).
  return data;
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getMyProfile() {
  const user = await currentUser();
  if (!user) throw new Error('Belum login.');
  const { data, error } = await supabase.from('profiles')
    .select('id,display_name,birth_date,created_at').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getBearerToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Silakan login terlebih dahulu.');
  return token; // Do not log or send this token to anyone.
}

export async function backendRequest(path, { method = 'GET', body } = {}) {
  const token = await getBearerToken();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`Tidak bisa menghubungi FastAPI (${API_BASE_URL}). Periksa server dan CORS. ${error.message}`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.detail === 'string' ? result.detail : `HTTP ${response.status}`);
  }
  return result;
}

export async function getBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`FastAPI health HTTP ${response.status}`);
  return response.json();
}

export async function getHistory() {
  const result = await backendRequest('/api/history');
  return result.items ?? [];
}

export async function getHistoryDetail(id) {
  return backendRequest(`/api/history/${encodeURIComponent(id)}`);
}

export async function submitScreening(answers) {
  // Important: Current backend path is /api/predict, not /api/screenings.
  // Qwen llama-server must be running before this function can succeed.
  return backendRequest('/api/predict', { method: 'POST', body: answers });
}

export async function deleteMyScreening(id) {
  // Supabase RLS allows users to delete only their own history entries.
  const { error } = await supabase.from('screenings').delete().eq('id', id);
  if (error) throw error;
}

// Account changes use the signed-in user's Auth session, never an admin key.
export async function updateAccountDetails(displayName, birthDate) {
  const { data, error } = await supabase.auth.updateUser({
    data: { display_name: displayName, birth_date: birthDate },
  });
  if (error) throw error;
  return data.user;
}

export async function updateAccountEmail(email) {
  const { data, error } = await supabase.auth.updateUser({ email }, {
    emailRedirectTo: `${location.origin}/profile.html`,
  });
  if (error) throw error;
  return data.user;
}

export async function updateAccountPassword(currentPassword, newPassword) {
  const user = await currentUser();
  if (!user?.email) throw new Error('Silakan masuk kembali sebelum mengganti kata sandi.');
  const verified = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verified.error) throw new Error('Kata sandi saat ini salah atau verifikasi akun gagal.');
  if (verified.data.user?.id !== user.id) throw new Error('Verifikasi akun gagal. Silakan masuk kembali.');
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data.user;
}
