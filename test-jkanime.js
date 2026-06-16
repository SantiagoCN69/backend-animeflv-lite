const axios = require('axios');
const cheerio = require('cheerio');

async function testJKAnime() {
  try {
    const response = await axios.get('https://jkanime.net/buscar/kaoru', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    console.log('=== ANÁLISIS DE ESTRUCTURA JKANIME ===\n');
    
    // Buscar todos los elementos que podrían contener animes
    console.log('1. Buscando elementos con clase que contenga "video":');
    $('[class*="video"]').each((i, elem) => {
      console.log(`   - Clase: $(elem).attr('class')}`);
      console.log(`     HTML: ${$(elem).html().substring(0, 200)}...`);
    });
    
    console.log('\n2. Buscando elementos con clase que contenga "anime":');
    $('[class*="anime"]').each((i, elem) => {
      console.log(`   - Clase: ${$(elem).attr('class')}`);
      console.log(`     HTML: ${$(elem).html().substring(0, 200)}...`);
    });
    
    console.log('\n3. Buscando elementos con clase que contenga "card":');
    $('[class*="card"]').each((i, elem) => {
      console.log(`   - Clase: ${$(elem).attr('class')}`);
      console.log(`     HTML: ${$(elem).html().substring(0, 200)}...`);
    });
    
    console.log('\n4. Buscando elementos con clase que contenga "block":');
    $('[class*="block"]').each((i, elem) => {
      console.log(`   - Clase: ${$(elem).attr('class')}`);
      console.log(`     HTML: ${$(elem).html().substring(0, 200)}...`);
    });
    
    console.log('\n5. Buscando todos los links dentro del contenido principal:');
    $('.content a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      if (href && href.includes('/kaoru')) {
        console.log(`   - Link: ${href}`);
        console.log(`     Texto: ${text}`);
        console.log(`     Padre: ${$(elem).parent().attr('class')}`);
      }
    });
    
    console.log('\n6. Buscando elementos con clase "title":');
    $('.title').each((i, elem) => {
      console.log(`   - Texto: ${$(elem).text().trim()}`);
      console.log(`     Padre: ${$(elem).parent().attr('class')}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testJKAnime();
