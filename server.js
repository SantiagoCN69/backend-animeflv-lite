const express = require('express');
const cors = require('cors');
const app = express();
const animeav1 = require('./sources/animeav1');
const jkanime = require('./sources/jkanime');

app.use(cors());

// Función auxiliar para normalizar títulos y hacer una comparación exacta
function normalizeTitleForCompare(title) {
  if (!title) return '';
  // Convierte a minúsculas y elimina todo lo que no sea letra o número (espacios, guiones, dos puntos, etc.)
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Función para deduplicar animes por Título
// Función para deduplicar y FUSIONAR animes por Título
function deduplicateAnimes(animes) {
  const seen = new Map();
  
  animes.forEach(anime => {
    const key = normalizeTitleForCompare(anime.title) || anime.id;
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (anime.image) {
        existing.image = anime.image;
      }
      
      if (anime.cover) {
        existing.cover = anime.cover;
      }
      
      if (anime.id) {
        existing.id = anime.id;
      }

      if (anime.servidores) {
        existing.servidores = existing.servidores || [];
        const allServers = [...existing.servidores, ...anime.servidores];
        existing.servidores = allServers.filter((server, index, self) =>
          index === self.findIndex(s => s.name === server.name)
        );
      }
    } else {

      const newAnime = { ...anime };
      
      if (newAnime.chapter && !newAnime.episode) newAnime.episode = newAnime.chapter;
      if (newAnime.episode && !newAnime.chapter) newAnime.chapter = newAnime.episode;
      if (newAnime.cover && !newAnime.image) newAnime.image = newAnime.cover;
      if (newAnime.image && !newAnime.cover) newAnime.cover = newAnime.image;

      seen.set(key, newAnime);
    }
  });
  
  return Array.from(seen.values());
}

// Últimos capítulos
app.get('/api/latest', async (req, res) => {
  const source = req.query.source || 'all';
  try {
    let data;

    if (source === 'animeav1') {
      data = await animeav1.getLatestEpisodes();
    } else if (source === 'jkanime') {
      data = await jkanime.getLatestEpisodes();
    } else {
      const [jkanimeData, animeav1Data] = await Promise.allSettled([
        jkanime.getLatestEpisodes(),
        animeav1.getLatestEpisodes()
      ]);

      const results = [];

      if (jkanimeData.status === 'fulfilled' && jkanimeData.value) {
        results.push(...(Array.isArray(jkanimeData.value) ? jkanimeData.value : []));
      }

      if (animeav1Data.status === 'fulfilled' && animeav1Data.value) {
        results.push(...(Array.isArray(animeav1Data.value) ? animeav1Data.value : []));
      }
      
      data = deduplicateAnimes(results);
    }

    res.json(data);
  } catch (error) {
    console.error('Error en /api/latest:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar anime
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const source = req.query.source || 'all';
  
  try {
    let data;
    if (source === 'animeav1') {
      data = await animeav1.search(query);
    } else if (source === 'jkanime') {
      data = await jkanime.search(query);
    } else {
      // Buscar en todas las fuentes y combinar resultados
      const [animeav1Data, jkanimeData] = await Promise.allSettled([
        animeav1.search(query),
        jkanime.search(query)
      ]);
      
      const results = [];
      if (animeav1Data.status === 'fulfilled' && animeav1Data.value) {
        // animeav1 devuelve {data: [...]} o array directo
        const animeav1Results = animeav1Data.value.data || animeav1Data.value;
        results.push(...(Array.isArray(animeav1Results) ? animeav1Results : []));
      }
      if (jkanimeData.status === 'fulfilled' && jkanimeData.value) {
        results.push(...(Array.isArray(jkanimeData.value) ? jkanimeData.value : []));
      }
      // Deduplicar resultados por título
      data = deduplicateAnimes(results);
    }
    res.json(data);
  } catch (error) {
    console.error('Error en /api/search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Navegar por animes
app.get('/api/browse', async (req, res) => {
  const source = req.query.source || 'animeav1';
  const params = req.url.split('?')[1];
  
  try {
    let data;
    if (source === 'animeav1') {
      data = await animeav1.browse(params);
    } else if (source === 'jkanime') {
      data = await jkanime.browse(params);
    } else {
      // Por defecto usar animeav1 para browse
      data = await jkanime.browse(params);
    }
    res.json(data);
  } catch (error) {
    console.error('Error en /api/browse:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detalles de anime
app.get('/api/anime', async (req, res) => {
  const id = req.query.id;
  const source = req.query.source || 'all';
  
  if (!id) {
    return res.status(400).json({ message: 'El ID del anime es requerido' });
  }
  
  try {
    let data;
    if (source === 'animeav1') {
      data = await animeav1.getAnimeDetails(id);
    } else if (source === 'jkanime') {
      data = await jkanime.getAnimeDetails(id);
    } else {
      const [animeav1Data, jkanimeData] = await Promise.allSettled([
        animeav1.getAnimeDetails(id),
        jkanime.getAnimeDetails(id)
      ]);
      
      const combined = {};
      
      if (animeav1Data.status === 'fulfilled' && animeav1Data.value) {
        Object.assign(combined, animeav1Data.value);
      }
      
      if (jkanimeData.status === 'fulfilled' && jkanimeData.value) {
        if (!combined.title) {
          Object.assign(combined, jkanimeData.value);
        } else {
          if (jkanimeData.value.genres && jkanimeData.value.genres.length > 0) {
            if (!combined.genres || combined.genres.length === 0) {
              combined.genres = jkanimeData.value.genres;
            } else {
              combined.genres = [...new Set([...combined.genres, ...jkanimeData.value.genres])];
            }
          }
        }
        
        const episodesV1 = animeav1Data.value?.episodes || [];
        const episodesJK = jkanimeData.value?.episodes || [];

        // Comparamos cuál tiene más episodios y tomamos esa lista como base
        if (episodesJK.length >= episodesV1.length) {
          combined.episodes = episodesJK;
          combined.source = 'jkanime';
        } else {
          combined.episodes = episodesV1;
          combined.source = 'animeav1';
        }
      }
      
      if (!combined.title) {
        return res.status(404).json({ message: 'Anime no encontrado en ninguna fuente' });
      }
      
      // Sobrescribimos la fuente para indicar que es un resultado mixto
      combined.source = 'combined'; 
      data = combined;
    }
    res.json(data);
  } catch (error) {
    console.error('Error en /api/anime:', error);
    res.status(500).json({ error: error.message });
  }
});


// Obtener los enlaces de video de un episodio
app.get('/api/episode', async (req, res) => {
  const url = req.query.url;
  const source = req.query.source || 'all';
  
  if (!url) {
    return res.status(400).json({ error: 'Falta el parámetro url' });
  }

  try {
    let data;
    if (source === 'animeav1') {
      data = await animeav1.getEpisodeLinks(url);
    } else if (source === 'jkanime') {
      data = await jkanime.getEpisodeLinks(url);
    } else {
      // Buscar en ambas fuentes y unir servidores
      const results = [];
      
      // Detectar fuente por URL y obtener servidores
      if (url.includes('animeav1')) {
        const animeav1Data = await animeav1.getEpisodeLinks(url);
        if (animeav1Data.servidores) {
          results.push(...animeav1Data.servidores.map(s => ({ ...s, source: 'animeav1' })));
        }
      } else if (url.includes('jkanime')) {
        const jkanimeData = await jkanime.getEpisodeLinks(url);
        if (jkanimeData.servidores) {
          results.push(...jkanimeData.servidores.map(s => ({ ...s, source: 'jkanime' })));
        }
      } else {
        // Si no se puede detectar, intentar con animeav1
        try {
          const animeav1Data = await animeav1.getEpisodeLinks(url);
          if (animeav1Data.servidores) {
            results.push(...animeav1Data.servidores.map(s => ({ ...s, source: 'animeav1' })));
          }
        } catch (e) {
          console.log('Error con animeav1, intentando jkanime');
        }
      }
      
      // Unir servidores únicos por nombre
      const uniqueServers = [];
      const seen = new Map();
      
      results.forEach(server => {
        const key = server.name || server.url;
        if (!seen.has(key)) {
          seen.set(key, true);
          uniqueServers.push(server);
        }
      });
      
      data = {
        video: uniqueServers[0]?.url,
        servidores: uniqueServers
      };
    }
    res.json(data);
  } catch (error) {
    console.error('Error en /api/episode:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ejemplo de unión de servidores (endpoint de prueba)
app.get('/api/example/servers', async (req, res) => {
  // Ejemplo simulado de cómo se unen los servidores
  const exampleAnime = {
    title: 'Naruto',
    servidores: [
      { name: 'mega', url: 'https://mega.nz/...' },
      { name: 'fembed', url: 'https://fembed.com/...' }
    ]
  };

  const duplicateAnime = {
    title: 'Naruto',
    servidores: [
      { name: 'mega', url: 'https://mega.nz/...' }, // Duplicado
      { name: 'streamtape', url: 'https://streamtape.com/...' } // Nuevo
    ]
  };

  // Aplicar deduplicación y unión de servidores
  const combined = deduplicateAnimes([exampleAnime, duplicateAnime]);

  res.json({
    mensaje: 'Ejemplo de unión de servidores con deduplicación',
    original: [exampleAnime, duplicateAnime],
    resultado: combined,
    explicacion: 'Los servidores duplicados (mega) se eliminan, los únicos (fembed, streamtape) se unen'
  });
});

// obtener los animes por horarios
app.get('/api/schedule', async (req, res) => {
  try {
    const data = await jkanime.getSchedule();
    res.json(data);
  } catch (error) {
    console.error('Error en /api/schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));