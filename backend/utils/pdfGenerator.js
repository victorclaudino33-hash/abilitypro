const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateCertificate(colaborador, curso, dadosAssinatura = null) {
    // 1. Carregar o template PDF correspondente ao curso
    const templateName = `${curso.replace('.', '_')}.pdf`;
    const templatePath = path.join(__dirname, '../../data/templates', templateName);

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template para o curso ${curso} não encontrado.`);
    }

    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    // 2. Carregar configurações de posicionamento customizadas
    const positionsPath = path.join(__dirname, '../../data/template_positions.json');
    let customPositions = null;
    if (fs.existsSync(positionsPath)) {
        const posData = JSON.parse(fs.readFileSync(positionsPath, 'utf8'));
        if (posData[curso]) {
            customPositions = posData[curso];
        }
    }

    // Pega a primeira página por padrão (ou a configurada no JSON)
    let pageIndex = 0;
    if (customPositions && customPositions.page !== undefined) {
        pageIndex = customPositions.page;
    }
    const page = pages[pageIndex] || pages[0];
    const { width, height } = page.getSize();

    // 3. Definir coordenadas padrão (Fallback antigo) ou Customizadas
    let coords = {
        nome: { x: width / 2 - 150, y: height * 0.55 },
        cpf: { x: width / 2 - 150, y: height * 0.50 },
        data: { x: width / 2 - 150, y: height * 0.45 },
        assinatura: { x: width / 2 - 100, y: height * 0.30 }
    };

    // Se existirem posições salvas pelo editor visual, converte a porcentagem da tela para pontos do PDF
    if (customPositions) {
        if (customPositions.nome) coords.nome = { x: customPositions.nome.x * width, y: customPositions.nome.y * height };
        if (customPositions.cpf) coords.cpf = { x: customPositions.cpf.x * width, y: customPositions.cpf.y * height };
        if (customPositions.data) coords.data = { x: customPositions.data.x * width, y: customPositions.data.y * height };
        if (customPositions.assinatura) coords.assinatura = { x: customPositions.assinatura.x * width, y: customPositions.assinatura.y * height };
    }

    // 4. Escrever os textos no PDF
    page.drawText(colaborador.NOME, {
        x: coords.nome.x,
        y: coords.nome.y,
        size: 20,
        color: rgb(0, 0, 0),
    });

    page.drawText(`CPF: ${colaborador.CPF}`, {
        x: coords.cpf.x,
        y: coords.cpf.y,
        size: 14,
        color: rgb(0.2, 0.2, 0.2),
    });

    const dataEmissao = new Date().toLocaleDateString('pt-BR');
    page.drawText(`Data de Emissão: ${dataEmissao}`, {
        x: coords.data.x,
        y: coords.data.y,
        size: 12,
        color: rgb(0.3, 0.3, 0.3),
    });

    // 5. Desenhar a assinatura digital se ela existir
    if (dadosAssinatura && dadosAssinatura.imagemBase64) {
        try {
            const imageBytes = Buffer.from(dadosAssinatura.imagemBase64.split(',')[1], 'base64');
            const signatureImage = await pdfDoc.embedPng(imageBytes);
            
            const sigWidth = 150;
            const sigHeight = 60;

            page.drawImage(signatureImage, {
                x: coords.assinatura.x,
                y: coords.assinatura.y,
                width: sigWidth,
                height: sigHeight,
            });
        } catch (imgError) {
            console.error("Erro ao embutir imagem da assinatura:", imgError);
        }
    }

    return await pdfDoc.save();
}

module.exports = { generateCertificate };