/* ============================================================
   Utils - Helpers reutilizáveis
   ============================================================ */

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(t);

  setTimeout(() => {
    t.style.animation = 'slideIn .3s ease reverse';
    setTimeout(() => t.remove(), 280);
  }, duration);
}

// ── Modal ──────────────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) { overlay.classList.add('show'); }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('show');
}

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});

// ── Formatação ─────────────────────────────────────────────
function fmtData(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtDataHora(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtHora(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtCPF(cpf) {
  if (!cpf) return '-';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// ── Live clock ─────────────────────────────────────────────
function startClock(el) {
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  tick();
  return setInterval(tick, 1000);
}

// ── Sidebar ─────────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const main    = document.querySelector('.main');
  const toggle  = document.getElementById('sidebarToggle');
  const mToggle = document.getElementById('mobileMenuToggle');

  if (!sidebar) return;

  const isMobile = () => window.innerWidth <= 768;

  // ── Backdrop mobile ───────────────────────────────────────
  let backdrop = document.getElementById('sidebarBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id        = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  function openMobile() {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeMobile() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    document.body.style.overflow = '';
  }

  backdrop.addEventListener('click', closeMobile);

  function updateToggleIcon() {
    if (!toggle) return;
    const icon = toggle.querySelector('i');
    if (!icon) return;
    if (sidebar.classList.contains('collapsed')) {
      icon.className = 'fas fa-chevron-right';
      toggle.title   = 'Expandir menu';
    } else {
      icon.className = 'fas fa-chevron-left';
      toggle.title   = 'Recolher menu';
    }
  }

  function toggleDesktop() {
    sidebar.classList.toggle('collapsed');
    main && main.classList.toggle('expanded');
    localStorage.setItem('sidebar_collapsed',
      sidebar.classList.contains('collapsed') ? '1' : '0');
    updateToggleIcon();
  }

  // ── Toggle desktop (recolher/expandir) / mobile (fechar) ──
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (isMobile()) closeMobile();
      else toggleDesktop();
    });
  }

  // ── Logo clicável para expandir quando colapsado ──────────
  const logo = document.querySelector('.sidebar-logo');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.title = 'Expandir/recolher menu';
    logo.addEventListener('click', () => {
      if (!isMobile()) toggleDesktop();
    });
  }

  // ── Hamburger mobile (topbar) ─────────────────────────────
  if (mToggle) {
    mToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('mobile-open')) closeMobile();
      else openMobile();
    });
  }

  // ── Fechar ao clicar num item de nav no mobile ────────────
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { if (isMobile()) closeMobile(); });
  });

  // ── Restaurar estado colapsado (só desktop) ───────────────
  if (!isMobile() && localStorage.getItem('sidebar_collapsed') === '1') {
    sidebar.classList.add('collapsed');
    main && main.classList.add('expanded');
  }
  updateToggleIcon();

  // ── Nav item ativo ────────────────────────────────────────
  const currentPage = location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && href === currentPage) item.classList.add('active');
  });

  // ── Info do usuário (fallback; renderLayout já preenche) ──
  const user = Auth.getUsuario();
  if (user) {
    const nameEl   = document.getElementById('sidebarUserName');
    const roleEl   = document.getElementById('sidebarUserRole');
    const avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl) nameEl.textContent = user.nome || '';
    if (roleEl) roleEl.textContent = user.cargo_nome || '';
    if (avatarEl && !avatarEl.querySelector('img')) {
      avatarEl.textContent = (user.nome || '?')[0].toUpperCase();
    }
  }

  // ── Visibilidade por permissão ────────────────────────────
  document.querySelectorAll('[data-perm]').forEach(el => {
    if (!Auth.hasPermission(el.getAttribute('data-perm'))) el.style.display = 'none';
  });
  document.querySelectorAll('[data-admin]').forEach(el => {
    if (!Auth.isAdmin()) el.style.display = 'none';
  });
  document.querySelectorAll('[data-supervisor]').forEach(el => {
    if (!Auth.isSupervisor()) el.style.display = 'none';
  });
}

// ── Logout ──────────────────────────────────────────────────
function initLogout() {
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try { await API.post('/auth/logout'); } catch {}
    Auth.clearToken();
    window.location.href = '/login.html';
  });
}

// ── Pagination ──────────────────────────────────────────────
function renderPagination(container, { total, pagina, por_pagina, onPage }) {
  if (!container) return;
  const totalPages = Math.ceil(total / por_pagina);
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const info = document.createElement('span');
  info.className = 'text-sm text-muted';
  info.textContent = `${total} registro(s) • Página ${pagina}/${totalPages}`;
  container.appendChild(info);

  const wrap = document.createElement('div');
  wrap.style.display = 'flex'; wrap.style.gap = '6px';

  const mkBtn = (label, page, disabled = false) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (page === pagina ? ' active' : '');
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.onclick = () => onPage(page);
    return b;
  };

  wrap.appendChild(mkBtn('«', 1, pagina === 1));
  wrap.appendChild(mkBtn('‹', pagina - 1, pagina === 1));

  for (let p = Math.max(1, pagina - 2); p <= Math.min(totalPages, pagina + 2); p++) {
    wrap.appendChild(mkBtn(p, p));
  }

  wrap.appendChild(mkBtn('›', pagina + 1, pagina === totalPages));
  wrap.appendChild(mkBtn('»', totalPages, pagina === totalPages));

  container.appendChild(wrap);
}

// ── Confirm dialog ──────────────────────────────────────────
function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header"><h3 class="modal-title">Confirmação</h3></div>
        <div class="modal-body"><p>${msg}</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cdCancel">Cancelar</button>
          <button class="btn btn-danger" id="cdConfirm">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cdCancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#cdConfirm').onclick = () => { overlay.remove(); resolve(true);  };
  });
}

// ── Table sort state ────────────────────────────────────────
function tableSort(th, key, state, onSort) {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    state.sortKey = key;
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    onSort(state);
  });
}

window.toast          = toast;
window.openModal      = openModal;
window.closeModal     = closeModal;
window.fmtData        = fmtData;
window.fmtDataHora    = fmtDataHora;
window.fmtHora        = fmtHora;
window.fmtCPF         = fmtCPF;
window.startClock     = startClock;
window.initSidebar    = initSidebar;
window.initLogout     = initLogout;
window.renderPagination = renderPagination;
window.confirmDialog  = confirmDialog;
