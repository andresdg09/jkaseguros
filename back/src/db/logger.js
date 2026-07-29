import { db } from './db.js';

/**
 * Registra una acción o evento relevante en el sistema para control y trazabilidad.
 * @param {number|null} usuarioId - ID del usuario que realiza la acción (opcional).
 * @param {string|null} correo - Correo del usuario que realiza la acción (opcional).
 * @param {string} accion - Nombre corto de la acción (ej: 'INICIO_SESION', 'CAMBIO_ROL').
 * @param {string} descripcion - Detalles de la acción realizada.
 */
export async function registrarAccion(usuarioId, correo, accion, descripcion) {
  try {
    await db.query(
      'INSERT INTO logs_actividad (usuario_id, correo_usuario, accion, descripcion) VALUES ($1, $2, $3, $4)',
      [usuarioId ? parseInt(usuarioId) : null, correo || 'sistema', accion, descripcion]
    );
  } catch (err) {
    console.error('Error al registrar acción en logs_actividad:', err);
  }
}
