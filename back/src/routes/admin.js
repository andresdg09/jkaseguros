import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. Obtener lista de clientes con métricas útiles para el administrador
router.get('/clients', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const clientsRes = await db.query('SELECT * FROM datos_personales');
    const polsRes = await db.query('SELECT * FROM polizas');
    const paysRes = await db.query('SELECT * FROM pagos');

    const mapped = clientsRes.rows.map(c => {
      const cliPols = polsRes.rows.filter(p => p.cliente_id === c.id);
      const cliPolIds = cliPols.map(p => p.id);
      const cliPays = paysRes.rows.filter(pa => cliPolIds.includes(pa.poliza_id) && pa.estado_pago === 'pagado');
      const totalPagado = cliPays.reduce((sum, p) => sum + parseFloat(p.monto), 0);

      return {
        id_cliente: c.id,
        nombre: `${c.primer_nombre} ${c.primer_apellido}`,
        primer_nombre: c.primer_nombre,
        primer_apellido: c.primer_apellido,
        nro_documento: c.nro_documento,
        telefono: `${c.codigo_area}-${c.numero_celular}`,
        polizas: cliPols.map(p => p.codigo_poliza).join(', ') || 'Ninguna',
        historial_pagos: `$${totalPagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error('Error al listar clientes en admin:', err);
    res.status(500).json({ error: 'Error del servidor al listar clientes.' });
  }
});

// 2. Obtener lista de asesores para admin
router.get('/advisors', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const advsRes = await db.query('SELECT * FROM asesores');
    const polsRes = await db.query('SELECT * FROM polizas');
    const clientsRes = await db.query('SELECT * FROM datos_personales');

    const mapped = advsRes.rows.map(a => {
      // Clientes vinculados a este asesor
      const assignedPolClients = polsRes.rows.filter(p => p.asesor_id === a.id).map(p => p.cliente_id);
      const uniqueClients = [...new Set(assignedPolClients)];
      
      const clientNames = clientsRes.rows
        .filter(c => uniqueClients.includes(c.id))
        .map(c => `${c.primer_nombre} ${c.primer_apellido}`)
        .join(', ');

      return {
        id_asesor: a.id,
        nombre: a.nombre,
        codigo_asesor: a.codigo_asesor,
        telefono: a.telefono,
        correo: a.correo,
        clientes: clientNames || 'Ninguno'
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error('Error al listar asesores en admin:', err);
    res.status(500).json({ error: 'Error del servidor al listar asesores.' });
  }
});

// 3. Obtener lista de usuarios para admin
router.get('/users', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const usersRes = await db.query('SELECT * FROM usuarios ORDER BY id ASC');
    // Filtrar contraseñas
    const cleanUsers = usersRes.rows.map(u => ({ id: u.id, correo: u.correo, rango: u.rango, created_at: u.created_at }));
    res.json(cleanUsers);
  } catch (err) {
    console.error('Error al listar usuarios en admin:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// 4. Modificar rango de un usuario (Admin)
router.put('/users/:id/role', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rango } = req.body;

  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  if (!['cliente', 'asesor', 'admin'].includes(rango)) return res.status(400).json({ error: 'Rango no válido.' });

  try {
    const updateRes = await db.query('UPDATE usuarios SET rango = $1 WHERE id = $2 RETURNING *', [rango, parseInt(id)]);
    
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const updatedUser = updateRes.rows[0];

    // Si cambió a rango asesor, creamos un registro de asesor si no existe
    if (rango === 'asesor') {
      const personalCheck = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [updatedUser.id]);
      const name = personalCheck.rows.length > 0 ? `${personalCheck.rows[0].primer_nombre} ${personalCheck.rows[0].primer_apellido}` : 'Asesor Nuevo';
      const tel = personalCheck.rows.length > 0 ? `${personalCheck.rows[0].codigo_area}-${personalCheck.rows[0].numero_celular}` : 'N/A';
      
      const checkAdv = await db.query('SELECT * FROM asesores WHERE usuario_id = $1', [updatedUser.id]);
      if (checkAdv.rows.length === 0) {
        const code = `ASE-${Math.floor(100 + Math.random() * 900)}`;
        await db.query(
          `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono) VALUES ($1, $2, $3, $4, $5)`,
          [updatedUser.id, name, code, updatedUser.correo, tel]
        );
      }
    } else {
      // Si ya no es asesor, removemos de la tabla de asesores para evitar inconsistencias
      await db.query('DELETE FROM asesores WHERE usuario_id = $1', [updatedUser.id]);
    }

    // Trazabilidad
    await registrarAccion(req.user.id, req.user.correo, 'MODIFICACION_ROL', `Usuario ID ${id} cambiado a rango ${rango}`);

    res.json({ message: 'Rango de usuario actualizado exitosamente.', user: { id: updatedUser.id, correo: updatedUser.correo, rango: updatedUser.rango } });
  } catch (err) {
    console.error('Error al cambiar rango de usuario:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// 5. Ver logs de trazabilidad (Admin)
router.get('/logs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const logsRes = await db.query('SELECT * FROM logs_actividad ORDER BY id DESC');
    res.json(logsRes.rows);
  } catch (err) {
    console.error('Error al obtener logs de actividad:', err);
    res.status(500).json({ error: 'Error del servidor al cargar los logs.' });
  }
});

// 6. Carga masiva de tarifas (Admin Data)
router.post('/data', authenticateToken, upload.single('archivo'), async (req, res) => {
  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'Solo los administradores pueden cargar tarifas.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Debe adjuntar un archivo para la carga masiva.' });
  }

  try {
    const fileContent = req.file.buffer.toString('utf8');
    const parsedData = JSON.parse(fileContent);

    if (!Array.isArray(parsedData)) {
      return res.status(400).json({ error: 'El formato de archivo no es válido. Debe ser una lista JSON de tarifas.' });
    }

    console.log(`Cargando masivamente ${parsedData.length} tarifas...`);

    if (db.isFallback()) {
      const compMap = {};
      const fallbackFilePath = './data/fallback_db.json';
      
      const fallbackFileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fallbackFileContent);
      
      fData.companias_seguros.forEach(c => {
        compMap[c.nombre] = c.id;
      });

      const nuevasTarifas = parsedData.map((t, idx) => {
        const cId = compMap[t.compania];
        return {
          id: idx + 1,
          compania_id: cId || 1,
          tipo_cobertura: t.tipo_cobertura || 'colectivo',
          edad_min: parseInt(t.edad_min),
          edad_max: parseInt(t.edad_max),
          suma_asegurada: parseFloat(t.suma_asegurada),
          prima: parseFloat(t.prima),
          created_at: new Date().toISOString()
        };
      });

      fData.tarifas = nuevasTarifas;
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      await db.query('DELETE FROM tarifas');
      const comps = await db.query('SELECT id, nombre FROM companias_seguros');
      const compMap = {};
      comps.rows.forEach(c => {
        compMap[c.nombre] = c.id;
      });

      for (const t of parsedData) {
        const cId = compMap[t.compania];
        if (!cId) continue;
        
        await db.query(
          `INSERT INTO tarifas (compania_id, tipo_cobertura, edad_min, edad_max, suma_asegurada, prima) VALUES ($1, $2, $3, $4, $5, $6)`,
          [cId, t.tipo_cobertura, parseInt(t.edad_min), parseInt(t.edad_max), parseFloat(t.suma_asegurada), parseFloat(t.prima)]
        );
      }
    }

    // Trazabilidad
    await registrarAccion(req.user.id, req.user.correo, 'CARGA_TARIFAS', `Cargadas masivamente ${parsedData.length} tarifas en el sistema.`);

    res.json({ message: 'Carga masiva realizada con éxito.', count: parsedData.length });

  } catch (err) {
    console.error('Error al realizar carga masiva:', err);
    res.status(500).json({ error: 'Error al procesar el archivo. Verifique que sea un archivo JSON válido.' });
  }
});

// 7. Listar todas las tarifas actuales
router.get('/tariffs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  try {
    const q = `
      SELECT t.*, c.nombre AS compania_nombre 
      FROM tarifas t 
      LEFT JOIN companias_seguros c ON t.compania_id = c.id 
      ORDER BY c.nombre ASC, t.tipo_cobertura ASC, t.edad_min ASC, t.suma_asegurada ASC
    `;
    const result = await db.query(q);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tarifas.' });
  }
});

// 8. Crear una tarifa individual
router.post('/tariffs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { compania_id, tipo_cobertura, edad_min, edad_max, suma_asegurada, prima } = req.body;
  
  if (!compania_id || !tipo_cobertura || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos.' });
  }

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);
      
      const newId = fData.tarifas.length > 0 ? Math.max(...fData.tarifas.map(t => t.id)) + 1 : 1;
      fData.tarifas.push({
        id: newId,
        compania_id: parseInt(compania_id),
        tipo_cobertura,
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        prima: parseFloat(prima),
        created_at: new Date().toISOString()
      });
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      const q = `
        INSERT INTO tarifas (compania_id, tipo_cobertura, edad_min, edad_max, suma_asegurada, prima) 
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await db.query(q, [
        parseInt(compania_id), tipo_cobertura, parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima)
      ]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'CREACION_TARIFA', `Nueva tarifa agregada para Compañía ID ${compania_id} (${tipo_cobertura})`);
    res.json({ message: 'Tarifa creada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la tarifa.' });
  }
});

// 9. Actualizar una tarifa individual
router.put('/tariffs/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { compania_id, tipo_cobertura, edad_min, edad_max, suma_asegurada, prima } = req.body;

  if (!compania_id || !tipo_cobertura || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos.' });
  }

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);
      
      const idx = fData.tarifas.findIndex(t => t.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Tarifa no encontrada.' });

      fData.tarifas[idx] = {
        ...fData.tarifas[idx],
        compania_id: parseInt(compania_id),
        tipo_cobertura,
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        prima: parseFloat(prima)
      };
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      const q = `
        UPDATE tarifas 
        SET compania_id = $1, tipo_cobertura = $2, edad_min = $3, edad_max = $4, suma_asegurada = $5, prima = $6 
        WHERE id = $7
      `;
      const resUp = await db.query(q, [
        parseInt(compania_id), tipo_cobertura, parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima), parseInt(id)
      ]);
      if (resUp.rowCount === 0) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    }

    await registrarAccion(req.user.id, req.user.correo, 'EDICION_TARIFA', `Tarifa ID ${id} modificada.`);
    res.json({ message: 'Tarifa actualizada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la tarifa.' });
  }
});

// 10. Eliminar una tarifa individual
router.delete('/tariffs/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);
      
      fData.tarifas = fData.tarifas.filter(t => t.id !== parseInt(id));
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      const q = `DELETE FROM tarifas WHERE id = $1`;
      const resDel = await db.query(q, [parseInt(id)]);
      if (resDel.rowCount === 0) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    }

    await registrarAccion(req.user.id, req.user.correo, 'ELIMINACION_TARIFA', `Tarifa ID ${id} eliminada.`);
    res.json({ message: 'Tarifa eliminada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la tarifa.' });
  }
});

// 11. Listar todas las compañías de seguros
router.get('/companies', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  try {
    const result = await db.query('SELECT id, nombre FROM companias_seguros ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener compañías.' });
  }
});

export default router;
