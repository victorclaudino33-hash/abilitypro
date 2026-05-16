/**
 * PDF Generator — Ability Pro v3
 * Usa pdf-lib para criar certificados e manifesto jurídico.
 * Se existir um arquivo template em /data/templates/<CERT>.pdf, usa como base.
 * Caso contrário, gera um PDF estilizado do zero.
 */

const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../../data/templates');
const LOGO_PATH     = path.join(__dirname, '../../data/logo.png');

// Cores da Ability Pro
const COLORS = {
  azul:    rgb(0.04, 0.22, 0.51),   // #0A3882
  laranja: rgb(0.95, 0.44, 0.04),   // #F27008
  cinza:   rgb(0.3, 0.3, 0.3),
  branco:  rgb(1, 1, 1),
  preto:   rgb(0, 0, 0),
};

/**
 * Gera PDF de certificado.
 * @param {object} colab  — dados do colaborador
 * @param {string} cert   — ex: 'NR35'
 * @param {string|null} signatureData — base64 PNG da assinatura
 */
async function generateCertificatePDF(colab, cert, signatureData) {
  const templatePath = path.join(TEMPLATES_DIR, `${cert}.pdf`);
  let pdfDoc;

  if (fs.existsSync(templatePath)) {
    // Usa template existente
    const templateBytes = fs.readFileSync(templatePath);
    pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const font      = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg   = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Preenche NOME do colaborador (posição aproximada — ajuste conforme seu template)
    page.drawText(colab.nome.toUpperCase(), {
      x: width / 2 - (font.widthOfTextAtSize(colab.nome.toUpperCase(), 18) / 2),
      y: height * 0.52,
      size: 18,
      font,
      color: COLORS.azul,
    });

    // CPF
    const cpfFormatted = formatCPF(colab.cpf);
    page.drawText(`CPF: ${cpfFormatted}`, {
      x: width / 2 - 60,
      y: height * 0.46,
      size: 11,
      font: fontReg,
      color: COLORS.cinza,
    });

    // Data de emissão
    const dataEmissao = new Date().toLocaleDateString('pt-BR');
    page.drawText(`Emissão: ${dataEmissao}`, {
      x: width / 2 - 50,
      y: height * 0.42,
      size: 10,
      font: fontReg,
      color: COLORS.cinza,
    });

    // Assinatura
    if (signatureData) {
      await embedSignature(pdfDoc, page, signatureData, width / 2 - 70, height * 0.2, 140, 50);
    }

  } else {
    // Gera do zero (sem template)
    pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([841.89, 595.28]); // A4 paisagem
    await drawCertificateFromScratch(pdfDoc, page, colab, cert, signatureData);
  }

  return await pdfDoc.save();
}

async function drawCertificateFromScratch(pdfDoc, page, colab, cert, signatureData) {
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Fundo azul escuro na borda
  page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.branco });
  page.drawRectangle({ x: 0, y: 0, width: 14, height, color: COLORS.laranja });
  page.drawRectangle({ x: width - 14, y: 0, width: 14, height, color: COLORS.laranja });
  page.drawRectangle({ x: 0, y: 0, width, height: 14, color: COLORS.laranja });
  page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: COLORS.laranja });

  // Faixa azul no topo
  page.drawRectangle({ x: 14, y: height - 90, width: width - 28, height: 76, color: COLORS.azul });

  // ABILITY PRO
  page.drawText('ABILITY PRO', {
    x: 40, y: height - 62,
    size: 28, font: fontBold, color: COLORS.laranja,
  });
  page.drawText('Sistema de Certificação Corporativo', {
    x: 40, y: height - 80,
    size: 10, font: fontReg, color: COLORS.branco,
  });

  // CERTIFICADO
  page.drawText('CERTIFICADO', {
    x: width / 2 - fontBold.widthOfTextAtSize('CERTIFICADO', 36) / 2,
    y: height - 160,
    size: 36, font: fontBold, color: COLORS.azul,
  });

  // Subtítulo do cert
  const certName = getCertFullName(cert);
  page.drawText(certName, {
    x: width / 2 - fontBold.widthOfTextAtSize(certName, 18) / 2,
    y: height - 190,
    size: 18, font: fontBold, color: COLORS.laranja,
  });

  // Texto central
  const textoPrincipal = 'Certificamos que';
  page.drawText(textoPrincipal, {
    x: width / 2 - fontReg.widthOfTextAtSize(textoPrincipal, 13) / 2,
    y: height - 240,
    size: 13, font: fontReg, color: COLORS.cinza,
  });

  // NOME DO COLABORADOR
  const nomeUpper = colab.nome.toUpperCase();
  page.drawText(nomeUpper, {
    x: width / 2 - fontBold.widthOfTextAtSize(nomeUpper, 24) / 2,
    y: height - 280,
    size: 24, font: fontBold, color: COLORS.azul,
  });

  // Linha decorativa sob nome
  page.drawLine({
    start: { x: width / 2 - 150, y: height - 292 },
    end:   { x: width / 2 + 150, y: height - 292 },
    thickness: 1.5, color: COLORS.laranja,
  });

  // CPF e data
  const cpfText = `CPF: ${formatCPF(colab.cpf)}`;
  page.drawText(cpfText, {
    x: width / 2 - fontReg.widthOfTextAtSize(cpfText, 11) / 2,
    y: height - 315,
    size: 11, font: fontReg, color: COLORS.cinza,
  });

  const concluidoText = 'concluiu com aproveitamento o treinamento referente às normas:';
  page.drawText(concluidoText, {
    x: width / 2 - fontReg.widthOfTextAtSize(concluidoText, 12) / 2,
    y: height - 345,
    size: 12, font: fontReg, color: COLORS.cinza,
  });

  page.drawText(certName, {
    x: width / 2 - fontBold.widthOfTextAtSize(certName, 16) / 2,
    y: height - 375,
    size: 16, font: fontBold, color: COLORS.azul,
  });

  // Data de emissão
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  page.drawText(`Emitido em ${hoje}`, {
    x: width / 2 - fontReg.widthOfTextAtSize(`Emitido em ${hoje}`, 10) / 2,
    y: height - 400,
    size: 10, font: fontReg, color: COLORS.cinza,
  });

  // Rodapé — linha de assinatura ALUNO
  const assinaturaY = 100;

  // Linha de assinatura
  page.drawLine({
    start: { x: width / 2 - 120, y: assinaturaY + 30 },
    end:   { x: width / 2 + 120, y: assinaturaY + 30 },
    thickness: 1, color: COLORS.cinza,
  });

  page.drawText('ALUNO', {
    x: width / 2 - fontReg.widthOfTextAtSize('ALUNO', 10) / 2,
    y: assinaturaY + 15,
    size: 10, font: fontReg, color: COLORS.cinza,
  });

  page.drawText(colab.nome.toUpperCase(), {
    x: width / 2 - fontReg.widthOfTextAtSize(colab.nome.toUpperCase(), 9) / 2,
    y: assinaturaY + 2,
    size: 9, font: fontReg, color: COLORS.cinza,
  });

  // Stamp assinatura ACIMA da linha ALUNO
  if (signatureData) {
    await embedSignature(pdfDoc, page, signatureData, width / 2 - 80, assinaturaY + 30, 160, 55);
  }

  // Rodapé direito — Ability Pro
  page.drawText('www.abilitypro.com.br', {
    x: width - 200, y: 40,
    size: 9, font: fontReg, color: COLORS.cinza,
  });
}

async function embedSignature(pdfDoc, page, signatureData, x, y, w, h) {
  try {
    // Remove data URI prefix if present
    const base64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const imgBytes = Buffer.from(base64, 'base64');
    const img = await pdfDoc.embedPng(imgBytes).catch(() => pdfDoc.embedJpg(imgBytes));
    page.drawImage(img, { x, y, width: w, height: h, opacity: 0.95 });
  } catch (e) {
    console.error('Erro ao embutir assinatura:', e.message);
  }
}

/**
 * Gera manifesto jurídico digital
 */
async function generateManifesto(colab, certs, ip, signedAt, signatureData) {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4 retrato
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Cabeçalho
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.azul });

  page.drawText('ABILITY PRO', {
    x: 30, y: height - 45, size: 22, font: fontBold, color: COLORS.laranja,
  });
  page.drawText('MANIFESTO DE ASSINATURA DIGITAL', {
    x: 30, y: height - 65, size: 11, font: fontReg, color: COLORS.branco,
  });

  let y = height - 120;
  const lineH = 22;

  const addLine = (label, value, isBold = false) => {
    page.drawText(`${label}:`, {
      x: 40, y, size: 11, font: fontBold, color: COLORS.azul,
    });
    page.drawText(value, {
      x: 180, y, size: 11, font: isBold ? fontBold : fontReg, color: COLORS.preto,
    });
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
  addLine('CPF', formatCPF(colab.cpf));

  addSection('DADOS DA ASSINATURA');
  const dateObj = new Date(signedAt);
  addLine('Data', dateObj.toLocaleDateString('pt-BR'));
  addLine('Horário', dateObj.toLocaleTimeString('pt-BR'));
  addLine('IP de Origem', ip);
  addLine('Fuso Horário', 'America/Sao_Paulo (BRT)');

  addSection('CERTIFICADOS ASSINADOS');
  certs.forEach(cert => {
    y -= 4;
    page.drawText(`• ${getCertFullName(cert)}`, {
      x: 50, y, size: 11, font: fontReg, color: COLORS.preto,
    });
    y -= lineH;
  });

  addSection('VALIDADE JURÍDICA');
  const textoValidade = [
    'Este documento comprova eletronicamente que o signatário identificado acima',
    'acessou o sistema Ability Pro através de dispositivo pessoal, confirmou sua',
    'identidade por CPF e apôs sua assinatura digital de próprio punho.',
    '',
    'A assinatura digital foi capturada em ambiente seguro e vinculada ao',
    'endereço IP registrado, data, horário e identificador único (token) do usuário.',
    '',
    'Documento gerado automaticamente pelo sistema Ability Pro v3.0.',
  ];
  textoValidade.forEach(linha => {
    page.drawText(linha, { x: 40, y, size: 10, font: fontReg, color: COLORS.cinza });
    y -= 16;
  });

  // Assinatura preview no manifesto
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

function formatCPF(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function getCertFullName(cert) {
  const map = {
    'NR06': 'NR-06 — Equipamento de Proteção Individual (EPI)',
    'NR10': 'NR-10 — Segurança em Instalações e Serviços em Eletricidade',
    'DIRECAO_DEFENSIVA': 'Direção Defensiva',
    'NR35': 'NR-35 — Trabalho em Altura',
    'SGA_NR20': 'SGA — NR-20 — Líquidos Combustíveis e Inflamáveis',
    'NR33': 'NR-33 — Trabalho em Espaço Confinado',
    'NR10_SEP': 'NR-10 — Sistema Elétrico de Potência (SEP)',
  };
  return map[cert] || cert;
}

module.exports = { generateCertificatePDF, generateManifesto };
