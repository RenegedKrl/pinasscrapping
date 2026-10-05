const fs = require('fs');
const path = require('path');
const { chromium } = require('./prospeccao/node_modules/playwright-core');

async function buildPack() {
  const saidasDir = path.join(__dirname, 'saidas');
  if (!fs.existsSync(saidasDir)) {
    fs.mkdirSync(saidasDir, { recursive: true });
  }

  console.log('Iniciando captura de slides em 1920x1080 alta resolução...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://localhost:3333/slides', { waitUntil: 'networkidle' });

  // Ocultar a barra de controles e a barra de progresso durante os prints
  await page.evaluate(() => {
    const controls = document.getElementById('deck-controls');
    const progress = document.querySelector('.deck-progress-track');
    const drawer = document.getElementById('speaker-drawer');
    if (controls) controls.style.display = 'none';
    if (progress) progress.style.display = 'none';
    if (drawer) drawer.style.display = 'none';
  });

  const totalSlides = 8;
  const slideImagesB64 = [];

  for (let i = 0; i < totalSlides; i++) {
    console.log(`Renderizando slide ${i + 1} de ${totalSlides}...`);
    await page.evaluate((idx) => {
      updateSlide(idx);
    }, i);
    // Aguardar animação de transição
    await page.waitForTimeout(500);

    const buffer = await page.screenshot({ type: 'png' });
    slideImagesB64.push(buffer.toString('base64'));
  }

  console.log('Compilando PDF a partir das capturas fiéis...');
  const printHtml = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      @page {
        size: 1920px 1080px;
        margin: 0;
      }
      * { margin: 0; padding: 0; }
      body { background: #000; overflow: hidden; }
      .slide-img {
        width: 1920px;
        height: 1080px;
        object-fit: cover;
        display: block;
        page-break-after: always;
      }
      .slide-img:last-child {
        page-break-after: avoid;
      }
    </style>
  </head>
  <body>
    ${slideImagesB64.map(b64 => `<img src="data:image/png;base64,${b64}" class="slide-img">`).join('\n')}
  </body>
  </html>`;

  const printPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await printPage.setContent(printHtml, { waitUntil: 'load' });

  const pdfPath = path.join(saidasDir, 'Apresentacao_Pinas_Studio_Slides.pdf');
  await printPage.pdf({
    path: pdfPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  console.log('✅ PDF 16:9 de Alta Fidelidade gerado com sucesso:', pdfPath);
  console.log('Tamanho:', fs.statSync(pdfPath).size, 'bytes');

  // Criar Arquivo HTML Standalone (1 arquivo só com tudo embutido)
  console.log('Criando arquivo HTML autônomo (1 arquivo só)...');
  const slidesHtml = fs.readFileSync(path.join(__dirname, 'prospeccao', 'public', 'slides', 'index.html'), 'utf8');
  const slidesCss = fs.readFileSync(path.join(__dirname, 'prospeccao', 'public', 'slides', 'style.css'), 'utf8');
  const slidesJs = fs.readFileSync(path.join(__dirname, 'prospeccao', 'public', 'slides', 'slides.js'), 'utf8');
  const logoBrancoB64 = fs.readFileSync(path.join(__dirname, 'prospeccao', 'public', 'logo-branco.png')).toString('base64');
  const logoVermelhoB64 = fs.readFileSync(path.join(__dirname, 'prospeccao', 'public', 'logo-vermelho.png')).toString('base64');

  let standaloneHtml = slidesHtml;
  standaloneHtml = standaloneHtml.replace('<link rel="stylesheet" href="style.css">', `<style>\n${slidesCss}\n</style>`);
  standaloneHtml = standaloneHtml.replace('<script src="slides.js"></script>', `<script>\n${slidesJs}\n</script>`);
  standaloneHtml = standaloneHtml.replace(/src="logo-branco\.png"/g, `src="data:image/png;base64,${logoBrancoB64}"`);
  standaloneHtml = standaloneHtml.replace(/src="logo-vermelho\.png"/g, `src="data:image/png;base64,${logoVermelhoB64}"`);

  const standalonePath = path.join(saidasDir, 'Apresentacao_Pinas_Studio.html');
  fs.writeFileSync(standalonePath, standaloneHtml, 'utf8');
  console.log('✅ Arquivo HTML Standalone gerado com sucesso:', standalonePath);

  await browser.close();
  console.log('==================================================');
  console.log('🎉 PACOTE DE ENVIO CONCLUÍDO!');
  console.log('==================================================');
}

buildPack().catch(err => {
  console.error('Erro ao gerar pacote:', err);
  process.exit(1);
});
