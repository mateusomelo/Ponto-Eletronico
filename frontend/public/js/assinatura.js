/* ============================================================
   Painel de assinatura digital — canvas com mouse/touch/caneta
   ============================================================ */

function criarPainelAssinatura(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  let desenhando = false;
  let temTraco = false;

  function ajustarResolucao() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  ajustarResolucao();

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function iniciar(e) {
    desenhando = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  }
  function mover(e) {
    if (!desenhando) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    temTraco = true;
    e.preventDefault();
  }
  function parar() { desenhando = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  canvas.addEventListener('mouseup', parar);
  canvas.addEventListener('mouseleave', parar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', mover, { passive: false });
  canvas.addEventListener('touchend', parar);

  function limpar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    temTraco = false;
  }
  limpar();

  return {
    getDataUrl: () => canvas.toDataURL('image/png'),
    limpar,
    temAssinatura: () => temTraco,
  };
}

window.criarPainelAssinatura = criarPainelAssinatura;
