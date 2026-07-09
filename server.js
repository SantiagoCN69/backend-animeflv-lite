const express = require('express');
const cors = require('cors');
const app = express();
const animeflv = require('./sources/animeflv');
const jkanime = require('./sources/jkanime');

app.use(cors());

// Función para deduplicar animes por título normalizado
// Función para deduplicar animes por ID
function deduplicateAnimes(animes) {
  const seen = new Map();
  
  return animes.filter(anime => {
    const id = anime.id || animeflv.normalizeTitle(anime.title);
    
    if (seen.has(id)) {
      const existing = seen.get(id);
      
      if (anime.servidores && existing.servidores) {
        const allServers = [...existing.servidores, ...anime.servidores];
        const uniqueServers = allServers.filter((server, index, self) =>
          index === self.findIndex(s => s.name === server.name)
        );
        existing.servidores = uniqueServers;
      }
      return false; 
    }

    seen.set(id, anime);
    return true;
  });
}

// Últimos capítulos
app.get('/api/latest', async (req, res) => {
  const source = req.query.source || 'all';
  try {
    let data;

    if (source === 'animeflv') {
      data = await animeflv.getLatestEpisodes();
    } else if (source === 'jkanime') {
      data = await jkanime.getLatestEpisodes();
    } else {
      const [jkanimeData, animeflvData] = await Promise.allSettled([
        jkanime.getLatestEpisodes(),
        animeflv.getLatestEpisodes()
      ]);

      const results = [];

      if (jkanimeData.status === 'fulfilled' && jkanimeData.value) {
        results.push(...(Array.isArray(jkanimeData.value) ? jkanimeData.value : []));
      }

      if (animeflvData.status === 'fulfilled' && animeflvData.value) {
        results.push(...(Array.isArray(animeflvData.value) ? animeflvData.value : []));
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
    if (source === 'animeflv') {
      data = await animeflv.search(query);
    } else if (source === 'jkanime') {
      data = await jkanime.search(query);
    } else {
      // Buscar en todas las fuentes y combinar resultados
      const [animeflvData, jkanimeData] = await Promise.allSettled([
        animeflv.search(query),
        jkanime.search(query)
      ]);
      
      const results = [];
      if (animeflvData.status === 'fulfilled' && animeflvData.value) {
        // animeflv devuelve {data: [...]} o array directo
        const animeflvResults = animeflvData.value.data || animeflvData.value;
        results.push(...(Array.isArray(animeflvResults) ? animeflvResults : []));
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
  const source = req.query.source || 'animeflv';
  const params = req.url.split('?')[1];
  
  try {
    let data;
    if (source === 'animeflv') {
      data = await animeflv.browse(params);
    } else if (source === 'jkanime') {
      data = await jkanime.browse(params);
    } else {
      // Por defecto usar animeflv para browse
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
    if (source === 'animeflv') {
      data = await animeflv.getAnimeDetails(id);
    } else if (source === 'jkanime') {
      data = await jkanime.getAnimeDetails(id);
    } else {
      const [animeflvData, jkanimeData] = await Promise.allSettled([
        animeflv.getAnimeDetails(id),
        jkanime.getAnimeDetails(id)
      ]);
      
      const combined = {};
      
      if (animeflvData.status === 'fulfilled' && animeflvData.value) {
        Object.assign(combined, animeflvData.value);
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
        
const episodesFLV = animeflvData.value?.episodes || [];
const episodesJK = jkanimeData.value?.episodes || [];

// Comparamos cuál tiene más episodios y tomamos esa lista como base
if (episodesJK.length >= episodesFLV.length) {
  combined.episodes = episodesJK;
  combined.source = 'jkanime';
} else {
  combined.episodes = episodesFLV;
  combined.source = 'animeflv';
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
    if (source === 'animeflv') {
      data = await animeflv.getEpisodeLinks(url);
    } else if (source === 'jkanime') {
      data = await jkanime.getEpisodeLinks(url);
    } else {
      // Buscar en ambas fuentes y unir servidores
      const results = [];
      
      // Detectar fuente por URL y obtener servidores
      if (url.includes('animeflv')) {
        const animeflvData = await animeflv.getEpisodeLinks(url);
        if (animeflvData.servidores) {
          results.push(...animeflvData.servidores.map(s => ({ ...s, source: 'animeflv' })));
        }
      } else if (url.includes('jkanime')) {
        const jkanimeData = await jkanime.getEpisodeLinks(url);
        if (jkanimeData.servidores) {
          results.push(...jkanimeData.servidores.map(s => ({ ...s, source: 'jkanime' })));
        }
      } else {
        // Si no se puede detectar, intentar con animeflv
        try {
          const animeflvData = await animeflv.getEpisodeLinks(url);
          if (animeflvData.servidores) {
            results.push(...animeflvData.servidores.map(s => ({ ...s, source: 'animeflv' })));
          }
        } catch (e) {
          console.log('Error con animeflv, intentando jkanime');
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

//obtener los animes por horarios
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
