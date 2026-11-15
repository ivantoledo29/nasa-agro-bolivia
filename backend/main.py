from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import requests
import json

app = FastAPI(title="NASA Agro-Bolivia API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEOJSON_PATH = "data/municipios_nasa_ready.geojson"
with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
    GEOJSON_DATA = json.load(f)

MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

@app.get("/")
def root():
    return {"status": "online", "proyecto": "NASA Agro-Bolivia API v2.1", "docs": "/docs"}

@app.get("/api/municipios")
def obtener_mapa_municipios():
    return GEOJSON_DATA

@app.get("/api/resumen")
def obtener_resumen_nacional():
    lista = [feat["properties"] for feat in GEOJSON_DATA["features"]]
    top_10 = sorted(lista, key=lambda x: x["focos_agricolas_2025"], reverse=True)[:10]
    total_focos = sum(x["focos_agricolas_2025"] for x in lista)
    criticos = sum(1 for x in lista if x["nivel_riesgo"] == "CRÍTICO")
    return {
        "total_focos_agricolas_2025": total_focos,
        "municipios_riesgo_critico": criticos,
        "top_10_municipios": top_10,
    }

@app.get("/api/clima-vivo")
def obtener_serie_y_prediccion(lat: float, lon: float):
    """
    Consulta NASA POWER en vivo para una coordenada exacta (parcela o centroide municipal):
    1) Serie histórica mensual (2016-2025) -> Climatología normal y ventana de siembra
    2) Últimos 60 días reales -> Anomalía ENSO local (patrón El Niño vs La Niña)
    """
    url_hist = (
        "https://power.larc.nasa.gov/api/temporal/monthly/point"
        f"?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT"
        f"&community=AG&longitude={lon:.4f}&latitude={lat:.4f}"
        f"&start=2016&end=2025&format=JSON"
    )

    fecha_fin = datetime.utcnow() - timedelta(days=5)
    fecha_ini = fecha_fin - timedelta(days=60)
    url_diario = (
        "https://power.larc.nasa.gov/api/temporal/daily/point"
        f"?parameters=T2M_MAX,PRECTOTCORR,GWETROOT"
        f"&community=AG&longitude={lon:.4f}&latitude={lat:.4f}"
        f"&start={fecha_ini.strftime('%Y%m%d')}&end={fecha_fin.strftime('%Y%m%d')}&format=JSON"
    )

    try:
        r_hist = requests.get(url_hist, timeout=12).json()["properties"]["parameter"]
        r_diario = requests.get(url_diario, timeout=12).json()["properties"]["parameter"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error consultando NASA POWER: {str(e)}")

    serie_mensual = []
    for m in range(1, 13):
        mm = f"{m:02d}"
        vals_lluvia = [v * 30.4 for k, v in r_hist["PRECTOTCORR"].items() if k.endswith(mm) and v > -900]
        vals_tmax = [v for k, v in r_hist["T2M_MAX"].items() if k.endswith(mm) and v > -900]
        vals_tmin = [v for k, v in r_hist["T2M_MIN"].items() if k.endswith(mm) and v > -900]
        vals_hum = [v * 100 for k, v in r_hist["GWETROOT"].items() if k.endswith(mm) and v > -900]

        serie_mensual.append({
            "mes": MESES_ES[m - 1],
            "mes_num": m,
            "lluvia_mm": round(sum(vals_lluvia) / max(1, len(vals_lluvia)), 1),
            "temp_max": round(sum(vals_tmax) / max(1, len(vals_tmax)), 1),
            "temp_min": round(sum(vals_tmin) / max(1, len(vals_tmin)), 1),
            "humedad_suelo": round(sum(vals_hum) / max(1, len(vals_hum)), 1),
        })

    meses_optimos = [
        x["mes"] for x in serie_mensual if x["humedad_suelo"] >= 55 and x["lluvia_mm"] >= 90
    ]
    ventana_siembra = (
        ", ".join(meses_optimos)
        if meses_optimos
        else "Oct, Nov, Dic (con riego suplementario)"
    )

    lluvias_rec = [v for v in r_diario["PRECTOTCORR"].values() if v > -900]
    tmax_rec = [v for v in r_diario["T2M_MAX"].values() if v > -900]
    hum_rec = [v * 100 for v in r_diario["GWETROOT"].values() if v > -900]

    lluvia_60d_real = sum(lluvias_rec)
    mes_actual = fecha_fin.month
    mes_previo = 12 if mes_actual == 1 else mes_actual - 1
    lluvia_60d_normal = (
        serie_mensual[mes_actual - 1]["lluvia_mm"] + serie_mensual[mes_previo - 1]["lluvia_mm"]
    )
    anomalia_lluvia_pct = round(
        ((lluvia_60d_real - lluvia_60d_normal) / max(10, lluvia_60d_normal)) * 100, 1
    )
    humedad_actual = round(sum(hum_rec[-7:]) / max(1, len(hum_rec[-7:])), 1)
    tmax_actual = round(sum(tmax_rec[-14:]) / max(1, len(tmax_rec[-14:])), 1)

    if anomalia_lluvia_pct <= -25 and humedad_actual < 50:
        fase_enso = "Patrón El Niño / Déficit Hídrico Severo"
        recomendacion_enso = "Retrasar siembra comercial hasta acumular 40 mm de lluvia. Priorizar sorgo, girasol o abono verde de cobertura."
    elif anomalia_lluvia_pct >= 25 or humedad_actual > 78:
        fase_enso = "Patrón La Niña / Exceso Hídrico"
        recomendacion_enso = "Alta humedad radicular: vigilar drenaje en parcelas bajas, prevenir hongos foliares y aprovechar para soya/maíz con control fitosanitario."
    else:
        fase_enso = "Fase Neutra / Condiciones Normales"
        recomendacion_enso = "Balance hídrico dentro del rango histórico (2016-2025). Ejecutar calendario estándar de rotación."

    return {
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "ventana_optima_siembra": ventana_siembra,
        "fase_enso_local": fase_enso,
        "anomalia_lluvia_60d_pct": anomalia_lluvia_pct,
        "lluvia_60d_real_mm": round(lluvia_60d_real, 1),
        "lluvia_60d_esperada_mm": round(lluvia_60d_normal, 1),
        "humedad_suelo_actual_pct": humedad_actual,
        "temp_max_reciente_c": tmax_actual,
        "recomendacion_enso": recomendacion_enso,
        "serie_mensual": serie_mensual,
    }