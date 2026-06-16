const { getLatest, searchAnime, getAnimeInfo, searchAnimesByFilter } = require('animeflv-api');
const cheerio = require('cheerio');
const axios = require('axios');

const BASE_URL = 'https://www3.animeflv.net';

// Normalizar título para comparación (eliminar espacios, acentos, etc.)
function normalizeTitle(title) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Últimos capítulos
async function getLatestEpisodes() {
  return await getLatest();
}

// Buscar anime
async function search(query) {
  return await searchAnime(query);
}

// Navegar por animes
async function browse(params) {
  const baseUrl = `${BASE_URL}/browse?`;
  const fullUrl = `${baseUrl}${params}`;

  try {
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const PaginasTotales = $('ul.pagination li').eq(-2).text();

    const animes = $('article.Anime').map((i, element) => {
      const article = $(element);
      const title = article.find('.Title').text();
      const typeElement = article.find('.Type');
      const type = typeElement.html();
      const url = article.find('a').attr('href');
      const cover = article.find('img').attr('src');

      return {
        title,
        type,
        url,
        cover,
        source: 'animeflv'
      };
    }).get();

    return { PaginasTotales, animes };

  } catch (error) {
    console.error('Error al procesar la página:', error);
    throw error;
  }
}

// Detalles de anime
async function getAnimeDetails(id) {
  try {
    const animePageUrl = `${BASE_URL}/anime/${id}`;
    const response = await axios.get(animePageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;

    const $ = cheerio.load(html);

    let animeTitle = id;
    let animeSlug = id;

    if (animeTitle === id) {
      let h1Title = $('h1.Title').text().trim();
      if (!h1Title) h1Title = $('h1.anime-title').text().trim();
      if (!h1Title) h1Title = $('h1.page-title').text().trim();
      if (h1Title) animeTitle = h1Title;
    }

    let cover = $('figure.AnimeCover img').attr('src');
    if (!cover) cover = $('figure img').first().attr('src');
    const pageBaseUrl = new URL(animePageUrl).origin;
    if (cover && !cover.startsWith('http')) {
      cover = pageBaseUrl + cover;
    }

    let banner = null;
    const bannerStyle = $('div.Ficha.fchlt div.Bg').attr('style');
    if (bannerStyle) {
      const bannerMatch = bannerStyle.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
      if (bannerMatch && bannerMatch[1]) {
        banner = bannerMatch[1].trim();
        if (!banner.startsWith('http')) {
          banner = pageBaseUrl + banner;
        }
      }
    }

    let synopsis = $('div.Description p').first().text();
    if (!synopsis) synopsis = $('div.container section.Main article.Anime div.Description p').first().text();
    if (!synopsis) synopsis = $('div[class*="sinopsis"], div[id*="sinopsis"] p').first().text();

    const genres = [];
    $('nav.Nvgnrs a').each((i, elem) => {
      const genreText = $(elem).text().trim();
      if (genreText) {
        genres.push(genreText);
      }
    });

    let rating = $('span#votes_prmd').text().trim();
    let status = $('span.fa-tv').text().trim();

    let related = [];
    $('ul.ListAnmRel li').each((i, elem) => {
      const linkText = $(elem).find('a').text().trim();
      const fullText = $(elem).text().trim();
      const extraText = fullText.replace(linkText, '').trim();

      if (linkText) {
        related.push({
          title: linkText,
          relation: extraText
        });
      }
    });

    let formattedEpisodes = [];
    try {
      const episodesRegex = /var episodes = (\s*\[\s*(?:\[\d+(?:\.\d+)?\s*,\s*\d+\]\s*(?:,\s*\[\d+(?:\.\d+)?\s*,\s*\d+\]\s*)*)?\]\s*);/;
      const episodesMatch = html.match(episodesRegex);
      if (episodesMatch && episodesMatch[1]) {
        const episodesArrayString = episodesMatch[1];
        const sanitizedEpisodesString = episodesArrayString.replace(/,\s*]/g, ']');
        const episodesData = JSON.parse(sanitizedEpisodesString);

        if (Array.isArray(episodesData)) {
          episodesData.sort((a, b) => {
            const numA = parseFloat(a[0]);
            const numB = parseFloat(b[0]);
            return numA - numB;
          });

          episodesData.forEach(epPair => {
            if (Array.isArray(epPair) && epPair.length >= 1) {
              const epNum = epPair[0];
              const episodeUrl = `${BASE_URL}/ver/${animeSlug}-${epNum}`;
              formattedEpisodes.push({ number: epNum, url: episodeUrl });
            }
          });
        }
      }
    } catch (e) {
      console.error(`Error al parsear var episodes: ${e.message}`);
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
      source: 'animeflv'
    };

  } catch (error) {
    console.error(`Error en getAnimeDetails con id '${id}':`, error.message);
    throw error;
  }
}

// Obtener enlaces de video de un episodio
async function getEpisodeLinks(url) {
  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const videosMatch = resp.data.match(/var videos = ({.*?});/s);
    if (!videosMatch) {
      throw new Error('No se encontró la variable de videos');
    }

    let servidores = [];
    try {
      const videosObj = JSON.parse(videosMatch[1]);
      if (videosObj.SUB && Array.isArray(videosObj.SUB)) {
        servidores = videosObj.SUB.map(srv => srv.code);
      }
    } catch (e) {
      throw new Error('Error al parsear los videos');
    }

    if (servidores.length === 0) {
      throw new Error('No se encontraron links de video');
    }

    return { video: servidores[0], servidores };
  } catch (error) {
    console.error(error);
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
