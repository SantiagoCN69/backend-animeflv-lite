const cheerio = require('cheerio');
const axios = require('axios');

const BASE_URL = 'https://jkanime.net';

// Normalizar título para comparación (eliminar espacios, acentos, etc.)
function normalizeTitle(title) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Últimos capítulos
async function getLatestEpisodes() {
    try {
        const response = await axios.get(BASE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
            }
        });

        const $ = cheerio.load(response.data);

        const latest = [];

        // SOLO la pestaña de Animes
        $("#animes .dir1").each((_, el) => {
            const item = $(el);

            const link = item.find("a").first();
            const img = item.find("img").first();

            const title = item.find(".card-title").text().trim();

            const badge = item.find(".badge-primary").text().trim();
            const chapter = parseInt(badge.replace(/[^\d]/g, ""), 10);

            const cover =
                img.attr("data-animepic") ||
                img.attr("src");

            const url = link.attr("href");

            if (!title || !url || isNaN(chapter)) return;

            latest.push({
                title,
                chapter,
                cover,
                url
            });
        });

        console.log(`JKAnime: ${latest.length} capítulos encontrados`);

        return latest;

    } catch (error) {
        console.error("Error obteniendo últimos capítulos de JKAnime:", error.message);
        return [];
    }
}

// Estrenos de temporada
async function getEstrenos() {
  try {
    const response = await axios.get(`${BASE_URL}/estrenos/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer": "https://jkanime.net/"
      }
    });

    const $ = cheerio.load(response.data);

    console.log("====== DEBUG JKANIME ======");
    console.log("Status:", response.status);
    console.log("Cards:", $(".card").length);
    console.log("Dir1:", $(".dir1").length);
    console.log("card-title:", $(".card-title").length);
    console.log("Tiene Tenmaku:", response.data.includes("Tenmaku"));
    console.log("Tiene data-animepic:", response.data.includes("data-animepic"));
    console.log("===========================");

    const latest = [];

    $(".card").each((_, element) => {
      const card = $(element);

      const href = card.find("a").attr("href");
      const title = card.find(".card-title").text().trim();

      const badge = card.find(".badge-primary").text().trim();
      const chapter = parseInt(
        badge.replace(/Ep/i, "").trim(),
        10
      );

      const img = card.find("img");

      const cover =
        img.attr("data-animepic") ||
        img.attr("src");

      if (title && href) {
        latest.push({
          title,
          chapter: isNaN(chapter) ? null : chapter,
          cover,
          url: href
        });
      }
    });

    console.log("Animes encontrados:", latest.length);

    return latest;

  } catch (error) {
    console.error("Error JKAnime:", error);
    return [];
  }
}


// Buscar anime
async function search(query) {
  try {
    const response = await axios.get(`${BASE_URL}/buscar/${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const animes = [];

    // Buscar resultados de búsqueda - estructura actual de jkanime (anime__item)
    $('.anime__item').each((i, element) => {
      const $item = $(element);
      const title = $item.find('.anime__item__text h5 a').text().trim();
      const image = $item.find('.anime__item__pic').attr('data-setbg');
      const link = $item.find('a').attr('href');
      const type = $item.find('.anime').text().trim();
      
      if (title && link) {
        // Extraer ID de la URL (ej: https://jkanime.net/kaoru-hana-wa-rin-to-saku/ -> kaoru-hana-wa-rin-to-saku)
        const urlParts = link.replace(BASE_URL, '').split('/').filter(Boolean);
        const id = urlParts[0] || urlParts[urlParts.length - 1];
        
        animes.push({
          id: id,
          title: title,
          image: image ? (image.startsWith('http') ? image : BASE_URL + image) : null,
          url: link.startsWith('http') ? link : BASE_URL + link,
          type: type,
          source: 'jkanime'
        });
      }
    });

    return animes;
  } catch (error) {
    console.error('Error en search JKAnime:', error.message);
    return [];
  }
}

// Navegar por animes
async function browse(params) {
  try {
    const response = await axios.get(`${BASE_URL}/directorio?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const animes = [];

    $('.anime-item').each((i, element) => {
      const $item = $(element);
      const title = $item.find('.anime-title').text().trim();
      const image = $item.find('img').attr('src');
      const link = $item.find('a').attr('href');
      const type = $item.find('.anime-type').text().trim();
      
      if (title && link) {
        // Extraer ID de la URL
        const urlParts = link.replace(BASE_URL, '').split('/').filter(Boolean);
        const id = urlParts[0] || urlParts[urlParts.length - 1];
        
        animes.push({
          id: id,
          title: title,
          image: image ? (image.startsWith('http') ? image : BASE_URL + image) : null,
          url: link.startsWith('http') ? link : BASE_URL + link,
          type: type,
          source: 'jkanime'
        });
      }
    });

    // Obtener total de páginas
    const pagination = $('.pagination').length;
    const PaginasTotales = pagination > 0 ? $('.pagination li').last().prev().text() : '1';

    return { PaginasTotales, animes };
  } catch (error) {
    console.error('Error en browse JKAnime:', error.message);
    return { PaginasTotales: '0', animes: [] };
  }
}

// Detalles de anime
async function getAnimeDetails(id) {
  try {
    const response = await axios.get(`${BASE_URL}/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Extraer título - buscar en h3 que contenga el nombre del anime
    let title = id;
    $('h3').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text && text.toLowerCase().includes(id.replace(/-/g, ' '))) {
        title = text;
      }
    });
    
    // Extraer imagen/portada
    let cover = $('.anime_pic.pc img').attr('src') || 
                $('.mov.mb-3.movpic img').attr('src') ||
                $('img').first().attr('src');
    
    // Extraer sinopsis
    let synopsis = $('.scroll').text().trim() || 
                    $('.sinopsis').text().trim() ||
                    $('p').first().text().trim();
    
    // Extraer géneros
    const genres = [];
    // Buscar el li que contiene "Generos:" y extraer los links dentro
    $('li').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.toLowerCase().includes('generos') || text.toLowerCase().includes('géneros')) {
        $(elem).find('a').each((j, link) => {
          const genreText = $(link).text().trim();
          if (genreText && !genres.includes(genreText)) {
            genres.push(genreText);
          }
        });
      }
    });
    
    // Fallback: intentar con el selector anterior
    if (genres.length === 0) {
      $('.genres a, .genre a').each((i, elem) => {
        const genreText = $(elem).text().trim();
        if (genreText && !genres.includes(genreText)) {
          genres.push(genreText);
        }
      });
    }

    // Extraer estado
    let status = 'Desconocido';
    // Buscar el li que contiene "Estado:" y extraer el texto del div dentro
    $('li').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.toLowerCase().includes('estado')) {
        const statusDiv = $(elem).find('div').first();
        if (statusDiv.length > 0) {
          status = statusDiv.text().trim();
        } else {
          // Fallback: extraer el texto después de "Estado:"
          const statusText = text.replace(/estado:\s*/i, '').trim();
          if (statusText) {
            status = statusText;
          }
        }
      }
    });
    
    // Fallback: intentar con los selectores anteriores
    if (status === 'Desconocido') {
      status = $('.status').text().trim() || 
               $('.state').text().trim() ||
               'Desconocido';
    }
    
    // Extraer episodios - probar URLs incrementales
    const episodes = [];
    
    // Intentar obtener el número total de episodios del HTML
    const episodesCountText = $('li:contains("Episodios")').text().match(/\d+/);
    const totalEpisodes = episodesCountText ? parseInt(episodesCountText[0]) : 0;
    
    if (totalEpisodes > 0) {
      // Generar URLs de episodios basadas en el patrón de jkanime
      for (let i = 1; i <= totalEpisodes; i++) {
        episodes.push({
          number: i.toString(),
          url: `${BASE_URL}/${id}/${i}/`
        });
      }
    } else {
      // Fallback: intentar detectar episodios buscando enlaces
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        
        // Buscar patrones de episodios en el href o texto
        if (href && (href.includes('/ver/') || href.match(/episodio/i) || (href.includes(`/${id}/`) && href.match(/\d+\/$/)))) {
          const epNum = text.match(/\d+/)?.[0] || href.match(/(\d+)\/$/)?.[1] || (i + 1).toString();
          episodes.push({
            number: epNum,
            url: href.startsWith('http') ? href : BASE_URL + href
          });
        }
      });
    }

    return {
      id: id,
      title: title,
      cover: cover ? (cover.startsWith('http') ? cover : BASE_URL + cover) : null,
      synopsis: synopsis || 'No disponible',
      genres: genres,
      status: status,
      episodes: episodes,
      source: 'jkanime'
    };
  } catch (error) {
    console.error('Error en getAnimeDetails JKAnime:', error.message);
    throw error;
  }
}

// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const servers = [];

    // Buscar la variable JavaScript 'servers' que contiene la información detallada de servidores
    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (scriptContent && scriptContent.includes('var servers =')) {
        // Extraer el JSON de la variable servers
        const serversMatch = scriptContent.match(/var servers = (\[[\s\S]*?\]);/);
        if (serversMatch) {
          try {
            const serversJson = JSON.parse(serversMatch[1]);
            serversJson.forEach((server, index) => {
              // Decodificar la URL base64 del campo 'remote'
              if (server.remote) {
                try {
                  const decodedUrl = Buffer.from(server.remote, 'base64').toString('utf-8');
                  servers.push({
                    name: server.server || `Server ${index + 1}`,
                    url: decodedUrl,
                    lang: server.lang,
                    size: server.size
                  });
                } catch (e) {
                  console.error('Error decodificando URL base64:', e.message);
                }
              }
            });
          } catch (e) {
            console.error('Error parseando JSON de servers:', e.message);
          }
        }
      }
    });

    // Si no se encontró la variable servers, intentar con el método anterior (video array)
    if (servers.length === 0) {
      $('script').each((i, elem) => {
        const scriptContent = $(elem).html();
        if (scriptContent && scriptContent.includes('var video = []')) {
          const videoAssignments = scriptContent.match(/video\[\d+\]\s*=\s*'([^']+)'/g);
          if (videoAssignments) {
            videoAssignments.forEach((assignment, index) => {
              const iframeMatch = assignment.match(/video\[\d+\]\s*=\s*'([^']+)'/);
              if (iframeMatch) {
                const iframeHtml = iframeMatch[1];
                const srcMatch = iframeHtml.match(/src="([^"]+)"/);
                if (srcMatch) {
                  const serverUrl = srcMatch[1];
                  let serverName = `Server ${index + 1}`;
                  if (serverUrl.includes('um')) serverName = 'Uptostream';
                  else if (serverUrl.includes('fembed')) serverName = 'Fembed';
                  else if (serverUrl.includes('mega')) serverName = 'Mega';
                  else if (serverUrl.includes('streamtape')) serverName = 'Streamtape';
                  else if (serverUrl.includes('gogo')) serverName = 'Gogo';
                  else if (serverUrl.includes('ss')) serverName = 'SS';
                  
                  servers.push({
                    name: serverName,
                    url: serverUrl
                  });
                }
              }
            });
          }
        }
      });
    }

    if (servers.length === 0) {
      throw new Error('No se encontraron servidores');
    }

    return { video: servers[0].url, servidores: servers };
  } catch (error) {
    console.error('Error en getEpisodeLinks JKAnime:', error.message);
    throw error;
  }
}

module.exports = {
  getLatestEpisodes,
  getEstrenos,
  search,
  browse,
  getAnimeDetails,
  getEpisodeLinks,
  normalizeTitle,
  BASE_URL
};
