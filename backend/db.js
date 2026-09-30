'use strict';

const mysql = require('mysql2/promise');

const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[${ts()}] ${msg}`);
const logError = (msg) => console.error(`[${ts()}] ${msg}`);

// Bloques horarios. Viven en la API (no en el frontend) para que la grilla y
// la validación usen exactamente la misma fuente: el SPA pide /franjas.
const FRANJAS = [
  { numero: 1, desde: '08:00', hasta: '10:00' },
  { numero: 2, desde: '10:00', hasta: '12:00' },
  { numero: 3, desde: '12:00', hasta: '14:00' },
  { numero: 4, desde: '14:00', hasta: '16:00' },
  { numero: 5, desde: '16:00', hasta: '18:00' },
  { numero: 6, desde: '18:00', hasta: '20:00' },
];

const SALAS_DEMO = [
  { nombre: 'Laboratorio 1', capacidad: 24, ubicacion: 'Planta baja, ala este' },
  { nombre: 'Laboratorio 2', capacidad: 24, ubicacion: 'Planta baja, ala oeste' },
  { nombre: 'Laboratorio de Redes', capacidad: 16, ubicacion: 'Primer piso' },
  { nombre: 'Aula Magna', capacidad: 120, ubicacion: 'Edificio central' },
  { nombre: 'Sala de Reuniones', capacidad: 10, ubicacion: 'Primer piso' },
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  // dateStrings evita que mysql2 convierta un DATE a un Date de JavaScript:
  // esa conversión aplica la zona horaria del proceso y termina corriendo la
  // fecha un día cuando el contenedor corre en UTC. Ver README.
  dateStrings: true,
});

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS salas (
     id        INT AUTO_INCREMENT PRIMARY KEY,
     nombre    VARCHAR(100) NOT NULL,
     capacidad INT          NOT NULL DEFAULT 0,
     ubicacion VARCHAR(120) NOT NULL DEFAULT '',
     CONSTRAINT sala_nombre_unico UNIQUE (nombre)
   )`,
  // La restricción sin_solapamiento es el corazón de esta variante: es lo
  // ÚNICO que garantiza que una sala no se reserve dos veces en la misma
  // franja cuando hay varias réplicas de la API atendiendo en paralelo.
  // Chequear con un SELECT antes de insertar no alcanza (ver README).
  `CREATE TABLE IF NOT EXISTS reservas (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     sala_id     INT          NOT NULL,
     fecha       DATE         NOT NULL,
     franja      TINYINT      NOT NULL,
     responsable VARCHAR(120) NOT NULL,
     motivo      VARCHAR(200) NOT NULL DEFAULT '',
     creada_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_reserva_sala FOREIGN KEY (sala_id) REFERENCES salas(id)
       ON DELETE RESTRICT,
     CONSTRAINT sin_solapamiento UNIQUE (sala_id, fecha, franja)
   )`,
];

/**
 * MySQL tarda bastante en aceptar conexiones la primera vez que inicializa el
 * datadir. Por eso se reintenta ~60 s antes de fallar.
 */
async function initDb(reintentos = 15, esperaMs = 4000) {
  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      for (const sentencia of ESQUEMA) await pool.query(sentencia);
      log(`esquema listo en ${process.env.DB_HOST}/${process.env.DB_NAME}`);
      return;
    } catch (err) {
      logError(`intento ${intento}/${reintentos} de conexión falló: ${err.message}`);
      if (intento === reintentos) throw err;
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

/**
 * Siembra las salas de demo y un par de reservas de hoy. Es idempotente:
 * las salas van con ON DUPLICATE KEY sobre su nombre único y las reservas con
 * INSERT IGNORE sobre sin_solapamiento, así que N réplicas arrancando a la vez
 * dejan siempre el mismo estado.
 */
async function sembrar() {
  for (const sala of SALAS_DEMO) {
    await pool.query(
      `INSERT INTO salas (nombre, capacidad, ubicacion) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE capacidad = VALUES(capacidad), ubicacion = VALUES(ubicacion)`,
      [sala.nombre, sala.capacidad, sala.ubicacion],
    );
  }

  const [salas] = await pool.query('SELECT id, nombre FROM salas ORDER BY id');
  const porNombre = Object.fromEntries(salas.map((s) => [s.nombre, s.id]));
  const hoy = new Date().toISOString().slice(0, 10);
  const reservasDemo = [
    ['Laboratorio 1', 2, 'Cátedra de Sistemas Operativos', 'Práctica de procesos'],
    ['Laboratorio de Redes', 4, 'Cátedra de Redes', 'Laboratorio de routing'],
    ['Aula Magna', 5, 'Secretaría Académica', 'Charla de egresados'],
  ];
  for (const [nombreSala, franja, responsable, motivo] of reservasDemo) {
    const salaId = porNombre[nombreSala];
    if (!salaId) continue;
    await pool.query(
      `INSERT IGNORE INTO reservas (sala_id, fecha, franja, responsable, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [salaId, hoy, franja, responsable, motivo],
    );
  }
  log(`datos de demo sembrados (${SALAS_DEMO.length} salas)`);
}

module.exports = { pool, initDb, sembrar, FRANJAS, log, logError };
