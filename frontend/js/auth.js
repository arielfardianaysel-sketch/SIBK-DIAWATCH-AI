/**
 * DiaWatch AI - Authentication Controller (Login & Register)
 */
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

// Show notice if redirected from protected route
if (msgType === 'need_login' && noticeBox) {
  noticeBox.classList.remove('hide');
}

// Error notification handler
function showError(msg) {
  if (errText) errText.textContent = msg || '';
  if (errBox) {
    errBox.classList.toggle('hide', !msg);
    if (msg) {
      errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      setSession(res);

      // Determine redirect target
      let targetUrl = 'index.html';
      if (redirectTarget) {
        targetUrl = decodeURIComponent(redirectTarget);
      }
      location.href = targetUrl;
    } catch (err) {
      showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}

// Handle Register submit
attachSubmit(fReg, async (data) => {
  if (!data.name || data.name.trim().length < 2) {
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
  return API.register(data);
});

// Handle Login submit
attachSubmit(fLogin, async (data) => {
  if (!data.email || !data.password) {
    throw new Error('Silakan isi email dan kata sandi Anda.');
  }
  return API.login(data);
});

// Auto-switch mode based on URL parameter
if (mode === 'register' || mode === 'reg') {
  switchTab(true);
}
