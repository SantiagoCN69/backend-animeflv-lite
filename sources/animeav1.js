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
  // Ajustamos la ruta a /catalogo ya que esa es la nueva URL base para búsquedas
  // Nota: si tu frontend aún manda 'page=1', se añadirá correctamente como /catalogo?page=1
  const fullUrl = `${BASE_URL}/catalogo?${params}`;

  try {
    const response = await axios.get(fullUrl, { headers: HEADERS });
    const html = response.data;

    // 1. Extraer el Total de Páginas (Fallback a "1" si no se encuentra)
    let PaginasTotales = "1";
    const totalPagesMatch = html.match(/totalPages\s*:\s*(\d+)/);
    if (totalPagesMatch) {
      PaginasTotales = totalPagesMatch[1];
    }

    let animes = [];

    // 2. Extraer el bloque del array 'results'
    const resultsMatch = html.match(/results\s*:\s*\[(.*?)\]\s*,\s*total\s*:/);
    
    if (resultsMatch && resultsMatch[1]) {
      const resultsStr = resultsMatch[1];
      
      // Separamos la cadena de texto por cada anime usando '{id:' como punto de corte
      const items = resultsStr.split('{id:').slice(1);

      animes = items.map(item => {
        // Como cortamos por '{id:', lo primero que queda es el id (ej: '"3812"')
        const idMatch = item.match(/^"([^"]+)"/); 
        const titleMatch = item.match(/title\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
        const slugMatch = item.match(/slug\s*:\s*"([^"]+)"/);
        const catMatch = item.match(/categoryId\s*:\s*(\d+)/);

        const id = idMatch ? idMatch[1] : '';
        const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : 'Sin título';
        const slug = slugMatch ? slugMatch[1] : '';
        const catId = catMatch ? parseInt(catMatch[1]) : 0;

        // Determinar el Tipo de anime según su ID de categoría
        let type = 'Anime';
        if (catId === 1) type = 'TV Anime';
        else if (catId === 2) type = 'Película';
        else if (catId === 3) type = 'OVA';
        else if (catId === 4) type = 'Especial';

        // Construir URLs
        const url = slug ? `${BASE_URL}/media/${slug}` : null;
        
        // El CDN de AnimeAV1 suele guardar las portadas usando el ID de la base de datos
        const cover = id ? `https://cdn.animeav1.com/covers/${id}.jpg` : null;

        return {
          title,
          type,
          url,
          cover,
          source: 'animeav1'
        };
      }).filter(a => a.url !== null); // Limpiamos cualquier error de extracción
    }

    return { PaginasTotales, animes };

  } catch (error) {
    console.error('Error al navegar en animeav1:', error.message);
    return { PaginasTotales: "0", animes: [] };
  }
}

// Detalles de anime (Ya era manual)
async function getAnimeDetails(id) {
  try {
    const animePageUrl = `${BASE_URL}/media/${id}`;
    const response = await axios.get(animePageUrl, { headers: HEADERS });
    const html = response.data;

    let startIndex = html.indexOf('media:{');
    if (startIndex === -1) startIndex = html.indexOf('"media":{');
    
    let chunk = html;
    if (startIndex !== -1) {
      chunk = html.slice(startIndex, startIndex + 5000); 
    }

    const internalIdMatch = chunk.match(/id\s*:\s*(\d+)/);
    const internalId = internalIdMatch ? internalIdMatch[1] : null;

    const titleMatch = chunk.match(/title\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    const title = titleMatch ? titleMatch[1] : id;

    const synopsisMatch = chunk.match(/synopsis\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    const synopsis = synopsisMatch 
      ? synopsisMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') 
      : 'No disponible';

    const startDateMatch = chunk.match(/startDate\s*:\s*"([^"]+)"/);
    const startDate = startDateMatch ? startDateMatch[1] : null;

    const posterMatch = chunk.match(/poster\s*:\s*"([^"]+)"/);
    let cover = posterMatch ? posterMatch[1] : null;
    
    if (cover && !cover.startsWith('http')) {
      cover = `${BASE_URL}/${cover.replace(/^\//, '')}`;
    } else if (!cover && internalId) {
      cover = `https://cdn.animeav1.com/covers/${internalId}.jpg`;
    }

    const backdropMatch = chunk.match(/backdrop\s*:\s*"([^"]+)"/);
    let banner = backdropMatch ? backdropMatch[1] : null;

    if (banner && !banner.startsWith('http')) {
      banner = `${BASE_URL}/${banner.replace(/^\//, '')}`;
    } else if (!banner && internalId) {
      banner = `https://cdn.animeav1.com/backdrops/${internalId}.jpg`;
    }

    const statusMatch = chunk.match(/status\s*:\s*(\d+)/);
    let status = 'Desconocido';
    if (statusMatch) {
      const s = parseInt(statusMatch[1]);
      if (s === 0) status = 'Finalizado';
      else if (s === 1 || s === 2) status = 'En emisión';
    }

    const genres = [];
    const genresMatch = chunk.match(/genres\s*:\s*\[(.*?)\]/);
    if (genresMatch && genresMatch[1]) {
      const nameMatches = [...genresMatch[1].matchAll(/name\s*:\s*"([^"]+)"/g)];
      nameMatches.forEach(m => genres.push(m[1]));
    }

    let formattedEpisodes = [];
    const episodesMatch = html.match(/episodes\s*:\s*(\[.*?\])/s);

    if (episodesMatch && episodesMatch[1]) {
      try {
        const numMatches = [...episodesMatch[1].matchAll(/number\s*:\s*(\d+(?:\.\d+)?)/g)];
        numMatches.forEach(m => {
          const epNum = m[1];
          formattedEpisodes.push({
            number: epNum.toString(),
            url: `${BASE_URL}/media/${id}/${epNum}`
          });
        });
        formattedEpisodes.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
      } catch (e) {
        console.error("Error procesando episodios:", e);
      }
    }

    // --- Extraer Relaciones (Solo slug, type y startDate) ---
    let formattedRelations = [];
    const relationsMatch = html.match(/relations\s*:\s*\[(.*?)\](?=\}\}|,\s*[a-zA-Z0-9_]+\s*:)/s);

    if (relationsMatch && relationsMatch[1]) {
      try {
        const relBlocks = [...relationsMatch[1].matchAll(/type\s*:\s*(\d+).*?destination\s*:\s*\{([^}]+)\}/gs)];
        
        relBlocks.forEach(m => {
          const typeCode = parseInt(m[1]);
          const destBlock = m[2]; 
          const idMatch = destBlock.match(/id\s*:\s*(\d+)/);
          const slugMatch = destBlock.match(/slug\s*:\s*"([^"]+)"/);
          const relDateMatch = destBlock.match(/startDate\s*:\s*"([^"]+)"/);

          if (slugMatch) {
            formattedRelations.push({
              id: idMatch ? idMatch[1] : null,
              slug: slugMatch[1],
              type: typeCode,      // Solo mandamos el número
              startDate: relDateMatch ? relDateMatch[1] : null
            });
          }
        });
      } catch (e) {
        console.error("Error procesando relaciones:", e);
      }
    }

    return {
      id: id,
      title: title,
      cover: cover || null,
      banner: banner || null,
      synopsis: synopsis,
      genres: genres,
      status: status,
      startDate: startDate, 
      episodes: formattedEpisodes,
      relations: formattedRelations, 
      source: 'animeav1'
    };

  } catch (error) {
    console.error(`Error obteniendo detalles:`, error.message);
    return null;
  }
}
// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    const resp = await axios.get(url, { headers: HEADERS });
    const html = resp.data;

    // Buscar el bloque de 'embeds' dentro del script de SvelteKit
    // Buscamos todo lo que está entre "embeds:{" y "downloads:" o "uses:"
    const embedsMatch = html.match(/embeds\s*:\s*{(.*?)}\s*,\s*(?:downloads|uses)\s*:/);
    
    if (!embedsMatch) {
      throw new Error('No se encontró el bloque embeds (Posible cambio de estructura)');
    }

    const embedsBlock = embedsMatch[1];
    let servidores = [];

    // Función auxiliar para extraer servidores usando Regex
    const extractServers = (block, suffix) => {
      // Extrae el nombre del servidor y la URL
      const serversRegex = /server\s*:\s*"([^"]+)"\s*,\s*url\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = serversRegex.exec(block)) !== null) {
        servidores.push({
          name: suffix ? `${match[1]} ${suffix}` : match[1],
          url: match[2]
        });
      }
    };

    // Extraer primero los latinos (DUB) si prefieres que salgan arriba, o los SUB
    const dubMatch = embedsBlock.match(/DUB\s*:\s*\[(.*?)\]/);
    if (dubMatch) extractServers(dubMatch[1], "(Lat)");

    // Extraer subtitulados (SUB)
    const subMatch = embedsBlock.match(/SUB\s*:\s*\[(.*?)\]/);
    if (subMatch) extractServers(subMatch[1], "(Sub)");

    if (servidores.length === 0) {
      throw new Error('No se encontraron links de video útiles');
    }

    return { 
      video: servidores[0].url, 
      servidores 
    };
  } catch (error) {
    console.error("Error obteniendo links del episodio en AnimeAV1:", error.message);
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