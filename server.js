const express = require('express');
const cors = require('cors');
const app = express();
const { getLatest, searchAnime, getAnimeInfo } = require('animeflv-api');
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
    if (!cover) {
      console.log(`[DEBUG /api/anime] No se pudo encontrar la portada para el ID: ${id}`);
    }

    // Extraer la sinopsis
    let synopsis = $('div.Description p').first().text();
    if (!synopsis) synopsis = $('div.container section.Main article.Anime div.Description p').first().text();
    if (!synopsis) synopsis = $('div[class*="sinopsis"], div[id*="sinopsis"] p').first().text();
    if (!synopsis) synopsis = $('p').filter((i, el) => $(el).text().trim() !== '').first().text();
    if (!synopsis) {
      console.log(`[DEBUG /api/anime] No se pudo encontrar la sinopsis para el ID: ${id}`);
    }

    // Extraer los géneros
    const genres = [];
    $('nav.Nvgnrs a').each((i, elem) => {
      const genreText = $(elem).text().trim();
      if (genreText) {
        genres.push(genreText);
      }
    });
    if (genres.length > 0) {
        console.log(`[DEBUG /api/anime] Géneros extraídos: ${genres.join(', ')}`);
    } else {
        console.log('[DEBUG /api/anime] No se encontraron géneros.');
    }

    // Extraer el rating
    let rating = $('span#votes_prmd').text().trim();
    if (rating) {
        console.log(`[DEBUG /api/anime] Rating extraído: ${rating}`);
    } else {
        console.log('[DEBUG /api/anime] No se encontró el rating (span#votes_prmd).');
        rating = 'N/A'; // Valor por defecto si no se encuentra
    }
    // estado
    let status = $('span.fa-tv').text().trim();
    if (!status) {
        console.log(`[DEBUG /api/anime] No se pudo encontrar el estado para el ID: ${id}`);
    }
    // Extraer y formatear los episodios desde la variable episodes en el script
    let formattedEpisodes = [];
    try {
      const episodesRegex = /var episodes = (\s*\[\s*(?:\[\d+\s*,\s*\d+\]\s*(?:,\s*\[\d+\s*,\s*\d+\]\s*)*)?\]\s*);/;
      const episodesMatch = html.match(episodesRegex);
      if (episodesMatch && episodesMatch[1]) {
        const episodesArrayString = episodesMatch[1];
        // Sanitize string for JSON.parse: ensure it's a valid JSON array literal string
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
          console.log(`[DEBUG /api/anime] ${formattedEpisodes.length} episodios extraídos y formateados de var episodes.`);
        }
      } else {
        console.log("[DEBUG /api/anime] No se encontró la variable JS 'episodes' o estaba vacía.");
      }
    } catch (e) {
      console.error(`[DEBUG /api/anime] Error al parsear var episodes: ${e.message}. String problemático: ${html.match(/var episodes = (.*?);/)?.[1]}`);
    }

    console.log(`[DEBUG /api/anime] Final Data - ID: ${id}, Título: ${animeTitle}, Cover: ${cover ? 'Encontrada' : 'No encontrada'}, Sinopsis: ${synopsis ? 'Encontrada' : 'No encontrada'}, # Episodios: ${formattedEpisodes.length}`);
    
    res.json({
      title: animeTitle,
      cover: cover || 'No se encontró portada.',
      synopsis: synopsis ? synopsis.trim() : 'No se encontró sinopsis.',
      genres: genres,
      rating: rating,
      status: status,
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


// Obtener solo la lista de episodios de un anime
app.get('/api/episodes', async (req, res) => {
  const id = req.query.id;
  try {
    const data = await getAnimeInfo(id);
    res.json({ episodes: data.episodes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener episodios' });
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
