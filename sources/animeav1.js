const cheerio = require('cheerio');
const axios = require('axios');

const BASE_URL = 'https://animeav1.com';

// Encabezados estándar para evitar bloqueos básicos
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

// Normalizar título para comparación
function normalizeTitle(title) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function getLatestEpisodes() {
  try {
    // Reemplaza esto con tu lógica de fetch/axios hacia la URL principal de AnimeAV1
    const response = await axios.get('https://animeav1.com'); // Asegúrate de usar la URL correcta
    const $ = cheerio.load(response.data);
    const episodes = [];

    // Seleccionamos solo las tarjetas de la cuadrícula de últimos episodios
    // Escapamos la barra inclinada en 'group/item' porque es un selector CSS válido
    $('article.group\\/item').each((index, element) => {
      // Título: Está dentro del header > div
      const title = $(element).find('header div').text().trim();
      
      // Episodio: Está dentro de un span con clase text-lead dentro del div bg-line
      const episodeText = $(element).find('.bg-line span.text-lead').text().trim();
      const episodeNumber = parseInt(episodeText, 10);
      
      // Imagen: Extraemos el src de la etiqueta img dentro del figure
      const image = $(element).find('figure img').attr('src');
      
      // Link y ID: Extraemos el href del enlace invisible que cubre la tarjeta
      const link = $(element).find('a.absolute.inset-0').attr('href');
      let id = '';
      
      if (link) {
        // El link tiene el formato: /media/nombre-del-anime/episodio
        const parts = link.split('/');
        if (parts.length >= 3) {
          id = parts[2]; // Obtenemos 'nombre-del-anime'
        }
      }

      if (title && id) {
        episodes.push({
          id: id,
          title: title,
          episode: episodeNumber,
          image: image,
          url: link
        });
      }
    });

    return episodes;
  } catch (error) {
    console.error('Error obteniendo últimos episodios de AnimeV1:', error.message);
    return [];
  }
}

async function search(query) {
  try {
    const searchUrl = `${BASE_URL}/catalogo?search=${encodeURIComponent(query)}`;
    
    // Usamos timeout para evitar que la conexión se quede abierta eternamente si el sitio tarda
    const response = await axios.get(searchUrl, { 
      headers: HEADERS,
      timeout: 10000 
    });
    
    const $ = cheerio.load(response.data);
    const animes = [];

    // Selector corregido para la estructura nueva: article.group/item
    $('article.group\\/item').each((i, element) => {
      const article = $(element);
      
      const title = article.find('h3').text().trim();
      const url = article.find('a').first().attr('href');
      const image = article.find('figure img').attr('src');
      const type = article.find('.rounded.bg-line').text().trim();

      if (title && url) {
        animes.push({
          id: url.split('/').pop(),
          title: title,
          image: image, // Mantenemos image según tu estructura
          url: BASE_URL + url,
          type: type || 'TV',
          source: 'animeav1'
        });
      }
    });

    return animes;
  } catch (error) {
    console.error('Error en search animeav1:', error.message);
    return [];
  }
}

// Navegar por animes (Ya era manual, se optimizan headers)
async function browse(params) {
  const fullUrl = `${BASE_URL}/browse?${params}`;

  try {
    const response = await axios.get(fullUrl, { headers: HEADERS });
    const $ = cheerio.load(response.data);
    
    // Fallback de paginación
    let PaginasTotales = $('ul.pagination li').eq(-2).text().trim() || "1";

    const animes = $('article.Anime').map((i, element) => {
      const article = $(element);
      const title = article.find('.Title').text().trim();
      const type = article.find('.Type').text().trim();
      const url = article.find('a').attr('href');
      let cover = article.find('img').attr('src');

      return {
        title,
        type,
        url: url ? (url.startsWith('http') ? url : BASE_URL + url) : null,
        cover: cover ? (cover.startsWith('http') ? cover : BASE_URL + cover) : null,
        source: 'animeav1'
      };
    }).get();

    return { PaginasTotales, animes };

  } catch (error) {
    console.error('Error al navegar en animeav1:', error.message);
    return { PaginasTotales: "0", animes: [] };
  }
}

// Detalles de anime (Ya era manual)
async function getAnimeDetails(id) {
  try {
    const animePageUrl = `${BASE_URL}/anime/${id}`;
    const response = await axios.get(animePageUrl, { headers: HEADERS });
    const html = response.data;
    const $ = cheerio.load(html);

    let animeTitle = id;
    let animeSlug = id;

    // Título
    let h1Title = $('h1.Title').text().trim() || $('h1.anime-title').text().trim() || $('h1.page-title').text().trim();
    if (h1Title) animeTitle = h1Title;

    // Portada
    let cover = $('figure.AnimeCover img').attr('src') || $('figure img').first().attr('src');
    if (cover && !cover.startsWith('http')) cover = BASE_URL + cover;

    // Banner
    let banner = null;
    const bannerStyle = $('div.Ficha.fchlt div.Bg').attr('style');
    if (bannerStyle) {
      const bannerMatch = bannerStyle.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
      if (bannerMatch && bannerMatch[1]) {
        banner = bannerMatch[1].trim();
        if (!banner.startsWith('http')) banner = BASE_URL + banner;
      }
    }

    // Sinopsis
    let synopsis = $('div.Description p').first().text() || 
                   $('div.container section.Main article.Anime div.Description p').first().text() || 
                   $('div[class*="sinopsis"] p, div[id*="sinopsis"] p').first().text();

    // Géneros
    const genres = [];
    $('nav.Nvgnrs a').each((i, elem) => {
      const genreText = $(elem).text().trim();
      if (genreText) genres.push(genreText);
    });

    let rating = $('span#votes_prmd').text().trim() || 'N/A';
    let status = $('span.fa-tv').text().trim() || 'Desconocido';

    // Relacionados
    let related = [];
    $('ul.ListAnmRel li').each((i, elem) => {
      const linkText = $(elem).find('a').text().trim();
      const fullText = $(elem).text().trim();
      const extraText = fullText.replace(linkText, '').trim();

      if (linkText) {
        related.push({ title: linkText, relation: extraText });
      }
    });

    // Episodios (Extracción por Regex del JS interno)
    let formattedEpisodes = [];
    try {
      const episodesRegex = /var episodes = (\s*\[\s*(?:\[\d+(?:\.\d+)?\s*,\s*\d+\]\s*(?:,\s*\[\d+(?:\.\d+)?\s*,\s*\d+\]\s*)*)?\]\s*);/;
      const episodesMatch = html.match(episodesRegex);
      if (episodesMatch && episodesMatch[1]) {
        const episodesData = JSON.parse(episodesMatch[1].replace(/,\s*]/g, ']'));

        if (Array.isArray(episodesData)) {
          episodesData.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
          episodesData.forEach(epPair => {
            if (Array.isArray(epPair) && epPair.length >= 1) {
              const epNum = epPair[0];
              formattedEpisodes.push({ 
                number: epNum, 
                url: `${BASE_URL}/ver/${animeSlug}-${epNum}` 
              });
            }
          });
        }
      }
    } catch (e) {
      console.error(`Error al parsear episodios: ${e.message}`);
    }

    return {
      title: animeTitle,
      cover: cover || 'No se encontró portada.',
      banner: banner || 'No se encontró banner.',
      synopsis: synopsis ? synopsis.trim() : 'No se encontró sinopsis.',
      genres: genres,
      rating: rating,
      status: status,
      related: related,
      episodes: formattedEpisodes,
      source: 'animeav1'
    };

  } catch (error) {
    console.error(`Error obteniendo detalles del anime '${id}':`, error.message);
    return null;
  }
}

// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    const resp = await axios.get(url, { headers: HEADERS });
    
    // Extracción de variables embebidas (típico de este sitio)
    const videosMatch = resp.data.match(/var videos = ({.*?});/s);
    if (!videosMatch) {
      throw new Error('No se encontró la variable de videos (Probablemente cloudflare o cambio de estructura)');
    }

    let servidores = [];
    try {
      const videosObj = JSON.parse(videosMatch[1]);
      // Extraer los subtitulados (SUB) y, si existen, latinos (LAT)
      if (videosObj.SUB && Array.isArray(videosObj.SUB)) {
        servidores.push(...videosObj.SUB.map(srv => ({ name: srv.server, code: srv.code })));
      }
      if (videosObj.LAT && Array.isArray(videosObj.LAT)) {
        servidores.push(...videosObj.LAT.map(srv => ({ name: srv.server + ' (Lat)', code: srv.code })));
      }
    } catch (e) {
      throw new Error('Error al parsear los JSON de los videos');
    }

    if (servidores.length === 0) {
      throw new Error('No se encontraron links de video útiles');
    }

    return { 
      video: servidores[0].code, 
      servidores 
    };
  } catch (error) {
    console.error("Error obteniendo links del episodio:", error.message);
    throw error;
  }
}

module.exports = {
  getLatestEpisodes,
  search,
  browse,
  getAnimeDetails,
  getEpisodeLinks,
  normalizeTitle,
  BASE_URL
};