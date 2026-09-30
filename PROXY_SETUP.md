# Configuración de Proxy Residencial para Vercel/Render

## El Problema
jkanime.net bloquea las IPs de servidores cloud (Vercel, Render, Cloudflare Workers, etc.) con protecciones anti-bot y Cloudflare.

## La Solución
Usar APIs de proxy residencial que rotan IPs reales y resuelven automáticamente los desafíos de Cloudflare.

## Pasos para configurar:

### 1. Regístrate en UNO de estos servicios (gratuito):

#### **Opción A: ScraperAPI** (Recomendado)
- **Gratis**: 5,000 peticiones/mes
- **Registro**: https://www.scraperapi.com/
- Después de registrarte, obtén tu API key del dashboard

#### **Opción B: ZenRows**
- **Gratis**: 1,000 créditos/mes
- **Registro**: https://www.zenrows.com/
- Obtén tu API key del dashboard

#### **Opción C: ScrapeOps**
- **Gratis**: Capa gratuita generosa
- **Registro**: https://scrapeops.io/
- Obtén tu API key del dashboard

### 2. Configura las variables de entorno:

#### En Vercel:
1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega una de estas variables:

```
SCRAPER_API_KEY=tu_api_key_aqui
# O
ZENROWS_API_KEY=tu_api_key_aqui
# O
SCRAPEOPS_API_KEY=tu_api_key_aqui
```

4. También agrega:
```
USE_PROXY=true
```

#### En Render:
1. Ve a tu proyecto en Render
2. Environment → Environment Variables
3. Agrega las mismas variables que arriba

#### En local (para probar):
1. Copia `.env.example` a `.env`
2. Agrega tu API key:
```bash
cp .env.example .env
# Edita .env y agrega tu API key
```

### 3. Despliega tu código:

El código ya está modificado para usar automáticamente el proxy cuando detecta que está en Vercel/Render.

### 4. Verifica que funciona:

Puedes agregar este endpoint temporal a tu `server.js` para probar:

```javascript
app.get('/api/test-proxy', async (req, res) => {
  const jkanime = require('./sources/jkanime');
  const result = await jkanime.testProxyConfiguration();
  res.json({ success: result });
});
```

Llama a `/api/test-proxy` desde tu navegador o Postman.

## Cómo funciona el código:

1. **Detección automática**: Detecta si está en Vercel/Render por variables de entorno
2. **Selección de proxy**: Usa la primera API key disponible (prioridad: ScraperAPI → ZenRows → ScrapeOps)
3. **Fallback**: Si el proxy falla o no está configurado, intenta petición directa
4. **Cache**: Las peticiones se cachean por 5 minutos para ahorrar créditos

## Límites de los planes gratuitos:

- **ScraperAPI**: 5,000 peticiones/mes
- **ZenRows**: 1,000 créditos/mes
- **ScrapeOps**: Variable según uso

## Recomendaciones:

1. **Empieza con ScraperAPI**: Más peticiones gratuitas (5,000 vs 1,000)
2. **Usa cache**: El código ya cachea respuestas por 5 minutos
3. **Monitorea uso**: Revisa el dashboard del servicio para ver cuántos créditos usas
4. **Considera plan pago**: Si necesitas más peticiones, los planes pagan son baratos (~$29/mes)

## Alternativa: Usar solo animeav1

Si no quieres configurar proxy, puedes:
1. Eliminar jkanime del código
2. Usar solo animeav1 como fuente
3. animeav1 podría tener menos protecciones (hay que probar)

## Preguntas frecuentes:

**Q: ¿Puedo usar múltiples proxies?**
A: El código usa solo uno a la vez (prioridad por orden de configuración)

**Q: ¿Qué pasa si se acaban los créditos gratuitos?**
A: Las peticiones fallarán. Necesitarás actualizar a plan pago o esperar al mes siguiente.

**Q: ¿Funciona en local?**
A: En local no es necesario usar proxy (tu IP no está bloqueada), pero puedes probarlo si quieres.

**Q: ¿Es legal?**
A: Hacer scraping de sitios públicos generalmente es legal, pero revisa los términos de servicio de jkanime.
