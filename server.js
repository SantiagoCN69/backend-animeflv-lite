const express = require('express');
const cors = require('cors');
const app = express();
const { getLatest, searchAnime, getAnimeInfo, searchAnimesByFilter } = require('animeflv-api');
const cheerio = require('cheerio');
const path = require('path');
const axios = require('axios');

app.use(cors());

// Últimos capítulos
app.get('/api/latest', async (req, res) => {
  const data = await getLatest();
  res.json(data);
});

// Buscar anime
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const data = await searchAnime(query);
  res.json(data);
});

// Navegar por animes
// Endpoint para contar elementos de la lista
app.get('/api/browse', async (req, res) => {
  // Construir la URL completa con la base y los parámetros de la consulta
  const baseUrl = 'https://www3.animeflv.net/browse?';

  // Obtener la URL completa desde los parámetros de la consulta
  const fullUrl = `${baseUrl}${req.url.split('?')[1]}`;
  try {
    // Hacemos la petición a la página
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Usamos cheerio para parsear el HTML
    const $ = cheerio.load(response.data);

    // Extraemos información de cada anime
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
        cover
      };
    }).get();
    res.json({ animes });

  } catch (error) {
    console.error('Error al procesar la página:', error);
    res.status(500).json({
      message: 'Error al procesar la página',
      error: error.message
    });
  }
});
// Detalles de anime
app.get('/api/anime', async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ message: 'El ID del anime es requerido' });
  }
  try {
    const animePageUrl = `https://www3.animeflv.net/anime/${id}`;
    const response = await axios.get(animePageUrl, {
      headers: {
        // Intentar simular un navegador para evitar bloqueos básicos
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;

    const $ = cheerio.load(html);

    let animeTitle = id; // Fallback al ID
    let animeSlug = id; // Fallback al ID para el slug


    if (animeTitle === id) { // Si no se pudo extraer de anime_info, intentar con selectores h1
      let h1Title = $('h1.Title').text().trim();
      if (!h1Title) h1Title = $('h1.anime-title').text().trim();
      if (!h1Title) h1Title = $('h1.page-title').text().trim();
      if (h1Title) animeTitle = h1Title;
      else console.log(`[DEBUG /api/anime] No se pudo extraer el título real con selectores h1, usando ID para título: ${id}`);
    }

    // Extraer la imagen de portada (cover)
    let cover = $('figure.AnimeCover img').attr('src');
    if (!cover) cover = $('figure img').first().attr('src');
    if (cover && !cover.startsWith('http')) {
      const pageBaseUrl = new URL(animePageUrl).origin;
      cover = pageBaseUrl + cover;
    }


    // Extraer la sinopsis
    let synopsis = $('div.Description p').first().text();
    if (!synopsis) synopsis = $('div.container section.Main article.Anime div.Description p').first().text();
    if (!synopsis) synopsis = $('div[class*="sinopsis"], div[id*="sinopsis"] p').first().text();


    // Extraer los géneros
    const genres = [];
    $('nav.Nvgnrs a').each((i, elem) => {
      const genreText = $(elem).text().trim();
      if (genreText) {
        genres.push(genreText);
      }
    });

    // Extraer el rating
    let rating = $('span#votes_prmd').text().trim();

    // estado
    let status = $('span.fa-tv').text().trim();

    // relacionado
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
    // Extraer y formatear los episodios desde la variable episodes en el script
    let formattedEpisodes = [];
    try {
      const episodesRegex = /var episodes = (\s*\[\s*(?:\[\d+\s*,\s*\d+\]\s*(?:,\s*\[\d+\s*,\s*\d+\]\s*)*)?\]\s*);/;
      const episodesMatch = html.match(episodesRegex);
      if (episodesMatch && episodesMatch[1]) {
        const episodesArrayString = episodesMatch[1];

        const sanitizedEpisodesString = episodesArrayString.replace(/,\s*]/g, ']'); // Remove trailing commas before closing bracket if any
        const episodesData = JSON.parse(sanitizedEpisodesString);

        if (Array.isArray(episodesData)) {
          episodesData.forEach(epPair => {
            if (Array.isArray(epPair) && epPair.length >= 1) {
              const epNum = epPair[0];
              // const otherId = epPair[1]; // No lo necesitamos para la URL final según el formato pedido
              const episodeUrl = `https://www3.animeflv.net/ver/${animeSlug}-${epNum}`;
              formattedEpisodes.push({ number: epNum, url: episodeUrl });
            }
          });
          formattedEpisodes.reverse(); // Para orden ascendente (Ep 1, 2, 3...)
        }
      } else {
        console.log("[DEBUG /api/anime] No se encontró la variable JS 'episodes' o estaba vacía.");
      }
    } catch (e) {
      console.error(`[DEBUG /api/anime] Error al parsear var episodes: ${e.message}. String problemático: ${html.match(/var episodes = (.*?);/)?.[1]}`);
    }

    res.json({
      title: animeTitle,
      cover: cover || 'No se encontró portada.',
      synopsis: synopsis ? synopsis.trim() : 'No se encontró sinopsis.',
      genres: genres,
      rating: rating,
      status: status,
      related: related,
      episodes: formattedEpisodes
    });

  } catch (error) {
    console.error(`Error en /api/anime con id '${id}':`, error.message);
    if (error.response) {
      // Error de la petición axios (ej. 404 del sitio de AnimeFLV)
      console.error(`[DEBUG /api/anime] Error de Axios: ${error.response.status} - ${error.response.statusText}`);
      return res.status(error.response.status).json({ message: `Error al contactar AnimeFLV: ${error.response.statusText}` });
    }
    res.status(500).json({ message: 'Error al obtener la información del anime.', details: error.message });
  }
});


// Obtener los enlaces de video de un episodio
app.get('/api/episode', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Falta el parámetro url' });
  }

  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // Buscar la variable "var videos = {...};"
    const videosMatch = resp.data.match(/var videos = ({.*?});/s);
    if (!videosMatch) {
      return res.status(404).json({ error: 'No se encontró la variable de videos' });
    }

    let servidores = [];
    try {
      const videosObj = JSON.parse(videosMatch[1]);
      if (videosObj.SUB && Array.isArray(videosObj.SUB)) {
        servidores = videosObj.SUB.map(srv => srv.code);
      }
    } catch (e) {
      return res.status(500).json({ error: 'Error al parsear los videos' });
    }

    if (servidores.length === 0) {
      return res.status(404).json({ error: 'No se encontraron links de video' });
    }

    return res.json({ video: servidores[0], servidores });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el video' });
  }
});
// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
