from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI(title="NASA Agro-Bolivia API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEOJSON_PATH = "data/municipios_nasa_ready.geojson"

with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
    GEOJSON_DATA = json.load(f)

@app.get("/api/municipios")
def obtener_mapa_municipios():
    """Devuelve el GeoJSON completo optimizado con diagnóstico FIRMS + NASA POWER."""
    return GEOJSON_DATA

@app.get("/api/resumen")
def obtener_resumen_nacional():
    """Ranking de los 10 municipios con mayor quema agrícola en 2025."""
    features = GEOJSON_DATA["features"]
    lista = [feat["properties"] for feat in features]
    top_10 = sorted(lista, key=lambda x: x["focos_agricolas_2025"], reverse=True)[:10]
    total_focos = sum(x["focos_agricolas_2025"] for x in lista)
    criticos = sum(1 for x in lista if x["nivel_riesgo"] == "CRÍTICO")
    return {
        "total_focos_agricolas_2025": total_focos,
        "municipios_riesgo_critico": criticos,
        "top_10_municipios": top_10
    }

@app.get("/")
def root():
    return {"status": "online", "proyecto": "NASA Agro-Bolivia API", "docs": "/docs"}