import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Icono limpio para el pin de parcela exacta
const pinParcela = new L.DivIcon({
  className: 'custom-parcela-pin',
  html: `<div style="background:#38bdf8;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px rgba(0,0,0,0.8)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ManejadorClicMapa({ modoParcela, onSeleccionarPunto }) {
  useMapEvents({
    click(e) {
      if (modoParcela) {
        onSeleccionarPunto(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function ControlVistaMapa({ centro, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (centro) {
      map.flyTo(centro, zoom, { duration: 1.1 });
    }
  }, [centro, zoom, map]);
  return null;
}

export default function App() {
  const [geoData, setGeoData] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [puntoParcela, setPuntoParcela] = useState(null); // { lat, lon, municipioRef }
  const [modoParcela, setModoParcela] = useState(false);
  const [vistaSatelite, setVistaSatelite] = useState(false);
  const [coordInput, setCoordInput] = useState('');
  const [mapaCentro, setMapaCentro] = useState(null);
  const [mapaZoom, setMapaZoom] = useState(6);

  const [climaVivo, setClimaVivo] = useState(null);
  const [cargandoClima, setCargandoClima] = useState(false);
  const [modoOffline, setModoOffline] = useState(!navigator.onLine);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState('TODOS');
  const [simulacionSequia, setSimulacionSequia] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const handleOnline = () => setModoOffline(false);
    const handleOffline = () => setModoOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carga inicial con respaldo en caché local (localStorage) para uso sin internet en el campo
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/municipios`).then((r) => r.json()),
      fetch(`${API_URL}/api/resumen`).then((r) => r.json()),
    ])
      .then(([geo, res]) => {
        setGeoData(geo);
        setResumen(res);
        localStorage.setItem('nasa_agro_geo_cache', JSON.stringify(geo));
        localStorage.setItem('nasa_agro_resumen_cache', JSON.stringify(res));
        if (res?.top_10_municipios?.length > 0) {
          setSeleccionado(res.top_10_municipios[0]);
        }
        setCargando(false);
      })
      .catch(() => {
        const cachedGeo = localStorage.getItem('nasa_agro_geo_cache');
        const cachedRes = localStorage.getItem('nasa_agro_resumen_cache');
        if (cachedGeo && cachedRes) {
          const geoParsed = JSON.parse(cachedGeo);
          const resParsed = JSON.parse(cachedRes);
          setGeoData(geoParsed);
          setResumen(resParsed);
          setModoOffline(true);
          if (resParsed?.top_10_municipios?.length > 0) {
            setSeleccionado(resParsed.top_10_municipios[0]);
          }
        }
        setCargando(false);
      });
  }, []);

  // Coordenada activa: prioridad al punto exacto de parcela si el usuario marcó uno
  const latActiva = puntoParcela ? puntoParcela.lat : seleccionado?.lat;
  const lonActiva = puntoParcela ? puntoParcela.lon : seleccionado?.lon;

  useEffect(() => {
    if (latActiva == null || lonActiva == null) return;
    const cacheKey = `clima_${latActiva.toFixed(2)}_${lonActiva.toFixed(2)}`;
    setCargandoClima(true);

    fetch(`${API_URL}/api/clima-vivo?lat=${latActiva}&lon=${lonActiva}`)
      .then((r) => r.json())
      .then((data) => {
        setClimaVivo(data);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setCargandoClima(false);
      })
      .catch(() => {
        const cachedClima = localStorage.getItem(cacheKey);
        if (cachedClima) {
          setClimaVivo(JSON.parse(cachedClima));
        } else {
          setClimaVivo(null);
        }
        setCargandoClima(false);
      });
  }, [latActiva, lonActiva]);

  const getColor = (focos) => {
    if (focos >= 300) return '#991b1b';
    if (focos >= 150) return '#dc2626';
    if (focos >= 50) return '#ea580c';
    if (focos >= 10) return '#eab308';
    if (focos > 0) return '#3b82f6';
    return '#1e293b';
  };

  const styleFeature = (feature) => {
    const props = feature.properties;
    const esSeleccionado = seleccionado?.municipio === props.municipio;
    const cumpleFiltro = filtroRiesgo === 'TODOS' || props.nivel_riesgo === filtroRiesgo;

    return {
      fillColor: getColor(props.focos_agricolas_2025),
      weight: esSeleccionado ? 2.8 : 0.8,
      opacity: 1,
      color: esSeleccionado ? '#38bdf8' : '#475569',
      fillOpacity: vistaSatelite ? 0.18 : cumpleFiltro ? 0.76 : 0.12,
    };
  };

  const onEachMunicipio = (feature, layer) => {
    const p = feature.properties;
    layer.bindTooltip(
      `<strong>${p.municipio}</strong> (${p.departamento})<br/>Quemas en cultivos: <b>${p.focos_agricolas_2025}</b><br/>Estado: ${p.nivel_riesgo}`,
      { sticky: true }
    );
    layer.on({
      click: (e) => {
        setSeleccionado(p);
        setSimulacionSequia(0);
        if (modoParcela) {
          setPuntoParcela({
            lat: e.latlng.lat,
            lon: e.latlng.lng,
            municipioRef: p.municipio,
          });
        } else {
          setPuntoParcela(null);
        }
      },
    });
  };

  const handleBuscarCoordenada = (e) => {
    e.preventDefault();
    // Extrae los dos números sin importar si están separados por coma, espacio o punto y coma
    const coincidencias = coordInput.match(/-?\d+(?:\.\d+)?/g);
    if (coincidencias && coincidencias.length >= 2) {
      const lat = parseFloat(coincidencias[0]);
      const lon = parseFloat(coincidencias[1]);

      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        // Buscar el municipio más cercano a esa coordenada para sincronizar los datos de quemas
        let municipioCercano = seleccionado;
        if (geoData?.features?.length) {
          let minDist = Infinity;
          for (const feat of geoData.features) {
            const p = feat.properties;
            const d = Math.hypot(p.lat - lat, p.lon - lon);
            if (d < minDist) {
              minDist = d;
              municipioCercano = p;
            }
          }
          setSeleccionado(municipioCercano);
        }

        setModoParcela(true);
        setVistaSatelite(true);
        setPuntoParcela({
          lat,
          lon,
          municipioRef: municipioCercano?.municipio || 'Parcela GPS',
        });
        // Pequeño offset aleatorio mínimo en zoom si ya estaba en 14 para forzar el flyTo de Leaflet
        setMapaCentro([lat, lon]);
        setMapaZoom((prev) => (prev === 14 ? 14.01 : 14));
      }
    }
  };

  const municipiosFiltrados = useMemo(() => {
    if (!geoData) return [];
    return geoData.features
      .map((f) => f.properties)
      .filter((p) => {
        const matchTexto =
          p.municipio.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.departamento.toLowerCase().includes(busqueda.toLowerCase());
        const matchRiesgo = filtroRiesgo === 'TODOS' || p.nivel_riesgo === filtroRiesgo;
        return matchTexto && matchRiesgo;
      })
      .sort((a, b) => b.focos_agricolas_2025 - a.focos_agricolas_2025);
  }, [geoData, busqueda, filtroRiesgo]);

  const diagnosticoClaro = useMemo(() => {
    if (!seleccionado) return null;
    const focos = seleccionado.focos_agricolas_2025;
    const lluviaBase = climaVivo ? climaVivo.lluvia_60d_real_mm : seleccionado.nasa_precip_anual_mm;
    const humedadBase = climaVivo ? climaVivo.humedad_suelo_actual_pct : seleccionado.nasa_humedad_suelo_pct;

    const lluviaAjustada = Math.round(lluviaBase * (1 - simulacionSequia / 100));
    const humedadAjustada = Math.max(
      12,
      +(humedadBase * (1 - (simulacionSequia * 0.7) / 100)).toFixed(1)
    );
    const saludAjustada = Math.max(
      10,
      Math.round(seleccionado.indice_salud_suelo - simulacionSequia * 0.35)
    );

    const haySequia = simulacionSequia >= 25 || (climaVivo && climaVivo.anomalia_lluvia_60d_pct <= -25);

    let resumenSuelo = '';
    let pasosAgricultor = [];

    if (haySequia) {
      resumenSuelo =
        '⚠️ Alerta de sequía en parcela: Poca agua disponible en la zona de raíces. Si se siembra un cultivo exigente ahora, corre alto riesgo de secarse antes de cosechar.';
      pasosAgricultor = [
        {
          etapa: 'Paso 1 • Sembrar cultivos resistentes a la sequía',
          cultivo: 'Sorgo granífero o Girasol',
          explicacion:
            'Necesitan mucha menos agua que la soya o el maíz y aguantan temperaturas altas sin perder la cosecha.',
        },
        {
          etapa: 'Paso 2 • Proteger la humedad de la tierra',
          cultivo: 'Crotalaria o Fréjol Caupí (abono verde)',
          explicacion:
            'Cubren el suelo como una alfombra natural para que el sol no evapore la poca agua que queda y devuelven nutrientes.',
        },
        {
          etapa: 'Regla clave • Cero fuego en la parcela',
          cultivo: 'Dejar el rastrojo picado encima',
          explicacion:
            'No quemar los restos de cosecha; ese colchón vegetal guarda hasta un 30% más de humedad para la siguiente siembra.',
        },
      ];
    } else if (focos >= 150) {
      resumenSuelo =
        '🔴 Zona con fuerte desgaste por quemas: El fuego repetido en las parcelas de este municipio quemó los nutrientes superficiales y dejó la tierra débil.';
      pasosAgricultor = [
        {
          etapa: '1ra Siembra • Recuperar la fertilidad de la tierra',
          cultivo: 'Mucuna ceniza o Crotalaria (abonos verdes)',
          explicacion:
            'Actúan como fertilizante natural: sus raíces atrapan nitrógeno del aire y devuelven vida al suelo quemado sin gastar en químicos.',
        },
        {
          etapa: '2da Siembra • Crear colchón protector sin quemar',
          cultivo: 'Sorgo forrajero o pasto Brachiaria',
          explicacion:
            'Producen abundante hoja y tallo que, al cortarse sin quemar, protegen el suelo del sol fuerte y evitan que se endurezca.',
        },
        {
          etapa: '3ra Siembra • Volver al cultivo comercial con buen rendimiento',
          cultivo: 'Soya o Maíz en siembra directa',
          explicacion:
            'Con la tierra ya recuperada y húmeda, se siembra directo encima de la cobertura anterior logrando mejor cosecha.',
        },
      ];
    } else if (focos >= 30) {
      resumenSuelo =
        '🟠 Desgaste moderado en la zona: Se registraron varias quemas cercanas. Conviene alternar cultivos para que la parcela no pierda fuerza ni humedad.';
      pasosAgricultor = [
        {
          etapa: '1ra Siembra • Alternar tipo de raíz',
          cultivo: 'Maíz o Sorgo',
          explicacion:
            'Sus raíces profundas aflojan la tierra de forma natural y aprovechan mejor el agua de lluvia.',
        },
        {
          etapa: '2da Siembra • Devolver nutrientes al suelo',
          cultivo: 'Soya o Fréjol',
          explicacion:
            'Al alternar con leguminosas se cortan las plagas del cultivo anterior y se reponen los nutrientes del suelo.',
        },
      ];
    } else {
      resumenSuelo =
        '🟢 Suelo en buen estado: Casi no hubo quemas agrícolas en la zona. La tierra conserva sus nutrientes naturales y buena retención de humedad.';
      pasosAgricultor = [
        {
          etapa: 'Siembra Principal • Aprovechar el buen estado del suelo',
          cultivo: 'Soya, Maíz o Arroz (según lluvia local)',
          explicacion:
            'El suelo tiene buenas condiciones para cultivos comerciales sin necesidad de recuperación previa.',
        },
        {
          etapa: 'Siguiente Ciclo • Mantener la tierra fértil',
          cultivo: 'Girasol o Sorgo sin quema de rastrojo',
          explicacion:
            'Rotar de cultivo cada temporada evita que el suelo se agote y mantiene altos los rendimientos año tras año.',
        },
      ];
    }

    return {
      lluviaAjustada,
      humedadAjustada,
      saludAjustada,
      resumenSuelo,
      pasosAgricultor,
    };
  }, [seleccionado, simulacionSequia, climaVivo]);

  // Generar Informe Oficial en PDF (Ficha Técnica Visual con Logo NASA Agro-Bolivia)
  const descargarFichaCampo = () => {
    if (!seleccionado || !diagnosticoClaro) return;

    const ubicacionTexto = puntoParcela
      ? `Parcela GPS (${puntoParcela.lat.toFixed(4)}, ${puntoParcela.lon.toFixed(4)}) • Ref: ${seleccionado.municipio}`
      : `Municipio de ${seleccionado.municipio} (${seleccionado.departamento})`;

    const fechaHoy = new Date().toLocaleDateString('es-BO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const colorEstado =
      diagnosticoClaro.saludAjustada < 40
        ? '#dc2626'
        : diagnosticoClaro.saludAjustada < 70
        ? '#d97706'
        : '#16a34a';

    const pasosHTML = diagnosticoClaro.pasosAgricultor
      .map(
        (p, idx) => `
        <div class="paso-card">
          <div class="paso-etapa">PASO ${idx + 1} — ${p.etapa.toUpperCase()}</div>
          <div class="paso-cultivo">${p.cultivo}</div>
          <div class="paso-desc">${p.explicacion}</div>
        </div>
      `
      )
      .join('');

    const ventanaPDF = window.open('', '_blank', 'width=850,height=950');
    if (!ventanaPDF) {
      alert('Por favor permite las ventanas emergentes para generar el informe PDF.');
      return;
    }

    ventanaPDF.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Informe_Parcela_${seleccionado.municipio.replace(/\s+/g, '_')}_NASA_Agro_Bolivia</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
          body { background: #f1f5f9; color: #0f172a; padding: 24px; }
          .hoja {
            max-width: 760px; margin: 0 auto; background: #ffffff;
            border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border: 1px solid #cbd5e1;
          }
          .header {
            background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
            color: #ffffff; padding: 22px 28px; display: flex;
            justify-content: space-between; align-items: center;
          }
          .brand { display: flex; align-items: center; gap: 14px; }
          .brand-text h1 { font-size: 20px; letter-spacing: 0.04em; font-weight: 800; }
          .brand-text p { font-size: 11.5px; color: #93c5fd; margin-top: 2px; }
          .meta { text-align: right; font-size: 11.5px; color: #cbd5e1; }
          .meta strong { color: #ffffff; display: block; font-size: 13px; margin-bottom: 3px; }

          .subbar {
            background: #f8fafc; border-bottom: 1px solid #e2e8f0;
            padding: 14px 28px; display: flex; justify-content: space-between; align-items: center;
          }
          .ubicacion h2 { font-size: 17px; color: #0f172a; }
          .ubicacion span { font-size: 12.5px; color: #475569; }
          .badge {
            background: ${colorEstado}; color: #fff; font-weight: 700;
            font-size: 11.5px; padding: 6px 12px; border-radius: 20px;
          }

          .contenido { padding: 22px 28px; }
          .sec-titulo {
            font-size: 12.5px; font-weight: 800; color: #1e3a8a;
            letter-spacing: 0.05em; text-transform: uppercase;
            border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px;
          }

          .grid-kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .kpi {
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 11px;
          }
          .kpi-label { font-size: 11px; font-weight: 700; color: #475569; }
          .kpi-src { font-size: 9px; color: #0284c7; font-weight: 600; margin-top: 1px; }
          .kpi-val { font-size: 19px; font-weight: 800; color: #0f172a; margin: 5px 0 3px; }
          .kpi-hint { font-size: 10px; color: #64748b; line-height: 1.3; }

          .clima-box {
            background: #eff6ff; border-left: 4px solid #2563eb;
            padding: 12px 15px; border-radius: 6px; margin-bottom: 18px; font-size: 12.5px;
          }
          .clima-box strong { color: #1e40af; }

          .alerta-suelo {
            background: #fff7ed; border: 1px solid #fdba74; border-left: 4px solid #ea580c;
            padding: 12px 15px; border-radius: 6px; margin-bottom: 20px;
            font-size: 12.5px; line-height: 1.45; color: #7c2d12;
          }

          .paso-card {
            border: 1px solid #bbf7d0; background: #f0fdf4; border-left: 4px solid #16a34a;
            border-radius: 8px; padding: 12px 15px; margin-bottom: 10px;
          }
          .paso-etapa { font-size: 10.5px; font-weight: 800; color: #15803d; }
          .paso-cultivo { font-size: 14.5px; font-weight: 800; color: #0f172a; margin: 3px 0; }
          .paso-desc { font-size: 12px; color: #334155; line-height: 1.4; }

          .footer {
            background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 28px;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 10.5px; color: #64748b;
          }

          .barra-acciones {
            max-width: 760px; margin: 0 auto 14px; display: flex; justify-content: flex-end; gap: 10px;
          }
          .btn-print {
            background: #0284c7; color: #fff; border: none; padding: 9px 16px;
            border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer;
          }
          @media print {
            body { background: #fff; padding: 0; }
            .hoja { box-shadow: none; border: none; }
            .barra-acciones { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="barra-acciones">
          <button class="btn-print" onclick="window.print()">🖨️ Guardar como PDF / Imprimir Ficha</button>
        </div>

        <div class="hoja">
          <div class="header">
            <div class="brand">
              <!-- Emblema Vectorial NASA Agro-Bolivia -->
              <div class="brand">
              <img 
                src="${window.location.origin}/logo.jpg" 
                alt="Logo NASA Agro-Bolivia" 
                style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #fff;" 
              />
              <div class="brand-text">
                <h1>NASA AGRO-BOLIVIA</h1>
                <p>Diagnóstico Satelital de Suelos y Guía de Siembra Regenerativa</p>
              </div>
            </div>
              <div class="brand-text">
                <h1>NASA AGRO-BOLIVIA</h1>
                <p>Diagnóstico Satelital de Suelos y Guía de Siembra Regenerativa</p>
              </div>
            </div>
            <div class="meta">
              <strong>FICHA TÉCNICA DE PARCELA</strong>
              Fecha: ${fechaHoy}<br/>
              Fuentes: NASA FIRMS • NASA POWER • MapBiomas
            </div>
          </div>

          <div class="subbar">
            <div class="ubicacion">
              <h2>${puntoParcela ? `Parcela en ${seleccionado.municipio}` : seleccionado.municipio}</h2>
              <span>${ubicacionTexto}</span>
            </div>
            <div class="badge">SALUD DEL SUELO: ${diagnosticoClaro.saludAjustada} / 100</div>
          </div>

          <div class="contenido">
            <div class="sec-titulo">1. Telemetría Satelital de la Ubicación</div>
            <div class="grid-kpi">
              <div class="kpi">
                <div class="kpi-label">🔥 Quemas en Zona</div>
                <div class="kpi-src">NASA FIRMS + MapBiomas</div>
                <div class="kpi-val" style="color:#dc2626">${seleccionado.focos_agricolas_2025} focos</div>
                <div class="kpi-hint">Focos en cultivos detectados en el municipio (2025).</div>
              </div>
              <div class="kpi">
                <div class="kpi-label">🌱 Salud de Tierra</div>
                <div class="kpi-src">Carbono Orgánico / Fuego</div>
                <div class="kpi-val" style="color:#16a34a">${diagnosticoClaro.saludAjustada} / 100</div>
                <div class="kpi-hint">Fertilidad superficial estimada de la parcela.</div>
              </div>
              <div class="kpi">
                <div class="kpi-label">☀️ Calor Máximo</div>
                <div class="kpi-src">NASA POWER • T2M_MAX</div>
                <div class="kpi-val" style="color:#d97706">${climaVivo ? climaVivo.temp_max_reciente_c : seleccionado.nasa_temp_max_c} °C</div>
                <div class="kpi-hint">Temperatura máxima reciente registrada.</div>
              </div>
              <div class="kpi">
                <div class="kpi-label">💧 Agua en Raíces</div>
                <div class="kpi-src">NASA POWER • GWETROOT</div>
                <div class="kpi-val" style="color:#0284c7">${diagnosticoClaro.humedadAjustada}%</div>
                <div class="kpi-hint">Humedad radicular (mínimo 55% para siembra).</div>
              </div>
            </div>

            ${
              climaVivo
                ? `<div class="clima-box">
                    <strong>🌦️ Balance Hídrico en Vivo (Últimos 60 días — NASA POWER):</strong>
                    ${climaVivo.fase_enso_local}. Se registraron <strong>${climaVivo.lluvia_60d_real_mm} mm</strong> de lluvia (normal histórica: ${climaVivo.lluvia_60d_esperada_mm} mm).<br/>
                    <strong>📅 Meses óptimos para sembrar:</strong> ${climaVivo.ventana_optima_siembra}
                  </div>`
                : ''
            }

            <div class="sec-titulo">2. Diagnóstico Agronómico</div>
            <div class="alerta-suelo">${diagnosticoClaro.resumenSuelo}</div>

            <div class="sec-titulo">3. Plan de Acción Recomendado para el Agricultor</div>
            ${pasosHTML}
          </div>

          <div class="footer">
            <span>Generado por <strong>NASA Agro-Bolivia</strong> • Uso libre para productores y técnicos</span>
            <span>Coordenadas: ${latActiva?.toFixed(4)}, ${lonActiva?.toFixed(4)}</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `);
    ventanaPDF.document.close();
  };

  if (cargando) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: '#0b1120' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>🛰️ Cargando datos satelitales de Bolivia...</h2>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Sincronizando 343 municipios y soporte offline</p>
        </div>
      </div>
    );
  }

  const maxLluviaChart = climaVivo
    ? Math.max(...climaVivo.serie_mensual.map((m) => m.lluvia_mm), 200)
    : 250;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* PANEL IZQUIERDO */}
      <aside
        style={{
          width: '315px',
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          padding: '15px',
          gap: '11px',
          overflowY: 'auto',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.07em' }}>
              NASA SPACE APPS • BOLIVIA
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '10px',
                fontWeight: 700,
                background: modoOffline ? '#b45309' : '#15803d',
                color: '#fff',
              }}
            >
              {modoOffline ? '📴 Modo Offline' : '🟢 Caché Lista'}
            </span>
          </div>
          <h1 style={{ fontSize: '17px', marginTop: '4px', lineHeight: 1.3 }}>
            Monitor de Quemas y Guía por Parcela
          </h1>
        </div>

        {/* BUSCADOR DE PARCELA POR COORDENADA GPS */}
        <form
          onSubmit={handleBuscarCoordenada}
          style={{ background: '#1e293b', padding: '9px', borderRadius: '8px', border: '1px solid #334155' }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', marginBottom: '5px' }}>
            📍 Ubicar mi Parcela por GPS (Lat, Lon)
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <input
              type="text"
              placeholder="-17.7022, -60.4238"
              value={coordInput}
              onChange={(e) => setCoordInput(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '5px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#f8fafc',
                fontSize: '12px',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '6px 10px',
                borderRadius: '5px',
                border: 'none',
                background: '#0284c7',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Ir
            </button>
          </div>
        </form>

        {resumen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#1e293b', padding: '9px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quemas en Cultivos</div>
              <div style={{ fontSize: '19px', fontWeight: 700, color: '#f87171' }}>
                {resumen.total_focos_agricolas_2025.toLocaleString()}
              </div>
            </div>
            <div style={{ background: '#1e293b', padding: '9px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Municipios Críticos</div>
              <div style={{ fontSize: '19px', fontWeight: 700, color: '#fb923c' }}>
                {resumen.municipios_riesgo_critico} / 343
              </div>
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Buscar municipio o departamento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#f8fafc',
            fontSize: '13px',
          }}
        />
        <select
          value={filtroRiesgo}
          onChange={(e) => setFiltroRiesgo(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#f8fafc',
            fontSize: '13px',
          }}
        >
          <option value="TODOS">Todos los municipios</option>
          <option value="CRÍTICO">🔴 Daño Alto por Quemas</option>
          <option value="MODERADO">🟠 Daño Moderado</option>
          <option value="BAJO / ESTABLE">🟢 Suelo Estable / Sin Quemas</option>
        </select>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
            Municipios ({municipiosFiltrados.length})
          </div>
          {municipiosFiltrados.slice(0, 40).map((m, idx) => (
            <button
              key={`${m.municipio}-${idx}`}
              onClick={() => {
                setSeleccionado(m);
                setPuntoParcela(null);
                setSimulacionSequia(0);
                setMapaCentro([m.lat, m.lon]);
                setMapaZoom(9);
              }}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: '6px',
                border: seleccionado?.municipio === m.municipio ? '1px solid #38bdf8' : '1px solid #1e293b',
                background: seleccionado?.municipio === m.municipio ? '#1e3a5f' : '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{m.municipio}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.departamento}</div>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: getColor(m.focos_agricolas_2025),
                  color: '#fff',
                }}
              >
                {m.focos_agricolas_2025}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* CENTRO: MAPA CON MODO PARCELA Y VISTA SATELITAL */}
      <main style={{ flex: 1, position: 'relative' }}>
        {/* BARRA FLOTANTE DE CONTROL DE ESCALA */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            zIndex: 1000,
            display: 'flex',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.92)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid #334155',
          }}
        >
          <button
            onClick={() => {
              const nuevoModo = !modoParcela;
              setModoParcela(nuevoModo);
              if (!nuevoModo) setPuntoParcela(null); // Limpia el pin al volver a vista municipal
            }}
            style={{
              padding: '6px 11px',
              borderRadius: '6px',
              border: 'none',
              background: modoParcela ? '#0284c7' : '#1e293b',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {modoParcela
              ? '📍 Modo Parcela ACTIVO (Clic para volver a Municipio)'
              : '🏛️ Modo Municipio ACTIVO (Clic para marcar Parcela)'}
          </button>

          <button
            onClick={() => setVistaSatelite(!vistaSatelite)}
            style={{
              padding: '6px 11px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: vistaSatelite ? '#15803d' : '#1e293b',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {vistaSatelite ? '🛰️ Satélite Real (Ver Parcelas)' : '🗺️ Mapa de Riesgo'}
          </button>
        </div>

        <MapContainer center={[-16.5, -64.5]} zoom={6} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; Esri &copy; OpenStreetMap contributors'
            url={
              vistaSatelite
                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
            }
          />
          <ControlVistaMapa centro={mapaCentro} zoom={mapaZoom} />
          <ManejadorClicMapa
            modoParcela={modoParcela}
            onSeleccionarPunto={(lat, lon) =>
              setPuntoParcela({ lat, lon, municipioRef: seleccionado?.municipio || 'Parcela' })
            }
          />
          {geoData && (
            <GeoJSON
              key={`${filtroRiesgo}-${seleccionado?.municipio}-${vistaSatelite}`}
              data={geoData}
              style={styleFeature}
              onEachFeature={onEachMunicipio}
            />
          )}
          {puntoParcela && (
            <Marker position={[puntoParcela.lat, puntoParcela.lon]} icon={pinParcela}>
              <Popup>
                <strong>Parcela Seleccionada</strong>
                <br />
                Lat: {puntoParcela.lat.toFixed(4)}, Lon: {puntoParcela.lon.toFixed(4)}
              </Popup>
            </Marker>
          )}
        </MapContainer>

        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.94)',
            padding: '11px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '5px' }}>Quemas detectadas en cultivos (2025)</div>
          {[
            ['#991b1b', 'Más de 300 quemas (Muy grave)'],
            ['#dc2626', '150 a 299 quemas (Alto)'],
            ['#ea580c', '50 a 149 quemas (Moderado)'],
            ['#eab308', '10 a 49 quemas (Bajo)'],
            ['#3b82f6', '1 a 9 quemas (Mínimo)'],
          ].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
              <span style={{ width: 11, height: 11, background: color, display: 'inline-block', borderRadius: 2 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </main>

      {/* PANEL DERECHO */}
      {seleccionado && diagnosticoClaro && (
        <aside
          style={{
            width: '475px',
            background: '#0f172a',
            borderLeft: '1px solid #1e293b',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            overflowY: 'auto',
          }}
        >
          {/* CABECERA */}
          <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11.5px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  background: puntoParcela
                    ? '#0284c7'
                    : seleccionado.nivel_riesgo === 'CRÍTICO'
                    ? '#991b1b'
                    : seleccionado.nivel_riesgo === 'MODERADO'
                    ? '#b45309'
                    : '#15803d',
                }}
              >
                {puntoParcela ? '📍 ANÁLISIS PUNTUAL DE PARCELA' : `ESTADO MUNICIPAL: ${seleccionado.nivel_riesgo}`}
              </span>

              <button
                onClick={descargarFichaCampo}
                style={{
                  padding: '6px 11px',
                  borderRadius: '6px',
                  border: '1px solid #38bdf8',
                  background: 'rgba(56, 189, 248, 0.14)',
                  color: '#38bdf8',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📄 Descargar Informe PDF
              </button>
              <a
                  href="https://github.com/ivantoledo29/nasa-agro-bolivia"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 11px',
                    borderRadius: '6px',
                    border: '1px solid #94a3b8',
                    background: 'rgba(148, 163, 184, 0.14)',
                    color: '#f8fafc',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                  title="View source code on GitHub"
                >
                  <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  <span>GitHub</span>
                </a>
            </div>

            <h2 style={{ fontSize: '22px', marginTop: '8px' }}>
              {puntoParcela ? `Parcela en ${seleccionado.municipio}` : seleccionado.municipio}
            </h2>
            <p style={{ fontSize: '12.5px', color: '#94a3b8' }}>
              {seleccionado.departamento} • Coordenada GPS:{' '}
              <b>
                {latActiva?.toFixed(4)}, {lonActiva?.toFixed(4)}
              </b>
            </p>
          </div>

          {/* SECCIÓN 1: TELEMETRÍA CON FUENTES */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
              🛰️ ¿QUÉ VEN LOS SATÉLITES DE LA NASA EN ESTA UBICACIÓN?
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.4 }}>
              Combina el historial de fuego del municipio con la humedad y calor exactos de esta coordenada GPS:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>🔥 Quemas en la Zona</div>
                <div style={{ fontSize: '10.5px', color: '#38bdf8', fontWeight: 600 }}>
                  (NASA FIRMS + MapBiomas Col. 4)
                </div>
                <div style={{ fontSize: '21px', fontWeight: 800, color: '#f87171', margin: '4px 0' }}>
                  {seleccionado.focos_agricolas_2025} focos
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                  Incendios detectados en cultivos del municipio (2025).
                </div>
              </div>

              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>🌱 Salud de la Tierra</div>
                <div style={{ fontSize: '10.5px', color: '#38bdf8', fontWeight: 600 }}>
                  (Índice Carbono Orgánico / Fuego)
                </div>
                <div style={{ fontSize: '21px', fontWeight: 800, color: '#4ade80', margin: '4px 0' }}>
                  {diagnosticoClaro.saludAjustada} / 100
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                  Fertilidad superficial estimada. Menos de 50 indica suelo agotado.
                </div>
              </div>

              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>☀️ Calor Máximo</div>
                <div style={{ fontSize: '10.5px', color: '#38bdf8', fontWeight: 600 }}>
                  (NASA POWER • T2M_MAX)
                </div>
                <div style={{ fontSize: '21px', fontWeight: 800, color: '#fbbf24', margin: '4px 0' }}>
                  {climaVivo ? climaVivo.temp_max_reciente_c : seleccionado.nasa_temp_max_c} °C
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                  Si pasa de 38 °C, las plantas sufren estrés y se seca rápido la parcela.
                </div>
              </div>

              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>💧 Agua en las Raíces</div>
                <div style={{ fontSize: '10.5px', color: '#38bdf8', fontWeight: 600 }}>
                  (NASA POWER • GWETROOT)
                </div>
                <div style={{ fontSize: '21px', fontWeight: 800, color: '#38bdf8', margin: '4px 0' }}>
                  {diagnosticoClaro.humedadAjustada}%
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                  Humedad en zona radicular. Se necesita más de 55% para sembrar seguro.
                </div>
              </div>
            </div>
          </div>

          {/* CLIMA EN VIVO */}
          {cargandoClima ? (
            <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#38bdf8' }}>
              🛰️ Consultando lluvias en vivo para la coordenada {latActiva?.toFixed(3)}, {lonActiva?.toFixed(3)}...
            </div>
          ) : (
            climaVivo && (
              <div
                style={{
                  background: '#1e293b',
                  padding: '13px',
                  borderRadius: '8px',
                  borderLeft: `4px solid ${
                    climaVivo.anomalia_lluvia_60d_pct <= -25
                      ? '#ef4444'
                      : climaVivo.anomalia_lluvia_60d_pct >= 25
                      ? '#38bdf8'
                      : '#4ade80'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                    🌦️ CLIMA EN TIEMPO REAL (60 DÍAS)
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#7dd3fc',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}
                  >
                    Fuente: NASA POWER Live
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '5px', color: '#f8fafc' }}>
                  {climaVivo.fase_enso_local}
                </div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.4 }}>
                  Cayeron <b>{climaVivo.lluvia_60d_real_mm} mm</b> de lluvia (NASA PRECTOTCORR) en los últimos 2 meses; lo normal para esta fecha es{' '}
                  <b>{climaVivo.lluvia_60d_esperada_mm} mm</b>.
                </div>
                <div style={{ fontSize: '13px', color: '#4ade80', marginTop: '8px', fontWeight: 700 }}>
                  📅 Meses óptimos para sembrar: {climaVivo.ventana_optima_siembra}
                </div>
              </div>
            )
          )}

          {/* SIMULADOR */}
          <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
              <span>🎛️ Probar escenario de sequía</span>
              <span style={{ color: '#fbbf24' }}>-{simulacionSequia}% de lluvia</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={simulacionSequia}
              onChange={(e) => setSimulacionSequia(Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px', cursor: 'pointer' }}
            />
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Mueve la barra para ver qué cultivos convienen si llueve menos de lo normal.
            </div>
          </div>

          {/* RESUMEN SENCILLO */}
          <div
            style={{
              background: 'rgba(234, 88, 12, 0.16)',
              border: '1px solid #ea580c',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: 1.45,
            }}
          >
            {diagnosticoClaro.resumenSuelo}
          </div>

          {/* PLAN DE ROTACIÓN */}
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#4ade80', marginBottom: '4px' }}>
              👨‍🌾 ¿QUÉ DEBE HACER EL AGRICULTOR EN SU PARCELA?
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.4 }}>
              Secuencia recomendada según los datos satelitales de arriba para recuperar la tierra y asegurar la cosecha:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {diagnosticoClaro.pasosAgricultor.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #4ade80',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#4ade80', fontWeight: 700 }}>
                    {item.etapa}
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#f8fafc', margin: '3px 0' }}>
                    {item.cultivo}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.4 }}>
                    {item.explicacion}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GRÁFICO MENSUAL */}
          {climaVivo && (
            <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>📊 Lluvias y Calor por Mes (2016–2025)</span>
                <span style={{ fontSize: '10px', color: '#7dd3fc' }}>NASA POWER Climatology</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: '4px',
                  alignItems: 'end',
                  height: '95px',
                  paddingTop: '14px',
                }}
              >
                {climaVivo.serie_mensual.map((m) => {
                  const alturaPct = Math.min(100, Math.round((m.lluvia_mm / maxLluviaChart) * 100));
                  return (
                    <div
                      key={m.mes}
                      title={`${m.mes}: ${m.lluvia_mm} mm de lluvia | Calor máx. ${m.temp_max}°C`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}
                    >
                      <span style={{ fontSize: '9.5px', color: '#fbbf24', marginBottom: '2px' }}>
                        {Math.round(m.temp_max)}°
                      </span>
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(6, alturaPct)}%`,
                            background: m.humedad_suelo >= 55 && m.lluvia_mm >= 90 ? '#38bdf8' : '#475569',
                            borderRadius: '3px 3px 0 0',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{m.mes[0]}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                * Las barras celestes muestran los meses con suficiente agua para sembrar.
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}