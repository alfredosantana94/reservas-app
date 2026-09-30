import { useEffect, useState } from "react";
import { borrarSala, crearSala } from "../api.js";

const VACIA = { nombre: "", capacidad: "", ubicacion: "" };

export default function SalasModal({ salas, onCambio, onCerrar }) {
  const [campos, setCampos] = useState(VACIA);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    const cerrarConEsc = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", cerrarConEsc);
    return () => document.removeEventListener("keydown", cerrarConEsc);
  }, [onCerrar]);

  const set = (clave) => (e) => setCampos({ ...campos, [clave]: e.target.value });

  const agregar = async (e) => {
    e.preventDefault();
    setTrabajando(true);
    setError(null);
    try {
      await crearSala({
        nombre: campos.nombre.trim(),
        capacidad: Number(campos.capacidad || 0),
        ubicacion: campos.ubicacion.trim(),
      });
      setCampos(VACIA);
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async (sala) => {
    setError(null);
    try {
      await borrarSala(sala.id);
      await onCambio();
    } catch (err) {
      // El 409 de acá lo genera la foreign key con ON DELETE RESTRICT: la
      // base se niega a dejar reservas apuntando a una sala que no existe.
      setError(err.message);
    }
  };

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-salas">
        <div className="modal-cabecera">
          <div>
            <h2 id="titulo-salas">Administrar salas</h2>
            <p className="ayuda">
              Una sala con reservas registradas no se puede borrar: la restricción la
              hace cumplir la base de datos.
            </p>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="modal-cuerpo">
          {error && (
            <div className="alerta" role="alert">
              {error}
            </div>
          )}

          <ul className="lista-salas">
            {salas.map((sala) => (
              <li key={sala.id}>
                <div>
                  <strong>{sala.nombre}</strong>
                  <small>
                    {sala.capacidad} lugares
                    {sala.ubicacion ? ` · ${sala.ubicacion}` : ""}
                  </small>
                </div>
                <button type="button" className="peligro" onClick={() => quitar(sala)}>
                  Borrar
                </button>
              </li>
            ))}
            {salas.length === 0 && <li className="vacio">Todavía no hay salas.</li>}
          </ul>

          <form onSubmit={agregar}>
            <fieldset>
              <legend>Nueva sala</legend>
              <div className="campos campos-sala">
                <label className="campo">
                  <span className="etiqueta">Nombre *</span>
                  <input value={campos.nombre} onChange={set("nombre")} required maxLength={100} />
                  <small>Único: no puede repetirse.</small>
                </label>
                <label className="campo">
                  <span className="etiqueta">Capacidad</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={campos.capacidad}
                    onChange={set("capacidad")}
                    placeholder="0"
                  />
                </label>
                <label className="campo">
                  <span className="etiqueta">Ubicación</span>
                  <input value={campos.ubicacion} onChange={set("ubicacion")} maxLength={120} />
                </label>
              </div>
            </fieldset>

            <div className="modal-pie">
              <button type="button" className="secundario" onClick={onCerrar}>
                Cerrar
              </button>
              <button type="submit" disabled={trabajando}>
                {trabajando ? "Agregando…" : "Agregar sala"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
