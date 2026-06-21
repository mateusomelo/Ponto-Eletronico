const { pool } = require('../database/connection');
const PDFDocument = require('pdfkit');
const xl = require('excel4node');
const path = require('path');
const fs = require('fs');

const LOGO_ICON = path.join(__dirname, '../assets/logo-icon.png');

// Marca "PontoControl" no rodapé de cada página gerada (relatórios, fechamentos).
function rodapePontoControl(doc, pageWidth = 595, marginRight = 50) {
  try {
    if (fs.existsSync(LOGO_ICON)) doc.image(LOGO_ICON, pageWidth - marginRight - 90, doc.page.height - 30, { width: 12 });
  } catch { /* logo é só um adorno — segue sem ela se falhar */ }
  doc.fontSize(7).fillColor('#94a3b8')
     .text('Gerado por PontoControl', pageWidth - marginRight - 74, doc.page.height - 27, { width: 80 });
}

async function getTimezone(company_id) {
  try {
    const cidFilter = company_id ? ' AND company_id = ?' : '';
    const params = company_id ? ['fuso_horario', company_id] : ['fuso_horario'];
    const [rows] = await pool.query(
      `SELECT valor FROM configuracoes WHERE chave = ?${cidFilter} LIMIT 1`, params
    );
    return rows[0]?.valor || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

function fmtDataHora(dt, tz) {
  return new Date(dt).toLocaleString('pt-BR', { timeZone: tz });
}

function cabecalhoPDF(doc, titulo, empresa = 'Empresa S.A.') {
  try {
    if (fs.existsSync(LOGO_ICON)) doc.image(LOGO_ICON, 50, 40, { width: 28 });
  } catch { /* segue sem a logo se falhar */ }
  doc.fontSize(18).fillColor('#1e3a5f').text(empresa, { align: 'center' });
  doc.fontSize(13).fillColor('#333').text(titulo, { align: 'center' });
  doc.fontSize(9).fillColor('#888').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#1e3a5f').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

// Resolve o usuario_id efetivo: funcionário sempre vê só ele mesmo
function resolveUid(req) {
  if (req.user.cargo_nivel >= 3) return req.user.id;
  return req.query.usuario_id || null;
}

async function buscarRegistros(req) {
  const { data_inicio, data_fim, tipo } = req.query;
  const usuario_id = resolveUid(req);
  const cid = req.user.company_id;

  const params = [];
  let where = 'WHERE 1=1';
  if (cid)         { where += ' AND u.company_id = ?'; params.push(cid); }
  if (usuario_id)  { where += ' AND r.usuario_id = ?'; params.push(usuario_id); }
  if (tipo)        { where += ' AND r.tipo = ?';       params.push(tipo); }
  if (data_inicio) { where += ' AND DATE(r.data_hora) >= ?'; params.push(data_inicio); }
  if (data_fim)    { where += ' AND DATE(r.data_hora) <= ?'; params.push(data_fim + ' 23:59:59'); }

  const [rows] = await pool.query(
    `SELECT r.id, r.tipo, r.data_hora, r.latitude, r.longitude,
            r.dispositivo, r.navegador, r.observacao, r.endereco_aprox,
            u.nome AS usuario_nome, u.email AS usuario_email, u.cpf AS usuario_cpf,
            c.nome AS cargo_nome
     FROM registros_ponto r
     JOIN usuarios u ON u.id = r.usuario_id
     JOIN cargos c ON c.id = u.cargo_id
     ${where}
     ORDER BY r.data_hora ASC`,
    params
  );
  return rows;
}

// GET /api/relatorios/dados
async function dados(req, res) {
  try {
    const rows = await buscarRegistros(req);
    return res.json({ total: rows.length, registros: rows });
  } catch (err) {
    console.error('[Relatorio]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/relatorios/pdf
async function exportarPDF(req, res) {
  try {
    const cid = req.user.company_id;
    const [rows, tz] = await Promise.all([buscarRegistros(req), getTimezone(cid)]);

    let empresaNome = 'Empresa';
    if (cid) {
      const [[emp]] = await pool.query('SELECT nome FROM empresas WHERE id = ? LIMIT 1', [cid]);
      if (emp) empresaNome = emp.nome;
    }

    // A4 landscape: 841 × 595 pt — margens 40 → área útil 761 × 515
    const MARGIN   = 40;
    const PAGE_W   = 841;
    const PAGE_H   = 595;
    const USABLE_W = PAGE_W - MARGIN * 2;
    const HEADER_H = 18;
    const ROW_H    = 15;
    const PAD      = 4;
    const MAX_Y    = PAGE_H - 45;

    // Colunas: soma das larguras + 6 gaps de 4 = 717 + 24 = 741 ≤ 761 ✓
    const colDefs = [
      { label: 'Data/Hora',   w: 130 },
      { label: 'Funcionário', w: 150 },
      { label: 'Cargo',       w: 92  },
      { label: 'Tipo',        w: 50  },
      { label: 'Localização', w: 215 },
      { label: 'Dispositivo', w: 104 },
    ];
    let cx = MARGIN;
    colDefs.forEach(col => { col.x = cx; cx += col.w + 4; });

    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-ponto.pdf"');
    doc.pipe(res);

    // ── Cabeçalho da primeira página ─────────────────────────────
    try {
      if (fs.existsSync(LOGO_ICON)) doc.image(LOGO_ICON, MARGIN, MARGIN, { width: 24 });
    } catch { /* segue sem a logo se falhar */ }
    doc.fontSize(18).fillColor('#1e3a5f').text(empresaNome, MARGIN, MARGIN, { width: USABLE_W, align: 'center' });
    doc.fontSize(11).fillColor('#444444').text('Relatório de Registro de Ponto', { width: USABLE_W, align: 'center' });
    doc.fontSize(8).fillColor('#999999').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { width: USABLE_W, align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).strokeColor('#1e3a5f').lineWidth(0.8).stroke();
    doc.moveDown(0.5);

    const trunc = (s, max) => {
      if (!s) return '-';
      s = String(s).trim();
      return s.length > max ? s.slice(0, max - 1) + '…' : s;
    };

    const truncAddr = (addr) => {
      if (!addr) return '-';
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      // Rua + Bairro, máximo 30 chars
      return trunc(parts.slice(0, 2).join(', '), 30);
    };

    const drawTableHeader = (y) => {
      doc.rect(MARGIN, y, USABLE_W, HEADER_H).fill('#1e3a5f');
      doc.fontSize(8).fillColor('#ffffff');
      colDefs.forEach(col => {
        doc.text(col.label, col.x + PAD, y + 5, { width: col.w - PAD * 2, lineBreak: false });
      });
      return y + HEADER_H + 1;
    };

    let y = drawTableHeader(doc.y);

    rows.forEach((r, idx) => {
      if (y > MAX_Y) {
        doc.addPage();
        y = MARGIN;
        y = drawTableHeader(y);
      }

      const bg = idx % 2 === 0 ? '#eef2ff' : '#ffffff';
      doc.rect(MARGIN, y, USABLE_W, ROW_H).fill(bg);

      const tipo      = (r.tipo || '').toLowerCase();
      const tipoLabel = tipo === 'entrada' ? 'Entrada' : tipo === 'saida' ? 'Saída' : tipo;
      const tipoColor = tipo === 'entrada' ? '#166534' : '#991b1b';

      const vals = [
        trunc(fmtDataHora(r.data_hora, tz), 22),
        trunc(r.usuario_nome, 22),
        trunc(r.cargo_nome, 14),
        { text: tipoLabel, color: tipoColor, bold: true },
        truncAddr(r.endereco_aprox),
        r.dispositivo || '-',
      ];

      doc.fontSize(7.5);
      colDefs.forEach((col, i) => {
        const val   = vals[i];
        const text  = typeof val === 'object' ? val.text : val;
        const color = typeof val === 'object' ? val.color : '#222222';
        doc.fillColor(color).text(text, col.x + PAD, y + 4, { width: col.w - PAD * 2, lineBreak: false });
      });

      y += ROW_H;
    });

    // ── Rodapé com total ─────────────────────────────────────────
    y += 8;
    doc.fontSize(8).fillColor('#555555')
       .text(`Total de registros: ${rows.length}`, MARGIN, y, { width: USABLE_W, align: 'right' });

    // ── Numeração de páginas + marca PontoControl ──────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#aaaaaa')
         .text(`Página ${i - range.start + 1} de ${range.count}`, MARGIN, PAGE_H - 28, { width: USABLE_W, align: 'center' });
      rodapePontoControl(doc, PAGE_W, MARGIN);
    }

    doc.end();
  } catch (err) {
    console.error('[Relatorio PDF]', err);
    return res.status(500).json({ erro: 'Erro ao gerar PDF.' });
  }
}

// GET /api/relatorios/excel
async function exportarExcel(req, res) {
  try {
    const [rows, tz] = await Promise.all([buscarRegistros(req), getTimezone(req.user.company_id)]);

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Registros de Ponto');

    const headerStyle = wb.createStyle({
      font: { bold: true, color: '#FFFFFF', size: 10 },
      fill: { type: 'pattern', patternType: 'solid', fgColor: '#1E3A5F' },
      border: { bottom: { style: 'thin', color: '#AAAAAA' } },
      alignment: { horizontal: 'center' },
    });
    const altStyle = wb.createStyle({
      fill: { type: 'pattern', patternType: 'solid', fgColor: '#EEF2FF' },
    });

    const headers = ['ID','Data/Hora','Funcionário','E-mail','CPF','Cargo','Tipo','Endereço','Latitude','Longitude','Dispositivo','Navegador','Observação'];
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(headerStyle));

    rows.forEach((r, idx) => {
      const row   = idx + 2;
      const style = idx % 2 === 0 ? altStyle : {};
      ws.cell(row,  1).number(r.id).style(style);
      ws.cell(row,  2).string(fmtDataHora(r.data_hora, tz)).style(style);
      ws.cell(row,  3).string(r.usuario_nome    || '').style(style);
      ws.cell(row,  4).string(r.usuario_email   || '').style(style);
      ws.cell(row,  5).string(r.usuario_cpf     || '').style(style);
      ws.cell(row,  6).string(r.cargo_nome      || '').style(style);
      ws.cell(row,  7).string(r.tipo            || '').style(style);
      ws.cell(row,  8).string(r.endereco_aprox  || '').style(style);
      ws.cell(row,  9).string(r.latitude  ? String(r.latitude)  : '').style(style);
      ws.cell(row, 10).string(r.longitude ? String(r.longitude) : '').style(style);
      ws.cell(row, 11).string(r.dispositivo     || '').style(style);
      ws.cell(row, 12).string(r.navegador       || '').style(style);
      ws.cell(row, 13).string(r.observacao      || '').style(style);
    });

    [8,20,25,28,16,18,10,40,12,12,12,12,20].forEach((w, i) => ws.column(i + 1).setWidth(w));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-ponto.xlsx"');
    wb.write('relatorio-ponto.xlsx', res);
  } catch (err) {
    console.error('[Relatorio Excel]', err);
    return res.status(500).json({ erro: 'Erro ao gerar Excel.' });
  }
}

// GET /api/relatorios/resumo-usuario
async function resumoUsuario(req, res) {
  try {
    const { data_inicio, data_fim } = req.query;
    const usuario_id = resolveUid(req);

    const params = [];
    let whereReg = '';
    if (data_inicio) { whereReg += ' AND DATE(r.data_hora) >= ?'; params.push(data_inicio); }
    if (data_fim)    { whereReg += ' AND DATE(r.data_hora) <= ?'; params.push(data_fim + ' 23:59:59'); }

    const cid = req.user.company_id;
    let whereUser = 'WHERE u.ativo = 1';
    const paramsUser = [...params];
    if (cid)        { whereUser += ' AND u.company_id = ?'; paramsUser.push(cid); }
    if (usuario_id) { whereUser += ' AND u.id = ?'; paramsUser.push(usuario_id); }

    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, c.nome AS cargo,
              COUNT(CASE WHEN r.tipo='entrada' THEN 1 END) AS total_entradas,
              COUNT(CASE WHEN r.tipo='saida'   THEN 1 END) AS total_saidas,
              COUNT(DISTINCT DATE(r.data_hora))             AS dias_trabalhados,
              MAX(r.data_hora)                              AS ultimo_registro
       FROM usuarios u
       LEFT JOIN registros_ponto r ON r.usuario_id = u.id ${whereReg}
       JOIN cargos c ON c.id = u.cargo_id
       ${whereUser}
       GROUP BY u.id, u.nome, u.email, c.nome
       ORDER BY u.nome ASC`,
      paramsUser
    );
    return res.json(rows);
  } catch (err) {
    console.error('[Relatorio resumo]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { dados, exportarPDF, exportarExcel, resumoUsuario };
