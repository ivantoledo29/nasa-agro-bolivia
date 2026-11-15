# NASA Agro-Bolivia: Monitor de Quemas Agrícolas, Predicción Climática y Rotación de Suelos

Plataforma geoespacial interactiva y motor de diagnóstico agroclimático diseñado para evaluar el impacto de las quemas agrícolas (*chaqueos*), predecir anomalías climáticas locales y recomendar planes de rotación regenerativa de cultivos en los **343 municipios de Bolivia**.

---

## Problema y Propósito

En las regiones productivas de Bolivia (Chiquitanía, Norte Integrado, Llanos de Moxos y Valles), la quema recurrente de rastrojos y áreas agrícolas degrada la materia orgánica superficial, reduce la retención de humedad radicular y expone los cultivos a estrés hídrico y térmico. 

**NASA Agro-Bolivia** integra observación satelital de la Tierra con climatología en tiempo real para que comunidades agrícolas, técnicos y tomadores de decisiones puedan:
1. Cuantificar la incidencia real de focos de calor ocurridos estrictamente dentro de zonas agrícolas por municipio (`35,238` focos aislados en cultivos durante 2025).
2. Monitorear en vivo el balance hídrico y detectar anomalías locales asociadas a **El Niño** (déficit hídrico severo) o **La Niña** (exceso de humedad).
3. Calcular la **ventana óptima de siembra** a partir de 10 años de telemetría satelital (2016–2025).
4. Simular escenarios de sequía y obtener secuencias de rotación de cultivos adaptadas a la degradación térmica e hídrica de cada municipio.

---

## 🛰️ Fuentes de Datos Espaciales y Satelitales

* **NASA FIRMS (VIIRS JPSS-1):** Detección de focos de calor activos correspondientes al periodo 2025.
* **MapBiomas Bolivia (Colección 4):** Máscara de cobertura agrícola 2025 (clases productivas: pasturas, mosaico de agricultura/pastos, soya y cultivos temporales) empleada para filtrar únicamente incendios ocurridos en tierras agropecuarias.
* **NASA POWER API (`AG` Agroclimatology):**
  * `T2M_MAX` y `T2M_MIN`: Temperatura máxima y mínima a 2 metros (°C).
  * `PRECTOTCORR`: Precipitación corregida (mm).
  * `GWETROOT`: Humedad relativa del suelo en la zona radicular (%).
* **Cartografía Oficial Municipal de Bolivia:** División político-administrativa de los 343 municipios.

---

## Arquitectura del Proyecto

```text
nasa-agro-bolivia/
├── backend/                          # API REST y motor analítico (Python + FastAPI)
│   ├── data/
│   │   └── municipios_nasa_ready.geojson  # Dataset espacial optimizado (<2 MB)
│   ├── preparar_datos.py             # Pipeline ETL: simplificación geométrica + NASA POWER
│   ├── main.py                       # Endpoints de mapas, ranking y clima en vivo (2016-2026)
│   └── requirements.txt              # Dependencias de Python
├── frontend/                         # Interfaz web interactiva (React + Vite + Leaflet)
│   ├── src/
│   │   ├── App.jsx                   # Mapa coroplético, climatología y simulador hídrico
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
└── README.md