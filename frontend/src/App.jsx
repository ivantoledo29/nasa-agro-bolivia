import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';

const API_URL = 'http://127.0.0.1:8000';

export default function App() {
  const [geoData, setGeoData] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState('TODOS');
  const [simulacionSequia, setSimulacionSequia] = useState(0); // % reducción de lluvia simulada
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/municipios`).then((r) => r.json()),
      fetch(`${API_URL}/api/resumen`).then((r) => r.json()),
    ])
      .then(([geo, res]) => {
        setGeoData(geo);
        setResumen(res);
        if (res?.top_10_municipios?.length > 0) {
          setSeleccionado(res.top_10_municipios[0]);
        }
        setCargando(false);
      })
      .catch((err) => {
        console.error('Error conectando con FastAPI:', err);
        setCargando(false);
      });
  }, []);

  // Color por intensidad de focos de calor en zonas agrícolas
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
    const cumpleFiltro =
      filtroRiesgo === 'TODOS' || props.nivel_riesgo === filtroRiesgo;

    return {
      fillColor: getColor(props.focos_agricolas_2025),
      weight: esSeleccionado ? 3 : 0.8,
      opacity: 1,
      color: esSeleccionado ? '#38bdf8' : '#475569',
      fillOpacity: cumpleFiltro ? 0.78 : 0.12,
    };
  };

  const onEachMunicipio = (feature, layer) => {
    const p = feature.properties;
    layer.bindTooltip(
      `<strong>${p.municipio}</strong> (${p.departamento})<br/>Focos agrícolas 2025: <b>${p.focos_agricolas_2025}</b><br/>Riesgo: ${p.nivel_riesgo}`,
      { sticky: true }
    );
    layer.on({
      click: () => {
        setSeleccionado(p);
        setSimulacionSequia(0);
      },
    });
  };

  // Lista filtrada para búsqueda rápida
  const municipiosFiltrados = useMemo(() => {
    if (!geoData) return [];
    return geoData.features
      .map((f) => f.properties)
      .filter((p) => {
        const matchTexto =
          p.municipio.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.departamento.toLowerCase().includes(busqueda.toLowerCase());
        const matchRiesgo =
          filtroRiesgo === 'TODOS' || p.nivel_riesgo === filtroRiesgo;
        return matchTexto && matchRiesgo;
      })
      .sort((a, b) => b.focos_agricolas_2025 - a.focos_agricolas_2025);
  }, [geoData, busqueda, filtroRiesgo]);

  // Cálculo dinámico de simulación climática sobre el municipio seleccionado
  const diagnosticoSimulado = useMemo(() => {
    if (!seleccionado) return null;
    const lluviaAjustada = Math.round(
      seleccionado.nasa_precip_anual_mm * (1 - simulacionSequia / 100)
    );
    const humedadAjustada = Math.max(
      12,
      +(seleccionado.nasa_humedad_suelo_pct * (1 - (simulacionSequia * 0.7) / 100)).toFixed(1)
    );
    const saludAjustada = Math.max(
      10,
      Math.round(seleccionado.indice_salud_suelo - simulacionSequia * 0.35)
    );

    let rotacionSimulada = seleccionado.plan_rotacion.split(' | ');
    if (simulacionSequia >= 25) {
      rotacionSimulada = [
        'Ciclo 1 (Emergencia Hídrica): Sorgo granífero o Mijo perla (bajo requerimiento hídrico)',
        'Ciclo 2 (Cobertura): Crotalaria juncea / Lablab para retener humedad radicular',
        'Manejo: Cero labranza y prohibición total de quema de rastrojo',
      ];
    }

    return {
      lluviaAjustada,
      humedadAjustada,
      saludAjustada,
      rotacionSimulada,
    };
  }, [seleccionado, simulacionSequia]);

  if (cargando) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: '#0b1120' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>🛰️ Cargando Geodatabase NASA FIRMS + MapBiomas Bolivia 2025...</h2>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Sincronizando 343 municipios con NASA POWER</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* PANEL IZQUIERDO: CONTROLES Y RANKING */}
      <aside
        style={{
          width: '340px',
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '14px',
          overflowY: 'auto',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.08em' }}>
            NASA SPACE APPS • AGRO-BOLIVIA
          </span>
          <h1 style={{ fontSize: '18px', marginTop: '4px', lineHeight: 1.3 }}>
            Monitor de Quemas Agrícolas y Rotación de Suelos
          </h1>
        </div>

        {/* KPIs Nacionales */}
        {resumen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Focos en Cultivos 2025</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f87171' }}>
                {resumen.total_focos_agricolas_2025.toLocaleString()}
              </div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Municipios Críticos</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c' }}>
                {resumen.municipios_riesgo_critico} / 343
              </div>
            </div>
          </div>
        )}

        {/* Buscador y Filtro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            <option value="TODOS">Todos los niveles de riesgo</option>
            <option value="CRÍTICO">🔴 Riesgo Crítico (≥150 focos)</option>
            <option value="MODERADO">🟠 Riesgo Moderado (30-149 focos)</option>
            <option value="BAJO / ESTABLE">🟢 Bajo / Estable (&lt;30 focos)</option>
          </select>
        </div>

        {/* Lista de Municipios */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
            Ranking por Incidencia Agrícola ({municipiosFiltrados.length})
          </div>
          {municipiosFiltrados.slice(0, 40).map((m, idx) => (
            <button
              key={`${m.municipio}-${idx}`}
              onClick={() => {
                setSeleccionado(m);
                setSimulacionSequia(0);
              }}
              style={{
                textAlign: 'left',
                padding: '9px 10px',
                borderRadius: '6px',
                border:
                  seleccionado?.municipio === m.municipio
                    ? '1px solid #38bdf8'
                    : '1px solid #1e293b',
                background:
                  seleccionado?.municipio === m.municipio ? '#1e3a5f' : '#1e293b',
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
                  padding: '2px 7px',
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

      {/* CENTRO: MAPA INTERACTIVO DE BOLIVIA */}
      <main style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={[-16.5, -64.5]} zoom={6} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; Esri &copy; OpenStreetMap contributors'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          />
          {geoData && (
            <GeoJSON
              key={`${filtroRiesgo}-${seleccionado?.municipio}`}
              data={geoData}
              style={styleFeature}
              onEachFeature={onEachMunicipio}
            />
          )}
        </MapContainer>

        {/* Leyenda flotante */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.92)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>Focos en Tierras Agrícolas (2025)</div>
          {[
            ['#991b1b', '≥ 300 focos (Severo)'],
            ['#dc2626', '150 - 299 (Crítico)'],
            ['#ea580c', '50 - 149 (Alto)'],
            ['#eab308', '10 - 49 (Moderado)'],
            ['#3b82f6', '1 - 9 (Bajo)'],
            ['#1e293b', '0 focos registrados'],
          ].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
              <span style={{ width: 12, height: 12, background: color, display: 'inline-block', borderRadius: 2 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </main>

      {/* PANEL DERECHO: DIAGNÓSTICO NASA POWER Y SIMULADOR DE ROTACIÓN */}
      {seleccionado && diagnosticoSimulado && (
        <aside
          style={{
            width: '380px',
            background: '#0f172a',
            borderLeft: '1px solid #1e293b',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
          }}
        >
          <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                background:
                  seleccionado.nivel_riesgo === 'CRÍTICO'
                    ? '#991b1b'
                    : seleccionado.nivel_riesgo === 'MODERADO'
                    ? '#b45309'
                    : '#15803d',
              }}
            >
              RIESGO {seleccionado.nivel_riesgo}
            </span>
            <h2 style={{ fontSize: '20px', marginTop: '8px' }}>{seleccionado.municipio}</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
              Departamento de {seleccionado.departamento} • Lat {seleccionado.lat}, Lon {seleccionado.lon}
            </p>
          </div>

          {/* Métricas Satelitales NASA */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
              🛰️ TELEMETRÍA NASA FIRMS &amp; NASA POWER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quemas en Cultivos</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f87171' }}>
                  {seleccionado.focos_agricolas_2025} focos
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Salud Estimada Suelo</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>
                  {diagnosticoSimulado.saludAjustada} / 100
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Temp. Máx. Media</div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {seleccionado.nasa_temp_max_c} °C
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Precipitación Anual</div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {diagnosticoSimulado.lluviaAjustada} mm
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Humedad Zona Radicular (NASA GWETROOT)</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
                  {diagnosticoSimulado.humedadAjustada}%
                </div>
              </div>
            </div>
          </div>

          {/* Simulador Predictivo de Estrés Hídrico */}
          <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
              <span>🌡️ Simulador Déficit Hídrico</span>
              <span style={{ color: '#fbbf24' }}>-{simulacionSequia}% lluvia</span>
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
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              Desliza para simular una temporada más seca y recalcular la rotación óptima.
            </div>
          </div>

          {/* Alerta Agronómica */}
          <div
            style={{
              background: 'rgba(234, 88, 12, 0.15)',
              border: '1px solid #ea580c',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            <strong>Diagnóstico de Degradación:</strong> {seleccionado.alerta_agronomica}
          </div>

          {/* Plan de Rotación de Cultivos */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#4ade80', marginBottom: '8px' }}>
              🌱 PLAN DE ROTACIÓN REGENERATIVA RECOMENDADO
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {diagnosticoSimulado.rotacionSimulada.map((paso, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    padding: '10px',
                    borderRadius: '6px',
                    borderLeft: '3px solid #4ade80',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  {paso}
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
