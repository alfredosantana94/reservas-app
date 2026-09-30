'use strict';

const express = require('express');
const { pool, initDb, sembrar, FRANJAS, log, logError } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = process.env.APP_VERSION || 'v1';
const SEED_DEMO = (process.env.SEED_DEMO || 'true').toLowerCase() !== 'false';

const app = express();
app.use(express.json({ limit: '64kb' }));

const NUMEROS_DE_FRANJA = FRANJAS.map((f) => f.numero);
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Traduce los errores del motor a códigos HTTP con un mensaje entendible. */
function traducirError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return err.message.includes('sin_solapamiento')
        ? { status: 409, error: 'esa sala ya está reservada en esa fecha y franja' }
        : { status: 409, error: 'ya existe una sala con ese nombre' };
    case 'ER_NO_REFERENCED_ROW_2':
      return { status: 400, error: 'la sala indicada no existe' };
    case 'ER_ROW_IS_REFERENCED_2':
      return { status: 409, error: 'no se puede borrar la sala: tiene reservas registradas' };
    default:
      return null;
  }
}

/** Envuelve un handler async para que un rechazo no tumbe el proceso. */
const ruta = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    const traducido = traducirError(err);
    if (traducido) {
      res.status(traducido.status).json({ error: traducido.error });
      return;
    }
    logError(`${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(500).json({ error: 'error interno' });
  });
};

app.get('/health', ruta(async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', version: APP_VERSION });
  } catch (err) {
    res.status(503).json({ status: 'degradado', db: 'sin conexión', version: APP_VERSION });
  }
}));

app.get('/franjas', (_req, res) => res.json(FRANJAS));

// ---------------------------------------------------------------- salas

app.get('/salas', ruta(async (_req, res) => {
  const [filas] = await pool.query(
    'SELECT id, nombre, capacidad, ubicacion FROM salas ORDER BY nombre',
  );
  res.json(filas);
}));

app.post('/salas', ruta(async (req, res) => {
  const { nombre, capacidad = 0, ubicacion = '' } = req.body || {};
  if (!nombre || !String(nombre).trim()) {
    res.status(400).json({ error: 'nombre es obligatorio' });
    return;
  }
  if (!Number.isInteger(Number(capacidad)) || Number(capacidad) < 0) {
    res.status(400).json({ error: 'capacidad debe ser un entero mayor o igual a 0' });
    return;
  }
  const [resultado] = await pool.query(
    'INSERT INTO salas (nombre, capacidad, ubicacion) VALUES (?, ?, ?)',
    [String(nombre).trim(), Number(capacidad), String(ubicacion).trim()],
  );
  const [[sala]] = await pool.query(
    'SELECT id, nombre, capacidad, ubicacion FROM salas WHERE id = ?',
    [resultado.insertId],
  );
  res.status(201).json(sala);
}));

app.delete('/salas/:id', ruta(async (req, res) => {
  // No hace falta chequear si tiene reservas: la FK con ON DELETE RESTRICT
  // hace fallar el DELETE y traducirError lo convierte en un 409.
  const [resultado] = await pool.query('DELETE FROM salas WHERE id = ?', [req.params.id]);
  if (resultado.affectedRows === 0) {
    res.status(404).json({ error: 'sala no encontrada' });
    return;
  }
  res.status(204).end();
}));

// ------------------------------------------------------------- reservas

app.get('/reservas', ruta(async (req, res) => {
  const { fecha, sala_id: salaId } = req.query;
  const condiciones = [];
  const valores = [];
  if (fecha) {
    if (!ES_FECHA.test(fecha)) {
      res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
      return;
    }
    condiciones.push('r.fecha = ?');
    valores.push(fecha);
  }
  if (salaId) {
    condiciones.push('r.sala_id = ?');
    valores.push(Number(salaId));
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await pool.query(
    `SELECT r.id, r.sala_id, s.nombre AS sala, r.fecha, r.franja,
            r.responsable, r.motivo, r.creada_en
       FROM reservas r
       JOIN salas s ON s.id = r.sala_id
       ${where}
      ORDER BY r.fecha, r.franja, s.nombre
      LIMIT 500`,
    valores,
  );
  res.json(filas);
}));

app.post('/reservas', ruta(async (req, res) => {
  const { sala_id: salaId, fecha, franja, responsable, motivo = '' } = req.body || {};

  if (!Number.isInteger(Number(salaId))) {
    res.status(400).json({ error: 'sala_id es obligatorio' });
    return;
  }
  if (!ES_FECHA.test(String(fecha || ''))) {
    res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
    return;
  }
  if (!NUMEROS_DE_FRANJA.includes(Number(franja))) {
    res.status(400).json({ error: `franja debe ser una de: ${NUMEROS_DE_FRANJA.join(', ')}` });
    return;
  }
  if (!responsable || !String(responsable).trim()) {
    res.status(400).json({ error: 'responsable es obligatorio' });
    return;
  }

  // OJO: este SELECT existe solo para dar un mensaje lindo cuando el turno ya
  // está tomado. NO es lo que garantiza la invariante: entre el SELECT y el
  // INSERT puede colarse otro pedido (otra réplica, u otro request en la misma
  // réplica: Node procesa el siguiente mientras este espera al await). Lo que
  // realmente impide la doble reserva es UNIQUE (sala_id, fecha, franja).
  const [tomadas] = await pool.query(
    'SELECT id FROM reservas WHERE sala_id = ? AND fecha = ? AND franja = ?',
    [Number(salaId), fecha, Number(franja)],
  );
  if (tomadas.length > 0) {
    res.status(409).json({ error: 'esa sala ya está reservada en esa fecha y franja' });
    return;
  }

  const [resultado] = await pool.query(
    `INSERT INTO reservas (sala_id, fecha, franja, responsable, motivo)
     VALUES (?, ?, ?, ?, ?)`,
    [Number(salaId), fecha, Number(franja), String(responsable).trim(), String(motivo).trim()],
  );
  const [[reserva]] = await pool.query(
    `SELECT r.id, r.sala_id, s.nombre AS sala, r.fecha, r.franja,
            r.responsable, r.motivo, r.creada_en
       FROM reservas r JOIN salas s ON s.id = r.sala_id
      WHERE r.id = ?`,
    [resultado.insertId],
  );
  res.status(201).json(reserva);
}));

app.delete('/reservas/:id', ruta(async (req, res) => {
  const [resultado] = await pool.query('DELETE FROM reservas WHERE id = ?', [req.params.id]);
  if (resultado.affectedRows === 0) {
    res.status(404).json({ error: 'reserva no encontrada' });
    return;
  }
  res.status(204).end();
}));

initDb()
  .then(() => (SEED_DEMO ? sembrar() : null))
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => log(`reservas-api ${APP_VERSION} escuchando en :${PORT}`));
  })
  .catch((err) => {
    logError(`no se pudo inicializar la base: ${err.message}`);
    process.exit(1);
  });
