# 📡 Eco-Localizador (Echo-Locator)

**Eco-Localizador** es una aplicación PWA de sonar activo diseñada para medir distancias a objetos mediante la ecolocalización, utilizando exclusivamente el hardware de audio de un dispositivo (altavoz y micrófono) y la **Web Audio API**.

![Versión](https://img.shields.io/badge/Versi%C3%B3n-1.0.0-green)
![Tecnolog%C3%ADa](https://img.shields.io/badge/Tecnolog%C3%ADa-Web%20Audio%20API-blue)
![PWA](https://img.shields.io/badge/PWA-Compatible-orange)

## 🚀 Funcionamiento Técnico

La aplicación funciona emitiendo un pulso ultrasónico de corto alcance y escuchando el rebote (eco) que se produce al chocar con una superficie.

1.  **Emisión (Chirp):** Se genera un pulso de 10ms que varía linealmente entre 18kHz y 20kHz. Esta frecuencia es casi imperceptible para el oído humano pero óptima para los micrófonos estándar.
2.  **Filtrado:** La señal de entrada del micrófono pasa por un filtro de paso de banda (BiquadFilter) centrado en 19kHz para eliminar el ruido ambiental.
3.  **Detección de Picos:** El motor de audio analiza la forma de onda en el tiempo para identificar el primer pico de amplitud significativo tras la emisión.
4.  **Cálculo de Distancia:** Se aplica la fórmula física:
    $$d = \frac{v \cdot t}{2}$$
    *(Donde $v$ es la velocidad del sonido (~343 m/s) y $t$ es el tiempo de ida y vuelta).*

## ✨ Características Principales

-   **Interfaz de Radar Militar:** Estética oscura con barrido de radar y osciloscopio en tiempo real (Canvas 60fps).
-   **Calibración Inteligente:** Mide la latencia interna entre el hardware del altavoz y el micrófono para descontar errores de medición.
-   **Análisis Dinámico:** Procesamiento de señal mediante la Web Audio API directamente en el navegador.
-   **Instalable (PWA):** Funciona como una aplicación nativa gracias a su `manifest.json`.

## 🛠️ Tecnologías

-   **React + TypeScript + Vite**
-   **Web Audio API** (AudioContext, OscillatorNode, AnalyserNode, BiquadFilterNode)
-   **HTML5 Canvas** (Renderizado de alta frecuencia)
-   **Tailwind CSS** (Interfaz responsiva y moderna)
-   **Lucide React** (Iconografía técnica)

## 📦 Instalación Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/eco-localizador.git
   cd eco-localizador
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## 🌐 Despliegue en GitHub Pages

Para alojar este proyecto en GitHub Pages de forma gratuita, sigue estos pasos:

### Opción A: Despliegue Automático (GitHub Actions)
Es la forma recomendada para proyectos con Vite.

1.  Crea un archivo en `.github/workflows/deploy.yml` con el contenido estándar de despliegue de Vite (puedes encontrar plantillas oficiales de Vite para GitHub Actions).
2.  Ve a la configuración de tu repositorio en GitHub: **Settings > Pages**.
3.  Bajo **Build and deployment**, selecciona **GitHub Actions** como fuente.

### Opción B: Despliegue Manual (Script)
1. Instala el paquete de ayuda:
   ```bash
   npm install -D gh-pages
   ```
2. Añade los scripts a tu `package.json`:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```
3. Ejecuta:
   ```bash
   npm run deploy
   ```

> [!IMPORTANT]
> Asegúrate de que `base: './'` esté configurado en tu `vite.config.ts` para que las rutas de los archivos sean relativas.

## ⚠️ Advertencia y Limitaciones
- **Hardware:** La precisión depende enormemente de la calidad del micrófono y la posición de los altavoces.
- **Entorno:** Funciona mejor en espacios interiores con superficies sólidas (paredes). Superficies blandas (cortinas) absorben el sonido y dificultan la detección.
- **Eco-Cancelación:** Algunos sistemas operativos tienen cancelación de eco por software que puede filtrar el pulso. La app intenta desactivarlo, pero el éxito varía según el navegador.

---
Desarrollado con fines educativos y de experimentación acústica.
