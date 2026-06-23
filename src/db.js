import Dexie from 'dexie';

const db = new Dexie('FincaManager');

db.version(1).stores({
  motores: '&id, nombre, created_at',
  motor_sesiones: '&id, motor_id, fecha, created_at',
  motor_mantenimientos: '&id, motor_id, fecha, created_at',
  potreros: '&id, nombre, created_at',
  ganado: '&id, nombre, potrero_id, created_at',
  herramientas: '&id, nombre, created_at',
  potrero_eventos: '&id, potrero_id, fecha, created_at',
  animal_pesajes: '&id, animal_id, fecha, created_at',
  animal_vacunas: '&id, animal_id, fecha, created_at',
  animal_fumigaciones: '&id, animal_id, fecha, created_at',
  herramienta_mantenimientos: '&id, herramienta_id, fecha, created_at',
  lotes: '&id, nombre, created_at',
  lote_aplicaciones: '&id, lote_id, fecha, created_at',
  lote_personal: '&id, lote_id, personal_id, created_at',
  personal: '&id, nombre, created_at',
  personal_asistencia: '&id, personal_id, fecha, created_at',
  _sync_meta: '&key',
  _sync_queue: '++id, table, action, timestamp',
});

export default db;
