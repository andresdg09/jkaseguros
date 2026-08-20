import express from 'express';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

// Obtener datos de perfil
router.get('/', authenticateToken, async (req, res) => {
  try {
    let advisor = null;
    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT * FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length > 0) {
        advisor = aseRes.rows[0];
      }
    }

    const personalRes = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    res.json({
      user: req.user,
      cliente: personalRes.rows.length > 0 ? personalRes.rows[0] : null,
      asesor: advisor
    });
  } catch (err) {
    console.error('Error al obtener perfil:', err);
    res.status(500).json({ error: 'Error del servidor al obtener el perfil.' });
  }
});

// Actualizar datos de perfil
router.put('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.rango === 'asesor') {
      const { nombre, telefono, cedula, banco, numero_cuenta, fecha_nacimiento } = req.body;
      if (!nombre || !telefono || !banco || !numero_cuenta || !fecha_nacimiento) {
        return res.status(400).json({ error: 'Los campos nombre, teléfono, banco, número de cuenta y fecha de nacimiento son requeridos.' });
      }

      const cleanCta = numero_cuenta.replace(/\D/g, '');
      if (cleanCta.length !== 20) {
        return res.status(400).json({ error: 'El número de cuenta bancaria debe tener exactamente 20 dígitos.' });
      }

      const cleanCedula = cedula ? cedula.trim().toUpperCase() : 'V00000000';

      const q = `
        UPDATE asesores SET
          nombre = $1,
          telefono = $2,
          cedula = $3,
          banco = $4,
          numero_cuenta = $5,
          fecha_nacimiento = $6
        WHERE usuario_id = $7 RETURNING *
      `;
      const result = await db.query(q, [nombre, telefono, cleanCedula, banco, cleanCta, fecha_nacimiento, req.user.id]);
      
      await registrarAccion(req.user.id, req.user.correo, 'ACTUALIZACION_PERFIL_ASESOR', `Perfil de asesor actualizado: ${nombre} (${cleanCedula})`);
      
      return res.json({ message: 'Perfil de asesor actualizado exitosamente', asesor: result.rows[0] });
    }

    // Lógica para clientes
    const {
      primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
    } = req.body;

    if (!primer_nombre || !primer_apellido || !fecha_nacimiento || !tipo_documento || !nro_documento || !genero || !numero_celular) {
      return res.status(400).json({ error: 'Los campos obligatorios no pueden estar vacíos.' });
    }

    const profileCheck = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    let result;
    if (profileCheck.rows.length > 0) {
      const queryStr = `
        UPDATE datos_personales SET
          primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
          fecha_nacimiento = $5, tipo_documento = $6, nro_documento = $7, genero = $8,
          estado_civil = $9, codigo_area = $10, numero_celular = $11
        WHERE usuario_id = $12 RETURNING *
      `;
      result = await db.query(queryStr, [
        primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero,
        estado_civil, codigo_area, numero_celular, req.user.id
      ]);
    } else {
      const queryStr = `
        INSERT INTO datos_personales (
          usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
      `;
      result = await db.query(queryStr, [
        req.user.id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
      ]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'ACTUALIZACION_PERFIL', `Perfil actualizado para ${primer_nombre} ${primer_apellido}`);
    res.json({ message: 'Perfil actualizado exitosamente', cliente: result.rows[0] });

  } catch (err) {
    console.error('Error al actualizar perfil:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el perfil.' });
  }
});

export default router;
