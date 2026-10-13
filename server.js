const express = require('express');
const cors = require('cors');
const app = express();
const animeav1 = require('./sources/animeav1');

app.use(cors());

// Últimos capítulos
app.get('/api/latest', async (req, res) => {
  try {
    const data = await animeav1.getLatestEpisodes();
    res.json(data);
  } catch (error) {
    console.error('Error en /api/latest:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar anime
app.get('/api/search', async (req, res) => {
  const query = req.query.q;

  try {
    const data = await animeav1.search(query);
    res.json(data);
  } catch (error) {
    console.error('Error en /api/search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Navegar por animes
app.get('/api/browse', async (req, res) => {
  const params = req.url.split('?')[1];

  try {
    const data = await animeav1.browse(params);
    res.json(data);
  } catch (error) {
    console.error('Error en /api/browse:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detalles de anime
app.get('/api/anime', async (req, res) => {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({ message: 'El ID del anime es requerido' });
  }

  try {
    const data = await animeav1.getAnimeDetails(id);
    res.json(data);
  } catch (error) {
    console.error('Error en /api/anime:', error);
    res.status(500).json({ error: error.message });
  }
});


// Obtener los enlaces de video de un episodio
app.get('/api/episode', async (req, res) => {
  const animeid = req.query.animeid;
  const cap = req.query.cap;

  if (!animeid || !cap) {
    return res.status(400).json({ error: 'Faltan los parámetros animeid y/o cap' });
  }

  const url = `https://animeav1.com/media/${animeid}/${cap}`;

  try {
    const data = await animeav1.getEpisodeLinks(url);
    res.json(data);
  } catch (error) {
    console.error('Error en /api/episode:', error);
    res.status(500).json({ error: error.message });
  }
});

// obtener los animes por horarios
app.get('/api/schedule', async (req, res) => {
  try {
    const data = await animeav1.getSchedule();
    res.json(data);
  } catch (error) {
    console.error('Error en /api/schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));