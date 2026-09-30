// Cliente HTTP de reservas-api.
//
// Acá no hay ninguna URL absoluta ni ningún import.meta.env.VITE_*: Vite
// hornea las variables VITE_* en TIEMPO DE BUILD, así que usarlas obligaría a
// construir una imagen distinta por cada entorno.
//
// En vez de eso el SPA pide siempre una ruta RELATIVA de su propio origen, y
// nginx —configurado al ARRANCAR el contenedor con envsubst— decide a qué
// backend reenviar. Una imagen, todos los entornos. Y como todo es mismo
// origen, no hay CORS: el backend no necesita ningún header especial.
const BASE = "/api";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return null;
  const body = await res.text();
  if (!res.ok) throw new Error(mensajeDeError(res.status, body));
  return body ? JSON.parse(body) : null;
}

// La API devuelve {"error": "..."} en todos sus fallos; si el cuerpo no es
// JSON (por ejemplo un 502 generado por nginx), se cae al mensaje genérico.
function mensajeDeError(status, body) {
  try {
    const { error } = JSON.parse(body);
    if (error) return error;
  } catch {
    /* no era JSON */
  }
  return `HTTP ${status}`;
}

export const getHealth = () => req("/health");
export const listarFranjas = () => req("/franjas");

export const listarSalas = () => req("/salas");
export const crearSala = (sala) =>
  req("/salas", { method: "POST", body: JSON.stringify(sala) });
export const borrarSala = (id) => req(`/salas/${id}`, { method: "DELETE" });

export const listarReservas = (fecha) =>
  req(`/reservas?fecha=${encodeURIComponent(fecha)}`);
export const crearReserva = (reserva) =>
  req("/reservas", { method: "POST", body: JSON.stringify(reserva) });
export const borrarReserva = (id) => req(`/reservas/${id}`, { method: "DELETE" });
