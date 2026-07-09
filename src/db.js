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

db.version(2).stores({
  animal_ventas: '&id, animal_id, fecha_venta, created_at',
});

db.version(3).stores({
  motores: '&id, empresa_id, nombre, created_at',
  motor_sesiones: '&id, empresa_id, motor_id, fecha, created_at',
  motor_mantenimientos: '&id, empresa_id, motor_id, fecha, created_at',
  potreros: '&id, empresa_id, nombre, created_at',
  ganado: '&id, empresa_id, nombre, potrero_id, created_at',
  herramientas: '&id, empresa_id, nombre, created_at',
  potrero_eventos: '&id, empresa_id, potrero_id, fecha, created_at',
  animal_pesajes: '&id, empresa_id, animal_id, fecha, created_at',
  animal_vacunas: '&id, empresa_id, animal_id, fecha, created_at',
  animal_fumigaciones: '&id, empresa_id, animal_id, fecha, created_at',
  animal_ventas: '&id, empresa_id, animal_id, fecha_venta, created_at',
  herramienta_mantenimientos: '&id, empresa_id, herramienta_id, fecha, created_at',
  lotes: '&id, empresa_id, nombre, edad_categoria, altura_msnm, created_at',
  lote_aplicaciones: '&id, empresa_id, lote_id, fecha, created_at',
  lote_personal: '&id, empresa_id, lote_id, personal_id, created_at',
  personal: '&id, empresa_id, nombre, created_at',
  personal_asistencia: '&id, empresa_id, personal_id, fecha, created_at',
  usuarios: '&id, email, created_at',
  empresas: '&id, nombre, created_at',
  usuario_empresas: '&id, usuario_id, empresa_id, created_at',
  invitaciones: '&id, empresa_id, email, token, created_at',
  _sync_meta: '&key',
  _sync_queue: '++id, table, action, timestamp',
});

export default db;
