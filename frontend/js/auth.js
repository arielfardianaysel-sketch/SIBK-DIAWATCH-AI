/**
 * DiaWatch AI - Authentication Controller (Login & Register via Supabase Auth)
 */
import { API, registerUser, loginUser, getMyProfile } from "./api.js";

// If already logged in, redirect to index
guestOnly();

const urlParams = new URLSearchParams(location.search);
const redirectTarget = urlParams.get('redirect');
const msgType = urlParams.get('msg');
const mode = urlParams.get('mode');

// Elements
const fLogin = $('#f-login');
const fReg = $('#f-reg');
const tabLogin = $('#tab-login');
const tabReg = $('#tab-reg');
const errBox = $('#err');
const errText = $('#err-text');
const noticeBox = $('#auth-notice');
const noticeText = $('#auth-notice-text');

// Show notice if redirected from protected route
if (msgType === 'need_login' && noticeBox) {
  noticeBox.classList.remove('hide');
}

// Error notification handler (dengan terjemahan pesan error Supabase Auth)
function formatSupabaseAuthError(err) {
  const raw = err?.message || String(err || '');
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah, atau akun belum terdaftar di Supabase Authentication (pastikan akun terdaftar di menu Authentication > Users, atau daftar lewat tab Daftar Akun Baru).';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email Anda belum dikonfirmasi. Silakan buka kotak masuk email Anda dan klik link verifikasi dari Supabase, atau nonaktifkan "Confirm email" di Supabase Dashboard (Authentication > Providers > Email).';
  }
  if (lower.includes('user already registered')) {
    return 'Email ini sudah terdaftar di Supabase. Silakan masuk menggunakan tab Masuk Akun.';
  }
  return raw || 'Terjadi kesalahan. Silakan coba lagi.';
}

function showError(msg) {
  if (errText) errText.textContent = msg || '';
  if (errBox) {
    errBox.classList.toggle('hide', !msg);
    if (msg) {
      errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function showNotice(msg) {
  if (noticeText) noticeText.textContent = msg || '';
  if (noticeBox) {
    noticeBox.classList.toggle('hide', !msg);
    if (msg) {
      noticeBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// Tab Switching
function switchTab(isRegister) {
  showError('');
  if (isRegister) {
    fLogin.classList.add('hide');
    fReg.classList.remove('hide');
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  } else {
    fReg.classList.add('hide');
    fLogin.classList.remove('hide');
    tabReg.classList.remove('active');
    tabLogin.classList.add('active');
  }
}

tabLogin.onclick = () => switchTab(false);
tabReg.onclick = () => switchTab(true);

const toRegLink = $('#to-reg');
if (toRegLink) toRegLink.onclick = (e) => { e.preventDefault(); switchTab(true); };

const toLoginLink = $('#to-login');
if (toLoginLink) toLoginLink.onclick = (e) => { e.preventDefault(); switchTab(false); };

// Password show/hide toggle
$$('.btn-toggle-pw').forEach(btn => {
  btn.onclick = () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    } else {
      input.type = 'password';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
  };
});

// Generic form submission handler
function attachSubmit(form, apiFn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const btn = $('button[type=submit]', form);
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Memproses...</span>';

    try {
      const data = Object.fromEntries(new FormData(form));
      const res = await apiFn(data);

      // Bila registrasi memerlukan verifikasi email sebelum sesi aktif
      if (!res.token) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        switchTab(false);
        showNotice('Registrasi berhasil! Silakan periksa kotak masuk email Anda untuk verifikasi sebelum masuk.');
        return;
      }

      setSession(res);

      // Determine redirect target
      let targetUrl = 'index.html';
      if (redirectTarget) {
        targetUrl = decodeURIComponent(redirectTarget);
      }
      location.href = targetUrl;
    } catch (err) {
      console.error('Supabase Auth Error:', err);
      showError(formatSupabaseAuthError(err));
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}

// Handle Register submit
attachSubmit(fReg, async (data) => {
  const email = (data.email || '').trim();
  const name = (data.name || '').trim();
  if (!name || name.length < 2) {
    throw new Error('Silakan masukkan nama lengkap yang valid.');
  }
  if (!data.password || data.password.length < 6) {
    throw new Error('Kata sandi minimal 6 karakter.');
  }
  if (!data.birth_date) {
    throw new Error('Silakan pilih tanggal lahir Anda.');
  }
  const birthDate = new Date(data.birth_date);
  if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
    throw new Error('Tanggal lahir tidak valid atau berada di masa depan.');
  }
  const result = await registerUser(email, data.password, name, data.birth_date);
  const user = result.user;
  return {
    token: result.session?.access_token || null,
    user: {
      id: user?.id,
      name,
      email: user?.email || email,
      birth_date: data.birth_date,
    },
  };
});

// Handle Login submit
attachSubmit(fLogin, async (data) => {
  const email = (data.email || '').trim();
  if (!email || !data.password) {
    throw new Error('Silakan isi email dan kata sandi Anda.');
  }
  const result = await loginUser(email, data.password);
  const user = result.user;
  let displayName = user?.user_metadata?.display_name;
  if (!displayName) {
    try {
      const profile = await getMyProfile();
      if (profile?.display_name) displayName = profile.display_name;
    } catch (_) {
      // Abaikan bila profil belum tersedia
    }
  }
  return {
    token: result.session?.access_token,
    user: {
      id: user?.id,
      name: displayName || user?.email?.split('@')[0] || 'Pengguna',
      email: user?.email || email,
      birth_date: user?.user_metadata?.birth_date || null,
    },
  };
});

// Auto-switch mode based on URL parameter
if (mode === 'register' || mode === 'reg') {
  switchTab(true);
}
