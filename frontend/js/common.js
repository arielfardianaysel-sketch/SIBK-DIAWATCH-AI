const CFG = window.APP_CONFIG || { USE_MOCK: false, API_URL: 'http://127.0.0.1:8000' };

// Session management (terintegrasi penuh dengan sesi Supabase Auth)
const getSession = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('dw_session') || 'null');

    // Hapus sesi lama jika masih menggunakan token mock dari mode sebelumnya
    if (saved && (!saved.token || String(saved.token).startsWith('mock-'))) {
      localStorage.removeItem('dw_session');
    } else if (saved && saved.user && saved.token) {
      return saved;
    }

    // Sinkronisasi otomatis dengan token sesi Supabase Auth di localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const sbSession = JSON.parse(localStorage.getItem(k) || 'null');
        if (sbSession && sbSession.access_token && sbSession.user) {
          const u = sbSession.user;
          const synced = {
            token: sbSession.access_token,
            user: {
              id: u.id,
              name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'Pengguna',
              email: u.email || '',
              birth_date: u.user_metadata?.birth_date || null,
            },
          };
          localStorage.setItem('dw_session', JSON.stringify(synced));
          return synced;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

const setSession = (s) => {
  if (s) {
    localStorage.setItem('dw_session', JSON.stringify(s));
  } else {
    localStorage.removeItem('dw_session');
    sessionStorage.removeItem('dw_last');
  }
};

// DOM query shorthand
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Auth Route Guard for protected pages (screening, history, report)
function guard() {
  const s = getSession();
  if (!s) {
    const page = location.pathname.split('/').pop() || 'index.html';
    const search = location.search;
    const target = encodeURIComponent(page + search);
    location.href = `auth.html?redirect=${target}&msg=need_login`;
    return false;
  }
  return true;
}

// Guest-only guard for auth page (redirect if already logged in)
function guestOnly() {
  const s = getSession();
  if (s) {
    location.href = 'index.html';
    return false;
  }
  return true;
}

// Common SVG Icons
const ICONS = {
  heartPulse: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h4.28"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  chart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
};

// Render Responsive Navigation according to Auth State
function renderNav() {
  const navContainer = $('#nav');
  if (!navContainer) return;

  const session = getSession();
  const currentPath = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  let navMenuHtml = '';
  let navActionsHtml = '';

  if (session && session.user) {
    // --- LOGGED IN USER: FULL MENUS ACTIVE ---
    const initial = (session.user.name || 'U').charAt(0).toUpperCase();
    const isHome = currentPath === 'index.html' || currentPath === '';
    const isScreening = currentPath === 'screening.html';
    const isHistory = currentPath === 'history.html' || currentPath === 'report.html';

    navMenuHtml = `
      <ul class="nav-menu" id="nav-menu-list">
        <li><a href="index.html" class="${isHome ? 'active' : ''}">Beranda</a></li>
        <li><a href="screening.html" class="${isScreening ? 'active' : ''}">Skrining Mandiri</a></li>
        <li><a href="history.html" class="${isHistory ? 'active' : ''}">Riwayat Skrining</a></li>
      </ul>
    `;

    navActionsHtml = `
      <div class="nav-actions">
        <div class="user-badge" title="${esc(session.user.email)}">
          <span class="user-avatar">${initial}</span>
          <span class="user-name">${esc(session.user.name)}</span>
        </div>
        <button id="btn-logout" class="btn-logout" title="Keluar dari akun">
          ${ICONS.logout}
          <span>Keluar</span>
        </button>
      </div>
    `;
  } else {
    // --- GUEST / NOT LOGGED IN: LANDING PAGE INFO ONLY ---
    // Protected menus (Skrining, Riwayat) are HIDDEN
    navMenuHtml = `
      <ul class="nav-menu" id="nav-menu-list">
        <li><a href="index.html#tentang">Tentang</a></li>
        <li><a href="index.html#cara-kerja">Cara Kerja</a></li>
        <li><a href="index.html#fitur">Fitur AI</a></li>
        <li><a href="index.html#faq">FAQ</a></li>
      </ul>
    `;

    navActionsHtml = `
      <div class="nav-actions">
        <a href="auth.html" class="btn ghost btn-sm">Masuk</a>
        <a href="auth.html?mode=register" class="btn btn-sm">Daftar Akun</a>
      </div>
    `;
  }

  navContainer.outerHTML = `
    <header class="nav-header">
      <div class="nav-container">
        <a href="index.html" class="nav-brand">
          <div class="nav-brand-icon">${ICONS.heartPulse}</div>
          <span>DiaWatch</span>
          <span class="badge-ai">AI</span>
        </a>
        ${navMenuHtml}
        ${navActionsHtml}
        <button class="nav-toggle" id="nav-toggle-btn" aria-label="Toggle menu">
          ${ICONS.menu}
        </button>
      </div>
    </header>
  `;

  // Attach logout handler
  const logoutBtn = $('#btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      if (confirm('Apakah Anda yakin ingin keluar dari akun?')) {
        try {
          if (window.API && typeof window.API.logout === 'function') {
            await window.API.logout();
          }
        } catch (_) {
          // Tetap lanjutkan hapus sesi lokal bila request signOut gagal
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            localStorage.removeItem(k);
          }
        }
        setSession(null);
        location.href = 'index.html';
      }
    };
  }

  // Mobile menu toggle
  const toggleBtn = $('#nav-toggle-btn');
  const menuList = $('#nav-menu-list');
  if (toggleBtn && menuList) {
    toggleBtn.onclick = () => {
      menuList.classList.toggle('show');
    };
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!toggleBtn.contains(e.target) && !menuList.contains(e.target)) {
        menuList.classList.remove('show');
      }
    });
  }
}

// Convert birth date into CDC BRFSS age category (1 to 13)
function ageCategory(birth, today = new Date()) {
  const age = Math.floor((today - new Date(birth)) / (365.25 * 864e5));
  if (isNaN(age) || age < 18) return 1;
  if (age < 25) return 1;
  return Math.min(13, Math.floor((age - 25) / 5) + 2);
}

// HTML escape helper
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// Date formatter in Indonesian
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(d);
  }
};

// Initial run
document.addEventListener('DOMContentLoaded', () => {
  renderNav();
});
