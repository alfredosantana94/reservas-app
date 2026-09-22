const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Se formatea a mano a partir del string YYYY-MM-DD: pasarlo por new Date()
// lo interpretaría como UTC y mostraría el día anterior según la zona horaria.
function enLetras(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const dias = DIAS[fecha.getDay()];
  return `${dias[0].toUpperCase()}${dias.slice(1)} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function correr(iso, dias) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia + dias);
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

export default function BarraFecha({ fecha, onCambiar, ocupadas, total, cargando }) {
  return (
    <div className="barra-fecha">
      <div className="navegacion">
        <button type="button" className="secundario" onClick={() => onCambiar(correr(fecha, -1))}>
          ‹
        </button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => e.target.value && onCambiar(e.target.value)}
          aria-label="Fecha a mostrar"
        />
        <button type="button" className="secundario" onClick={() => onCambiar(correr(fecha, 1))}>
          ›
        </button>
      </div>

      <p className="fecha-larga">{enLetras(fecha)}</p>

      {!cargando && (
        <span className="conteo">
          {ocupadas} de {total} turnos ocupados
        </span>
      )}
    </div>
  );
}
