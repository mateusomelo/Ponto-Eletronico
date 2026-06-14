const { pool } = require('../database/connection');
const PDFDocument = require('pdfkit');
const xl = require('excel4node');

async function getTimezone() {
  try {
    const [rows] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'fuso_horario' LIMIT 1");
    return rows[0]?.valor || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

function fmtDataHora(dt, tz) {
  return new Date(dt).toLocaleString('pt-BR', { timeZone: tz });
}

function cabecalhoPDF(doc, titulo, empresa = 'Empresa S.A.') {
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

  const params = [];
  let where = 'WHERE 1=1';
  if (usuario_id)  { where += ' AND r.usuario_id = ?'; params.push(usuario_id); }
  if (tipo)        { where += ' AND r.tipo = ?';       params.push(tipo); }
  if (data_inicio) { where += ' AND DATE(r.data_hora) >= ?'; params.push(data_inicio); }
  if (data_fim)    { where += ' AND DATE(r.data_hora) <= ?'; params.push(data_fim + ' 23:59:59'); }

  const [rows] = await pool.query(
    `SELECT r.id, r.tipo, r.data_hora, r.ip, r.ip_publico, r.latitude, r.longitude,
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
    const [rows, tz] = await Promise.all([buscarRegistros(req), getTimezone()]);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-ponto.pdf"');
    doc.pipe(res);

    cabecalhoPDF(doc, 'Relatório de Registro de Ponto');

    // A4 landscape: 841 x 595, margens 40 → área útil ≈ 761pt
    const cols    = [40, 135, 235, 300, 345, 435, 555];
    const headers = ['Data/Hora', 'Funcionário', 'Cargo', 'Tipo', 'IP Público', 'Endereço', 'Dispositivo'];
    const pageW   = 801; // 841 - 40 margem direita
    doc.fontSize(9).fillColor('#fff');
    doc.rect(40, doc.y, pageW - 40, 16).fill('#1e3a5f');
    headers.forEach((h, i) => {
      const x = cols[i];
      const w = (cols[i + 1] || pageW) - x - 4;
      doc.fillColor('#fff').text(h, x, doc.y - 14, { width: w });
    });
    doc.moveDown(0.3);

    rows.forEach((r, idx) => {
      if (doc.y > 530) doc.addPage();
      const bg   = idx % 2 === 0 ? '#f0f4ff' : '#ffffff';
      const yRow = doc.y;
      doc.rect(40, yRow, pageW - 40, 14).fill(bg);
      doc.fillColor('#333').fontSize(8);
      const vals = [
        fmtDataHora(r.data_hora, tz),
        r.usuario_nome    || '-',
        r.cargo_nome      || '-',
        r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1),
        r.ip_publico      || r.ip || '-',
        r.endereco_aprox  || '-',
        r.dispositivo     || '-',
      ];
      vals.forEach((v, i) => {
        const x = cols[i];
        const w = (cols[i + 1] || pageW) - x - 4;
        doc.text(v, x, yRow + 2, { width: w, lineBreak: false });
      });
      doc.moveDown(0.15);
    });

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#888').text(`Total de registros: ${rows.length}`, { align: 'right' });
    doc.end();
  } catch (err) {
    console.error('[Relatorio PDF]', err);
    return res.status(500).json({ erro: 'Erro ao gerar PDF.' });
  }
}

// GET /api/relatorios/excel
async function exportarExcel(req, res) {
  try {
    const [rows, tz] = await Promise.all([buscarRegistros(req), getTimezone()]);

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

    const headers = ['ID','Data/Hora','Funcionário','E-mail','CPF','Cargo','Tipo','IP Público','IP Interno','Endereço','Latitude','Longitude','Dispositivo','Navegador','Observação'];
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
      ws.cell(row,  8).string(r.ip_publico      || '').style(style);
      ws.cell(row,  9).string(r.ip              || '').style(style);
      ws.cell(row, 10).string(r.endereco_aprox  || '').style(style);
      ws.cell(row, 11).string(r.latitude  ? String(r.latitude)  : '').style(style);
      ws.cell(row, 12).string(r.longitude ? String(r.longitude) : '').style(style);
      ws.cell(row, 13).string(r.dispositivo     || '').style(style);
      ws.cell(row, 14).string(r.navegador       || '').style(style);
      ws.cell(row, 15).string(r.observacao      || '').style(style);
    });

    [8,20,25,28,16,18,10,16,12,40,12,12,12,12,20].forEach((w, i) => ws.column(i + 1).setWidth(w));

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

    let whereUser = 'WHERE u.ativo = 1';
    const paramsUser = [...params];
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
