import express from 'express';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';
import { ejecutarCorridaComisiones } from '../services/commissionService.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function parsePagoMetodos(pagoStr) {
  const s = String(pagoStr || '').toUpperCase();
  return {
    pago_contado: s.includes('CONT') || s.includes('ANUAL') || s.includes('CONTADO'),
    pago_semestral: s.includes('SEM') || s.includes('SEMESTRAL'),
    pago_cuatrimestral: s.includes('CUATRI') || s.includes('CUATRIMESTRAL'),
    pago_trimestral: s.includes('TRIM') || s.includes('TRIMESTRAL'),
    pago_bimestral: s.includes('BIM') || s.includes('BIMESTRAL'),
    pago_4_cuotas: s.includes('4 CUOTA') || s.includes('4CUOTA') || s.includes('4_CUOTA') || s.includes('CUATRO CUOTA'),
    pago_mensual: s.includes('MENS') || s.includes('MEN') || s.includes('MENSUAL')
  };
}

function getPagoBooleans(body) {
  if (body.pago_contado !== undefined || body.pago_semestral !== undefined || body.pago_cuatrimestral !== undefined || body.pago_trimestral !== undefined || body.pago_bimestral !== undefined || body.pago_4_cuotas !== undefined || body.pago_mensual !== undefined) {
    return {
      pago_contado: body.pago_contado === true || body.pago_contado === 'true' || body.pago_contado === 1,
      pago_semestral: body.pago_semestral === true || body.pago_semestral === 'true' || body.pago_semestral === 1,
      pago_cuatrimestral: body.pago_cuatrimestral === true || body.pago_cuatrimestral === 'true' || body.pago_cuatrimestral === 1,
      pago_trimestral: body.pago_trimestral === true || body.pago_trimestral === 'true' || body.pago_trimestral === 1,
      pago_bimestral: body.pago_bimestral === true || body.pago_bimestral === 'true' || body.pago_bimestral === 1,
      pago_4_cuotas: body.pago_4_cuotas === true || body.pago_4_cuotas === 'true' || body.pago_4_cuotas === 1,
      pago_mensual: body.pago_mensual === true || body.pago_mensual === 'true' || body.pago_mensual === 1
    };
  }
  return parsePagoMetodos(body.pago);
}

// Helper: Actualizar metadatos de tarifario (versión y fecha de última modificación)
async function actualizarTarifarioMetadata(usuarioCorreo) {
  const now = new Date().toISOString();
  if (db.isFallback()) {
    try {
      const fData = db.getFallbackData();
      const oldMeta = fData.tarifario_metadata || { version: '1.0.0' };
      const parts = oldMeta.version.split('.');
      const nextPatch = parseInt(parts[2] || 0) + 1;
      const nextVersion = `${parts[0] || '1'}.${parts[1] || '0'}.${nextPatch}`;
      
      fData.tarifario_metadata = {
        version: nextVersion,
        ultima_modificacion: now,
        usuario_correo: usuarioCorreo
      };
      db.saveFallback();
    } catch (e) {
      console.error('Error al actualizar metadatos en fallback:', e);
    }
  } else {
    try {
      const lastMeta = await db.query('SELECT version FROM tarifario_metadata ORDER BY id DESC LIMIT 1');
      let nextVersion = '1.0.1';
      if (lastMeta.rows && lastMeta.rows.length > 0) {
        const parts = lastMeta.rows[0].version.split('.');
        const nextPatch = parseInt(parts[2] || 0) + 1;
        nextVersion = `${parts[0] || '1'}.${parts[1] || '0'}.${nextPatch}`;
      }
      await db.query(
        'INSERT INTO tarifario_metadata (version, ultima_modificacion, usuario_correo) VALUES ($1, CURRENT_TIMESTAMP, $2)',
        [nextVersion, usuarioCorreo]
      );
    } catch (e) {
      console.error('Error al actualizar metadatos en Postgres:', e);
    }
  }
}

// 1. Obtener lista de clientes con métricas útiles para el administrador
router.get('/clients', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const clientsRes = await db.query('SELECT * FROM datos_personales');
    const polsRes = await db.query('SELECT * FROM polizas');
    const paysRes = await db.query('SELECT * FROM pagos');
    const usersRes = await db.query('SELECT id, correo FROM usuarios');

    const mapped = clientsRes.rows.map(c => {
      const cliPols = polsRes.rows.filter(p => parseInt(p.cliente_id) === parseInt(c.id));
      const cliPolIds = cliPols.map(p => parseInt(p.id));
      const cliPays = paysRes.rows.filter(pa => cliPolIds.includes(parseInt(pa.poliza_id)) && pa.estado_pago === 'pagado');
      const totalPagado = cliPays.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
      const userObj = usersRes.rows.find(u => parseInt(u.id) === parseInt(c.usuario_id));

      return {
        id: c.id,
        id_cliente: c.id,
        nombre: `${c.primer_nombre} ${c.primer_apellido}`,
        primer_nombre: c.primer_nombre,
        segundo_nombre: c.segundo_nombre || '',
        primer_apellido: c.primer_apellido,
        segundo_apellido: c.segundo_apellido || '',
        fecha_nacimiento: c.fecha_nacimiento,
        genero: c.genero,
        estado_civil: c.estado_civil,
        tipo_documento: c.tipo_documento,
        nro_documento: c.nro_documento,
        telefono: `${c.codigo_area}-${c.numero_celular}`,
        correo: userObj ? userObj.correo : 'N/A',
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
        id: a.id,
        id_asesor: a.id,
        nombre: a.nombre,
        codigo_asesor: a.codigo_asesor,
        telefono: a.telefono,
        correo: a.correo,
        cedula: a.cedula || 'N/A',
        fecha_nacimiento: a.fecha_nacimiento ? (typeof a.fecha_nacimiento === 'object' ? a.fecha_nacimiento.toISOString().split('T')[0] : String(a.fecha_nacimiento).split('T')[0]) : 'N/A',
        banco: a.banco || 'N/A',
        numero_cuenta: a.numero_cuenta || 'N/A',
        estado: a.estado || 'pendiente',
        tipo_asesor: a.tipo_asesor || 'asesor_3',
        clientes: clientNames || 'Ninguno'
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error('Error al listar asesores en admin:', err);
    res.status(500).json({ error: 'Error del servidor al listar asesores.' });
  }
});

// Registrar un asesor directamente desde Admin con todos los datos
router.post('/advisors', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { correo, contrasena, nombre, cedula, telefono, banco, fecha_nacimiento, numero_cuenta } = req.body;

  if (!correo || !contrasena || !nombre || !cedula || !telefono || !banco || !fecha_nacimiento || !numero_cuenta) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar completos.' });
  }

  try {
    // Verificar si el usuario ya existe
    let exists = false;
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      exists = fData.usuarios.some(u => u.correo.toLowerCase() === correo.toLowerCase());
    } else {
      const checkRes = await db.query('SELECT id FROM usuarios WHERE correo = $1', [correo.toLowerCase()]);
      exists = checkRes.rows.length > 0;
    }

    if (exists) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // Hash contraseña
    const salt = await bcrypt.genSalt(10);
    const hashContrasena = await bcrypt.hash(contrasena, salt);

    let newUserId;
    const code = `ASE-${Math.floor(100 + Math.random() * 900)}`;

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      newUserId = fData.usuarios.length ? Math.max(...fData.usuarios.map(u => u.id)) + 1 : 1;
      
      fData.usuarios.push({
        id: newUserId,
        correo: correo.toLowerCase(),
        contrasena: hashContrasena,
        rango: 'asesor',
        created_at: new Date().toISOString()
      });

      const newAdvId = fData.asesores.length ? Math.max(...fData.asesores.map(a => a.id)) + 1 : 1;
      fData.asesores.push({
        id: newAdvId,
        usuario_id: newUserId,
        nombre,
        codigo_asesor: code,
        correo: correo.toLowerCase(),
        telefono,
        cedula,
        fecha_nacimiento,
        banco,
        numero_cuenta,
        created_at: new Date().toISOString()
      });
      db.saveFallback();
    } else {
      const userRes = await db.query(
        'INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id',
        [correo.toLowerCase(), hashContrasena, 'asesor']
      );
      newUserId = userRes.rows[0].id;

      await db.query(
        `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono, cedula, fecha_nacimiento, banco, numero_cuenta) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newUserId, nombre, code, correo.toLowerCase(), telefono, cedula, fecha_nacimiento, banco, numero_cuenta]
      );
    }

    await registrarAccion(req.user.id, req.user.correo, 'CREAR_ASESOR', `Asesor ${nombre} registrado con éxito. Código: ${code}`);

    res.status(201).json({ message: 'Asesor registrado exitosamente.', codigo_asesor: code });
  } catch (err) {
    console.error('Error al crear asesor:', err);
    res.status(500).json({ error: 'Error del servidor al registrar asesor.' });
  }
});

// Eliminar asesor y su usuario asociado (Borrado físico seguro)
router.delete('/advisors/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;

  try {
    const aId = parseInt(id);
    let name = '';
    let uId = null;

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const adv = fData.asesores.find(a => a.id === aId);
      if (adv) {
        name = adv.nombre;
        uId = adv.usuario_id;
        // Desvincular referencias en polizas, clientes y cotizaciones
        (fData.polizas || []).forEach(p => { if (p.asesor_id === aId) p.asesor_id = null; });
        (fData.datos_personales || []).forEach(d => { if (d.asesor_id === aId) d.asesor_id = null; });
        (fData.cotizaciones || []).forEach(c => { if (c.asesor_id === aId) c.asesor_id = null; });
        if (fData.comisiones_asesores) {
          fData.comisiones_asesores = fData.comisiones_asesores.filter(ca => ca.asesor_id !== aId);
        }
        fData.asesores = fData.asesores.filter(a => a.id !== aId);
        if (uId) {
          fData.usuarios = fData.usuarios.filter(u => u.id !== uId);
          (fData.logs_actividad || []).forEach(l => { if (l.usuario_id === uId) l.usuario_id = null; });
        }
        db.saveFallback();
      }
    } else {
      const checkRes = await db.query('SELECT nombre, usuario_id FROM asesores WHERE id = $1', [aId]);
      if (checkRes.rows.length > 0) {
        name = checkRes.rows[0].nombre;
        uId = checkRes.rows[0].usuario_id;
        
        // 1. Desvincular claves foráneas en tablas dependientes
        await db.query('UPDATE polizas SET asesor_id = NULL WHERE asesor_id = $1', [aId]);
        await db.query('UPDATE datos_personales SET asesor_id = NULL WHERE asesor_id = $1', [aId]);
        await db.query('UPDATE cotizaciones SET asesor_id = NULL WHERE asesor_id = $1', [aId]);
        try {
          await db.query('UPDATE historico_comisiones SET asesor_id = NULL WHERE asesor_id = $1', [aId]);
          await db.query('DELETE FROM comisiones_asesores WHERE asesor_id = $1', [aId]);
        } catch (eCom) {
          console.warn('Advertencia comisiones asesor al eliminar:', eCom.message);
        }

        // 2. Eliminar de la tabla asesores
        await db.query('DELETE FROM asesores WHERE id = $1', [aId]);

        // 3. Eliminar usuario asociado
        if (uId) {
          try {
            await db.query('UPDATE logs_actividad SET usuario_id = NULL WHERE usuario_id = $1', [uId]);
          } catch (eLog) {}
          await db.query('DELETE FROM usuarios WHERE id = $1', [uId]);
        }
      }
    }

    await registrarAccion(req.user.id, req.user.correo, 'ELIMINAR_ASESOR', `Asesor ${name} (ID: ${aId}) eliminado del sistema.`);
    res.json({ message: 'Asesor y usuario asociado eliminados correctamente.' });
  } catch (err) {
    console.error('Error al eliminar asesor:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar el asesor.' });
  }
});

// Actualizar el estado de aprobación / borrado lógico de un asesor
router.put('/advisors/:id/status', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { estado } = req.body;

  const validStatuses = ['aprobado', 'pendiente', 'rechazado', 'inactivo'];
  if (!validStatuses.includes(estado)) {
    return res.status(400).json({ error: 'Estado de aprobación no válido.' });
  }

  try {
    const aId = parseInt(id);
    let name = '';

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.asesores.findIndex(a => a.id === aId);
      if (idx === -1) return res.status(404).json({ error: 'Asesor no encontrado.' });
      fData.asesores[idx].estado = estado;
      name = fData.asesores[idx].nombre;
      db.saveFallback();
    } else {
      const checkRes = await db.query('SELECT nombre FROM asesores WHERE id = $1', [aId]);
      if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Asesor no encontrado.' });
      name = checkRes.rows[0].nombre;
      await db.query('UPDATE asesores SET estado = $1 WHERE id = $2', [estado, aId]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'APROBACION_ASESOR', `Estado de asesor ${name} (ID: ${aId}) cambiado a ${estado}.`);
    res.json({ message: `Estado del asesor cambiado a ${estado}.`, estado });
  } catch (err) {
    console.error('Error al actualizar estado del asesor:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar estado.' });
  }
});

// Actualizar el nivel de comisiones de un asesor (Jerarquía)
router.put('/advisors/:id/level', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { tipo_asesor } = req.body;

  const validLevels = ['asesor_1', 'asesor_2', 'asesor_3', 'consultor_1', 'consultor_2', 'johans', 'nivel_1_subagente', 'nivel_2_agente'];
  if (!tipo_asesor || !validLevels.includes(tipo_asesor)) {
    return res.status(400).json({ error: 'Nivel de asesor no válido.' });
  }

  try {
    const aId = parseInt(id);
    let name = '';

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.asesores.findIndex(a => a.id === aId);
      if (idx === -1) return res.status(404).json({ error: 'Asesor no encontrado.' });
      fData.asesores[idx].tipo_asesor = tipo_asesor;
      name = fData.asesores[idx].nombre;
      db.saveFallback();
    } else {
      const checkRes = await db.query('SELECT nombre FROM asesores WHERE id = $1', [aId]);
      if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Asesor no encontrado.' });
      name = checkRes.rows[0].nombre;
      await db.query('UPDATE asesores SET tipo_asesor = $1 WHERE id = $2', [tipo_asesor, aId]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'CAMBIO_NIVEL_ASESOR', `Nivel de asesor ${name} (ID: ${aId}) cambiado a ${tipo_asesor}.`);
    res.json({ message: `Nivel del asesor ${name} actualizado a ${tipo_asesor}.`, tipo_asesor });
  } catch (err) {
    console.error('Error al actualizar nivel del asesor:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar nivel del asesor.' });
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

    let loadedCount = 0;

    if (db.isFallback()) {
      const compMap = {};
      const compIdSet = new Set();
      const fData = db.getFallbackData();

      fData.companias_seguros.forEach(c => {
        compMap[c.nombre.toLowerCase().trim()] = c.id;
        compIdSet.add(c.id);
      });

      const nuevasTarifas = [];
      parsedData.forEach((t, idx) => {
        let cId = null;
        const compName = (t.compania || t.compania_nombre || '').trim();
        if (compName && compMap[compName.toLowerCase()]) {
          cId = compMap[compName.toLowerCase()];
        } else if (compName) {
          cId = fData.companias_seguros.length ? Math.max(...fData.companias_seguros.map(c => c.id)) + 1 : 1;
          fData.companias_seguros.push({ id: cId, nombre: compName, created_at: new Date().toISOString() });
          compMap[compName.toLowerCase()] = cId;
          compIdSet.add(cId);
        } else if (t.compania_id && compIdSet.has(parseInt(t.compania_id))) {
          cId = parseInt(t.compania_id);
        } else {
          cId = fData.companias_seguros[0]?.id || 1;
        }

        const edadMin = parseInt(t.edad_min);
        const edadMax = parseInt(t.edad_max);
        const sumaAsegurada = parseFloat(t.suma_asegurada);
        const deducibleVal = parseFloat(t.deducible || 0);
        const primaVal = parseFloat(t.prima);

        if (isNaN(edadMin) || isNaN(edadMax) || isNaN(sumaAsegurada) || isNaN(primaVal)) {
          return;
        }

        const metodos = getPagoBooleans(t);
        const atMedPrim = t.atencion_medica_primaria !== undefined ? (t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL') : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos);
        const meds = t.medicinas !== undefined ? (t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL') : false;
        const consMed = t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO'))) : false;
        const rehab = t.rehabilitacion !== undefined ? (t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL') : false;
        const prot = t.protesis !== undefined ? (t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL') : false;
        const muletaSilla = t.muleta_silla_ruedas !== undefined ? (t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL') : false;
        const consult = t.consultas !== undefined ? (t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL') : false;
        const mat = t.maternidad !== undefined ? (t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL') : false;
        const oftalmo = t.oftalmologia !== undefined ? (t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL') : false;
        const odonto = t.odontologia !== undefined ? (t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL') : false;
        const muerteAcc = t.muerte_accidental !== undefined ? (t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL') : false;
        const invalidezPerm = t.invalidez_permanente !== undefined ? (t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL') : false;

        const row = {
          id: idx + 1,
          compania_id: cId,
          edad_min: edadMin,
          edad_max: edadMax,
          suma_asegurada: sumaAsegurada,
          deducible: deducibleVal,
          prima: primaVal,
          plan: t.plan || '',
          pago: t.pago || '',
          pago_contado: metodos.pago_contado,
          pago_semestral: metodos.pago_semestral,
          pago_cuatrimestral: metodos.pago_cuatrimestral,
          pago_trimestral: metodos.pago_trimestral,
          pago_bimestral: metodos.pago_bimestral,
          pago_4_cuotas: metodos.pago_4_cuotas,
          pago_mensual: metodos.pago_mensual,
          maternidad_suma: t.maternidad_suma || '',
          maternidad_costo: t.maternidad_costo || '',
          asist_intl_suma: t.asist_intl_suma || '',
          asist_intl_costo: t.asist_intl_costo || '',
          funeral_suma: t.funeral_suma || '',
          funeral_costo: t.funeral_costo || '',
          at_situ_medicamentos: t.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
          atencion_medica_primaria: atMedPrim,
          medicinas: meds,
          consultas_medicas: consMed,
          rehabilitacion: rehab,
          protesis: prot,
          muleta_silla_ruedas: muletaSilla,
          examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
          consultas: consult,
          maternidad: mat,
          oftalmologia: oftalmo,
          odontologia: odonto,
          muerte_accidental: muerteAcc,
          muerte_accidental_suma: t.muerte_accidental_suma || '',
          muerte_accidental_costo: t.muerte_accidental_costo || '',
          invalidez_permanente: invalidezPerm,
          invalidez_permanente_suma: t.invalidez_permanente_suma || '',
          invalidez_permanente_costo: t.invalidez_permanente_costo || '',
          ambulancia: t.ambulancia || '',
          ramo: t.ramo || 'Salud',
          created_at: new Date().toISOString()
        };

        nuevasTarifas.push(row);
        loadedCount++;
      });

      fData.tarifas = nuevasTarifas;
      db.saveFallback();
    } else {
      await db.query('DELETE FROM tarifas');
      const comps = await db.query('SELECT id, nombre FROM companias_seguros');
      const compMap = {};
      const compIdSet = new Set();
      comps.rows.forEach(c => {
        compMap[c.nombre.toLowerCase().trim()] = c.id;
        compIdSet.add(c.id);
      });

      for (const t of parsedData) {
        let cId = null;
        const compName = (t.compania || t.compania_nombre || '').trim();
        if (compName && compMap[compName.toLowerCase()]) {
          cId = compMap[compName.toLowerCase()];
        } else if (compName) {
          const insRes = await db.query(
            'INSERT INTO companias_seguros (nombre) VALUES ($1) RETURNING id',
            [compName]
          );
          cId = insRes.rows[0].id;
          compMap[compName.toLowerCase()] = cId;
          compIdSet.add(cId);
        } else if (t.compania_id && compIdSet.has(parseInt(t.compania_id))) {
          cId = parseInt(t.compania_id);
        } else if (comps.rows.length > 0) {
          cId = comps.rows[0].id;
        } else {
          cId = 1;
        }

        const edadMin = parseInt(t.edad_min);
        const edadMax = parseInt(t.edad_max);
        const sumaAsegurada = parseFloat(t.suma_asegurada);
        const deducibleVal = parseFloat(t.deducible || 0);
        const primaVal = parseFloat(t.prima);

        if (isNaN(edadMin) || isNaN(edadMax) || isNaN(sumaAsegurada) || isNaN(primaVal)) {
          continue;
        }

        const metodos = getPagoBooleans(t);
        const atMedPrim = t.atencion_medica_primaria !== undefined ? (t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL') : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos);
        const meds = t.medicinas !== undefined ? (t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL') : false;
        const consMed = t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO'))) : false;
        const rehab = t.rehabilitacion !== undefined ? (t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL') : false;
        const prot = t.protesis !== undefined ? (t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL') : false;
        const muletaSilla = t.muleta_silla_ruedas !== undefined ? (t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL') : false;
        const consult = t.consultas !== undefined ? (t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL') : false;
        const mat = t.maternidad !== undefined ? (t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL') : false;
        const oftalmo = t.oftalmologia !== undefined ? (t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL') : false;
        const odonto = t.odontologia !== undefined ? (t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL') : false;
        const muerteAcc = t.muerte_accidental !== undefined ? (t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL') : false;
        const invalidezPerm = t.invalidez_permanente !== undefined ? (t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL') : false;

        const q = `
          INSERT INTO tarifas (
            compania_id, edad_min, edad_max, suma_asegurada, deducible, prima,
            plan, pago, pago_contado, pago_semestral, pago_cuatrimestral, pago_trimestral, pago_bimestral, pago_4_cuotas, pago_mensual,
            maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
            funeral_suma, funeral_costo, at_situ_medicamentos, atencion_medica_primaria, medicinas, consultas_medicas,
            rehabilitacion, protesis, muleta_silla_ruedas, examenes_lab_imagenologia, consultas, maternidad,
            oftalmologia, odontologia, muerte_accidental, muerte_accidental_suma, muerte_accidental_costo,
            invalidez_permanente, invalidez_permanente_suma, invalidez_permanente_costo, ambulancia, ramo
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
          )
        `;

        await db.query(q, [
          cId, edadMin, edadMax, sumaAsegurada, deducibleVal, primaVal,
          t.plan || '', t.pago || '',
          metodos.pago_contado, metodos.pago_semestral, metodos.pago_cuatrimestral, metodos.pago_trimestral, metodos.pago_bimestral, metodos.pago_4_cuotas, metodos.pago_mensual,
          t.maternidad_suma || '', t.maternidad_costo || '', t.asist_intl_suma || '', t.asist_intl_costo || '',
          t.funeral_suma || '', t.funeral_costo || '', t.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
          atMedPrim, meds,
          typeof consMed === 'boolean' ? (consMed ? 'INCL' : '') : (consMed || ''),
          rehab, prot, muletaSilla,
          t.examenes_lab_imagenologia || '',
          consult, mat,
          oftalmo, odonto,
          muerteAcc, t.muerte_accidental_suma || '', t.muerte_accidental_costo || '',
          invalidezPerm, t.invalidez_permanente_suma || '', t.invalidez_permanente_costo || '',
          t.ambulancia || '',
          t.ramo || 'Salud'
        ]);
        loadedCount++;
      }
    }

    // Trazabilidad
    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'CARGA_TARIFAS', `Cargadas masivamente ${loadedCount} tarifas en el sistema.`);

    res.json({ message: 'Carga masiva realizada con éxito.', count: loadedCount });

  } catch (err) {
    console.error('Error al realizar carga masiva:', err);
    res.status(500).json({ error: 'Error al procesar el archivo. Verifique que sea un archivo JSON válido.' });
  }
});

// 7. Listar todas las tarifas actuales
router.get('/tariffs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') return res.status(403).json({ error: 'No autorizado.' });
  try {
    const q = `
      SELECT t.*, c.nombre AS compania_nombre
      FROM tarifas t
      LEFT JOIN companias_seguros c ON t.compania_id = c.id
      ORDER BY t.edad_min ASC, t.suma_asegurada ASC, c.nombre ASC
    `;
    const result = await db.query(q);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tarifas.' });
  }
});

// Campos de beneficios de una tarifa (texto libre o flags: montos, "INCL", "NO", frecuencias, etc.)
const TARIFF_BENEFIT_FIELDS = [
  'plan', 'pago', 'maternidad_suma', 'maternidad_costo', 'asist_intl_suma', 'asist_intl_costo',
  'funeral_suma', 'funeral_costo', 'at_situ_medicamentos', 'atencion_medica_primaria', 'medicinas', 'consultas_medicas',
  'rehabilitacion', 'protesis', 'muleta_silla_ruedas', 'examenes_lab_imagenologia', 'consultas', 'maternidad',
  'oftalmologia', 'odontologia', 'ambulancia',
  'muerte_accidental', 'muerte_accidental_suma', 'muerte_accidental_costo',
  'invalidez_permanente', 'invalidez_permanente_suma', 'invalidez_permanente_costo'
];

// 8. Crear una tarifa individual
router.post('/tariffs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { compania_id, edad_min, edad_max, suma_asegurada, prima, deducible } = req.body;

  if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos (Aseguradora, Edades, Suma Asegurada, Prima).' });
  }

  try {
    const metodos = getPagoBooleans(req.body);
    const atMedPrim = req.body.atencion_medica_primaria !== undefined ? (req.body.atencion_medica_primaria === true || req.body.atencion_medica_primaria === 'true' || req.body.atencion_medica_primaria === 'INCL') : (req.body.at_situ_medicamentos === 'INCL' || !!req.body.at_situ_medicamentos);
    const meds = req.body.medicinas !== undefined ? (req.body.medicinas === true || req.body.medicinas === 'true' || req.body.medicinas === 'INCL') : false;
    const consMed = req.body.consultas_medicas !== undefined ? (typeof req.body.consultas_medicas === 'boolean' ? req.body.consultas_medicas : (req.body.consultas_medicas === 'INCL' || req.body.consultas_medicas === '2/AÑO' || (typeof req.body.consultas_medicas === 'string' && req.body.consultas_medicas.length > 0 && req.body.consultas_medicas !== 'NO'))) : false;
    const rehab = req.body.rehabilitacion !== undefined ? (req.body.rehabilitacion === true || req.body.rehabilitacion === 'true' || req.body.rehabilitacion === 'INCL') : false;
    const prot = req.body.protesis !== undefined ? (req.body.protesis === true || req.body.protesis === 'true' || req.body.protesis === 'INCL') : false;
    const muletaSilla = req.body.muleta_silla_ruedas !== undefined ? (req.body.muleta_silla_ruedas === true || req.body.muleta_silla_ruedas === 'true' || req.body.muleta_silla_ruedas === 'INCL') : false;
    const consult = req.body.consultas !== undefined ? (req.body.consultas === true || req.body.consultas === 'true' || req.body.consultas === 'INCL') : false;
    const mat = req.body.maternidad !== undefined ? (req.body.maternidad === true || req.body.maternidad === 'true' || req.body.maternidad === 'INCL') : false;
    const oftalmo = req.body.oftalmologia !== undefined ? (req.body.oftalmologia === true || req.body.oftalmologia === 'true' || req.body.oftalmologia === 'INCL') : false;
    const odonto = req.body.odontologia !== undefined ? (req.body.odontologia === true || req.body.odontologia === 'true' || req.body.odontologia === 'INCL') : false;
    const muerteAcc = req.body.muerte_accidental !== undefined ? (req.body.muerte_accidental === true || req.body.muerte_accidental === 'true' || req.body.muerte_accidental === 'INCL') : false;
    const invalidezPerm = req.body.invalidez_permanente !== undefined ? (req.body.invalidez_permanente === true || req.body.invalidez_permanente === 'true' || req.body.invalidez_permanente === 'INCL') : false;

    let createdTariff = null;

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const newId = fData.tarifas.length > 0 ? Math.max(...fData.tarifas.map(t => t.id)) + 1 : 1;
      createdTariff = {
        id: newId,
        compania_id: parseInt(compania_id),
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        deducible: parseFloat(deducible || 0),
        prima: parseFloat(prima),
        pago_contado: metodos.pago_contado,
        pago_semestral: metodos.pago_semestral,
        pago_cuatrimestral: metodos.pago_cuatrimestral,
        pago_trimestral: metodos.pago_trimestral,
        pago_bimestral: metodos.pago_bimestral,
        pago_4_cuotas: metodos.pago_4_cuotas,
        pago_mensual: metodos.pago_mensual,
        atencion_medica_primaria: atMedPrim,
        medicinas: meds,
        consultas_medicas: consMed,
        rehabilitacion: rehab,
        protesis: prot,
        muleta_silla_ruedas: muletaSilla,
        consultas: consult,
        maternidad: mat,
        oftalmologia: oftalmo,
        odontologia: odonto,
        muerte_accidental: muerteAcc,
        muerte_accidental_suma: req.body.muerte_accidental_suma || '',
        muerte_accidental_costo: req.body.muerte_accidental_costo || '',
        invalidez_permanente: invalidezPerm,
        invalidez_permanente_suma: req.body.invalidez_permanente_suma || '',
        invalidez_permanente_costo: req.body.invalidez_permanente_costo || '',
        ramo: req.body.ramo || 'Salud',
        created_at: new Date().toISOString()
      };
      TARIFF_BENEFIT_FIELDS.forEach(f => {
        if (createdTariff[f] === undefined) {
          createdTariff[f] = req.body[f] || '';
        }
      });
      fData.tarifas.push(createdTariff);
      db.saveFallback();
    } else {
      const q = `
        INSERT INTO tarifas (
          compania_id, edad_min, edad_max, suma_asegurada, deducible, prima,
          plan, pago, pago_contado, pago_semestral, pago_cuatrimestral, pago_trimestral, pago_bimestral, pago_4_cuotas, pago_mensual,
          maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
          funeral_suma, funeral_costo, at_situ_medicamentos, atencion_medica_primaria, medicinas, consultas_medicas,
          rehabilitacion, protesis, muleta_silla_ruedas, examenes_lab_imagenologia, consultas, maternidad,
          oftalmologia, odontologia, muerte_accidental, muerte_accidental_suma, muerte_accidental_costo,
          invalidez_permanente, invalidez_permanente_suma, invalidez_permanente_costo, ambulancia, ramo
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
          $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
        )
        RETURNING *
      `;
      const insRes = await db.query(q, [
        parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima),
        req.body.plan || '', req.body.pago || '',
        metodos.pago_contado, metodos.pago_semestral, metodos.pago_cuatrimestral, metodos.pago_trimestral, metodos.pago_bimestral, metodos.pago_4_cuotas, metodos.pago_mensual,
        req.body.maternidad_suma || '', req.body.maternidad_costo || '', req.body.asist_intl_suma || '', req.body.asist_intl_costo || '',
        req.body.funeral_suma || '', req.body.funeral_costo || '', req.body.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
        atMedPrim, meds,
        typeof consMed === 'boolean' ? (consMed ? 'INCL' : '') : (consMed || ''),
        rehab, prot, muletaSilla,
        req.body.examenes_lab_imagenologia || '',
        consult, mat,
        oftalmo, odonto,
        muerteAcc, req.body.muerte_accidental_suma || '', req.body.muerte_accidental_costo || '',
        invalidezPerm, req.body.invalidez_permanente_suma || '', req.body.invalidez_permanente_costo || '',
        req.body.ambulancia || '',
        req.body.ramo || 'Salud'
      ]);
      createdTariff = insRes.rows[0];
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'CREACION_TARIFA', `Nueva tarifa agregada para Compañía ID ${compania_id} (plan ${req.body.plan || 'N/A'})`);
    res.json({ message: 'Tarifa creada correctamente.', tarifa: createdTariff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la tarifa.' });
  }
});

// 9. Actualizar una tarifa individual
router.put('/tariffs/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { compania_id, edad_min, edad_max, suma_asegurada, prima, deducible } = req.body;

  if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos.' });
  }

  try {
    const metodos = getPagoBooleans(req.body);
    const atMedPrim = req.body.atencion_medica_primaria !== undefined ? (req.body.atencion_medica_primaria === true || req.body.atencion_medica_primaria === 'true' || req.body.atencion_medica_primaria === 'INCL') : (req.body.at_situ_medicamentos === 'INCL' || !!req.body.at_situ_medicamentos);
    const meds = req.body.medicinas !== undefined ? (req.body.medicinas === true || req.body.medicinas === 'true' || req.body.medicinas === 'INCL') : false;
    const consMed = req.body.consultas_medicas !== undefined ? (typeof req.body.consultas_medicas === 'boolean' ? req.body.consultas_medicas : (req.body.consultas_medicas === 'INCL' || req.body.consultas_medicas === '2/AÑO' || (typeof req.body.consultas_medicas === 'string' && req.body.consultas_medicas.length > 0 && req.body.consultas_medicas !== 'NO'))) : false;
    const rehab = req.body.rehabilitacion !== undefined ? (req.body.rehabilitacion === true || req.body.rehabilitacion === 'true' || req.body.rehabilitacion === 'INCL') : false;
    const prot = req.body.protesis !== undefined ? (req.body.protesis === true || req.body.protesis === 'true' || req.body.protesis === 'INCL') : false;
    const muletaSilla = req.body.muleta_silla_ruedas !== undefined ? (req.body.muleta_silla_ruedas === true || req.body.muleta_silla_ruedas === 'true' || req.body.muleta_silla_ruedas === 'INCL') : false;
    const consult = req.body.consultas !== undefined ? (req.body.consultas === true || req.body.consultas === 'true' || req.body.consultas === 'INCL') : false;
    const mat = req.body.maternidad !== undefined ? (req.body.maternidad === true || req.body.maternidad === 'true' || req.body.maternidad === 'INCL') : false;
    const oftalmo = req.body.oftalmologia !== undefined ? (req.body.oftalmologia === true || req.body.oftalmologia === 'true' || req.body.oftalmologia === 'INCL') : false;
    const odonto = req.body.odontologia !== undefined ? (req.body.odontologia === true || req.body.odontologia === 'true' || req.body.odontologia === 'INCL') : false;
    const muerteAcc = req.body.muerte_accidental !== undefined ? (req.body.muerte_accidental === true || req.body.muerte_accidental === 'true' || req.body.muerte_accidental === 'INCL') : false;
    const invalidezPerm = req.body.invalidez_permanente !== undefined ? (req.body.invalidez_permanente === true || req.body.invalidez_permanente === 'true' || req.body.invalidez_permanente === 'INCL') : false;

    let updatedTariff = null;

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.tarifas.findIndex(t => t.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Tarifa no encontrada.' });

      updatedTariff = {
        ...fData.tarifas[idx],
        compania_id: parseInt(compania_id),
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        deducible: deducible !== undefined ? parseFloat(deducible) : (fData.tarifas[idx].deducible || 0),
        prima: parseFloat(prima),
        pago_contado: metodos.pago_contado,
        pago_semestral: metodos.pago_semestral,
        pago_cuatrimestral: metodos.pago_cuatrimestral,
        pago_trimestral: metodos.pago_trimestral,
        pago_bimestral: metodos.pago_bimestral,
        pago_4_cuotas: metodos.pago_4_cuotas,
        pago_mensual: metodos.pago_mensual,
        atencion_medica_primaria: atMedPrim,
        medicinas: meds,
        consultas_medicas: consMed,
        rehabilitacion: rehab,
        protesis: prot,
        muleta_silla_ruedas: muletaSilla,
        consultas: consult,
        maternidad: mat,
        oftalmologia: oftalmo,
        odontologia: odonto,
        muerte_accidental: muerteAcc,
        muerte_accidental_suma: req.body.muerte_accidental_suma ?? (fData.tarifas[idx].muerte_accidental_suma || ''),
        muerte_accidental_costo: req.body.muerte_accidental_costo ?? (fData.tarifas[idx].muerte_accidental_costo || ''),
        invalidez_permanente: invalidezPerm,
        invalidez_permanente_suma: req.body.invalidez_permanente_suma ?? (fData.tarifas[idx].invalidez_permanente_suma || ''),
        invalidez_permanente_costo: req.body.invalidez_permanente_costo ?? (fData.tarifas[idx].invalidez_permanente_costo || ''),
        ramo: req.body.ramo || fData.tarifas[idx].ramo || 'Salud'
      };
      TARIFF_BENEFIT_FIELDS.forEach(f => {
        if (!['atencion_medica_primaria', 'medicinas', 'consultas_medicas', 'rehabilitacion', 'protesis', 'muleta_silla_ruedas', 'consultas', 'maternidad', 'oftalmologia', 'odontologia', 'muerte_accidental', 'invalidez_permanente'].includes(f)) {
          updatedTariff[f] = req.body[f] ?? updatedTariff[f] ?? '';
        }
      });
      fData.tarifas[idx] = updatedTariff;
      db.saveFallback();
    } else {
      const q = `
        UPDATE tarifas
        SET compania_id = $1, edad_min = $2, edad_max = $3, suma_asegurada = $4, deducible = $5, prima = $6,
            plan = $7, pago = $8, pago_contado = $9, pago_semestral = $10, pago_cuatrimestral = $11, pago_trimestral = $12,
            pago_bimestral = $13, pago_4_cuotas = $14, pago_mensual = $15,
            maternidad_suma = $16, maternidad_costo = $17, asist_intl_suma = $18, asist_intl_costo = $19,
            funeral_suma = $20, funeral_costo = $21, at_situ_medicamentos = $22, atencion_medica_primaria = $23, medicinas = $24, consultas_medicas = $25,
            rehabilitacion = $26, protesis = $27, muleta_silla_ruedas = $28, examenes_lab_imagenologia = $29, consultas = $30, maternidad = $31,
            oftalmologia = $32, odontologia = $33, muerte_accidental = $34, muerte_accidental_suma = $35, muerte_accidental_costo = $36,
            invalidez_permanente = $37, invalidez_permanente_suma = $38, invalidez_permanente_costo = $39, ambulancia = $40, ramo = $41
        WHERE id = $42
        RETURNING *
      `;
      const resUp = await db.query(q, [
        parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima),
        req.body.plan || '', req.body.pago || '',
        metodos.pago_contado, metodos.pago_semestral, metodos.pago_cuatrimestral, metodos.pago_trimestral, metodos.pago_bimestral, metodos.pago_4_cuotas, metodos.pago_mensual,
        req.body.maternidad_suma || '', req.body.maternidad_costo || '', req.body.asist_intl_suma || '', req.body.asist_intl_costo || '',
        req.body.funeral_suma || '', req.body.funeral_costo || '', req.body.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
        atMedPrim, meds,
        typeof consMed === 'boolean' ? (consMed ? 'INCL' : '') : (consMed || ''),
        rehab, prot, muletaSilla,
        req.body.examenes_lab_imagenologia || '',
        consult, mat,
        oftalmo, odonto,
        muerteAcc, req.body.muerte_accidental_suma || '', req.body.muerte_accidental_costo || '',
        invalidezPerm, req.body.invalidez_permanente_suma || '', req.body.invalidez_permanente_costo || '',
        req.body.ambulancia || '',
        req.body.ramo || 'Salud',
        parseInt(id)
      ]);
      if (resUp.rowCount === 0) return res.status(404).json({ error: 'Tarifa no encontrada.' });
      updatedTariff = resUp.rows[0];
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'EDICION_TARIFA', `Tarifa ID ${id} modificada.`);
    res.json({ message: 'Tarifa actualizada correctamente.', tarifa: updatedTariff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la tarifa.' });
  }
});

// 9.5 Guardar tarifas modificadas/nuevas en lote
router.post('/tariffs/bulk', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { tariffs } = req.body;

  if (!Array.isArray(tariffs)) {
    return res.status(400).json({ error: 'El cuerpo debe ser una lista de tarifas.' });
  }

  try {
    let savedCount = 0;
    if (db.isFallback()) {
      const fData = db.getFallbackData();

      for (const t of tariffs) {
        const { id, compania_id, edad_min, edad_max, suma_asegurada, prima, deducible } = t;
        if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
          continue;
        }

        const metodos = getPagoBooleans(t);
        const atMedPrim = t.atencion_medica_primaria !== undefined ? (t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL') : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos);
        const meds = t.medicinas !== undefined ? (t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL') : false;
        const consMed = t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO'))) : false;
        const rehab = t.rehabilitacion !== undefined ? (t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL') : false;
        const prot = t.protesis !== undefined ? (t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL') : false;
        const muletaSilla = t.muleta_silla_ruedas !== undefined ? (t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL') : false;
        const consult = t.consultas !== undefined ? (t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL') : false;
        const mat = t.maternidad !== undefined ? (t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL') : false;
        const oftalmo = t.oftalmologia !== undefined ? (t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL') : false;
        const odonto = t.odontologia !== undefined ? (t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL') : false;
        const muerteAcc = t.muerte_accidental !== undefined ? (t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL') : false;
        const invalidezPerm = t.invalidez_permanente !== undefined ? (t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL') : false;

        const isNew = String(id).startsWith('new-');
        if (isNew) {
          const newId = fData.tarifas.length > 0 ? Math.max(...fData.tarifas.map(item => item.id)) + 1 : 1;
          const row = {
            id: newId,
            compania_id: parseInt(compania_id),
            edad_min: parseInt(edad_min),
            edad_max: parseInt(edad_max),
            suma_asegurada: parseFloat(suma_asegurada),
            deducible: parseFloat(deducible || 0),
            prima: parseFloat(prima),
            pago_contado: metodos.pago_contado,
            pago_semestral: metodos.pago_semestral,
            pago_cuatrimestral: metodos.pago_cuatrimestral,
            pago_trimestral: metodos.pago_trimestral,
            pago_bimestral: metodos.pago_bimestral,
            pago_4_cuotas: metodos.pago_4_cuotas,
            pago_mensual: metodos.pago_mensual,
            atencion_medica_primaria: atMedPrim,
            medicinas: meds,
            consultas_medicas: consMed,
            rehabilitacion: rehab,
            protesis: prot,
            muleta_silla_ruedas: muletaSilla,
            consultas: consult,
            maternidad: mat,
            oftalmologia: oftalmo,
            odontologia: odonto,
            muerte_accidental: muerteAcc,
            muerte_accidental_suma: t.muerte_accidental_suma || '',
            muerte_accidental_costo: t.muerte_accidental_costo || '',
            invalidez_permanente: invalidezPerm,
            invalidez_permanente_suma: t.invalidez_permanente_suma || '',
            invalidez_permanente_costo: t.invalidez_permanente_costo || '',
            ramo: t.ramo || 'Salud',
            created_at: new Date().toISOString()
          };
          TARIFF_BENEFIT_FIELDS.forEach(f => {
            if (row[f] === undefined) {
              row[f] = t[f] || '';
            }
          });
          fData.tarifas.push(row);
          savedCount++;
        } else {
          const idx = fData.tarifas.findIndex(item => item.id === parseInt(id));
          if (idx !== -1) {
            const updated = {
              ...fData.tarifas[idx],
              compania_id: parseInt(compania_id),
              edad_min: parseInt(edad_min),
              edad_max: parseInt(edad_max),
              suma_asegurada: parseFloat(suma_asegurada),
              deducible: deducible !== undefined ? parseFloat(deducible) : (fData.tarifas[idx].deducible || 0),
              prima: parseFloat(prima),
              pago_contado: metodos.pago_contado,
              pago_semestral: metodos.pago_semestral,
              pago_cuatrimestral: metodos.pago_cuatrimestral,
              pago_trimestral: metodos.pago_trimestral,
              pago_bimestral: metodos.pago_bimestral,
              pago_4_cuotas: metodos.pago_4_cuotas,
              pago_mensual: metodos.pago_mensual,
              atencion_medica_primaria: atMedPrim,
              medicinas: meds,
              consultas_medicas: consMed,
              rehabilitacion: rehab,
              protesis: prot,
              muleta_silla_ruedas: muletaSilla,
              consultas: consult,
              maternidad: mat,
              oftalmologia: oftalmo,
              odontologia: odonto,
              muerte_accidental: muerteAcc,
              muerte_accidental_suma: t.muerte_accidental_suma ?? (fData.tarifas[idx].muerte_accidental_suma || ''),
              muerte_accidental_costo: t.muerte_accidental_costo ?? (fData.tarifas[idx].muerte_accidental_costo || ''),
              invalidez_permanente: invalidezPerm,
              invalidez_permanente_suma: t.invalidez_permanente_suma ?? (fData.tarifas[idx].invalidez_permanente_suma || ''),
              invalidez_permanente_costo: t.invalidez_permanente_costo ?? (fData.tarifas[idx].invalidez_permanente_costo || ''),
              ramo: t.ramo || fData.tarifas[idx].ramo || 'Salud'
            };
            TARIFF_BENEFIT_FIELDS.forEach(f => {
              if (!['atencion_medica_primaria', 'medicinas', 'consultas_medicas', 'rehabilitacion', 'protesis', 'muleta_silla_ruedas', 'consultas', 'maternidad', 'oftalmologia', 'odontologia', 'muerte_accidental', 'invalidez_permanente'].includes(f)) {
                updated[f] = t[f] ?? updated[f] ?? '';
              }
            });
            fData.tarifas[idx] = updated;
            savedCount++;
          }
        }
      }
      db.saveFallback();
    } else {
      for (const t of tariffs) {
        const { id, compania_id, edad_min, edad_max, suma_asegurada, prima, deducible } = t;
        if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
          continue;
        }

        const metodos = getPagoBooleans(t);
        const atMedPrim = t.atencion_medica_primaria !== undefined ? (t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL') : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos);
        const meds = t.medicinas !== undefined ? (t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL') : false;
        const consMed = t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO'))) : false;
        const rehab = t.rehabilitacion !== undefined ? (t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL') : false;
        const prot = t.protesis !== undefined ? (t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL') : false;
        const muletaSilla = t.muleta_silla_ruedas !== undefined ? (t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL') : false;
        const consult = t.consultas !== undefined ? (t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL') : false;
        const mat = t.maternidad !== undefined ? (t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL') : false;
        const oftalmo = t.oftalmologia !== undefined ? (t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL') : false;
        const odonto = t.odontologia !== undefined ? (t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL') : false;
        const muerteAcc = t.muerte_accidental !== undefined ? (t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL') : false;
        const invalidezPerm = t.invalidez_permanente !== undefined ? (t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL') : false;

        const isNew = String(id).startsWith('new-');
        if (isNew) {
          const q = `
            INSERT INTO tarifas (
              compania_id, edad_min, edad_max, suma_asegurada, deducible, prima,
              plan, pago, pago_contado, pago_semestral, pago_cuatrimestral, pago_trimestral, pago_bimestral, pago_4_cuotas, pago_mensual,
              maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
              funeral_suma, funeral_costo, at_situ_medicamentos, atencion_medica_primaria, medicinas, consultas_medicas,
              rehabilitacion, protesis, muleta_silla_ruedas, examenes_lab_imagenologia, consultas, maternidad,
              oftalmologia, odontologia, muerte_accidental, muerte_accidental_suma, muerte_accidental_costo,
              invalidez_permanente, invalidez_permanente_suma, invalidez_permanente_costo, ambulancia, ramo
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
              $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
            )
          `;
          await db.query(q, [
            parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima),
            t.plan || '', t.pago || '',
            metodos.pago_contado, metodos.pago_semestral, metodos.pago_cuatrimestral, metodos.pago_trimestral, metodos.pago_bimestral, metodos.pago_4_cuotas, metodos.pago_mensual,
            t.maternidad_suma || '', t.maternidad_costo || '', t.asist_intl_suma || '', t.asist_intl_costo || '',
            t.funeral_suma || '', t.funeral_costo || '', t.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
            atMedPrim, meds,
            typeof consMed === 'boolean' ? (consMed ? 'INCL' : '') : (consMed || ''),
            rehab, prot, muletaSilla,
            t.examenes_lab_imagenologia || '',
            consult, mat,
            oftalmo, odonto,
            muerteAcc, t.muerte_accidental_suma || '', t.muerte_accidental_costo || '',
            invalidezPerm, t.invalidez_permanente_suma || '', t.invalidez_permanente_costo || '',
            t.ambulancia || '',
            t.ramo || 'Salud'
          ]);
          savedCount++;
        } else {
          const q = `
            UPDATE tarifas
            SET compania_id = $1, edad_min = $2, edad_max = $3, suma_asegurada = $4, deducible = $5, prima = $6,
                plan = $7, pago = $8, pago_contado = $9, pago_semestral = $10, pago_cuatrimestral = $11, pago_trimestral = $12,
                pago_bimestral = $13, pago_4_cuotas = $14, pago_mensual = $15,
                maternidad_suma = $16, maternidad_costo = $17, asist_intl_suma = $18, asist_intl_costo = $19,
                funeral_suma = $20, funeral_costo = $21, at_situ_medicamentos = $22, atencion_medica_primaria = $23, medicinas = $24, consultas_medicas = $25,
                rehabilitacion = $26, protesis = $27, muleta_silla_ruedas = $28, examenes_lab_imagenologia = $29, consultas = $30, maternidad = $31,
                oftalmologia = $32, odontologia = $33, muerte_accidental = $34, muerte_accidental_suma = $35, muerte_accidental_costo = $36,
                invalidez_permanente = $37, invalidez_permanente_suma = $38, invalidez_permanente_costo = $39, ambulancia = $40, ramo = $41
            WHERE id = $42
          `;
          await db.query(q, [
            parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima),
            t.plan || '', t.pago || '',
            metodos.pago_contado, metodos.pago_semestral, metodos.pago_cuatrimestral, metodos.pago_trimestral, metodos.pago_bimestral, metodos.pago_4_cuotas, metodos.pago_mensual,
            t.maternidad_suma || '', t.maternidad_costo || '', t.asist_intl_suma || '', t.asist_intl_costo || '',
            t.funeral_suma || '', t.funeral_costo || '', t.at_situ_medicamentos || (atMedPrim ? 'INCL' : ''),
            atMedPrim, meds,
            typeof consMed === 'boolean' ? (consMed ? 'INCL' : '') : (consMed || ''),
            rehab, prot, muletaSilla,
            t.examenes_lab_imagenologia || '',
            consult, mat,
            oftalmo, odonto,
            muerteAcc, t.muerte_accidental_suma || '', t.muerte_accidental_costo || '',
            invalidezPerm, t.invalidez_permanente_suma || '', t.invalidez_permanente_costo || '',
            t.ambulancia || '',
            t.ramo || 'Salud',
            parseInt(id)
          ]);
          savedCount++;
        }
      }
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'EDICION_MASIVA_TARIFAS', `Se actualizaron/crearon ${savedCount} tarifas en lote.`);
    res.json({ message: `Se guardaron ${savedCount} tarifas correctamente.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar tarifas en lote.' });
  }
});

// 10. Eliminar una tarifa individual
router.delete('/tariffs/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;

  try {
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      fData.tarifas = fData.tarifas.filter(t => t.id !== parseInt(id));
      db.saveFallback();
    } else {
      const q = `DELETE FROM tarifas WHERE id = $1`;
      const resDel = await db.query(q, [parseInt(id)]);
      if (resDel.rowCount === 0) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    }

    await actualizarTarifarioMetadata(req.user.correo);
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

// 12. Obtener metadatos del tarifario
router.get('/tarifario-metadata', authenticateToken, async (req, res) => {
  try {
    let result;
    if (db.isFallback()) {
      try {
        const fData = db.getFallbackData();
        result = { rows: [fData.tarifario_metadata || { version: '1.0.0', ultima_modificacion: new Date().toISOString(), usuario_correo: 'admin@jkaseguros.com' }] };
      } catch (e) {
        result = { rows: [] };
      }
    } else {
      result = await db.query('SELECT * FROM tarifario_metadata ORDER BY id DESC LIMIT 1');
    }

    if (!result.rows || result.rows.length === 0) {
      return res.json({
        version: '1.0.0',
        ultima_modificacion: new Date().toISOString(),
        usuario_correo: 'admin@jkaseguros.com'
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener metadatos del tarifario:', err);
    res.status(500).json({ error: 'Error al obtener los metadatos del tarifario.' });
  }
});

// ==========================================
// MÓDULO DE COMISIONES (ADMIN)
// ==========================================

// 1. Obtener todas las comisiones, configuraciones y cálculos
router.get('/commissions', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    let companias = [];
    let asesores = [];
    let matriz = [];
    let historico = [];
    let corridas = [];
    let polizas = [];
    let comisionesAsesores = [];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      companias = fData.companias_seguros || [];
      asesores = fData.asesores || [];
      matriz = fData.matriz_comisiones || [];
      corridas = fData.corridas_comisiones || [];
      comisionesAsesores = fData.comisiones_asesores || [];

      // Enriquecer pólizas con nombres de cliente, aseguradora y asesor
      const rawPolizas = fData.polizas || [];
      const datosPersonales = fData.datos_personales || [];
      polizas = rawPolizas.map(p => {
        const cli = datosPersonales.find(d => d.id === p.cliente_id);
        const comp = companias.find(c => c.id === p.compania_id);
        const adv = asesores.find(a => a.id === p.asesor_id);
        return {
          ...p,
          primer_nombre: cli ? cli.primer_nombre : '',
          primer_apellido: cli ? cli.primer_apellido : '',
          compania_nombre: comp ? comp.nombre : 'N/A',
          asesor_nombre: adv ? adv.nombre : 'N/A',
          codigo_asesor: adv ? adv.codigo_asesor : 'N/A'
        };
      });
      
      const rawHist = fData.historico_comisiones || [];
      historico = rawHist.map(h => {
        const p = rawPolizas.find(pol => pol.id === h.poliza_id);
        const a = asesores.find(adv => adv.id === h.asesor_id);
        const comp = companias.find(c => c.id === (p ? p.compania_id : null));
        return {
          ...h,
          codigo_poliza: p ? p.codigo_poliza : 'N/A',
          plan: p ? p.plan : 'N/A',
          asesor_nombre: a ? a.nombre : 'N/A',
          codigo_asesor: a ? a.codigo_asesor : 'N/A',
          compania_nombre: comp ? comp.nombre : 'N/A'
        };
      });
    } else {
      const resComps = await db.query('SELECT id, nombre, comision_compania, comision_asesor_estandar FROM companias_seguros ORDER BY nombre ASC');
      companias = resComps.rows;

      const resAsesores = await db.query('SELECT id, nombre, codigo_asesor, correo, tipo_asesor, cedula, banco, numero_cuenta FROM asesores ORDER BY id ASC');
      asesores = resAsesores.rows;

      const resMat = await db.query('SELECT m.*, c.nombre AS compania_nombre FROM matriz_comisiones m LEFT JOIN companias_seguros c ON m.compania_id = c.id');
      matriz = resMat.rows;

      const resRuns = await db.query('SELECT * FROM corridas_comisiones ORDER BY id DESC');
      corridas = resRuns.rows;

      const resHist = await db.query(`
        SELECT h.*, p.codigo_poliza, p.plan, a.nombre AS asesor_nombre, a.codigo_asesor, c.nombre AS compania_nombre
        FROM historico_comisiones h
        LEFT JOIN polizas p ON h.poliza_id = p.id
        LEFT JOIN asesores a ON h.asesor_id = a.id
        LEFT JOIN companias_seguros c ON p.compania_id = c.id
        ORDER BY h.id DESC
      `);
      historico = resHist.rows;

      // Consultar pólizas con JOINs para nombres
      const resPolizas = await db.query(`
        SELECT p.*,
          dp.primer_nombre, dp.primer_apellido,
          comp.nombre AS compania_nombre,
          a.nombre AS asesor_nombre, a.codigo_asesor
        FROM polizas p
        LEFT JOIN datos_personales dp ON p.cliente_id = dp.id
        LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
        LEFT JOIN asesores a ON p.asesor_id = a.id
        ORDER BY p.id DESC
      `);
      polizas = resPolizas.rows;

      // Consultar comisiones personalizadas por asesor
      const resComAsesores = await db.query('SELECT * FROM comisiones_asesores ORDER BY id ASC');
      comisionesAsesores = resComAsesores.rows;
    }

    // Calcular vista previa de BNC a partir de comisiones pendientes
    const bncPreview = [];
    const nowTemp = new Date();
    const dia = String(nowTemp.getDate()).padStart(2, '0');
    const mes = String(nowTemp.getMonth() + 1).padStart(2, '0');
    const anio = nowTemp.getFullYear();
    const fechaPago = `${dia}/${mes}/${anio}`;
    const cuentaDebitar = '01910100201000123456';

    const pendingComms = historico.filter(h => h.estado_corrida === 'pendiente');
    const advisorsMap = {};

    pendingComms.forEach(c => {
      if (!c.asesor_id) return;
      const key = c.asesor_id;
      if (!advisorsMap[key]) {
        const advProfile = asesores.find(a => a.id === c.asesor_id) || {};
        advisorsMap[key] = {
          id: key,
          nombre: c.asesor_nombre || advProfile.nombre || 'Asesor Sin Nombre',
          correo: advProfile.correo || 'info@jkaconsultores.com',
          cedula: advProfile.cedula || 'V00000000',
          banco: advProfile.banco || 'BNC',
          numero_cuenta: advProfile.numero_cuenta || '00000000000000000000',
          totalComision: 0
        };
      }
      advisorsMap[key].totalComision += parseFloat(c.pago_asesor || 0);
    });

    let refNum = 1001;
    Object.values(advisorsMap).forEach(adv => {
      if (adv.totalComision <= 0) return;

      const rawCta = adv.numero_cuenta || '';
      const cleanCtaBenef = rawCta.replace(/\D/g, '').substring(0, 20).padEnd(20, '0');
      
      const rawCed = adv.cedula || '';
      const cleanCedula = rawCed.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      
      const rawNombre = adv.nombre || 'Asesor Sin Nombre';
      const cleanNombre = rawNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 80);
      
      const rawDesc = `Abono de Comisiones Asesor ${rawNombre}`;
      const cleanDesc = rawDesc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 60);

      bncPreview.push({
        fecha_pago: fechaPago,
        cuenta_debitar: cuentaDebitar,
        cuenta_beneficiario: cleanCtaBenef,
        monto: adv.totalComision.toFixed(2).replace('.', ','),
        descripcion: cleanDesc,
        id_beneficiario: cleanCedula,
        nombre_beneficiario: cleanNombre,
        email_beneficiario: (adv.correo || '').substring(0, 100),
        referencia: String(refNum++)
      });
    });

    res.json({
      companias,
      asesores,
      polizas,
      comisiones_asesores: comisionesAsesores,
      matriz_comisiones: matriz,
      historico_comisiones: historico,
      corridas_comisiones: corridas,
      bnc_preview: bncPreview
    });
  } catch (err) {
    console.error('Error al obtener comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al obtener comisiones.' });
  }
});

// Generar corrida de comisiones de forma manual
router.post('/commissions/run', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { cuenta_debitar } = req.body;
  try {
    const result = await ejecutarCorridaComisiones('manual', cuenta_debitar || '01910100201000123456');
    res.json(result);
  } catch (err) {
    console.error('Error al ejecutar corrida manual:', err);
    res.status(500).json({ error: 'Error del servidor al ejecutar corrida de comisiones.' });
  }
});

// Generar archivo TXT para Pago de Proveedores del BNC (Delimitado por Tabulaciones)
router.get('/commissions/export-bnc-txt', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const cuentaDebitar = req.query.cuenta_debitar || '01910100201000123456';
  
  try {
    const result = await ejecutarCorridaComisiones('manual', cuentaDebitar);
    
    if (result.count === 0) {
      res.setHeader('Content-disposition', 'attachment; filename=bnc_vacio.txt');
      res.setHeader('Content-type', 'text/plain; charset=utf-8');
      return res.send("No hay comisiones pendientes para liquidar en este momento.");
    }
    
    res.setHeader('Content-disposition', `attachment; filename=bnc_pago_proveedores_run_${result.runId}.txt`);
    res.setHeader('Content-type', 'text/plain; charset=utf-8');
    res.send(result.archivo_txt);
  } catch (err) {
    console.error('Error al exportar TXT:', err);
    res.status(500).json({ error: 'Error del servidor al generar archivo TXT.' });
  }
});

// Crear nueva regla jerárquica en la Matriz de Comisiones
router.post('/commissions/matrix', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { 
    mercado, compania_id, ramo, producto_modalidad, total_comision,
    asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente 
  } = req.body;

  if (!mercado || !ramo || !producto_modalidad || total_comision === undefined) {
    return res.status(400).json({ error: 'Mercado, Ramo, Producto/Modalidad y Total Comisión son obligatorios.' });
  }

  try {
    const a1 = parseFloat(asesor_1 || consultor_1 || 0);
    const a2 = parseFloat(asesor_2 || consultor_2 || 0);
    const a3 = parseFloat(asesor_3 || 0);
    const c1 = parseFloat(consultor_1 || asesor_1 || 0);
    const c2 = parseFloat(consultor_2 || asesor_2 || 0);
    const j = parseFloat(johans || 0);
    const n1 = parseFloat(nivel_1_subagente || 0);
    const n2 = parseFloat(nivel_2_agente || 0);
    const total = parseFloat(total_comision || 0);
    const compId = compania_id ? parseInt(compania_id) : null;

    let newRule;
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const newId = fData.matriz_comisiones.length ? Math.max(...fData.matriz_comisiones.map(m => m.id)) + 1 : 1;
      newRule = {
        id: newId,
        mercado,
        compania_id: compId,
        ramo,
        producto_modalidad,
        total_comision: total,
        asesor_1: a1,
        asesor_2: a2,
        asesor_3: a3,
        consultor_1: c1,
        consultor_2: c2,
        johans: j,
        nivel_1_subagente: n1,
        nivel_2_agente: n2,
        created_at: new Date().toISOString()
      };
      fData.matriz_comisiones.push(newRule);
      db.saveFallback();
    } else {
      const insRes = await db.query(
        `INSERT INTO matriz_comisiones (
          mercado, compania_id, ramo, producto_modalidad, total_comision,
          asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [mercado, compId, ramo, producto_modalidad, total, a1, a2, a3, c1, c2, j, n1, n2]
      );
      newRule = insRes.rows[0];
    }

    await registrarAccion(req.user.id, req.user.correo, 'CREAR_REGLA_MATRIZ', `Nueva regla de comisión creada: ${mercado} - ${ramo} - ${producto_modalidad} (${total}%)`);
    res.status(201).json({ message: 'Regla jerárquica creada con éxito.', regla: newRule });
  } catch (err) {
    console.error('Error al crear regla en matriz:', err);
    res.status(500).json({ error: 'Error del servidor al crear regla de comisión.' });
  }
});

// Actualizar regla jerárquica existente en la Matriz de Comisiones
router.put('/commissions/matrix/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { 
    mercado, compania_id, ramo, producto_modalidad, total_comision,
    asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente 
  } = req.body;

  try {
    const mId = parseInt(id);
    const a1 = parseFloat(asesor_1 !== undefined ? asesor_1 : (consultor_1 || 0));
    const a2 = parseFloat(asesor_2 !== undefined ? asesor_2 : (consultor_2 || 0));
    const a3 = parseFloat(asesor_3 !== undefined ? asesor_3 : 0);
    const c1 = parseFloat(consultor_1 !== undefined ? consultor_1 : a1);
    const c2 = parseFloat(consultor_2 !== undefined ? consultor_2 : a2);
    const j = parseFloat(johans !== undefined ? johans : 0);
    const n1 = parseFloat(nivel_1_subagente !== undefined ? nivel_1_subagente : 0);
    const n2 = parseFloat(nivel_2_agente !== undefined ? nivel_2_agente : 0);
    const total = parseFloat(total_comision !== undefined ? total_comision : 0);
    const compId = compania_id ? parseInt(compania_id) : null;

    let updatedRule;
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.matriz_comisiones.findIndex(m => m.id === mId);
      if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada.' });
      fData.matriz_comisiones[idx] = {
        ...fData.matriz_comisiones[idx],
        mercado: mercado || fData.matriz_comisiones[idx].mercado,
        compania_id: compId,
        ramo: ramo || fData.matriz_comisiones[idx].ramo,
        producto_modalidad: producto_modalidad || fData.matriz_comisiones[idx].producto_modalidad,
        total_comision: total,
        asesor_1: a1,
        asesor_2: a2,
        asesor_3: a3,
        consultor_1: c1,
        consultor_2: c2,
        johans: j,
        nivel_1_subagente: n1,
        nivel_2_agente: n2
      };
      updatedRule = fData.matriz_comisiones[idx];
      db.saveFallback();
    } else {
      const updRes = await db.query(
        `UPDATE matriz_comisiones SET
          mercado = $1, compania_id = $2, ramo = $3, producto_modalidad = $4, total_comision = $5,
          asesor_1 = $6, asesor_2 = $7, asesor_3 = $8, consultor_1 = $9, consultor_2 = $10,
          johans = $11, nivel_1_subagente = $12, nivel_2_agente = $13
         WHERE id = $14 RETURNING *`,
        [mercado, compId, ramo, producto_modalidad, total, a1, a2, a3, c1, c2, j, n1, n2, mId]
      );
      if (updRes.rows.length === 0) return res.status(404).json({ error: 'Regla no encontrada.' });
      updatedRule = updRes.rows[0];
    }

    await registrarAccion(req.user.id, req.user.correo, 'EDITAR_REGLA_MATRIZ', `Regla de comisión ID ${mId} actualizada.`);
    res.json({ message: 'Regla jerárquica actualizada con éxito.', regla: updatedRule });
  } catch (err) {
    console.error('Error al actualizar regla de matriz:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar regla de comisión.' });
  }
});

// Eliminar regla jerárquica de la Matriz de Comisiones
router.delete('/commissions/matrix/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;

  try {
    const mId = parseInt(id);
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      fData.matriz_comisiones = fData.matriz_comisiones.filter(m => m.id !== mId);
      db.saveFallback();
    } else {
      await db.query('DELETE FROM matriz_comisiones WHERE id = $1', [mId]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'ELIMINAR_REGLA_MATRIZ', `Regla de comisión ID ${mId} eliminada.`);
    res.json({ message: 'Regla jerárquica eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar regla de matriz:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar regla de comisión.' });
  }
});

// Restablecer / Sincronizar Matriz de Comisiones con el Tarifario Oficial
router.post('/commissions/matrix/reset-defaults', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    const defaultRules = [
      {
        mercado: 'Nacionales',
        compania_id: 1, // Mercantil Seguros
        ramo: 'Salud',
        producto_modalidad: 'ACCESS (Salud Cobertura Nacional)',
        total_comision: 20.0,
        asesor_1: 15.0,
        asesor_2: 12.0,
        asesor_3: 10.0,
        consultor_1: 15.0,
        consultor_2: 12.0,
        johans: 15.0,
        nivel_1_subagente: 10.0,
        nivel_2_agente: 8.0
      },
      {
        mercado: 'Nacionales',
        compania_id: 2, // Seguros Caracas
        ramo: 'Salud',
        producto_modalidad: 'SALUD EXTERIOR (Salud Integral)',
        total_comision: 22.5,
        asesor_1: 17.0,
        asesor_2: 15.0,
        asesor_3: 12.0,
        consultor_1: 17.0,
        consultor_2: 15.0,
        johans: 17.0,
        nivel_1_subagente: 12.0,
        nivel_2_agente: 10.0
      },
      {
        mercado: 'Nacionales',
        compania_id: 2, // Seguros Caracas
        ramo: 'Salud',
        producto_modalidad: 'SALUD INDIVIDUAL (Salud Integral)',
        total_comision: 22.5,
        asesor_1: 17.0,
        asesor_2: 15.0,
        asesor_3: 12.0,
        consultor_1: 17.0,
        consultor_2: 15.0,
        johans: 17.0,
        nivel_1_subagente: 12.0,
        nivel_2_agente: 10.0
      },
      {
        mercado: 'Nacionales',
        compania_id: 3, // Seguros Venezuela
        ramo: 'Salud',
        producto_modalidad: 'BRONCE / PLATA / ORO (Salud Individual)',
        total_comision: 22.0,
        asesor_1: 16.0,
        asesor_2: 14.0,
        asesor_3: 11.0,
        consultor_1: 16.0,
        consultor_2: 14.0,
        johans: 16.0,
        nivel_1_subagente: 11.0,
        nivel_2_agente: 9.0
      },
      {
        mercado: 'Nacionales',
        compania_id: 4, // Mapfre Seguros
        ramo: 'Patrimoniales',
        producto_modalidad: 'Incendio y Riesgos Patrimoniales',
        total_comision: 40.0,
        asesor_1: 30.0,
        asesor_2: 28.0,
        asesor_3: 25.0,
        consultor_1: 30.0,
        consultor_2: 28.0,
        johans: 30.0,
        nivel_1_subagente: 25.0,
        nivel_2_agente: 20.0
      },
      {
        mercado: 'Internacionales',
        compania_id: 5, // Internacional de Seguros
        ramo: 'Viajes',
        producto_modalidad: 'Cobertura Internacional / Asistencia en Viajes',
        total_comision: 25.0,
        asesor_1: 18.0,
        asesor_2: 15.0,
        asesor_3: 12.0,
        consultor_1: 18.0,
        consultor_2: 15.0,
        johans: 18.0,
        nivel_1_subagente: 12.0,
        nivel_2_agente: 10.0
      }
    ];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      fData.matriz_comisiones = defaultRules.map((r, idx) => ({
        id: idx + 1,
        ...r,
        created_at: new Date().toISOString()
      }));
      db.saveFallback();
    } else {
      await db.query('DELETE FROM matriz_comisiones');
      for (const r of defaultRules) {
        await db.query(
          `INSERT INTO matriz_comisiones (
            mercado, compania_id, ramo, producto_modalidad, total_comision,
            asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [r.mercado, r.compania_id, r.ramo, r.producto_modalidad, r.total_comision, r.asesor_1, r.asesor_2, r.asesor_3, r.consultor_1, r.consultor_2, r.johans, r.nivel_1_subagente, r.nivel_2_agente]
        );
      }
    }

    await registrarAccion(req.user.id, req.user.correo, 'RESET_MATRIZ_COMISIONES', 'Matriz de comisiones restablecida y sincronizada con el tarifario.');
    res.json({ message: 'Matriz de comisiones sincronizada exitosamente con el tarifario.' });
  } catch (err) {
    console.error('Error al restablecer matriz de comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al sincronizar matriz.' });
  }
});

// 2. Establecer porcentaje estándar para una aseguradora
router.post('/commissions/standard', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { compania_id, comision_compania, comision_asesor_estandar } = req.body;

  if (compania_id === undefined || comision_compania === undefined || comision_asesor_estandar === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros: compania_id, comision_compania y comision_asesor_estandar.' });
  }

  try {
    const compVal = parseFloat(comision_compania);
    const advVal = parseFloat(comision_asesor_estandar);

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.companias_seguros.findIndex(c => c.id === parseInt(compania_id));
      if (idx === -1) return res.status(404).json({ error: 'Aseguradora no encontrada.' });
      fData.companias_seguros[idx].comision_compania = compVal;
      fData.companias_seguros[idx].comision_asesor_estandar = advVal;
      db.saveFallback();
    } else {
      await db.query(
        'UPDATE companias_seguros SET comision_compania = $1, comision_asesor_estandar = $2 WHERE id = $3',
        [compVal, advVal, compania_id]
      );
    }

    await registrarAccion(req.user.id, req.user.correo, 'COMISION_ESTANDAR_UPDATE', `Comisión de aseguradora ID ${compania_id} actualizada: Compañía: ${compVal}%, Asesor: ${advVal}%`);
    res.json({ message: 'Comisiones estándares de aseguradora actualizadas correctamente.', comision_compania: compVal, comision_asesor_estandar: advVal });
  } catch (err) {
    console.error('Error al actualizar comisiones estándar:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar comisiones estándar.' });
  }
});

// 3. Establecer porcentaje personalizado para un asesor y aseguradora
router.post('/commissions/advisor', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { asesor_id, compania_id, porcentaje } = req.body;

  if (asesor_id === undefined || compania_id === undefined || porcentaje === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros: asesor_id, compania_id y porcentaje.' });
  }

  try {
    const pctVal = parseFloat(porcentaje);
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      if (!fData.comisiones_asesores) fData.comisiones_asesores = [];
      const idx = fData.comisiones_asesores.findIndex(c => c.asesor_id === parseInt(asesor_id) && c.compania_id === parseInt(compania_id));
      if (idx !== -1) {
        fData.comisiones_asesores[idx].porcentaje = pctVal;
      } else {
        const newId = fData.comisiones_asesores.length ? Math.max(...fData.comisiones_asesores.map(c => c.id)) + 1 : 1;
        fData.comisiones_asesores.push({
          id: newId,
          asesor_id: parseInt(asesor_id),
          compania_id: parseInt(compania_id),
          porcentaje: pctVal
        });
      }
      db.saveFallback();
    } else {
      await db.query(`
        INSERT INTO comisiones_asesores (asesor_id, compania_id, porcentaje)
        VALUES ($1, $2, $3)
        ON CONFLICT (asesor_id, compania_id)
        DO UPDATE SET porcentaje = $3
      `, [asesor_id, compania_id, pctVal]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'COMISION_ASESOR_UPDATE', `Comisión del asesor ID ${asesor_id} para aseguradora ID ${compania_id} cambiada a ${pctVal}%`);
    res.json({ message: 'Comisión de asesor actualizada correctamente.', porcentaje: pctVal });
  } catch (err) {
    console.error('Error al actualizar comisión de asesor:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar comisión de asesor.' });
  }
});

// DELETE para eliminar comisión de asesor personalizada
router.delete('/commissions/advisor/:asesor_id/:compania_id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { asesor_id, compania_id } = req.params;

  try {
    const aId = parseInt(asesor_id);
    const cId = parseInt(compania_id);

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      if (fData.comisiones_asesores) {
        fData.comisiones_asesores = fData.comisiones_asesores.filter(c => !(c.asesor_id === aId && c.compania_id === cId));
        db.saveFallback();
      }
    } else {
      await db.query('DELETE FROM comisiones_asesores WHERE asesor_id = $1 AND compania_id = $2', [aId, cId]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'COMISION_ASESOR_DELETE', `Comisión personalizada del asesor ID ${aId} para aseguradora ID ${cId} eliminada`);
    res.json({ message: 'Comisión personalizada de asesor eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar comisión de asesor:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar comisión de asesor.' });
  }
});

// 4. Establecer porcentaje personalizado para una póliza
router.post('/commissions/policy', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { poliza_id, comision_porcentaje } = req.body;

  if (poliza_id === undefined) {
    return res.status(400).json({ error: 'Falta parámetro: poliza_id.' });
  }

  try {
    const pctVal = comision_porcentaje === null ? null : parseFloat(comision_porcentaje);
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.polizas.findIndex(p => p.id === parseInt(poliza_id));
      if (idx === -1) return res.status(404).json({ error: 'Póliza no encontrada.' });
      fData.polizas[idx].comision_porcentaje = pctVal;
      db.saveFallback();
    } else {
      await db.query('UPDATE polizas SET comision_porcentaje = $1 WHERE id = $2', [pctVal, poliza_id]);
    }

    await registrarAccion(req.user.id, req.user.correo, 'COMISION_POLIZA_UPDATE', `Comisión específica de la póliza ID ${poliza_id} cambiada a ${pctVal !== null ? pctVal + '%' : 'estándar'}`);
    res.json({ message: 'Comisión de póliza actualizada correctamente.', comision_porcentaje: pctVal });
  } catch (err) {
    console.error('Error al actualizar comisión de póliza:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar comisión de póliza.' });
  }
});

// 5. Generar reporte TXT de comisiones
router.get('/commissions/export-txt', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });

  try {
    let historico = [];
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const companias = fData.companias_seguros || [];
      const rawHist = fData.historico_comisiones || [];
      historico = rawHist.map(h => {
        const p = (fData.polizas || []).find(pol => pol.id === h.poliza_id);
        const a = (fData.asesores || []).find(adv => adv.id === h.asesor_id);
        const comp = companias.find(c => c.id === (p ? p.compania_id : null));
        return {
          ...h,
          codigo_poliza: p ? p.codigo_poliza : 'N/A',
          plan: p ? p.plan : 'N/A',
          asesor_nombre: a ? a.nombre : 'N/A',
          codigo_asesor: a ? a.codigo_asesor : 'N/A',
          compania_nombre: comp ? comp.nombre : 'N/A'
        };
      });
    } else {
      const resHist = await db.query(`
        SELECT h.*, p.codigo_poliza, p.plan, a.nombre AS asesor_nombre, a.codigo_asesor, c.nombre AS compania_nombre
        FROM historico_comisiones h
        LEFT JOIN polizas p ON h.poliza_id = p.id
        LEFT JOIN asesores a ON h.asesor_id = a.id
        LEFT JOIN companias_seguros c ON p.compania_id = c.id
        ORDER BY h.id DESC
      `);
      historico = resHist.rows;
    }

    const now = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
    let text = `========================================================================\n`;
    text += `             PROTECCIÓN Y SEGUROS 360 - BROKER DE SEGUROS\n`;
    text += `                REPORTE DETALLADO DE COMISIONES HISTÓRICAS\n`;
    text += `========================================================================\n`;
    text += `Fecha de Generación: ${now}\n`;
    text += `Generado por: ${req.user.correo}\n\n`;

    const asesoresMap = {};
    historico.forEach(h => {
      const key = h.asesor_id || 'sin_asesor';
      const name = h.asesor_nombre || 'Sin Asesor Asignado';
      const code = h.codigo_asesor || 'N/A';
      if (!asesoresMap[key]) {
        asesoresMap[key] = {
          nombre: name,
          codigo: code,
          comisiones: [],
          totalMontoPago: 0,
          totalComision: 0
        };
      }
      asesoresMap[key].comisiones.push(h);
      asesoresMap[key].totalMontoPago += parseFloat(h.monto_pago || 0);
      asesoresMap[key].totalComision += parseFloat(h.pago_asesor || 0);
    });

    Object.values(asesoresMap).forEach(adv => {
      text += `------------------------------------------------------------------------\n`;
      text += `ASESOR: ${adv.nombre} (Código: ${adv.codigo})\n`;
      text += `------------------------------------------------------------------------\n`;
      text += `Póliza       | Aseguradora     | Plan       | Monto Pago  | % Com. | Com. Ganada | Estado Corrida \n`;
      text += `-------------+-----------------+------------+-------------+--------+-------------+----------------\n`;
      
      adv.comisiones.forEach(c => {
        const cod = (c.codigo_poliza || 'N/A').padEnd(12).substring(0, 12);
        const comp = (c.compania_nombre || 'N/A').padEnd(15).substring(0, 15);
        const plan = (c.plan || 'N/A').padEnd(10).substring(0, 10);
        const pagoStr = `$${parseFloat(c.monto_pago || 0).toFixed(2)}`.padStart(11);
        const pctStr = `${c.asesor_porcentaje}%`.padStart(6);
        const comStr = `$${parseFloat(c.pago_asesor || 0).toFixed(2)}`.padStart(11);
        const stateStr = (c.estado_corrida || 'pendiente').padEnd(14);
        
        text += `${cod} | ${comp} | ${plan} | ${pagoStr} | ${pctStr} | ${comStr} | ${stateStr}\n`;
      });
      
      text += `-------------+-----------------+------------+-------------+--------+-------------+----------------\n`;
      text += `TOTALES:                                 | ${`$${adv.totalMontoPago.toFixed(2)}`.padStart(11)} |        | ${`$${adv.totalComision.toFixed(2)}`.padStart(11)}\n\n`;
    });

    text += `========================================================================\n`;
    text += `FIN DEL REPORTE\n`;
    text += `========================================================================\n`;

    res.setHeader('Content-disposition', 'attachment; filename=comisiones_asesores_historico.txt');
    res.setHeader('Content-type', 'text/plain; charset=utf-8');
    res.send(text);

  } catch (err) {
    console.error('Error al generar TXT de comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al exportar comisiones.' });
  }
});

// Endpoint exclusivo de pruebas: Limpiar cotizaciones, pólizas, pagos y comisiones sin borrar usuarios
router.post('/clear-test-data', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol de Administrador.' });
  }

  try {
    await db.query('DELETE FROM historico_comisiones');
    await db.query('DELETE FROM corridas_comisiones');
    await db.query('DELETE FROM pagos');
    await db.query('DELETE FROM polizas');
    await db.query('DELETE FROM cotizaciones');

    // Registrar acción en bitácora / auditoría
    await registrarAccion(
      req.user.id,
      req.user.correo,
      'LIMPIEZA_DATA_PRUEBA',
      'El Administrador ejecutó la limpieza de datos de prueba (cotizaciones, pólizas, pagos y comisiones). Usuarios, clientes y asesores conservados.'
    );

    res.json({
      status: 'ok',
      message: 'Todos los datos de prueba (cotizaciones, pólizas, pagos y comisiones) han sido eliminados correctamente. Los usuarios, clientes y asesores se mantienen intactos.'
    });
  } catch (err) {
    console.error('Error al limpiar datos de prueba:', err);
    res.status(500).json({ error: 'Error al limpiar los datos de prueba: ' + err.message });
  }
});

export default router;
