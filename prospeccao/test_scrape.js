const { chromium } = require('playwright');

async function testMaps() {
  console.log('Launching Edge...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const query = 'clinica veterinaria santo amaro';
  console.log(`Searching for: ${query}`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const places = await page.evaluate(() => {
    const results = [];
    const items = document.querySelectorAll('div[role="feed"] > div > div[jsaction]');
    for (const item of items) {
      const linkEl = item.querySelector('a.hfpxzc');
      if (!linkEl) continue;
      const name = linkEl.getAttribute('aria-label') || '';
      const url = linkEl.getAttribute('href') || '';
      const text = item.innerText || '';
      
      // Extract phone regex
      const phoneMatch = text.match(/(?:\(?([1-9]{2})\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}/);
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      // Extract rating
      const ratingEl = item.querySelector('.MW4etd');
      const rating = ratingEl ? ratingEl.innerText : '';
      
      results.push({ name, url, phone, rating, preview: text.replace(/\n+/g, ' | ').slice(0, 150) });
    }
    return results;
  });

  console.log(`Found ${places.length} places:`);
  console.log(JSON.stringify(places.slice(0, 5), null, 2));

  await browser.close();
}

testMaps().catch(console.error);
