export default function GrillaReservas({ salas, franjas, reservas, onReservar, onLiberar }) {
  if (salas.length === 0) {
    return (
      <div className="vacio">
        <p>No hay salas cargadas. Agregá una desde “Administrar salas”.</p>
      </div>
    );
  }

  // Índice por sala+franja para no recorrer el array en cada celda.
  const porCelda = new Map(reservas.map((r) => [`${r.sala_id}-${r.franja}`, r]));

  return (
    <div className="tabla-scroll">
      <table className="grilla">
        <thead>
          <tr>
            <th className="col-franja">Franja</th>
            {salas.map((sala) => (
              <th key={sala.id}>
                {sala.nombre}
                <small>{sala.capacidad} lugares</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {franjas.map((franja) => (
            <tr key={franja.numero}>
              <th scope="row" className="col-franja">
                <span className="horario">
                  {franja.desde}–{franja.hasta}
                </span>
                <small>bloque {franja.numero}</small>
              </th>

              {salas.map((sala) => {
                const reserva = porCelda.get(`${sala.id}-${franja.numero}`);
                return (
                  <td key={sala.id} className={reserva ? "celda ocupada" : "celda"}>
                    {reserva ? (
                      <div className="reserva">
                        <strong>{reserva.responsable}</strong>
                        {reserva.motivo && <span className="motivo">{reserva.motivo}</span>}
                        <button
                          type="button"
                          className="enlace-peligro"
                          onClick={() => onLiberar(reserva)}
                        >
                          Liberar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="libre"
                        onClick={() => onReservar(sala, franja)}
                      >
                        Reservar
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
