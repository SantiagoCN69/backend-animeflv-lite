const express = require('express');
const cors = require('cors');
const app = express();
const { getLatest, searchAnime, getAnimeInfo } = require('animeflv-api');
const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

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
  const data = await getAnimeInfo(id);
  res.json(data);
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

// Función para extraer link directo de video
async function extractDirectVideoLink(embedUrl) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(embedUrl, { waitUntil: 'networkidle0' });
    
    // Intenta diferentes estrategias para encontrar el link directo
    const videoLink = await page.evaluate(() => {
      // Buscar elementos de video
      const videoElements = [
        document.querySelector('video source'),
        document.querySelector('video'),
        document.querySelector('iframe[src*=".mp4"]'),
      ];

      for (let el of videoElements) {
        if (el) {
          return el.src || el.currentSrc;
        }
      }

      // Si no encuentra, buscar en scripts
      const scripts = Array.from(document.scripts);
      for (let script of scripts) {
        const match = script.textContent.match(/https?:.*\.mp4/);
        if (match) return match[0];
      }

      return null;
    });

    await browser.close();
    return videoLink;
  } catch (error) {
    console.error('Error extrayendo link directo:', error);
    await browser.close();
    return null;
  }
}

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

    // Extraer link directo del primer servidor
    const directVideoLink = await extractDirectVideoLink(servidores[0]);

    return res.json({
      video: servidores[0],
      directLink: directVideoLink,
      servidores
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el video' });
  }
});
// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
