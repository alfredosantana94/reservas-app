import VersionBadge from "./VersionBadge.jsx";

export default function Navbar({ health, onGestionarSalas }) {
  return (
    <header className="navbar">
      <div className="contenedor navbar-interior">
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">
            ▦
          </span>
          <div>
            <strong>Reservas</strong>
            <small>reservas-app · Variante B</small>
          </div>
        </div>

        <div className="navbar-acciones">
          <VersionBadge health={health} />
          <button type="button" className="secundario" onClick={onGestionarSalas}>
            Administrar salas
          </button>
        </div>
      </div>
    </header>
  );
}
