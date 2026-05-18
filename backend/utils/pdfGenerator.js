/**
 * PDF Generator — Ability Pro v3
 * - Cor primária: VERMELHO (#E8192C)
 * - Suporte a datas personalizadas por colaborador/curso
 * - Datas de múltiplos dias concatenadas (ex: "17, 18 e 19/05/2026")
 * - Coordenadas salvas pelo Editor Visual (template_positions.json)
 *
 * CORREÇÃO CRÍTICA DE COORDENADAS:
 *   O canvas HTML tem y=0 no TOPO (cresce para baixo).
 *   O pdf-lib tem y=0 na BASE (cresce para cima).
 *   A conversão correta é:  y_pdf = pageHeight - (py * pageHeight) - elementHeight
 *   onde py é a posição relativa (0-1) vinda do editor visual.
 */

const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

const TEMPLATES_DIR  = path.join(__dirname, '../../data/templates');
const POSITIONS_FILE = path.join(__dirname, '../../data/template_positions.json');

// Cores da Ability Pro
const COLORS = {
  azul:     rgb(0.04, 0.22, 0.51),   // #0A3882
  vermelho: rgb(0.91, 0.10, 0.17),   // #E8192C
  cinza:    rgb(0.3,  0.3,  0.3),
  branco:   rgb(1,    1,    1),
  preto:    rgb(0,    0,    0),
};

// ─── Carrega posições salvas pelo admin ──────────────────────────────────────
function loadSavedPositions() {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
    }
  } catch(e) { console.warn('Erro ao carregar template_positions.json:', e.message); }
  return {};
}

// ─── Formata array de datas para exibição ───────────────────────────────────
// Ex: ['2026-05-17', '2026-05-18'] → "17 e 18/05/2026"
// Ex: ['2026-05-17']               → "17/05/2026"
// Ex: []                           → data de hoje por extenso
function formatDates(datesArr) {
  const valid = (datesArr || []).filter(d => d && String(d).trim());
  if (!valid.length) {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  if (valid.length === 1) {
    const [y, m, d] = valid[0].split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return valid[0];
  }
  // Múltiplos dias
  const parsed = valid.map(s => {
    const [y, m, d] = s.split('-');
    return { y, m, d };
  }).filter(p => p.y && p.m && p.d);

  const sameMonth = parsed.every(p => p.m === parsed[0].m && p.y === parsed[0].y);
  if (sameMonth && parsed.length > 0) {
    const days = parsed.map(p => parseInt(p.d)).sort((a, b) => a - b);
    const last = days.pop();
    if (!days.length) return `${String(last).padStart(2,'0')}/${parsed[0].m}/${parsed[0].y}`;
    return `${days.map(d => String(d).padStart(2,'0')).join(', ')} e ${String(last).padStart(2,'0')}/${parsed[0].m}/${parsed[0].y}`;
  }
  return parsed.map(p => `${p.d}/${p.m}/${p.y}`).join(', ');
}

// ─── Calcula fonte máxima que cabe em maxWidth ───────────────────────────────
function calcFitFontSize(font, text, desiredSize, maxWidth) {
  let sz = desiredSize;
  while (sz > 6 && font.widthOfTextAtSize(text, sz) > maxWidth) sz -= 0.5;
  return sz;
}

/**
 * Converte posição relativa (px, py) do editor visual para coordenadas pdf-lib.
 *
 * O editor visual usa:
 *   px = left / canvasWidth   (0 = esquerda, 1 = direita)
 *   py = top  / canvasHeight  (0 = topo,     1 = base)
 *
 * pdf-lib usa:
 *   x = pixels da esquerda
 *   y = pixels da base (crescendo para cima)
 *
 * Portanto:
 *   x_pdf = px * pageWidth
 *   y_pdf = pageHeight - (py * pageHeight) - textLineHeight
 *         = pageHeight * (1 - py) - textLineHeight
 *
 * Para assinatura (imagem):
 *   y_pdf = pageHeight * (1 - py) - imageHeight
 */
function toAbsX(px, pageWidth) {
  return px * pageWidth;
}

function toAbsY(py, pageHeight, elementHeight = 0) {
  // py=0 = topo da página → y_pdf = pageHeight - elementHeight
  // py=1 = base da página → y_pdf = 0 - elementHeight (pode ser negativo se mal configurado)
  return pageHeight * (1 - py) - elementHeight;
}

/**
 * Gera PDF de certificado.
 * @param {object}   colab        — dados do colaborador
 * @param {string}   cert         — ex: 'NR35'
 * @param {string|null} signatureData — base64 PNG da assinatura
 * @param {string[]|null} courseDates  — datas do curso vindas do admin
 */
async function generateCertificatePDF(colab, cert, signatureData, courseDates) {
  const templatePath   = path.join(TEMPLATES_DIR, `${cert}.pdf`);
  const savedPositions = loadSavedPositions();
  const pos            = savedPositions[cert] || null;
  const dataExibir     = formatDates(courseDates);
  let   pdfDoc;

  if (fs.existsSync(templatePath)) {
    // ── Usa template existente ──────────────────────────────────────────────
    const templateBytes = fs.readFileSync(templatePath);
    pdfDoc = await PDFDocument.load(templateBytes);

    // Página correta (editor salva como 1-based)
    const pageIdx = pos?.page ? pos.page - 1 : 0;
    const page    = pdfDoc.getPages()[pageIdx] || pdfDoc.getPages()[0];
    const { width: W, height: H } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Tamanhos de fonte configuráveis pelo editor
    const nomeSz = pos?.nomeSz || 18;
    const cpfSz  = pos?.cpfSz  || 11;
    const dataSz = pos?.dataSz || 10;
    const sigW   = pos?.sigW   || 140;
    const sigH   = pos?.sigH   || 50;

   // ── NOME ────────────────────────────────────────────────────────────────
    const nomeText   = colab.nome.toUpperCase();
    const nomeFitSz  = calcFitFontSize(fontBold, nomeText, nomeSz, W * 0.8);
    const nomeTextW  = fontBold.widthOfTextAtSize(nomeText, nomeFitSz);

    if (pos?.nome) {
      // Posição definida pelo editor visual
      const nx = toAbsX(pos.nome.px, W);
      const ny = toAbsY(pos.nome.py, H, nomeFitSz);
      page.drawText(nomeText, { x: nx, y: ny, size: nomeFitSz, font: fontBold, color: COLORS.azul });
    } else {
      // Fallback centralizado cirurgicamente no meio da área branca
      let nx = W / 2 - nomeTextW / 2;
      let ny = H * 0.52; 

      if (cert === 'NR35') { ny = H * 0.58; } 
      else if (cert === 'NR06') { ny = H * 0.60; }
      else if (cert === 'NR10') { ny = H * 0.62; }
      else if (cert === 'DIREÇÃO_DEFENSIVA' || cert === 'DIRECAODEFENSIVA' || cert === 'DIRECAO') { ny = H * 0.54; }

      page.drawText(nomeText, { x: nx, y: ny, size: nomeFitSz, font: fontBold, color: COLORS.azul });
    }

    // ── CPF ─────────────────────────────────────────────────────────────────
    const cpfText = `CPF: ${formatCPF(colab.cpf)}`;
    if (pos?.cpf) {
      const cx = toAbsX(pos.cpf.px, W);
      const cy = toAbsY(pos.cpf.py, H, cpfSz);
      page.drawText(cpfText, { x: cx, y: cy, size: cpfSz, font: fontReg, color: COLORS.cinza });
    } else {
      // Alinha o CPF logo abaixo do nome centralizado
      let cx = W / 2 - fontReg.widthOfTextAtSize(cpfText, cpfSz) / 2;
      let cy = H * 0.47;

      if (cert === 'NR35') { cy = H * 0.53; }
      else if (cert === 'NR06') { cy = H * 0.55; }
      else if (cert === 'NR10') { cy = H * 0.57; }
      else if (cert === 'DIREÇÃO_DEFENSIVA' || cert === 'DIRECAODEFENSIVA' || cert === 'DIRECAO') { cy = H * 0.49; }

      page.drawText(cpfText, { x: cx, y: cy, size: cpfSz, font: fontReg, color: COLORS.cinza });
    }

    // ── DATA ─────────────────────────────────────────────────────────────────
    const dataText = `Realizado em: ${dataExibir}`;
    if (pos?.data) {
      const dx = toAbsX(pos.data.px, W);
      const dy = toAbsY(pos.data.py, H, dataSz);
      page.drawText(dataText, { x: dx, y: dy, size: dataSz, font: fontReg, color: COLORS.cinza });
    } else {
      // Posiciona a data acima dos blocos de instrutores
      let dx = W / 2 - fontReg.widthOfTextAtSize(dataText, dataSz) / 2;
      let dy = H * 0.38;

      if (cert === 'NR35') { dy = H * 0.35; }
      else if (cert === 'NR06') { dy = H * 0.42; }
      else if (cert === 'NR10') { dy = H * 0.39; }
      else if (cert === 'DIREÇÃO_DEFENSIVA' || cert === 'DIRECAODEFENSIVA' || cert === 'DIRECAO') { dy = H * 0.38; }

      page.drawText(dataText, { x: dx, y: dy, size: dataSz, font: fontReg, color: COLORS.cinza });
    }

    // ── ASSINATURA ───────────────────────────────────────────────────────────
    if (signatureData) {
      if (pos?.sig) {
        const sx = toAbsX(pos.sig.px, W);
        const sy = toAbsY(pos.sig.py, H, sigH);
        await embedSignature(pdfDoc, page, signatureData, sx, sy, sigW, sigH);
      } else {
        // Fallback: Força a imagem a flutuar na linha EXATAMENTE ACIMA da palavra Aluno/ALUNO
        let sx = W / 2 - sigW / 2; 
        let sy = H * 0.18; 

        if (cert === 'NR35') { 
          sy = H * 0.23; // Linha do aluno fica mais alta neste template
        } else if (cert === 'NR06') { 
          sy = H * 0.17; 
        } else if (cert === 'NR10') { 
          // No seu template da NR10, a palavra "Aluno" está deslocada para o canto esquerdo da folha
          sx = W * 0.17; 
          sy = H * 0.20; 
        } else if (cert === 'DIREÇÃO_DEFENSIVA' || cert === 'DIRECAODEFENSIVA' || cert === 'DIRECAO') { 
          sy = H * 0.18; 
        }

        await embedSignature(pdfDoc, page, signatureData, sx, sy, sigW, sigH);
      }
    }

  } else {
    // ── Gera do zero (sem template) ─────────────────────────────────────────
    pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([841.89, 595.28]); // A4 paisagem
    await drawCertificateFromScratch(pdfDoc, page, colab, cert, signatureData, dataExibir);
  }

  return await pdfDoc.save();
}

// ─── Desenha certificado do zero (sem template PDF) ──────────────────────────
async function drawCertificateFromScratch(pdfDoc, page, colab, cert, signatureData, dataExibir) {
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Fundo branco
  page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.branco });

  // Bordas vermelhas
  page.drawRectangle({ x: 0,          y: 0,           width: 14,     height,      color: COLORS.vermelho });
  page.drawRectangle({ x: width - 14, y: 0,           width: 14,     height,      color: COLORS.vermelho });
  page.drawRectangle({ x: 0,          y: 0,           width,         height: 14,  color: COLORS.vermelho });
  page.drawRectangle({ x: 0,          y: height - 14, width,         height: 14,  color: COLORS.vermelho });

  // Faixa azul no topo
  page.drawRectangle({ x: 14, y: height - 90, width: width - 28, height: 76, color: COLORS.azul });
  page.drawText('ABILITY PRO', {
    x: 40, y: height - 62, size: 28, font: fontBold, color: COLORS.vermelho,
  });
  page.drawText('Sistema de Certificação Corporativo', {
    x: 40, y: height - 80, size: 10, font: fontReg, color: COLORS.branco,
  });

  // Título CERTIFICADO
  page.drawText('CERTIFICADO', {
    x: width / 2 - fontBold.widthOfTextAtSize('CERTIFICADO', 36) / 2,
    y: height - 160, size: 36, font: fontBold, color: COLORS.azul,
  });

  const certName = getCertFullName(cert);
  page.drawText(certName, {
    x: width / 2 - fontBold.widthOfTextAtSize(certName, 18) / 2,
    y: height - 190, size: 18, font: fontBold, color: COLORS.vermelho,
  });

  page.drawText('Certificamos que', {
    x: width / 2 - fontReg.widthOfTextAtSize('Certificamos que', 13) / 2,
    y: height - 240, size: 13, font: fontReg, color: COLORS.cinza,
  });

  const nomeUpper = colab.nome.toUpperCase();
  const nomeSz    = calcFitFontSize(fontBold, nomeUpper, 24, width * 0.7);
  page.drawText(nomeUpper, {
    x: width / 2 - fontBold.widthOfTextAtSize(nomeUpper, nomeSz) / 2,
    y: height - 280, size: nomeSz, font: fontBold, color: COLORS.azul,
  });

  page.drawLine({
    start: { x: width / 2 - 150, y: height - 292 },
    end:   { x: width / 2 + 150, y: height - 292 },
    thickness: 1.5, color: COLORS.vermelho,
  });

  const cpfText = `CPF: ${formatCPF(colab.cpf)}`;
  page.drawText(cpfText, {
    x: width / 2 - fontReg.widthOfTextAtSize(cpfText, 11) / 2,
    y: height - 315, size: 11, font: fontReg, color: COLORS.cinza,
  });

  page.drawText('concluiu com aproveitamento o treinamento referente às normas:', {
    x: width / 2 - fontReg.widthOfTextAtSize('concluiu com aproveitamento o treinamento referente às normas:', 12) / 2,
    y: height - 345, size: 12, font: fontReg, color: COLORS.cinza,
  });

  page.drawText(certName, {
    x: width / 2 - fontBold.widthOfTextAtSize(certName, 16) / 2,
    y: height - 375, size: 16, font: fontBold, color: COLORS.azul,
  });

  const dataLine = `Realizado em ${dataExibir}`;
  page.drawText(dataLine, {
    x: width / 2 - fontReg.widthOfTextAtSize(dataLine, 10) / 2,
    y: height - 400, size: 10, font: fontReg, color: COLORS.cinza,
  });

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  page.drawText(`Emitido em ${hoje}`, {
    x: width / 2 - fontReg.widthOfTextAtSize(`Emitido em ${hoje}`, 9) / 2,
    y: height - 415, size: 9, font: fontReg, color: COLORS.cinza,
  });

  // Linha de assinatura
  const assinaturaY = 100;
  page.drawLine({
    start: { x: width / 2 - 120, y: assinaturaY + 30 },
    end:   { x: width / 2 + 120, y: assinaturaY + 30 },
    thickness: 1, color: COLORS.cinza,
  });
  page.drawText('ALUNO', {
    x: width / 2 - fontReg.widthOfTextAtSize('ALUNO', 10) / 2,
    y: assinaturaY + 15, size: 10, font: fontReg, color: COLORS.cinza,
  });
  page.drawText(colab.nome.toUpperCase(), {
    x: width / 2 - fontReg.widthOfTextAtSize(colab.nome.toUpperCase(), 9) / 2,
    y: assinaturaY + 2, size: 9, font: fontReg, color: COLORS.cinza,
  });

  if (signatureData) {
    await embedSignature(pdfDoc, page, signatureData, width / 2 - 80, assinaturaY + 30, 160, 55);
  }

  page.drawText('www.abilitypro.com.br', {
    x: width - 200, y: 40, size: 9, font: fontReg, color: COLORS.cinza,
  });
}

// ─── Embute assinatura PNG/JPG na página ─────────────────────────────────────
async function embedSignature(pdfDoc, page, signatureData, x, y, w, h) {
  try {
    const base64   = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const imgBytes = Buffer.from(base64, 'base64');
    const img      = await pdfDoc.embedPng(imgBytes).catch(() => pdfDoc.embedJpg(imgBytes));
    page.drawImage(img, { x, y, width: w, height: h, opacity: 0.95 });
  } catch(e) {
    console.error('Erro ao embutir assinatura:', e.message);
  }
}

// ─── Gera manifesto jurídico digital ─────────────────────────────────────────
async function generateManifesto(colab, certs, ip, signedAt, signatureData) {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4 retrato
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Cabeçalho azul
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.azul });
  page.drawText('ABILITY PRO', {
    x: 30, y: height - 45, size: 22, font: fontBold, color: COLORS.vermelho,
  });
  page.drawText('MANIFESTO DE ASSINATURA DIGITAL', {
    x: 30, y: height - 65, size: 11, font: fontReg, color: COLORS.branco,
  });

  let y = height - 120;
  const lineH = 22;

  const addLine = (label, value, isBold = false) => {
    page.drawText(`${label}:`, { x: 40, y, size: 11, font: fontBold, color: COLORS.azul });
    page.drawText(value,       { x: 180, y, size: 11, font: isBold ? fontBold : fontReg, color: COLORS.preto });
    y -= lineH;
  };

  const addSection = (title) => {
    y -= 10;
    page.drawRectangle({ x: 30, y: y - 4, width: width - 60, height: 20, color: rgb(0.93, 0.93, 0.93) });
    page.drawText(title, { x: 40, y, size: 12, font: fontBold, color: COLORS.azul });
    y -= lineH + 4;
  };

  addSection('DADOS DO SIGNATÁRIO');
  addLine('Nome', colab.nome.toUpperCase(), true);
  addLine('CPF',  formatCPF(colab.cpf));

  addSection('DADOS DA ASSINATURA');
  const dateObj = new Date(signedAt);
  addLine('Data',       dateObj.toLocaleDateString('pt-BR'));
  addLine('Horário',    dateObj.toLocaleTimeString('pt-BR'));
  addLine('IP de Origem', ip);
  addLine('Fuso Horário', 'America/Sao_Paulo (BRT)');

  addSection('CERTIFICADOS ASSINADOS');
  certs.forEach(cert => {
    y -= 4;
    page.drawText(`• ${getCertFullName(cert)}`, { x: 50, y, size: 11, font: fontReg, color: COLORS.preto });
    y -= lineH;
  });

  addSection('VALIDADE JURÍDICA');
  const textoValidade = [
    'Este documento comprova eletronicamente que o signatário identificado acima',
    'acessou o sistema Ability Pro através de dispositivo pessoal, confirmou sua',
    'identidade por CPF e apôs sua assinatura digital de próprio punho.',
    '',
    'Documento gerado automaticamente pelo sistema Ability Pro v3.0.',
  ];
  textoValidade.forEach(linha => {
    page.drawText(linha, { x: 40, y, size: 10, font: fontReg, color: COLORS.cinza });
    y -= 16;
  });

  if (signatureData) {
    y -= 20;
    page.drawText('Assinatura capturada:', { x: 40, y, size: 10, font: fontBold, color: COLORS.azul });
    y -= 60;
    await embedSignature(pdfDoc, page, signatureData, 40, y, 160, 55);
    y -= 20;
    page.drawLine({ start: { x: 40, y }, end: { x: 210, y }, thickness: 0.5, color: COLORS.cinza });
    y -= 14;
    page.drawText(colab.nome.toUpperCase(), { x: 40, y, size: 9, font: fontReg, color: COLORS.cinza });
  }

  // Rodapé
  page.drawRectangle({ x: 0, y: 0, width, height: 40, color: COLORS.azul });
  page.drawText('Ability Pro — Sistema de Certificação Corporativo | www.abilitypro.com.br', {
    x: 30, y: 14, size: 9, font: fontReg, color: COLORS.branco,
  });

  return await pdfDoc.save();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCPF(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function getCertFullName(cert) {
  const map = {
    'NR06':              'NR-06 — Equipamento de Proteção Individual (EPI)',
    'NR10':              'NR-10 — Segurança em Instalações e Serviços em Eletricidade',
    'DIRECAO_DEFENSIVA': 'Direção Defensiva',
    'NR35':              'NR-35 — Trabalho em Altura',
    'SGA_NR20':          'SGA — NR-20 — Líquidos Combustíveis e Inflamáveis',
    'NR33':              'NR-33 — Trabalho em Espaço Confinado',
    'NR10_SEP':          'NR-10 — Sistema Elétrico de Potência (SEP)',
  };
  return map[cert] || cert;
}

module.exports = { generateCertificatePDF, generateManifesto, formatDates };