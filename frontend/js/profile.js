import { supabase, currentUser, getMyProfile, updateAccountDetails, updateAccountEmail, updateAccountPassword } from './diawatch-supabase.js';

export function validBirthDate(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day && date <= today;
}

function message(form, text, failed = false) {
  const output = form.querySelector('[data-feedback]');
  output.textContent = text;
  output.setAttribute('role', failed ? 'alert' : 'status');
  output.style.color = failed ? 'var(--high)' : '';
}

function readableError(error) {
  const code = error?.code || '';
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') {
    return 'Silakan keluar lalu masuk kembali sebelum mengganti kata sandi.';
  }
  if (code === 'email_exists' || code === 'user_already_exists') return 'Email tersebut sudah digunakan akun lain.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.';
  if (code === 'same_password') return 'Gunakan kata sandi baru yang berbeda dari sebelumnya.';
  if (code === 'weak_password') return 'Kata sandi belum memenuhi ketentuan keamanan akun. Gunakan kombinasi yang lebih kuat.';
  return error?.message || 'Perubahan belum berhasil disimpan. Silakan coba lagi.';
}

export async function syncAccountSession(user) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!user || !data.session || data.session.user?.id !== user.id) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  setSession({ token: data.session.access_token, user: {
    id: user.id,
    name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Pengguna',
    email: user.email || '', birth_date: user.user_metadata?.birth_date || null,
  } });
  renderNav();
}

function showEmail(user) {
  document.getElementById('current-email').textContent = `Email aktif: ${user.email || '-'}`;
  const pending = document.getElementById('pending-email');
  pending.hidden = !user.new_email;
  pending.textContent = user.new_email ? `Menunggu konfirmasi perubahan ke ${user.new_email}. Periksa kotak masuk email Anda.` : '';
}

export async function initProfile() {
  if (!guard()) return;
  const loading = document.getElementById('profile-loading');
  const errorBox = document.getElementById('profile-error');
  let user;
  try {
    user = await currentUser();
    await syncAccountSession(user);
    const profile = await getMyProfile();
    document.getElementById('profile-name').value = profile?.display_name ?? user.user_metadata?.display_name ?? '';
    const birth = document.getElementById('profile-birth');
    birth.value = profile?.birth_date ?? user.user_metadata?.birth_date ?? '';
    const today = new Date();
    birth.max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    showEmail(user);
    document.getElementById('profile-content').hidden = false;
  } catch (error) {
    errorBox.textContent = readableError(error);
    errorBox.classList.remove('hide');
    return;
  } finally {
    loading.hidden = true;
  }

  // Forms are serialized so two account updates cannot overwrite session state.
  let busy = false;
  function submit(id, action) {
    const form = document.getElementById(id);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      const buttons = document.querySelectorAll('#profile-content button[type="submit"]');
      buttons.forEach(button => { button.disabled = true; });
      message(form, 'Menyimpan...');
      try {
        await action(form);
      } catch (error) {
        message(form, readableError(error), true);
      } finally {
        if (id === 'profile-password') form.reset();
        buttons.forEach(button => { button.disabled = false; });
        busy = false;
      }
    });
  }

  submit('profile-details', async form => {
    const name = form.elements.display_name.value.trim();
    const birthDate = form.elements.birth_date.value;
    if (name.length < 2 || name.length > 100) throw new Error('Nama harus berisi 2–100 karakter.');
    if (!validBirthDate(birthDate)) throw new Error('Tanggal lahir tidak valid atau berada di masa depan.');
    user = await updateAccountDetails(name, birthDate);
    await syncAccountSession(user);
    message(form, 'Data diri berhasil disimpan. Usia skrining akan mengikuti tanggal lahir terbaru.');
  });

  submit('profile-email', async form => {
    const email = form.elements.email.value.trim();
    user = await currentUser();
    if (email.toLowerCase() === user.email?.toLowerCase()) throw new Error('Masukkan email baru yang berbeda dari email aktif.');
    user = await updateAccountEmail(email);
    await syncAccountSession(user);
    showEmail(user);
    form.reset();
    message(form, user.email?.toLowerCase() === email.toLowerCase()
      ? 'Email berhasil diperbarui.'
      : 'Permintaan perubahan email berhasil dikirim. Periksa email lama dan baru untuk menyelesaikan konfirmasi.');
  });

  submit('profile-password', async form => {
    const current = form.elements.current_password.value;
    const next = form.elements.password.value;
    if (next.length < 8) throw new Error('Kata sandi baru minimal 8 karakter.');
    if (next !== form.elements.confirm_password.value) throw new Error('Konfirmasi kata sandi baru belum sama.');
    if (next === current) throw new Error('Kata sandi baru harus berbeda dari kata sandi saat ini.');
    user = await updateAccountPassword(current, next);
    await syncAccountSession(user);
    message(form, 'Kata sandi berhasil diperbarui. Gunakan kata sandi baru saat masuk berikutnya.');
  });
}

initProfile();
