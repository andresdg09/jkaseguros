import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

// 1. Obtener todos los asesores (Público, para dropdown del cotizador con contacto)
router.get('/public/advisors', async (req, res) => {
  try {
    const q = `
      SELECT 
        COALESCE(a.id, u.id) as id,
        COALESCE(a.nombre, dp.primer_nombre || ' ' || dp.primer_apellido, u.correo) as nombre,
        COALESCE(a.codigo_asesor, 'ASE-' || u.id) as codigo_asesor,
        COALESCE(a.telefono, dp.codigo_area || '-' || dp.numero_celular, 'N/A') as telefono,
        u.correo
      FROM usuarios u
      LEFT JOIN asesores a ON u.id = a.usuario_id
      LEFT JOIN datos_personales dp ON u.id = dp.usuario_id
      WHERE u.rango = 'asesor'
      ORDER BY nombre ASC
    `;
    const advRes = await db.query(q);
    res.json(advRes.rows);
  } catch (err) {
    console.error('Error al listar asesores públicos:', err);
    res.status(500).json({ error: 'Error al obtener asesores.' });
  }
});

// 2. CLIENTE: Obtener asesores asignados a sus pólizas
router.get('/client/advisors', authenticateToken, async (req, res) => {
  try {
    // Buscar datos_personales del cliente logueado
    const cliRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (cliRes.rows.length === 0) return res.json([]);

    const polRes = await db.query('SELECT DISTINCT asesor_id FROM polizas WHERE cliente_id = $1', [cliRes.rows[0].id]);
    const advisorIds = polRes.rows.map(r => r.asesor_id).filter(id => id !== null);

    if (advisorIds.length === 0) return res.json([]);

    const advRes = await db.query('SELECT * FROM asesores');
    const matchedAdvisors = advRes.rows.filter(a => advisorIds.includes(a.id)).map(a => ({
      ...a,
      area: 'Salud'
    }));

    res.json(matchedAdvisors);
  } catch (err) {
    console.error('Error al obtener asesores del cliente:', err);
    res.status(500).json({ error: 'Error en el servidor al cargar asesores.' });
  }
});

// 3. ASESOR: Obtener lista de clientes vinculados con detalles completos
router.get('/advisor/clients', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  try {
    let asesorId;
    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length === 0) return res.json([]);
      asesorId = aseRes.rows[0].id;
    } else {
      // Administrador: ver todos los clientes en el sistema
      const clientsRes = await db.query('SELECT * FROM datos_personales');
      const usersRes = await db.query('SELECT id, correo FROM usuarios');
      
      const mapped = clientsRes.rows.map(c => {
        const userObj = usersRes.rows.find(u => u.id === c.usuario_id);
        return {
          id: c.id,
          nombre: `${c.primer_nombre} ${c.primer_apellido}`,
          primer_nombre: c.primer_nombre,
          segundo_nombre: c.segundo_nombre,
          primer_apellido: c.primer_apellido,
          segundo_apellido: c.segundo_apellido,
          fecha_nacimiento: c.fecha_nacimiento,
          tipo_documento: c.tipo_documento,
          nro_documento: c.nro_documento,
          genero: c.genero,
          estado_civil: c.estado_civil,
          telefono: `${c.codigo_area}-${c.numero_celular}`,
          correo: userObj ? userObj.correo : 'N/A'
        };
      });
      return res.json(mapped);
    }

    // Buscar clientes únicos vinculados a pólizas con este asesor o creados directamente por él
    const polRes = await db.query('SELECT DISTINCT cliente_id FROM polizas WHERE asesor_id = $1', [asesorId]);
    const clientIdsFromPols = polRes.rows.map(r => r.cliente_id);

    const directClientsRes = await db.query('SELECT id FROM datos_personales WHERE asesor_id = $1', [asesorId]);
    const clientIdsFromDirect = directClientsRes.rows.map(r => r.id);

    const clientIds = [...new Set([...clientIdsFromPols, ...clientIdsFromDirect])];

    if (clientIds.length === 0) return res.json([]);

    const clientsRes = await db.query('SELECT * FROM datos_personales');
    const usersRes = await db.query('SELECT id, correo FROM usuarios');

    const matchedClients = clientsRes.rows
      .filter(c => clientIds.includes(c.id))
      .map(c => {
        const userObj = usersRes.rows.find(u => u.id === c.usuario_id);
        return {
          id: c.id,
          nombre: `${c.primer_nombre} ${c.primer_apellido}`,
          primer_nombre: c.primer_nombre,
          segundo_nombre: c.segundo_nombre,
          primer_apellido: c.primer_apellido,
          segundo_apellido: c.segundo_apellido,
          fecha_nacimiento: c.fecha_nacimiento,
          tipo_documento: c.tipo_documento,
          nro_documento: c.nro_documento,
          genero: c.genero,
          estado_civil: c.estado_civil,
          telefono: `${c.codigo_area}-${c.numero_celular}`,
          correo: userObj ? userObj.correo : 'N/A'
        };
      });

    res.json(matchedClients);
  } catch (err) {
    console.error('Error al obtener clientes del asesor:', err);
    res.status(500).json({ error: 'Error del servidor al obtener clientes.' });
  }
});

// 4. ASESOR: Registrar un cliente directamente
router.post('/advisor/create-client', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado para registrar clientes.' });
  }

  const {
    correo,
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido,
    fecha_nacimiento,
    tipo_documento,
    nro_documento,
    genero,
    estado_civil,
    codigo_area,
    numero_celular
  } = req.body;

  if (!correo || !primer_nombre || !primer_apellido || !fecha_nacimiento || !tipo_documento || !nro_documento || !genero || !numero_celular) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar rellenos.' });
  }

  try {
    const userExistRes = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
    if (userExistRes.rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const docExistRes = await db.query('SELECT * FROM datos_personales WHERE nro_documento = $1', [nro_documento]);
    if (docExistRes.rows.length > 0) {
      return res.status(400).json({ error: 'El número de documento ya está registrado.' });
    }

    // Generar contraseña temporal
    const tempPassword = `JKA-${nro_documento}`;
    const salt = await bcrypt.genSalt(10);
    const hashContrasena = await bcrypt.hash(tempPassword, salt);

    // Obtener asesor_id si es asesor
    let asesorId = null;
    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length > 0) {
        asesorId = aseRes.rows[0].id;
      }
    }

    // Insertar Usuario
    const userRes = await db.query(
      'INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id, correo, rango',
      [correo.toLowerCase(), hashContrasena, 'cliente']
    );
    const userId = userRes.rows[0].id;

    // Insertar Datos Personales
    const personalRes = await db.query(
      `INSERT INTO datos_personales (
        usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular, asesor_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        userId, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil || 'Soltero', codigo_area, numero_celular, asesorId
      ]
    );

    // Registrar acción para control/trazabilidad
    await registrarAccion(req.user.id, req.user.correo, 'CREACION_CLIENTE', `Asesor registró cliente ${primer_nombre} ${primer_apellido} (${correo.toLowerCase()}).`);

    res.status(201).json({
      message: 'Cliente registrado exitosamente. La contraseña temporal es JKA-[Nro. Documento]',
      cliente: {
        ...personalRes.rows[0],
        correo: correo.toLowerCase()
      },
      tempPassword
    });

  } catch (err) {
    console.error('Error al registrar cliente desde asesor:', err);
    res.status(500).json({ error: 'Error del servidor al registrar el cliente.' });
  }
});

export default router;
