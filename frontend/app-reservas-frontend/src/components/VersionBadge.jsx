// Muestra la versión que reporta /api/health. Durante un rolling update con
// varias réplicas el badge oscila entre v1 y v2 (conviven las dos versiones)
// y se estabiliza cuando el rollout termina.
export default function VersionBadge({ health }) {
  const ok = health?.status === "ok";
  return (
    <span className={`badge ${ok ? "badge-ok" : "badge-off"}`} title="Versión que reporta /api/health">
      <span className="punto" aria-hidden="true" />
      {ok ? `API ${health.version}` : "API sin respuesta"}
    </span>
  );
}
