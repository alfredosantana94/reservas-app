import { useEffect, useState } from "react";

export default function ReservaModal({ fecha, sala, franja, onGuardar, onCerrar }) {
  const [responsable, setResponsable] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cerrarConEsc = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", cerrarConEsc);
    return () => document.removeEventListener("keydown", cerrarConEsc);
  }, [onCerrar]);

  const submit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        sala_id: sala.id,
        fecha,
        franja: franja.numero,
        responsable: responsable.trim(),
        motivo: motivo.trim(),
      });
    } catch (err) {
      // Acá aterriza el 409 de sin_solapamiento cuando alguien reservó el
      // mismo turno entre que se abrió el modal y se apretó Confirmar.
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <div className="modal-cabecera">
          <div>
            <h2 id="titulo-modal">Reservar turno</h2>
            <p className="ayuda">Los campos marcados con * son obligatorios.</p>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={submit} className="modal-cuerpo">
          {error && (
            <div className="alerta" role="alert">
              {error}
            </div>
          )}

          <dl className="resumen">
            <div>
              <dt>Sala</dt>
              <dd>{sala.nombre}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{fecha}</dd>
            </div>
            <div>
              <dt>Franja</dt>
              <dd>
                {franja.desde}–{franja.hasta}
              </dd>
            </div>
          </dl>

          <label className="campo">
            <span className="etiqueta">Responsable *</span>
            <input
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              maxLength={120}
              required
              autoFocus
              placeholder="Cátedra, docente o área que reserva"
            />
          </label>

          <label className="campo">
            <span className="etiqueta">Motivo</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
              placeholder="Para qué se usa la sala en ese bloque"
            />
          </label>

          <div className="modal-pie">
            <button type="button" className="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando}>
              {guardando ? "Confirmando…" : "Confirmar reserva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
