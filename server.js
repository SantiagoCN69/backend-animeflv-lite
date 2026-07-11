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
    
    // Búsqueda por fuente específica
    if (source === 'animeav1') {
      data = await animeav1.getAnimeDetails(id);
    } else if (source === 'jkanime') {
      data = await jkanime.getAnimeDetails(id);
    } else {
      // Búsqueda combinada (all)
      const [animeav1Data, jkanimeData] = await Promise.allSettled([
        animeav1.getAnimeDetails(id),
        jkanime.getAnimeDetails(id)
      ]);
      
      const v1 = animeav1Data.status === 'fulfilled' ? animeav1Data.value : null;
      const jk = jkanimeData.status === 'fulfilled' ? jkanimeData.value : null;

      if (!v1 && !jk) {
        return res.status(404).json({ message: 'Anime no encontrado en ninguna fuente' });
      }

      // 1. Unir datos básicos (priorizamos la fuente que los tenga)
      const combined = {
        id: id,
        title: v1?.title || jk?.title || id,
        cover: v1?.cover || jk?.cover || '',
        banner: v1?.banner || jk?.banner || '', 
        synopsis: v1?.synopsis || jk?.synopsis || 'Sinopsis no disponible.',
        status: v1?.status || jk?.status || 'Desconocido',
        source: 'combined'
      };

      // 2. Fusionar géneros sin duplicados
      const allGenres = [...(v1?.genres || []), ...(jk?.genres || [])];
      combined.genres = [...new Set(allGenres)];

      // 3. Fusionar episodios inteligentemente (sin duplicados por número)
      const episodesMap = new Map();

      // Agregamos primero los de JKAnime
      if (jk?.episodes) {
        jk.episodes.forEach(ep => {
          episodesMap.set(ep.number.toString(), ep);
        });
      }

      // Luego agregamos los de AnimeAV1
      // Si el episodio ya existe en el Map, no lo sobreescribe, pero si AV1 
      // tiene capítulos extra, se agregarán correctamente.
      if (v1?.episodes) {
        v1.episodes.forEach(ep => {
          if (!episodesMap.has(ep.number.toString())) {
            episodesMap.set(ep.number.toString(), ep);
          }
        });
      }

      // Convertimos el mapa de vuelta a un array y lo ordenamos numéricamente
      combined.episodes = Array.from(episodesMap.values()).sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
      
      data = combined;
    }
    
    // Devolver el JSON final
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
  const source = req.query.source || 'all';
  
  if (!animeid || !cap) {
    return res.status(400).json({ error: 'Faltan los parámetros animeid y/o cap' });
  }

  // Construimos dinámicamente las URLs según la estructura de cada página
  const urlAnimeAv1 = `https://animeav1.com/media/${animeid}/${cap}`;
  const urlJkAnime = `https://jkanime.net/${animeid}/${cap}/`;
  

  try {
    let data;
    
    if (source === 'animeav1') {
      data = await animeav1.getEpisodeLinks(urlAnimeAv1);
    } else if (source === 'jkanime') {
      data = await jkanime.getEpisodeLinks(urlJkAnime);
    } else {
      // Buscar en ambas fuentes simultáneamente y unir servidores
      const [animeav1Data, jkanimeData] = await Promise.allSettled([
        animeav1.getEpisodeLinks(urlAnimeAv1),
        jkanime.getEpisodeLinks(urlJkAnime)
      ]);
      
      const results = [];
      
      // Procesar resultados de JKAnime (ahora los agregamos primero)
      if (jkanimeData.status === 'fulfilled' && jkanimeData.value && jkanimeData.value.servidores) {
        results.push(...jkanimeData.value.servidores.map(s => ({ ...s, source: 'jkanime' })));
      }

      // Procesar resultados de AnimeAV1 (ahora van después)
      if (animeav1Data.status === 'fulfilled' && animeav1Data.value && animeav1Data.value.servidores) {
        results.push(...animeav1Data.value.servidores.map(s => ({ ...s, source: 'animeav1' })));
      }
      
      // Unir servidores únicos por nombre para evitar duplicados
      const uniqueServers = [];
      const seen = new Map();
      
      results.forEach(server => {
        const key = server.name || server.url;
        if (!seen.has(key)) {
          seen.set(key, true);
          uniqueServers.push(server);
        }
      });

      if (uniqueServers.length === 0) {
        throw new Error('No se encontraron enlaces de video en ninguna de las fuentes para este episodio.');
      }
      
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