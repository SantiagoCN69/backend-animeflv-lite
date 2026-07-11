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
    const url = `${BASE_URL}/directorio/?${params}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const html = response.data;

    // 🔥 extraer el objeto JS: var animes = {...};
    const match = html.match(/var\s+animes\s*=\s*({[\s\S]*?});/);

    if (!match) {
      return {
        PaginasTotales: "0",
        animes: []
      };
    }

    // 🔥 convertir string a objeto JS seguro
    let data;
    try {
      data = Function('"use strict"; return (' + match[1] + ')')();
    } catch (e) {
      console.error("Error parseando animes:", e.message);
      return {
        PaginasTotales: "0",
        animes: []
      };
    }

    return {
      PaginasTotales: data.total_pages || data.last_page || "161",
      animes: (data.data || []).map(a => ({
        title: a.title,
        image: a.image || null,
        synopsis: a.synopsis || "",
        source: "jkanime",
        estado: a.estado || ""
      }))
    };

  } catch (error) {
    console.error("Error en browse JKAnime:", error.message);
    return {
      PaginasTotales: "0",
      animes: []
    };
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
    
    // Extraer episodios - probar URLs incrementales// Extraer episodios - Múltiples estrategias para JKAnime
    let episodes = [];

    // ESTRATEGIA 1: Buscar en el HTML las variables JS ocultas (Regex robusto)
    // No buscamos nombres de variables, buscamos directamente propiedades {"number": X}
    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (!scriptContent) return;

      // Si el script maneja episodios o contiene arrays con imágenes y números
      if (scriptContent.includes('number') && (scriptContent.includes('render_caps') || scriptContent.includes('image'))) {
        // Atrapa patrones como: "number":"1", 'number':'2', number: 3, "number": 4.5
        const numberMatches = [...scriptContent.matchAll(/['"]?number['"]?\s*:\s*['"]?(\d+(\.\d+)?)['"]?/g)];
        numberMatches.forEach(match => {
          const num = match[1];
          episodes.push({
            number: num.toString(),
            url: `${BASE_URL}/${id}/${num}/`
          });
        });
      }
    });

    // ESTRATEGIA 2: Si el script falla, intentar con la API interna (AJAX) de JKAnime
    // Muchos animes nuevos cargan sus capítulos a través de peticiones asíncronas.
    if (episodes.length === 0) {
      // Buscar el ID numérico interno de JKAnime (ej: data-anime="1234")
      const internalId = $('#guardar-anime').attr('data-anime') || 
                         $('[data-anime]').attr('data-anime') || 
                         $('.svea').attr('data-anime');
                         
      if (internalId) {
        try {
          // Petición al paginador interno
          const ajaxRes = await axios.get(`${BASE_URL}/ajax/pagination_episodes/${internalId}/1/`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
          });
          
          if (ajaxRes.data && Array.isArray(ajaxRes.data)) {
            ajaxRes.data.forEach(ep => {
              if (ep.number) {
                episodes.push({
                  number: ep.number.toString(),
                  url: `${BASE_URL}/${id}/${ep.number}/`
                });
              }
            });
          }
        } catch (e) {
          console.log('No se pudo obtener episodios por AJAX interno:', e.message);
        }
      }
    }

    // ESTRATEGIA 3: Buscar enlaces puros renderizados en el HTML
    // Buscamos estrictamente en la URL para no confundirnos con títulos como "Thunder 3"
    if (episodes.length === 0) {
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        // Validar que el link pertenezca a este anime y que termine en /un-numero/
        if (href && href.includes(`/${id}/`) && href.match(/\/\d+\/$/)) {
          const epNumMatch = href.match(/\/(\d+)\/$/);
          if (epNumMatch) {
            episodes.push({
              number: epNumMatch[1],
              url: href.startsWith('http') ? href : BASE_URL + href
            });
          }
        }
      });
    }

    // ESTRATEGIA 4: Secuencial de emergencia (solo útil para animes ya finalizados)
    if (episodes.length === 0) {
      const totalText = $('li:contains("Episodios")').text().match(/\d+/);
      const total = totalText ? parseInt(totalText[0]) : 0;
      if (total > 0 && total < 2000) { // Limitamos para evitar bucles infinitos
        for (let i = 1; i <= total; i++) {
          episodes.push({
            number: i.toString(),
            url: `${BASE_URL}/${id}/${i}/`
          });
        }
      }
    }

    // Limpiar duplicados y ordenar de menor a mayor
    // ==========================================
    // AUTOCOMPLETADO INTELIGENTE DE EPISODIOS
    // ==========================================
    if (episodes.length > 0) {
      // Obtenemos el número de episodio más alto que detectaron las estrategias
      const maxEpisode = Math.max(...episodes.map(ep => parseFloat(ep.number)));
      
      // Si encontró un máximo válido (ej. el 3), generamos del 1 al 3 para rellenar vacíos
      if (!isNaN(maxEpisode) && maxEpisode > 0 && maxEpisode < 2000) {
        for (let i = 1; i <= maxEpisode; i++) {
          episodes.push({
            number: i.toString(),
            url: `${BASE_URL}/${id}/${i}/`
          });
        }
      }
    }

    // Limpiar duplicados y ordenar de menor a mayor
    const uniqueEpisodes = [];
    const seenNumbers = new Set();
    
    episodes.forEach(ep => {
      if (!seenNumbers.has(ep.number)) {
        seenNumbers.add(ep.number);
        uniqueEpisodes.push(ep);
      }
    });
    
    const sortedEpisodes = uniqueEpisodes.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

    return {
      id: id,
      title: title,
      cover: cover ? (cover.startsWith('http') ? cover : BASE_URL + cover) : null,
      synopsis: synopsis || 'No disponible',
      genres: genres,
      status: status,
      episodes: sortedEpisodes, // Usamos la lista final ordenada y completa
      source: 'jkanime'
    };
  } catch (e) {
    console.log('No se pudo obtener detalles del anime:', e.message);
    return null;
  }
}

// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    console.log("🔗 URL:", url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    const servidores = [];

    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (!scriptContent) return;

      // =========================
      // 🔥 SERVERS (descargas)
      // =========================
      const serverMatch = scriptContent.match(/var\s+servers\s*=\s*(\[[\s\S]*?\])/);

      if (serverMatch) {
        try {
          const serversJson = JSON.parse(serverMatch[1]);

          serversJson.forEach(server => {
            if (!server.remote) return;

            try {
              const decodedUrl = Buffer.from(
                server.remote,
                'base64'
              ).toString('utf-8');

              servidores.push({
                type: "download",
                name: server.server,
                url: decodedUrl,
                size: server.size
              });

            } catch (e) {}
          });

        } catch (e) {}
      }

      // =========================
      // 🎬 VIDEO (players)
      // =========================
      const videoMatches = scriptContent.match(/video\[\d+\]\s*=\s*'([^']+)'/g);

      if (videoMatches) {
        videoMatches.forEach((m, index) => {
          const srcMatch = m.match(/src="([^"]+)"/);

          if (srcMatch) {
            servidores.push({
              type: "player",
              name: `Player ${index + 1}`,
              url: srcMatch[1]
            });
          }
        });
      }
    });

    console.log("\n📊 TOTAL SERVIDORES:", servidores.length);

    servidores.forEach((s, i) => {
      console.log(`[${i}] ${s.type} -> ${s.name} -> ${s.url}`);
    });

    if (servidores.length === 0) {
      throw new Error("No se encontraron servidores");
    }

    return {
      video: servidores[0].url,
      servidores
    };

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    throw error;
  }
}


async function getSchedule() {
  try {
    // URL del horario de JKAnime
    const url = `${BASE_URL}/horario/`; 
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const schedule = [];

    // 🔥 Iterar sobre cada bloque de día de la semana
    $('.box.semana').each((i, element) => {
      // Extraer el nombre del día (ej. "Lunes") limpiando los espacios
      const dayName = $(element).find('h2').text().trim();
      
      const animesList = [];

      // 🔥 Iterar sobre cada anime dentro de la caja de ese día
      $(element).find('.cajas .box.img').each((j, el) => {
        const title = $(el).attr('title') || $(el).find('h3').text().trim();
        const urlAnime = $(el).find('.boxx a').first().attr('href');
        const image = $(el).find('.boxx img').attr('src');
        
        // Extraer datos adicionales (ID y Tipo) que están ocultos
        const dataDiv = $(el).find('.svea');
        const id = dataDiv.attr('data-anime');
        const type = dataDiv.attr('data-tipo');

        // Extraer información del último capítulo y tiempo
        const lastEpisodeText = $(el).find('.last span').text().trim();
        const timeAgo = $(el).find('.last time').text().trim();

        animesList.push({
          title: title,
          image: image || null,
          type: type || null, // Ej: "Serie", "ONA"
          last_episode: lastEpisodeText.replace('Último capítulo: ', '').trim(),
          time_ago: timeAgo
        });
      });

      // Agregar el día y sus respectivos animes al arreglo final
      schedule.push({
        day: dayName,
        animes: animesList
      });
    });

    return schedule;

  } catch (error) {
    console.error("Error en getSchedule JKAnime:", error.message);
    return [];
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
  BASE_URL,
  getSchedule
};
