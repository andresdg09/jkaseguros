import express from 'express';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper: Actualizar metadatos de tarifario (versión y fecha de última modificación)
async function actualizarTarifarioMetadata(usuarioCorreo) {
  const now = new Date().toISOString();
  if (db.isFallback()) {
    const fallbackFilePath = './data/fallback_db.json';
    try {
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);
      
      const oldMeta = fData.tarifario_metadata || { version: '1.0.0' };
      const parts = oldMeta.version.split('.');
      const nextPatch = parseInt(parts[2] || 0) + 1;
      const nextVersion = `${parts[0] || '1'}.${parts[1] || '0'}.${nextPatch}`;
      
      fData.tarifario_metadata = {
        version: nextVersion,
        ultima_modificacion: now,
        usuario_correo: usuarioCorreo
      };
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
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
      const cliPols = polsRes.rows.filter(p => p.cliente_id === c.id);
      const cliPolIds = cliPols.map(p => p.id);
      const cliPays = paysRes.rows.filter(pa => cliPolIds.includes(pa.poliza_id) && pa.estado_pago === 'pagado');
      const totalPagado = cliPays.reduce((sum, p) => sum + parseFloat(p.monto), 0);
      const userObj = usersRes.rows.find(u => u.id === c.usuario_id);

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

// Eliminar asesor y su usuario asociado
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
        fData.asesores = fData.asesores.filter(a => a.id !== aId);
        if (uId) {
          fData.usuarios = fData.usuarios.filter(u => u.id !== uId);
        }
        db.saveFallback();
      }
    } else {
      const checkRes = await db.query('SELECT nombre, usuario_id FROM asesores WHERE id = $1', [aId]);
      if (checkRes.rows.length > 0) {
        name = checkRes.rows[0].nombre;
        uId = checkRes.rows[0].usuario_id;
        
        await db.query('DELETE FROM asesores WHERE id = $1', [aId]);
        if (uId) {
          await db.query('DELETE FROM usuarios WHERE id = $1', [uId]);
        }
      }
    }

    await registrarAccion(req.user.id, req.user.correo, 'ELIMINAR_ASESOR', `Asesor ${name} (ID: ${aId}) eliminado del sistema.`);
    res.json({ message: 'Asesor eliminado correctamente.' });
  } catch (err) {
    console.error('Error al eliminar asesor:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar el asesor.' });
  }
});

// Actualizar el estado de aprobación de un asesor
router.put('/advisors/:id/status', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { id } = req.params;
  const { estado } = req.body;

  if (!['aprobado', 'pendiente', 'rechazado'].includes(estado)) {
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
    res.json({ message: `Estado de aprobación del asesor cambiado a ${estado}.`, estado });
  } catch (err) {
    console.error('Error al actualizar estado del asesor:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar estado del asesor.' });
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

    const BENEFIT_FIELDS = [
      'plan', 'pago', 'maternidad_suma', 'maternidad_costo', 'asist_intl_suma', 'asist_intl_costo',
      'funeral_suma', 'funeral_costo', 'at_situ_medicamentos', 'consultas_medicas',
      'examenes_lab_imagenologia', 'ambulancia'
    ];

    if (db.isFallback()) {
      const compMap = {};
      const fallbackFilePath = './data/fallback_db.json';

      const fallbackFileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fallbackFileContent);

      fData.companias_seguros.forEach(c => {
        compMap[c.nombre] = c.id;
      });

      const nuevasTarifas = [];
      parsedData.forEach((t, idx) => {
        let cId = compMap[t.compania];
        if (!cId && t.compania) {
          const newId = fData.companias_seguros.length ? Math.max(...fData.companias_seguros.map(c => c.id)) + 1 : 1;
          const newComp = {
            id: newId,
            nombre: t.compania,
            created_at: new Date().toISOString()
          };
          fData.companias_seguros.push(newComp);
          cId = newId;
          compMap[t.compania] = cId;
        }

        const row = {
          id: idx + 1,
          compania_id: cId || 1,
          edad_min: parseInt(t.edad_min),
          edad_max: parseInt(t.edad_max),
          suma_asegurada: parseFloat(t.suma_asegurada),
          prima: parseFloat(t.prima),
          created_at: new Date().toISOString()
        };
        BENEFIT_FIELDS.forEach(f => { row[f] = t[f] || ''; });
        nuevasTarifas.push(row);
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
        if (!t.compania) continue;
        let cId = compMap[t.compania];
        if (!cId) {
          const insRes = await db.query(
            'INSERT INTO companias_seguros (nombre) VALUES ($1) RETURNING id',
            [t.compania]
          );
          cId = insRes.rows[0].id;
          compMap[t.compania] = cId;
        }

        await db.query(
          `INSERT INTO tarifas (
            compania_id, edad_min, edad_max, suma_asegurada, prima,
            plan, pago, maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
            funeral_suma, funeral_costo, at_situ_medicamentos, consultas_medicas, examenes_lab_imagenologia, ambulancia
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            cId, parseInt(t.edad_min), parseInt(t.edad_max), parseFloat(t.suma_asegurada), parseFloat(t.prima),
            t.plan || '', t.pago || '', t.maternidad_suma || '', t.maternidad_costo || '', t.asist_intl_suma || '', t.asist_intl_costo || '',
            t.funeral_suma || '', t.funeral_costo || '', t.at_situ_medicamentos || '', t.consultas_medicas || '', t.examenes_lab_imagenologia || '', t.ambulancia || ''
          ]
        );
      }
    }

    // Trazabilidad
    await actualizarTarifarioMetadata(req.user.correo);
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
      ORDER BY t.edad_min ASC, t.suma_asegurada ASC, c.nombre ASC
    `;
    const result = await db.query(q);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tarifas.' });
  }
});

// Campos de beneficios de una tarifa (texto libre: montos, "INCL", "NO", frecuencias, etc.)
const TARIFF_BENEFIT_FIELDS = [
  'plan', 'pago', 'maternidad_suma', 'maternidad_costo', 'asist_intl_suma', 'asist_intl_costo',
  'funeral_suma', 'funeral_costo', 'at_situ_medicamentos', 'consultas_medicas',
  'examenes_lab_imagenologia', 'ambulancia'
];

// 8. Crear una tarifa individual
router.post('/tariffs', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const { compania_id, edad_min, edad_max, suma_asegurada, prima } = req.body;

  if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos.' });
  }

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);

      const newId = fData.tarifas.length > 0 ? Math.max(...fData.tarifas.map(t => t.id)) + 1 : 1;
      const row = {
        id: newId,
        compania_id: parseInt(compania_id),
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        prima: parseFloat(prima),
        created_at: new Date().toISOString()
      };
      TARIFF_BENEFIT_FIELDS.forEach(f => { row[f] = req.body[f] || ''; });
      fData.tarifas.push(row);
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      const q = `
        INSERT INTO tarifas (
          compania_id, edad_min, edad_max, suma_asegurada, prima,
          plan, pago, maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
          funeral_suma, funeral_costo, at_situ_medicamentos, consultas_medicas, examenes_lab_imagenologia, ambulancia
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `;
      await db.query(q, [
        parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima),
        ...TARIFF_BENEFIT_FIELDS.map(f => req.body[f] || '')
      ]);
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'CREACION_TARIFA', `Nueva tarifa agregada para Compañía ID ${compania_id} (plan ${req.body.plan || 'N/A'})`);
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
  const { compania_id, edad_min, edad_max, suma_asegurada, prima } = req.body;

  if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
    return res.status(400).json({ error: 'Faltan campos numéricos requeridos.' });
  }

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);

      const idx = fData.tarifas.findIndex(t => t.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Tarifa no encontrada.' });

      const updated = {
        ...fData.tarifas[idx],
        compania_id: parseInt(compania_id),
        edad_min: parseInt(edad_min),
        edad_max: parseInt(edad_max),
        suma_asegurada: parseFloat(suma_asegurada),
        prima: parseFloat(prima)
      };
      TARIFF_BENEFIT_FIELDS.forEach(f => { updated[f] = req.body[f] ?? updated[f] ?? ''; });
      fData.tarifas[idx] = updated;
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      const q = `
        UPDATE tarifas
        SET compania_id = $1, edad_min = $2, edad_max = $3, suma_asegurada = $4, prima = $5,
            plan = $6, pago = $7, maternidad_suma = $8, maternidad_costo = $9, asist_intl_suma = $10, asist_intl_costo = $11,
            funeral_suma = $12, funeral_costo = $13, at_situ_medicamentos = $14, consultas_medicas = $15,
            examenes_lab_imagenologia = $16, ambulancia = $17
        WHERE id = $18
      `;
      const resUp = await db.query(q, [
        parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima),
        ...TARIFF_BENEFIT_FIELDS.map(f => req.body[f] || ''),
        parseInt(id)
      ]);
      if (resUp.rowCount === 0) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'EDICION_TARIFA', `Tarifa ID ${id} modificada.`);
    res.json({ message: 'Tarifa actualizada correctamente.' });
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
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);

      for (const t of tariffs) {
        const { id, compania_id, edad_min, edad_max, suma_asegurada, prima } = t;
        if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
          continue;
        }

        const isNew = String(id).startsWith('new-');
        if (isNew) {
          const newId = fData.tarifas.length > 0 ? Math.max(...fData.tarifas.map(item => item.id)) + 1 : 1;
          const row = {
            id: newId,
            compania_id: parseInt(compania_id),
            edad_min: parseInt(edad_min),
            edad_max: parseInt(edad_max),
            suma_asegurada: parseFloat(suma_asegurada),
            prima: parseFloat(prima),
            created_at: new Date().toISOString()
          };
          TARIFF_BENEFIT_FIELDS.forEach(f => { row[f] = t[f] || ''; });
          fData.tarifas.push(row);
        } else {
          const idx = fData.tarifas.findIndex(item => item.id === parseInt(id));
          if (idx !== -1) {
            const updated = {
              ...fData.tarifas[idx],
              compania_id: parseInt(compania_id),
              edad_min: parseInt(edad_min),
              edad_max: parseInt(edad_max),
              suma_asegurada: parseFloat(suma_asegurada),
              prima: parseFloat(prima)
            };
            TARIFF_BENEFIT_FIELDS.forEach(f => { updated[f] = t[f] ?? updated[f] ?? ''; });
            fData.tarifas[idx] = updated;
          }
        }
      }
      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      for (const t of tariffs) {
        const { id, compania_id, edad_min, edad_max, suma_asegurada, prima } = t;
        if (!compania_id || isNaN(edad_min) || isNaN(edad_max) || isNaN(suma_asegurada) || isNaN(prima)) {
          continue;
        }

        const isNew = String(id).startsWith('new-');
        if (isNew) {
          const q = `
            INSERT INTO tarifas (
              compania_id, edad_min, edad_max, suma_asegurada, prima,
              plan, pago, maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
              funeral_suma, funeral_costo, at_situ_medicamentos, consultas_medicas, examenes_lab_imagenologia, ambulancia
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          `;
          await db.query(q, [
            parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima),
            ...TARIFF_BENEFIT_FIELDS.map(f => t[f] || '')
          ]);
        } else {
          const q = `
            UPDATE tarifas
            SET compania_id = $1, edad_min = $2, edad_max = $3, suma_asegurada = $4, prima = $5,
                plan = $6, pago = $7, maternidad_suma = $8, maternidad_costo = $9, asist_intl_suma = $10, asist_intl_costo = $11,
                funeral_suma = $12, funeral_costo = $13, at_situ_medicamentos = $14, consultas_medicas = $15,
                examenes_lab_imagenologia = $16, ambulancia = $17
            WHERE id = $18
          `;
          await db.query(q, [
            parseInt(compania_id), parseInt(edad_min), parseInt(edad_max), parseFloat(suma_asegurada), parseFloat(prima),
            ...TARIFF_BENEFIT_FIELDS.map(f => t[f] || ''),
            parseInt(id)
          ]);
        }
      }
    }

    await actualizarTarifarioMetadata(req.user.correo);
    await registrarAccion(req.user.id, req.user.correo, 'EDICION_TARIFA_LOTE', `Se actualizaron o crearon ${tariffs.length} tarifas en lote.`);
    res.json({ message: 'Tarifas actualizadas en lote correctamente.', count: tariffs.length });
  } catch (err) {
    console.error('Error en guardado masivo:', err);
    res.status(500).json({ error: 'Error al procesar el guardado por lote de tarifas.' });
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
      const fallbackFilePath = './data/fallback_db.json';
      try {
        const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
        const fData = JSON.parse(fileContent);
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
    let comisionesAsesores = [];
    let polizas = [];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      companias = fData.companias_seguros || [];
      asesores = fData.asesores || [];
      comisionesAsesores = fData.comisiones_asesores || [];
      
      const rawPolizas = fData.polizas || [];
      polizas = rawPolizas.map(p => {
        const advisor = asesores.find(a => a.id === p.asesor_id);
        const comp = companias.find(c => c.id === p.compania_id);
        const client = (fData.datos_personales || []).find(dp => dp.id === p.cliente_id);
        
        return {
          id: p.id,
          codigo_poliza: p.codigo_poliza,
          plan: p.plan,
          prima_anual: p.prima_anual,
          estado: p.estado,
          pago_estado: p.pago_estado,
          comision_porcentaje: p.comision_porcentaje,
          asesor_nombre: advisor ? advisor.nombre : 'N/A',
          codigo_asesor: advisor ? advisor.codigo_asesor : 'N/A',
          asesor_id: p.asesor_id,
          compania_nombre: comp ? comp.nombre : 'N/A',
          compania_id: p.compania_id,
          primer_nombre: client ? client.primer_nombre : 'N/A',
          primer_apellido: client ? client.primer_apellido : ''
        };
      });
    } else {
      const resComps = await db.query('SELECT id, nombre, comision_estandar, comision_compania, comision_asesor_estandar FROM companias_seguros ORDER BY id ASC');
      companias = resComps.rows;

      const resAsesores = await db.query('SELECT id, nombre, codigo_asesor, correo FROM asesores ORDER BY id ASC');
      asesores = resAsesores.rows;

      const resComs = await db.query('SELECT id, asesor_id, compania_id, porcentaje FROM comisiones_asesores');
      comisionesAsesores = resComs.rows;

      const resPols = await db.query(`
        SELECT p.id, p.codigo_poliza, p.plan, p.prima_anual, p.estado, p.pago_estado, p.comision_porcentaje,
               a.nombre as asesor_nombre, a.codigo_asesor, a.id as asesor_id,
               c.nombre as compania_nombre, c.id as compania_id,
               dp.primer_nombre, dp.primer_apellido
        FROM polizas p
        LEFT JOIN asesores a ON p.asesor_id = a.id
        LEFT JOIN companias_seguros c ON p.compania_id = c.id
        LEFT JOIN datos_personales dp ON p.cliente_id = dp.id
        ORDER BY p.id DESC
      `);
      polizas = resPols.rows;
    }

    const compMap = {};
    companias.forEach(c => {
      compMap[c.id] = c;
    });

    const polizasConCalculos = polizas.map(p => {
      const comp = compMap[p.compania_id];
      const comision_compania_pct = comp ? parseFloat(comp.comision_compania || 0) : 0;
      
      let porcentaje = 0;
      let origen = 'Aseguradora';

      if (p.comision_porcentaje !== null && p.comision_porcentaje !== undefined) {
        porcentaje = parseFloat(p.comision_porcentaje);
        origen = 'Poliza';
      } else if (p.asesor_id && p.compania_id) {
        const custom = comisionesAsesores.find(c => c.asesor_id === p.asesor_id && c.compania_id === p.compania_id);
        if (custom) {
          porcentaje = parseFloat(custom.porcentaje);
          origen = 'Asesor';
        } else {
          porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
          origen = 'Aseguradora';
        }
      } else {
        porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
        origen = 'Aseguradora';
      }

      const prima = parseFloat(p.prima_anual || 0);
      const comision_jka = (prima * comision_compania_pct) / 100;
      const comision_calculada = (comision_jka * porcentaje) / 100;

      return {
        ...p,
        comision_compania_pct,
        comision_jka: parseFloat(comision_jka.toFixed(2)),
        porcentaje_aplicado: porcentaje,
        origen_comision: origen,
        comision_calculada: parseFloat(comision_calculada.toFixed(2))
      };
    });

    // Construir tabla de abonos BNC (para copiado directo en excel)
    const bncPreview = [];
    const nowTemp = new Date();
    const dia = String(nowTemp.getDate()).padStart(2, '0');
    const mes = String(nowTemp.getMonth() + 1).padStart(2, '0');
    const anio = nowTemp.getFullYear();
    const fechaPago = `${dia}/${mes}/${anio}`;
    const cuentaDebitar = '01910100201000123456';

    const asesoresMap = {};
    polizasConCalculos.forEach(p => {
      if (!p.asesor_id) return;
      const key = p.asesor_id;
      if (!asesoresMap[key]) {
        const advProfile = asesores.find(a => a.id === p.asesor_id);
        asesoresMap[key] = {
          id: key,
          nombre: p.asesor_nombre,
          correo: advProfile ? advProfile.correo : 'info@jkaconsultores.com',
          cedula: advProfile ? advProfile.cedula : 'V00000000',
          banco: advProfile ? advProfile.banco : 'BNC',
          numero_cuenta: advProfile ? advProfile.numero_cuenta : '00000000000000000000',
          totalComision: 0
        };
      }
      asesoresMap[key].totalComision += p.comision_calculada;
    });

    let refNum = 1001;
    Object.values(asesoresMap).forEach(adv => {
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
      comisiones_asesores: comisionesAsesores,
      polizas: polizasConCalculos,
      bnc_preview: bncPreview
    });
  } catch (err) {
    console.error('Error al obtener comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al obtener comisiones.' });
  }
});

// Generar archivo TXT para Pago de Proveedores del BNC (Delimitado por Tabulaciones)
router.get('/commissions/export-bnc-txt', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') return res.status(403).json({ error: 'No autorizado.' });
  const cuentaDebitarParam = req.query.cuenta_debitar || '01910100201000123456';

  try {
    let companias = [];
    let asesores = [];
    let comisionesAsesores = [];
    let polizas = [];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      companias = fData.companias_seguros || [];
      asesores = fData.asesores || [];
      comisionesAsesores = fData.comisiones_asesores || [];
      
      const rawPolizas = fData.polizas || [];
      polizas = rawPolizas.map(p => {
        const advisor = asesores.find(a => a.id === p.asesor_id);
        const comp = companias.find(c => c.id === p.compania_id);
        const client = (fData.datos_personales || []).find(dp => dp.id === p.cliente_id);
        
        return {
          id: p.id,
          codigo_poliza: p.codigo_poliza,
          plan: p.plan,
          prima_anual: p.prima_anual,
          estado: p.estado,
          pago_estado: p.pago_estado,
          comision_porcentaje: p.comision_porcentaje,
          asesor_nombre: advisor ? advisor.nombre : 'N/A',
          codigo_asesor: advisor ? advisor.codigo_asesor : 'N/A',
          asesor_id: p.asesor_id,
          compania_nombre: comp ? comp.nombre : 'N/A',
          compania_id: p.compania_id,
          primer_nombre: client ? client.primer_nombre : 'N/A',
          primer_apellido: client ? client.primer_apellido : ''
        };
      });
    } else {
      const resComps = await db.query('SELECT id, nombre, comision_estandar, comision_compania, comision_asesor_estandar FROM companias_seguros ORDER BY id ASC');
      companias = resComps.rows;

      const resAsesores = await db.query('SELECT id, nombre, codigo_asesor, correo, cedula, telefono, banco, numero_cuenta FROM asesores ORDER BY id ASC');
      asesores = resAsesores.rows;

      const resComs = await db.query('SELECT id, asesor_id, compania_id, porcentaje FROM comisiones_asesores');
      comisionesAsesores = resComs.rows;

      const resPols = await db.query(`
        SELECT p.id, p.codigo_poliza, p.plan, p.prima_anual, p.estado, p.pago_estado, p.comision_porcentaje,
               a.nombre as asesor_nombre, a.codigo_asesor, a.id as asesor_id,
               c.nombre as compania_nombre, c.id as compania_id,
               dp.primer_nombre, dp.primer_apellido
        FROM polizas p
        LEFT JOIN asesores a ON p.asesor_id = a.id
        LEFT JOIN companias_seguros c ON p.compania_id = c.id
        LEFT JOIN datos_personales dp ON p.cliente_id = dp.id
        ORDER BY p.id DESC
      `);
      polizas = resPols.rows;
    }

    const compMap = {};
    companias.forEach(c => {
      compMap[c.id] = c;
    });

    const polizasConCalculos = polizas.map(p => {
      const comp = compMap[p.compania_id];
      const comision_compania_pct = comp ? parseFloat(comp.comision_compania || 0) : 0;
      
      let porcentaje = 0;
      let origen = 'Aseguradora';

      if (p.comision_porcentaje !== null && p.comision_porcentaje !== undefined) {
        porcentaje = parseFloat(p.comision_porcentaje);
        origen = 'Poliza';
      } else if (p.asesor_id && p.compania_id) {
        const custom = comisionesAsesores.find(c => c.asesor_id === p.asesor_id && c.compania_id === p.compania_id);
        if (custom) {
          porcentaje = parseFloat(custom.porcentaje);
          origen = 'Asesor';
        } else {
          porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
          origen = 'Aseguradora';
        }
      } else {
        porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
        origen = 'Aseguradora';
      }

      const prima = parseFloat(p.prima_anual || 0);
      const comision_jka = (prima * comision_compania_pct) / 100;
      const comision_calculada = (comision_jka * porcentaje) / 100;

      return {
        ...p,
        comision_compania_pct,
        comision_jka: parseFloat(comision_jka.toFixed(2)),
        porcentaje_aplicado: porcentaje,
        origen_comision: origen,
        comision_calculada: parseFloat(comision_calculada.toFixed(2))
      };
    });

    // Agrupar por Asesor
    const asesoresMap = {};
    polizasConCalculos.forEach(p => {
      if (!p.asesor_id) return;
      const key = p.asesor_id;
      if (!asesoresMap[key]) {
        const advProfile = asesores.find(a => a.id === p.asesor_id);
        asesoresMap[key] = {
          id: key,
          nombre: p.asesor_nombre,
          correo: advProfile ? advProfile.correo : 'info@jkaconsultores.com',
          cedula: advProfile ? advProfile.cedula : 'V00000000',
          banco: advProfile ? advProfile.banco : 'BNC',
          numero_cuenta: advProfile ? advProfile.numero_cuenta : '00000000000000000000',
          totalComision: 0
        };
      }
      asesoresMap[key].totalComision += p.comision_calculada;
    });

    const nowTemp = new Date();
    const dia = String(nowTemp.getDate()).padStart(2, '0');
    const mes = String(nowTemp.getMonth() + 1).padStart(2, '0');
    const anio = nowTemp.getFullYear();
    const fechaPago = `${dia}/${mes}/${anio}`;

    const cuentaDebitar = cuentaDebitarParam.replace(/\D/g, '').substring(0, 20).padEnd(20, '0');

    let lines = [];
    let refNum = 1001;

    Object.values(asesoresMap).forEach(adv => {
      if (adv.totalComision <= 0) return;

      const col1 = fechaPago;
      const col2 = cuentaDebitar;
      
      const rawCta = adv.numero_cuenta || '';
      const col3 = rawCta.replace(/\D/g, '').substring(0, 20).padEnd(20, '0');
      
      const col4 = adv.totalComision.toFixed(2).replace('.', ',');
      
      const rawNombre = adv.nombre || 'Asesor Sin Nombre';
      const cleanDesc = `Abono de Comisiones Asesor ${rawNombre}`
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .substring(0, 60);
      const col5 = cleanDesc;
      
      const rawCed = adv.cedula || '';
      const cleanCedula = rawCed.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      const col6 = cleanCedula;
      
      const cleanNombre = rawNombre
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .substring(0, 80);
      const col7 = cleanNombre;
      
      const col8 = (adv.correo || '').substring(0, 100);
      const col9 = String(refNum++);

      lines.push(`${col1}\t${col2}\t${col3}\t${col4}\t${col5}\t${col6}\t${col7}\t${col8}\t${col9}`);
    });

    const fileContent = lines.join('\n');

    res.setHeader('Content-disposition', 'attachment; filename=bnc_pago_proveedores.txt');
    res.setHeader('Content-type', 'text/plain; charset=utf-8');
    res.send(fileContent);

  } catch (err) {
    console.error('Error al generar BNC TXT de comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al generar archivo de pagos BNC.' });
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
    let companias = [];
    let asesores = [];
    let comisionesAsesores = [];
    let polizas = [];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      companias = fData.companias_seguros || [];
      asesores = fData.asesores || [];
      comisionesAsesores = fData.comisiones_asesores || [];
      
      const rawPolizas = fData.polizas || [];
      polizas = rawPolizas.map(p => {
        const advisor = asesores.find(a => a.id === p.asesor_id);
        const comp = companias.find(c => c.id === p.compania_id);
        const client = (fData.datos_personales || []).find(dp => dp.id === p.cliente_id);
        
        return {
          id: p.id,
          codigo_poliza: p.codigo_poliza,
          plan: p.plan,
          prima_anual: p.prima_anual,
          estado: p.estado,
          pago_estado: p.pago_estado,
          comision_porcentaje: p.comision_porcentaje,
          asesor_nombre: advisor ? advisor.nombre : 'N/A',
          codigo_asesor: advisor ? advisor.codigo_asesor : 'N/A',
          asesor_id: p.asesor_id,
          compania_nombre: comp ? comp.nombre : 'N/A',
          compania_id: p.compania_id,
          primer_nombre: client ? client.primer_nombre : 'N/A',
          primer_apellido: client ? client.primer_apellido : ''
        };
      });
    } else {
      const resComps = await db.query('SELECT id, nombre, comision_estandar, comision_compania, comision_asesor_estandar FROM companias_seguros ORDER BY id ASC');
      companias = resComps.rows;

      const resAsesores = await db.query('SELECT id, nombre, codigo_asesor, correo FROM asesores ORDER BY id ASC');
      asesores = resAsesores.rows;

      const resComs = await db.query('SELECT id, asesor_id, compania_id, porcentaje FROM comisiones_asesores');
      comisionesAsesores = resComs.rows;

      const resPols = await db.query(`
        SELECT p.id, p.codigo_poliza, p.plan, p.prima_anual, p.estado, p.pago_estado, p.comision_porcentaje,
               a.nombre as asesor_nombre, a.codigo_asesor, a.id as asesor_id,
               c.nombre as compania_nombre, c.id as compania_id,
               dp.primer_nombre, dp.primer_apellido
        FROM polizas p
        LEFT JOIN asesores a ON p.asesor_id = a.id
        LEFT JOIN companias_seguros c ON p.compania_id = c.id
        LEFT JOIN datos_personales dp ON p.cliente_id = dp.id
        ORDER BY p.id DESC
      `);
      polizas = resPols.rows;
    }

    const compMap = {};
    companias.forEach(c => {
      compMap[c.id] = c;
    });

    const polizasConCalculos = polizas.map(p => {
      const comp = compMap[p.compania_id];
      const comision_compania_pct = comp ? parseFloat(comp.comision_compania || 0) : 0;
      
      let porcentaje = 0;
      let origen = 'Aseguradora';

      if (p.comision_porcentaje !== null && p.comision_porcentaje !== undefined) {
        porcentaje = parseFloat(p.comision_porcentaje);
        origen = 'Poliza';
      } else if (p.asesor_id && p.compania_id) {
        const custom = comisionesAsesores.find(c => c.asesor_id === p.asesor_id && c.compania_id === p.compania_id);
        if (custom) {
          porcentaje = parseFloat(custom.porcentaje);
          origen = 'Asesor';
        } else {
          porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
          origen = 'Aseguradora';
        }
      } else {
        porcentaje = comp ? parseFloat(comp.comision_asesor_estandar || 0) : 0;
        origen = 'Aseguradora';
      }

      const prima = parseFloat(p.prima_anual || 0);
      const comision_jka = (prima * comision_compania_pct) / 100;
      const comision_calculada = (comision_jka * porcentaje) / 100;

      return {
        ...p,
        comision_compania_pct,
        comision_jka: parseFloat(comision_jka.toFixed(2)),
        porcentaje_aplicado: porcentaje,
        origen_comision: origen,
        comision_calculada: parseFloat(comision_calculada.toFixed(2))
      };
    });

    const now = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
    let text = `========================================================================\n`;
    text += `                   JKA CONSULTORES DE SEGUROS\n`;
    text += `                REPORTE DETALLADO DE COMISIONES\n`;
    text += `========================================================================\n`;
    text += `Fecha de Generación: ${now}\n`;
    text += `Generado por: ${req.user.correo}\n\n`;

    const asesoresMap = {};
    polizasConCalculos.forEach(p => {
      const key = p.asesor_id || 'sin_asesor';
      const name = p.asesor_nombre || 'Sin Asesor Asignado';
      const code = p.codigo_asesor || 'N/A';
      if (!asesoresMap[key]) {
        asesoresMap[key] = {
          nombre: name,
          codigo: code,
          polizas: [],
          totalPrima: 0,
          totalComision: 0
        };
      }
      asesoresMap[key].polizas.push(p);
      asesoresMap[key].totalPrima += parseFloat(p.prima_anual || 0);
      asesoresMap[key].totalComision += p.comision_calculada;
    });

    Object.values(asesoresMap).forEach(adv => {
      text += `------------------------------------------------------------------------\n`;
      text += `ASESOR: ${adv.nombre} (Código: ${adv.codigo})\n`;
      text += `------------------------------------------------------------------------\n`;
      text += `Póliza       | Aseguradora     | Plan       | Cliente              | Prima Anual | % Com. | Com. Ganada \n`;
      text += `-------------+-----------------+------------+----------------------+-------------+--------+-------------\n`;
      
      adv.polizas.forEach(p => {
        const cod = p.codigo_poliza.padEnd(12).substring(0, 12);
        const comp = p.compania_nombre.padEnd(15).substring(0, 15);
        const plan = (p.plan || 'N/A').padEnd(10).substring(0, 10);
        const cliName = `${p.primer_nombre} ${p.primer_apellido || ''}`.padEnd(20).substring(0, 20);
        const primaStr = `$${parseFloat(p.prima_anual || 0).toFixed(2)}`.padStart(11);
        const pctStr = `${p.porcentaje_aplicado}%`.padStart(6);
        const comStr = `$${p.comision_calculada.toFixed(2)}`.padStart(11);
        
        text += `${cod} | ${comp} | ${plan} | ${cliName} | ${primaStr} | ${pctStr} | ${comStr}\n`;
      });
      
      text += `-------------+-----------------+------------+----------------------+-------------+--------+-------------\n`;
      text += `TOTALES:                                                            | ${`$${adv.totalPrima.toFixed(2)}`.padStart(11)} |        | ${`$${adv.totalComision.toFixed(2)}`.padStart(11)}\n\n`;
    });

    text += `========================================================================\n`;
    text += `FIN DEL REPORTE\n`;
    text += `========================================================================\n`;

    res.setHeader('Content-disposition', 'attachment; filename=comisiones_asesores.txt');
    res.setHeader('Content-type', 'text/plain; charset=utf-8');
    res.send(text);

  } catch (err) {
    console.error('Error al generar TXT de comisiones:', err);
    res.status(500).json({ error: 'Error del servidor al exportar comisiones.' });
  }
});

export default router;
