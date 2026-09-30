const cheerio = require('cheerio');
const axios = require('axios');

const BASE_URL = 'https://animeav1.com';

// Cache simple en memoria para reducir peticiones repetidas
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCacheKey(url) {
  return url;
}

function getCached(url) {
  const key = getCacheKey(url);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(url, data) {
  cache.set(getCacheKey(url), { data, timestamp: Date.now() });
}

// Headers optimizados
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Connection': 'keep-alive'
};

// Configuración axios optimizada
const axiosConfig = {
  headers: HEADERS,
  timeout: 20000,
  maxRedirects: 3,
  validateStatus: function (status) {
    return status >= 200 && status < 500;
  }
};

// Función helper optimizada con cache
async function fetchWithCache(url) {
  const cached = getCached(url);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.get(url, axiosConfig);
    if (response.status === 200 && response.data) {
      setCache(url, response);
      return response;
    }
    throw new Error(`Status ${response.status}`);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    throw error;
  }
}

// Normalizar título para comparación
function normalizeTitle(title) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Calcular tiempo relativo (timeAgo) desde una fecha
function getTimeAgo(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'hace un momento';
    if (diffMins < 60) return `hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
    if (diffHours < 24) return `hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    if (diffDays < 7) return `hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
    if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) !== 1 ? 's' : ''}`;
    if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)} mes${Math.floor(diffDays / 30) !== 1 ? 'es' : ''}`;
    return `hace ${Math.floor(diffDays / 365)} año${Math.floor(diffDays / 365) !== 1 ? 's' : ''}`;
  } catch (e) {
    return null;
  }
}

async function getLatestEpisodes() {
  try {
    const response = await fetchWithCache(BASE_URL);
    const $ = cheerio.load(response.data);
    const latest = [];

    // Función auxiliar para extraer ID de URL
    const getIdFromUrl = (url) => {
      if (!url) return '';
      const parts = url.split('/');
      if (parts.length >= 3) {
        return parts[2];
      }
      return '';
    };

    // Seleccionamos solo las tarjetas de la cuadrícula de últimos episodios
    $('article.group\\/item').each((index, element) => {
      const item = $(element);

      const title = item.find('header div').text().trim();
      
      const episodeText = item.find('.bg-line span.text-lead').text().trim();
      const chapter = parseInt(episodeText, 10);
      
      const cover = item.find('figure img').attr('src');
      
      const link = item.find('a.absolute.inset-0').attr('href');
      const id = getIdFromUrl(link);

      if (!title || !id || isNaN(chapter)) return;

      latest.push({
        id,
        title,
        'cover-lasted': cover,
        chapter
      });
    });

    return latest;
  } catch (error) {
    console.error('Error obteniendo últimos episodios de AnimeV1:', error.message);
    return [];
  }
}

async function search(query) {
  try {
    const searchUrl = `${BASE_URL}/catalogo?search=${encodeURIComponent(query)}`;

    const response = await fetchWithCache(searchUrl);
    
    const $ = cheerio.load(response.data);
    const animes = [];

    // Selector corregido para la estructura nueva: article.group/item
    $('article.group\\/item').each((i, element) => {
      const article = $(element);
      
      const title = article.find('h3').text().trim();
      const url = article.find('a').first().attr('href');
      const cover = article.find('figure img').attr('src');
      const type = article.find('.rounded.bg-line').text().trim();

      if (title && url) {
        animes.push({
          id: url.split('/').pop(),
          title: title,
          cover: cover,
          url: BASE_URL + url,
          type: type || 'TV'
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
    const response = await fetchWithCache(fullUrl);
    const html = response.data;

    // 1. Extraer el Total de Páginas (Fallback a "1" si no se encuentra)
    let PaginasTotales = "1";
    const totalPagesMatch = html.match(/totalPages\s*:\s*(\d+)/);
    if (totalPagesMatch) {
      PaginasTotales = totalPagesMatch[1];
    }

    let animes = [];

    // 2. Extraer el bloque del array 'results' (usando [\s\S] para capturar con newlines)
    const resultsMatch = html.match(/results\s*:\s*\[([\s\S]*?)\]\s*,\s*total/);
    
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
        // Buscar synopsis - puede contener newlines y caracteres especiales
        let synopsis = '';
        const synopsisMatch = item.match(/synopsis\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (synopsisMatch) {
          synopsis = synopsisMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        }

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
          synopsis
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
    const response = await fetchWithCache(animePageUrl);
    const html = response.data;

    // --- 1. Aislar el bloque exacto de "media" ---
    // Usamos regex para encontrar el inicio sin importar si tiene comillas o espacios
    const mediaStartMatch = html.match(/(?:"media"|media)\s*:\s*\{/);
    
    let chunk = html;
    if (mediaStartMatch) {
      // Tomamos desde donde empieza el 'media:{' hasta 100,000 caracteres adelante.
      // Aumentamos esto porque los arrays de episodios y relaciones son muy largos.
      chunk = html.slice(mediaStartMatch.index, mediaStartMatch.index + 100000); 
    }

    // --- 2. Extraer el ID interno como primer dato del chunk ---
    // Como ya estamos dentro del bloque 'media', el primer 'id' que encuentre será el correcto.
    const internalIdMatch = chunk.match(/(?:"id"|id)\s*:\s*(\d+)/);
    const internalId = internalIdMatch ? internalIdMatch[1] : null;

    // --- 3. Extraer el resto de las propiedades ---
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

    const categoryMatch = chunk.match(/category\s*:\s*\{[^}]*name\s*:\s*"([^"]+)"/);
    const category = categoryMatch ? categoryMatch[1] : 'Desconocido';

    const scoreMatch = chunk.match(/score\s*:\s*(\d+(?:\.\d+)?)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

    const genres = [];
    const genresMatch = chunk.match(/genres\s*:\s*\[(.*?)\]/);
    if (genresMatch && genresMatch[1]) {
      const nameMatches = [...genresMatch[1].matchAll(/name\s*:\s*"([^"]+)"/g)];
      nameMatches.forEach(m => genres.push(m[1]));
    }

    let formattedEpisodes = [];
    const episodesMatch = chunk.match(/episodes\s*:\s*(\[.*\])/s);

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

    // --- Extraer Relaciones ---
    let formattedRelations = [];
    const relationsMatch = chunk.match(/relations\s*:\s*\[(.*)\](?=\}\}|,\s*[a-zA-Z0-9_]+\s*:)/s);

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
              type: typeCode,
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
      internalId: internalId,
      title: title,
      cover: cover || null,
      banner: banner || null,
      synopsis: synopsis,
      genres: genres,
      category: category,
      status: status,
      startDate: startDate,
      score: score,
      episodes: formattedEpisodes,
      relations: formattedRelations
    };

  } catch (error) {
    console.error(`Error obteniendo detalles:`, error.message);
    return null;
  }
}
// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    const resp = await fetchWithCache(url);
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

async function getSchedule() {
  try {
    const url = `${BASE_URL}/horario`;
    const response = await fetchWithCache(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const schedule = [];

    // Extraer los datos del script de SvelteKit
    const scriptMatch = html.match(/data:\{media:\[([\s\S]*?)\]\}/);
    
    if (!scriptMatch) {
      return [];
    }

    const mediaDataStr = scriptMatch[1];
    
    // Parsear cada item de media individualmente
    const mediaItems = [];
    
    // Dividir por },{ y parsear cada item
    const items = mediaDataStr.split('},{').map(item => {
      if (!item.startsWith('{')) item = '{' + item;
      if (!item.endsWith('}')) item = item + '}';
      return item;
    });
    
    items.forEach(item => {
      try {
        const idMatch = item.match(/^\{id:(\d+)/);
        const titleMatch = item.match(/title:"([^"]+)"/);
        const slugMatch = item.match(/slug:"([^"]+)"/);
        const startDateMatch = item.match(/startDate:"([^"]+)"/);
        const createdAtMatch = item.match(/createdAt:"([^"]+)"/);
        const categoryMatch = item.match(/category:\{id:\d+,name:"([^"]+)"\}/);
        
        let latestEpisode = null;
        let latestEpisodeCreatedAt = null;
        
        if (!item.includes('latestEpisode:void 0')) {
          const episodeMatch = item.match(/latestEpisode:\{[^}]*number:(\d+)/);
          if (episodeMatch) latestEpisode = episodeMatch[1];
          
          const dateMatch = item.match(/latestEpisode:\{[^}]*createdAt:"([^"]+)"/);
          if (dateMatch) latestEpisodeCreatedAt = dateMatch[1];
        }
        
        if (titleMatch && slugMatch) {
          mediaItems.push({
            id: idMatch ? idMatch[1] : null,
            title: titleMatch[1],
            slug: slugMatch[1],
            startDate: startDateMatch ? startDateMatch[1] : null,
            createdAt: createdAtMatch ? createdAtMatch[1] : null,
            category: categoryMatch ? categoryMatch[1] : 'Desconocido',
            latestEpisode,
            latestEpisodeCreatedAt
          });
        }
      } catch (e) {
        // Ignorar errores de parsing
      }
    });

    // Organizar por días de la semana basándose en la fecha de inicio
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    
    // Agrupar animes por día de emisión (basado en startDate)
    const dayGroups = {};
    daysOfWeek.forEach(day => dayGroups[day] = []);
    
    mediaItems.forEach(anime => {
      // Solo incluir animes que tengan latestEpisode
      if (!anime.latestEpisode) return;
      
      // Usar latestEpisodeCreatedAt para determinar el día, fallback a startDate
      const dateToUse = anime.latestEpisodeCreatedAt || anime.startDate;
      
      if (dateToUse) {
        const date = new Date(dateToUse);
        const dayIndex = date.getDay(); // 0 = Domingo, 1 = Lunes, etc.
        const dayName = daysOfWeek[dayIndex];
        
        const cover = anime.id ? `https://cdn.animeav1.com/covers/${anime.id}.jpg` : null;
        const timeAgo = getTimeAgo(anime.latestEpisodeCreatedAt || anime.createdAt);
        
        dayGroups[dayName].push({
          title: anime.title,
          cover: cover,
          type: anime.category,
          last_episode: anime.latestEpisode,
          time_ago: timeAgo,
          url: anime.slug ? `${BASE_URL}/media/${anime.slug}` : null
        });
      }
    });

    // Convertir a formato de array (incluyendo días vacíos)
    daysOfWeek.forEach(dayName => {
      schedule.push({
        day: dayName,
        animes: dayGroups[dayName]
      });
    });

    return schedule;

  } catch (error) {
    console.error("Error en getSchedule AnimeAV1:", error.message);
    return [];
  }
}

module.exports = {
  getLatestEpisodes,
  search,
  browse,
  getAnimeDetails,
  getEpisodeLinks,
  normalizeTitle,
  BASE_URL,
  getSchedule
};