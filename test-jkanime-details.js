const axios = require('axios');
const cheerio = require('cheerio');

async function testJKAnimeDetails() {
  try {
    const response = await axios.get('https://jkanime.net/kaoru-hana-wa-rin-to-saku/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    console.log('=== ANÁLISIS DE ESTRUCTURA JKANIME DETALLES ===\n');
    
    // Buscar título
    console.log('1. Buscando título:');
    $('h1, h2, h3, .title, .anime-title').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text) {
        console.log(`   - Tag: ${elem.tagName}, Clase: ${$(elem).attr('class')}`);
        console.log(`     Texto: ${text.substring(0, 100)}`);
      }
    });
    
    // Buscar imagen
    console.log('\n2. Buscando imagen/portada:');
    $('img').each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-setbg');
      const alt = $(elem).attr('alt');
      if (src && (alt?.toLowerCase().includes('kaoru') || src.includes('kaoru'))) {
        console.log(`   - Src: ${src}`);
        console.log(`     Alt: ${alt}`);
        console.log(`     Padre: ${$(elem).parent().attr('class')}`);
      }
    });
    
    // Buscar sinopsis
    console.log('\n3. Buscando sinopsis:');
    $('.sinopsis, .description, .synopsis, p').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 50) {
        console.log(`   - Clase: ${$(elem).attr('class')}`);
        console.log(`     Texto: ${text.substring(0, 150)}...`);
      }
    });
    
    // Buscar episodios
    console.log('\n4. Buscando episodios:');
    $('[class*="episode"], [class*="ep"]').each((i, elem) => {
      const text = $(elem).text().trim();
      const href = $(elem).find('a').attr('href');
      if (text || href) {
        console.log(`   - Clase: ${$(elem).attr('class')}`);
        console.log(`     Texto: ${text}`);
        console.log(`     Href: ${href}`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testJKAnimeDetails();
