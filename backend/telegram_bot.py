import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()  # Lee automáticamente el archivo backend/.env

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_TOKEN:
    raise ValueError("⚠️ Falta TELEGRAM_BOT_TOKEN en el archivo backend/.env")

API_BASE = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
BACKEND_URL = "http://127.0.0.1:8000/api/clima-vivo"

def enviar_mensaje(chat_id: int, texto: str):
    requests.post(
        f"{API_BASE}/sendMessage",
        json={"chat_id": chat_id, "text": texto, "parse_mode": "Markdown"},
        timeout=10,
    )


def consultar_diagnostico_parcela(lat: float, lon: float) -> str:
    try:
        resp = requests.get(f"{BACKEND_URL}?lat={lat}&lon={lon}", timeout=15).json()
    except Exception:
        return "⚠️ No se pudo conectar con el servidor NASA Agro-Bolivia. Verifica que FastAPI esté encendido."

    humedad = resp["humedad_suelo_actual_pct"]
    lluvia = resp["lluvia_60d_real_mm"]
    fase = resp["fase_enso_local"]
    ventana = resp["ventana_optima_siembra"]
    consejo = resp["recomendacion_enso"]

    estado_agua = "✅ Apta para sembrar" if humedad >= 55 else "⚠️ Suelo seco (<55% humedad)"

    return (
        f"🛰️ *DIAGNÓSTICO SATELITAL DE TU PARCELA*\n"
        f"📍 GPS: `{lat:.4f}, {lon:.4f}`\n\n"
        f"💧 *Agua en raíces (NASA GWETROOT):* {humedad}% ({estado_agua})\n"
        f"🌧️ *Lluvia últimos 60 días:* {lluvia} mm (Normal: {resp['lluvia_60d_esperada_mm']} mm)\n"
        f"🌡️ *Calor máximo reciente:* {resp['temp_max_reciente_c']} °C\n"
        f"🌦️ *Clima actual:* {fase}\n"
        f"📅 *Meses óptimos de siembra:* {ventana}\n\n"
        f"👨‍🌾 *¿Qué hacer en tu parcela?*\n{consejo}\n\n"
        f"🌱 *Recordatorio:* Evita quemar el rastrojo; usa cobertura vegetal (Crotalaria/Mucuna) para retener humedad."
    )


def iniciar_bot():
    print("🤖 Bot de Alertas NASA Agro-Bolivia escuchando mensajes en Telegram...")
    offset = None
    while True:
        try:
            params = {"timeout": 30}
            if offset:
                params["offset"] = offset
            updates = requests.get(f"{API_BASE}/getUpdates", params=params, timeout=35).json()

            for item in updates.get("result", []):
                offset = item["update_id"] + 1
                msg = item.get("message", {})
                chat_id = msg.get("chat", {}).get("id")
                if not chat_id:
                    continue

                # Caso 1: El agricultor comparte su ubicación GPS desde el celular
                if "location" in msg:
                    lat = msg["location"]["latitude"]
                    lon = msg["location"]["longitude"]
                    enviar_mensaje(chat_id, "🛰️ Consultando satélites de la NASA para tu parcela...")
                    enviar_mensaje(chat_id, consultar_diagnostico_parcela(lat, lon))

                # Caso 2: Comandos de texto
                elif "text" in msg:
                    texto = msg["text"].strip()
                    if texto.startswith("/start"):
                        enviar_mensaje(
                            chat_id,
                            "🌾 *Bienvenido a NASA Agro-Bolivia*\n\n"
                            "Envíame la *ubicación GPS de tu parcela* (usando el clip 📎 -> Ubicación en Telegram) "
                            "y te diré al instante cómo está la humedad de tus raíces, si hay riesgo de sequía y qué cultivo te conviene sembrar.",
                        )
                    elif texto.startswith("/consultar"):
                        partes = texto.split()
                        if len(partes) == 3:
                            enviar_mensaje(
                                chat_id,
                                consultar_diagnostico_parcela(float(partes[1]), float(partes[2])),
                            )
                        else:
                            enviar_mensaje(chat_id, "Usa: `/consultar -17.70 -60.42` o envía tu ubicación GPS.")
        except Exception as e:
            print("Error en polling:", e)
            time.sleep(3)


if __name__ == "__main__":
    iniciar_bot()

if __name__ == "__main__":
    try:
        iniciar_bot()
    except KeyboardInterrupt:
        print("\n🛑 Bot detenido correctamente.")