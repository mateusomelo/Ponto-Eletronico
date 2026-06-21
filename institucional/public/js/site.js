/* ============================================================
   PontoControl — Site Institucional — JS compartilhado
   ============================================================ */

const SISTEMA_URL = 'https://ponto-eletronicoo.netlify.app/index.html';
const CADASTRO_URL = 'https://ponto-eletronicoo.netlify.app/cadastro.html';

function renderNavbar(active) {
  const links = [
    { href: 'index.html', label: 'Início', key: 'inicio' },
    { href: 'funcionalidades.html', label: 'Funcionalidades', key: 'funcionalidades' },
    { href: 'solucoes.html', label: 'Soluções', key: 'solucoes' },
    { href: 'aplicativo.html', label: 'Aplicativo', key: 'aplicativo' },
    { href: 'planos.html', label: 'Planos', key: 'planos' },
    { href: 'empresas.html', label: 'Empresas', key: 'empresas' },
    { href: 'faq.html', label: 'FAQ', key: 'faq' },
    { href: 'contato.html', label: 'Contato', key: 'contato' },
  ];

  document.getElementById('navbarMount').innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <a class="navbar-logo" href="index.html"><img src="img/logo.png" alt="PontoControl" /></a>
        <div class="navbar-links" id="navLinks">
          ${links.map(l => `<a href="${l.href}" class="${l.key === active ? 'active' : ''}">${l.label}</a>`).join('')}
          <a href="${SISTEMA_URL}" class="btn btn-primary" style="padding:10px 20px">Acessar Sistema</a>
        </div>
        <button class="navbar-toggle" id="navToggle"><i class="fas fa-bars"></i></button>
      </div>
    </nav>
    <a href="${SISTEMA_URL}" class="btn-acessar-fixed"><i class="fas fa-sign-in-alt"></i> Acessar Sistema</a>
  `;

  document.getElementById('navToggle').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });
}

function renderFooter() {
  document.getElementById('footerMount').innerHTML = `
    <footer>
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-logo"><img src="img/logo-icon.png" alt="" style="height:28px;width:28px" /></div>
            <p style="font-size:.85rem;max-width:280px">PontoControl — controle inteligente de jornada. Registro de ponto, gestão de equipes e fechamento de folha em um só sistema.</p>
          </div>
          <div>
            <h4>Produto</h4>
            <ul>
              <li><a href="funcionalidades.html">Funcionalidades</a></li>
              <li><a href="aplicativo.html">Aplicativo</a></li>
              <li><a href="planos.html">Planos</a></li>
              <li><a href="${SISTEMA_URL}">Acessar Sistema</a></li>
            </ul>
          </div>
          <div>
            <h4>Empresa</h4>
            <ul>
              <li><a href="empresas.html">Para Empresas</a></li>
              <li><a href="solucoes.html">Soluções</a></li>
              <li><a href="faq.html">FAQ</a></li>
              <li><a href="contato.html">Contato</a></li>
            </ul>
          </div>
          <div>
            <h4>Contato</h4>
            <ul>
              <li><a href="mailto:contato@pontocontrol.com.br">contato@pontocontrol.com.br</a></li>
              <li><a href="https://wa.me/5500000000000" target="_blank" rel="noopener">WhatsApp</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} PontoControl. Todos os direitos reservados.</span>
          <span>Controle Inteligente de Jornada</span>
        </div>
      </div>
    </footer>
  `;
}

function toggleFaq(el) {
  el.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const active = document.body.dataset.page || '';
  renderNavbar(active);
  renderFooter();
});
