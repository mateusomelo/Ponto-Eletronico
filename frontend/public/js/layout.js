/* ============================================================
   Layout - Sidebar HTML injetado em todas as páginas internas
   ============================================================ */

function renderLayout(pageTitle) {
  const sidebar = `
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo"><img src="/img/logo-icon.png" alt="PontoControl" style="width:100%;height:100%;object-fit:contain" /></div>
      <span class="sidebar-title">PontoControl</span>
    </div>

    <div class="sidebar-nav">
      <div class="nav-group-label">Principal</div>
      <a class="nav-item" href="dashboard.html">
        <i class="fas fa-chart-line nav-icon"></i>
        <span class="nav-label">Dashboard</span>
      </a>
      <a class="nav-item" href="ponto.html" data-perm="ponto.registrar">
        <i class="fas fa-clock nav-icon"></i>
        <span class="nav-label">Registrar Ponto</span>
      </a>

      <div class="nav-group-label" data-perm="ponto.visualizar">Registros</div>
      <a class="nav-item" href="historico.html" data-perm="ponto.visualizar">
        <i class="fas fa-history nav-icon"></i>
        <span class="nav-label">Histórico</span>
      </a>
      <a class="nav-item" href="meus-relatorios.html">
        <i class="fas fa-file-signature nav-icon"></i>
        <span class="nav-label">Meus Relatórios</span>
        <span class="nav-badge" id="navRelBadge" style="display:none"></span>
      </a>
      <a class="nav-item" href="relatorios.html" data-perm="relatorios.visualizar">
        <i class="fas fa-file-alt nav-icon"></i>
        <span class="nav-label">Relatórios</span>
      </a>

      <div class="nav-group-label" data-perm="usuarios.visualizar">Administração</div>
      <a class="nav-item" href="usuarios.html" data-perm="usuarios.visualizar">
        <i class="fas fa-users nav-icon"></i>
        <span class="nav-label">Usuários</span>
      </a>
      <a class="nav-item" href="cargos.html" data-perm="cargos.criar">
        <i class="fas fa-id-badge nav-icon"></i>
        <span class="nav-label">Cargos & Permissões</span>
      </a>

      <div class="nav-group-label" data-perm="fechamento.visualizar">Folha de Pagamento</div>
      <a class="nav-item" href="fechamento.html" data-perm="fechamento.visualizar">
        <i class="fas fa-file-invoice-dollar nav-icon"></i>
        <span class="nav-label">Fechamento de Folha</span>
      </a>
      <a class="nav-item" href="assinaturas.html" data-perm="fechamento.visualizar">
        <i class="fas fa-file-signature nav-icon"></i>
        <span class="nav-label">Histórico de Assinaturas</span>
      </a>

      <div class="nav-group-label" data-supervisor>Sistema</div>
      <a class="nav-item" href="pagamentos.html" data-supervisor>
        <i class="fas fa-credit-card nav-icon"></i>
        <span class="nav-label">Pagamentos</span>
      </a>
      <a class="nav-item" href="logs.html" data-admin>
        <i class="fas fa-shield-alt nav-icon"></i>
        <span class="nav-label">Logs de Auditoria</span>
      </a>
      <a class="nav-item" href="configuracoes.html" data-perm="sistema.configurar">
        <i class="fas fa-cog nav-icon"></i>
        <span class="nav-label">Configurações</span>
      </a>
      <a class="nav-item" href="downloads.html">
        <i class="fas fa-mobile-alt nav-icon"></i>
        <span class="nav-label">App Mobile</span>
      </a>
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar" id="sidebarAvatar">?</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name" id="sidebarUserName">Carregando...</div>
          <div class="sidebar-user-role" id="sidebarUserRole"></div>
        </div>
        <button class="btn-icon" id="btnAlterarSenha" title="Alterar minha senha" style="flex-shrink:0;opacity:.7">
          <i class="fas fa-key" style="font-size:.75rem"></i>
        </button>
        <button class="sidebar-toggle" id="sidebarToggle" title="Recolher menu">
          <i class="fas fa-chevron-left"></i>
        </button>
      </div>
    </div>
  </nav>`;

  const topbar = `
  <header class="topbar">
    <div class="topbar-left">
      <button class="btn-icon" id="mobileMenuToggle" aria-label="Menu">
        <i class="fas fa-bars"></i>
      </button>
      <h1 class="page-title">${pageTitle}</h1>
    </div>
    <div class="topbar-right">
      <span class="topbar-time" id="topbarClock"></span>
      <button class="btn-icon notif-bell-btn" id="btnNotificacoes" title="Notificações" onclick="window.location.href='notificacoes.html'">
        <i class="fas fa-bell"></i>
        <span class="notif-badge" id="notifBadge" style="display:none">0</span>
      </button>
      <button class="btn-icon" id="btnLogout" title="Sair">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    </div>
  </header>`;

  document.getElementById('sidebarMount').innerHTML  = sidebar;
  document.getElementById('topbarMount').innerHTML   = topbar;

  // Banner de fatura em atraso — visível para usuários de empresa com pagamento pendente
  (function injetarBannerPastDue() {
    const _u = Auth.getUsuario();
    if (!_u || _u.role === 'super_admin') return;

    function _mostrarBanner(fatura) {
      if (document.getElementById('pastDueBanner')) return;
      const banner = document.createElement('div');
      banner.id = 'pastDueBanner';
      banner.style.cssText = 'background:#fef3c7;border-bottom:2px solid #fbbf24;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:.875rem;position:relative;z-index:5;';
      const hasPagPerm = Auth.hasPermission && Auth.hasPermission('pagamentos.visualizar');
      const linkPagar  = fatura?.hosted_invoice_url
        ? `<a href="${fatura.hosted_invoice_url}" target="_blank" class="btn btn-outline" style="color:#d97706;border-color:#fbbf24;white-space:nowrap;font-size:.8rem;padding:4px 12px;flex-shrink:0"><i class="fas fa-credit-card"></i> Pagar boleto/cartão</a>`
        : hasPagPerm
          ? `<a href="pagamentos.html" class="btn btn-outline" style="color:#d97706;border-color:#fbbf24;white-space:nowrap;font-size:.8rem;padding:4px 12px;flex-shrink:0"><i class="fas fa-file-invoice-dollar"></i> Ver fatura</a>`
          : '<span style="color:#92400e;font-size:.8rem">Contate o administrador da conta.</span>';
      banner.innerHTML = `
        <span>
          <i class="fas fa-exclamation-triangle" style="color:#d97706;margin-right:8px"></i>
          <strong>Fatura em atraso:</strong> Sua assinatura está com pagamento pendente. Regularize para evitar suspensão do acesso.
        </span>
        ${linkPagar}`;
      const topbarEl = document.getElementById('topbarMount');
      if (topbarEl && topbarEl.parentNode) {
        topbarEl.parentNode.insertBefore(banner, topbarEl.nextSibling);
      }
    }

    // Exibe imediatamente se o status em cache já indica atraso
    if (_u.company_status === 'past_due') _mostrarBanner(null);

    // Verifica em tempo real (silencioso — não bloqueia o render)
    API.get('/stripe/alerta-fatura').then(data => {
      if (data?.fatura) _mostrarBanner(data.fatura);
    }).catch(() => {});
  })();

  // Injeta modal de alterar senha (único no DOM)
  if (!document.getElementById('modalAlterarSenha')) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div class="modal-overlay" id="modalAlterarSenha">
  <div class="modal" style="max-width:380px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-key"></i> Alterar Senha</h3>
      <button class="modal-close" onclick="closeModal('modalAlterarSenha')"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Senha atual</label>
        <input type="password" class="form-control" id="asSenhaAtual" placeholder="Sua senha atual" autocomplete="current-password" />
      </div>
      <div class="form-group">
        <label class="form-label">Nova senha</label>
        <input type="password" class="form-control" id="asNovaSenha" placeholder="Mínimo 8 caracteres" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label class="form-label">Confirmar nova senha</label>
        <input type="password" class="form-control" id="asConfirmarSenha" placeholder="Repita a nova senha" autocomplete="new-password" />
      </div>
      <div id="asErro" class="alert alert-danger" style="display:none"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalAlterarSenha')">Cancelar</button>
      <button class="btn btn-primary" id="btnConfirmarAlterarSenha"><i class="fas fa-check"></i> Salvar</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById('btnConfirmarAlterarSenha').addEventListener('click', async () => {
      const senhaAtual = document.getElementById('asSenhaAtual').value;
      const novaSenha  = document.getElementById('asNovaSenha').value;
      const confirmar  = document.getElementById('asConfirmarSenha').value;
      const erroEl     = document.getElementById('asErro');
      erroEl.style.display = 'none';

      if (!senhaAtual || !novaSenha || !confirmar) {
        erroEl.textContent = 'Todos os campos são obrigatórios.'; erroEl.style.display = 'block'; return;
      }
      if (novaSenha.length < 8) {
        erroEl.textContent = 'A nova senha deve ter no mínimo 8 caracteres.'; erroEl.style.display = 'block'; return;
      }
      if (novaSenha !== confirmar) {
        erroEl.textContent = 'As senhas não coincidem.'; erroEl.style.display = 'block'; return;
      }

      const btn = document.getElementById('btnConfirmarAlterarSenha');
      btn.disabled = true;
      try {
        await API.post('/auth/alterar-senha', { senha_atual: senhaAtual, nova_senha: novaSenha });
        closeModal('modalAlterarSenha');
        toast('Senha alterada com sucesso!', 'success');
      } catch (err) {
        erroEl.textContent = err.data?.erro || 'Erro ao alterar senha.'; erroEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.getElementById('btnAlterarSenha')?.addEventListener('click', () => {
    document.getElementById('asSenhaAtual').value   = '';
    document.getElementById('asNovaSenha').value    = '';
    document.getElementById('asConfirmarSenha').value = '';
    document.getElementById('asErro').style.display = 'none';
    openModal('modalAlterarSenha');
  });

  initSidebar();
  initLogout();
  startClock(document.getElementById('topbarClock'));
  _carregarNotificacoes();

  // Populate sidebar user info + avatar
  const user = Auth.getUsuario();
  if (user) {
    document.getElementById('sidebarUserName').textContent = user.nome || '';
    document.getElementById('sidebarUserRole').textContent = user.cargo_nome || '';

    const avatarEl = document.getElementById('sidebarAvatar');
    _atualizarAvatarSidebar(avatarEl, user);

    // Clique no avatar → trocar foto
    avatarEl.style.cursor = 'pointer';
    avatarEl.title = 'Clique para alterar sua foto de perfil';
    avatarEl.style.position = 'relative';
    avatarEl.style.overflow = 'hidden';

    // Overlay de câmera
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;border-radius:50%;';
    overlay.innerHTML = '<i class="fas fa-camera" style="color:#fff;font-size:.85rem"></i>';
    avatarEl.appendChild(overlay);
    avatarEl.addEventListener('mouseenter', () => overlay.style.opacity = '1');
    avatarEl.addEventListener('mouseleave', () => overlay.style.opacity = '0');

    // Input de arquivo oculto
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    avatarEl.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const fd = new FormData();
      fd.append('foto', file);

      try {
        const res = await fetch('/api/auth/me/foto', {
          method:  'POST',
          headers: { Authorization: `Bearer ${Auth.getToken()}` },
          body:    fd,
        });
        const data = await res.json();

        if (res.ok) {
          const updatedUser = Auth.getUsuario();
          const lembrar = !!localStorage.getItem('usuario');
          Auth.setUsuario({ ...updatedUser, foto: data.foto }, lembrar);
          _atualizarAvatarSidebar(avatarEl, { ...updatedUser, foto: data.foto });
          // Re-adiciona overlay (foi substituído pelo innerHTML)
          avatarEl.appendChild(overlay);
          toast('Foto atualizada!', 'success');
        } else {
          toast(data.erro || 'Erro ao atualizar foto.', 'error');
        }
      } catch {
        toast('Erro de conexão ao enviar foto.', 'error');
      }

      fileInput.value = '';
    });
  }
}

async function _carregarNotificacoes() {
  try {
    const data = await API.get('/notificacoes/nao-lidas');
    const n    = data.total || 0;
    const badge    = document.getElementById('notifBadge');
    const navBadge = document.getElementById('navRelBadge');
    if (badge) {
      badge.textContent   = n > 9 ? '9+' : n;
      badge.style.display = n > 0 ? 'flex' : 'none';
    }
    if (navBadge) {
      navBadge.textContent   = n > 9 ? '9+' : n;
      navBadge.style.display = n > 0 ? '' : 'none';
    }
  } catch { /* silencioso */ }
}

window.atualizarBadgeNotificacoes = _carregarNotificacoes;

// Atualiza badge a cada 60s enquanto a aba estiver ativa
setInterval(_carregarNotificacoes, 60_000);

function _atualizarAvatarSidebar(avatarEl, user) {
  const inicial = (user.nome || '?')[0].toUpperCase();
  if (user.foto) {
    avatarEl.innerHTML = `<img src="${user.foto}?t=${Date.now()}" alt="${user.nome}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.parentElement.textContent='${inicial}'" />`;
  } else {
    avatarEl.textContent = inicial;
  }
}

window.renderLayout = renderLayout;
