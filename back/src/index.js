import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { db } from './db/db.js';
import { generarPdfCotizacion } from './services/pdfGenerator.js';

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'jkaseguros_secret_key_12345';

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de Multer para Carga de Datos en Memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper: Calcular edad a partir de fecha de nacimiento
function calcularEdad(fechaNacimiento) {
  const hoy = new Date();
  const cumple = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - cumple.getFullYear();
  const m = hoy.getMonth() - cumple.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
    edad--;
  }
  return edad;
}

// Middleware de Autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no suministrado.' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
}

// --- RUTAS DE AUTENTICACIÓN ---

// 1. Registro de Usuario (con Datos Personales)
app.post('/api/auth/register', async (req, res) => {
  const {
    correo,
    contrasena,
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
    numero_celular,
    rango // opcional, por defecto 'cliente'
  } = req.body;

  if (!correo || !contrasena || !primer_nombre || !primer_apellido || !fecha_nacimiento || !tipo_documento || !nro_documento || !genero || !numero_celular) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar rellenos.' });
  }

  try {
    // Verificar si el usuario ya existe
    const userExistRes = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
    if (userExistRes.rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashContrasena = await bcrypt.hash(contrasena, salt);

    // Insertar Usuario
    const userRole = rango || 'cliente';
    const userRes = await db.query(
      'INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id, correo, rango',
      [correo, hashContrasena, userRole]
    );
    const userId = userRes.rows[0].id;

    // Insertar Datos Personales
    const personalRes = await db.query(
      `INSERT INTO datos_personales (
        usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        userId, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil || 'Soltero', codigo_area, numero_celular
      ]
    );

    // Si el rango es asesor, registrarlo en la tabla de asesores automáticamente
    if (userRole === 'asesor') {
      const code = `ASE-${Math.floor(100 + Math.random() * 900)}`;
      await db.query(
        `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono) VALUES ($1, $2, $3, $4, $5)`,
        [userId, `${primer_nombre} ${primer_apellido}`, code, correo, `${codigo_area}-${numero_celular}`]
      );
    }

    // Generar JWT
    const token = jwt.sign({ id: userId, correo, rango: userRole }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: userId, correo, rango: userRole },
      cliente: personalRes.rows[0]
    });

  } catch (err) {
    console.error('Error al registrar usuario:', err);
    res.status(500).json({ error: 'Error del servidor al registrar el usuario.' });
  }
});

// 2. Inicio de Sesión
app.post('/api/auth/login', async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  try {
    // Buscar usuario
    const userRes = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas (usuario no encontrado).' });
    }

    const user = userRes.rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(contrasena, user.contrasena);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenciales inválidas (contraseña incorrecta).' });
    }

    // Buscar sus datos personales (si es cliente)
    const personalRes = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [user.id]);
    const cliente = personalRes.rows[0] || null;

    // Buscar datos de asesor (si es asesor)
    let asesor = null;
    if (user.rango === 'asesor') {
      const asesorRes = await db.query('SELECT * FROM asesores WHERE usuario_id = $1', [user.id]);
      asesor = asesorRes.rows[0] || null;
    }

    // Generar Token
    const token = jwt.sign({ id: user.id, correo: user.correo, rango: user.rango }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: { id: user.id, correo: user.correo, rango: user.rango },
      cliente,
      asesor
    });

  } catch (err) {
    console.error('Error en el login:', err);
    res.status(500).json({ error: 'Error del servidor en el inicio de sesión.' });
  }
});

// --- RUTA DE PERFIL ---

// Obtener datos de perfil
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const personalRes = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (personalRes.rows.length === 0) {
      return res.json({ user: req.user, cliente: null });
    }
    res.json({
      user: req.user,
      cliente: personalRes.rows[0]
    });
  } catch (err) {
    console.error('Error al obtener perfil:', err);
    res.status(500).json({ error: 'Error del servidor al obtener el perfil.' });
  }
});

// Actualizar datos de perfil (Mi Perfil - guardar cambios)
app.put('/api/profile', authenticateToken, async (req, res) => {
  const {
    primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
    fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
  } = req.body;

  if (!primer_nombre || !primer_apellido || !fecha_nacimiento || !tipo_documento || !nro_documento || !genero || !numero_celular) {
    return res.status(400).json({ error: 'Los campos obligatorios no pueden estar vacíos.' });
  }

  try {
    // Verificar si existe el registro
    const profileCheck = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    
    let result;
    if (profileCheck.rows.length > 0) {
      // Modificar
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
      // Crear si no existía (ejemplo, para el admin o asesor que actualiza perfil)
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

    // Si es asesor, actualizar también su nombre en asesores
    if (req.user.rango === 'asesor') {
      await db.query(
        'UPDATE asesores SET nombre = $1, telefono = $2 WHERE usuario_id = $3',
        [`${primer_nombre} ${primer_apellido}`, `${codigo_area}-${numero_celular}`, req.user.id]
      );
    }

    res.json({ message: 'Perfil actualizado exitosamente', cliente: result.rows[0] });

  } catch (err) {
    console.error('Error al actualizar perfil:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el perfil.' });
  }
});

// --- LÓGICA DE COTIZACIÓN Y COMPARACIÓN ---

// 1. Obtener cotización comparativa en pantalla
app.post('/api/quote', async (req, res) => {
  const { fecha_nacimiento, tipo_cobertura = 'colectivo' } = req.body;

  if (!fecha_nacimiento) {
    return res.status(400).json({ error: 'La fecha de nacimiento es requerida para calcular la cotización.' });
  }

  const edad = calcularEdad(fecha_nacimiento);

  try {
    // Cargar Compañías de Seguros
    const compRes = await db.query('SELECT * FROM companias_seguros ORDER BY id ASC');
    const companias = compRes.rows;

    // Cargar Tarifas para la edad dada y cobertura
    const tarifasRes = await db.query('SELECT * FROM tarifas WHERE tipo_cobertura = $1', [tipo_cobertura]);
    const tarifas = tarifasRes.rows;

    // Comparar tarifas mapeando por edad
    const comparativa = companias.map(comp => {
      // Buscar tarifa que calce con la edad
      const tarifa = tarifas.find(t => t.compania_id === comp.id && edad >= t.edad_min && edad <= t.edad_max);
      
      return {
        id: comp.id,
        nombre: comp.nombre,
        col_suma_salud: comp.col_suma_salud,
        col_deducible: comp.col_deducible,
        col_maternidad: comp.col_maternidad,
        col_suma_maternidad: comp.col_suma_maternidad,
        col_cobertura_inmediata: comp.col_cobertura_inmediata,
        col_examenes: comp.col_examenes,
        col_espera_inicial: comp.col_espera_inicial,
        col_admisibilidad: comp.col_admisibilidad,
        col_preexistencias: comp.col_preexistencias,
        col_condiciones_pago: comp.col_condiciones_pago,
        
        ind_admisibilidad: comp.ind_admisibilidad,
        ind_suma_salud: comp.ind_suma_salud,
        ind_deducible: comp.ind_deducible,
        ind_maternidad: comp.ind_maternidad,
        ind_deducible_maternidad: comp.ind_deducible_maternidad,
        ind_asistencia_internacional: comp.ind_asistencia_internacional,
        ind_espera_vzla: comp.ind_espera_vzla,
        ind_condiciones_pago: comp.ind_condiciones_pago,
        
        prima: tarifa ? parseFloat(tarifa.prima) : null,
        suma_asegurada_tarifa: tarifa ? parseFloat(tarifa.suma_asegurada) : null
      };
    });

    res.json({
      edad,
      tipo_cobertura: tipo_cobertura,
      comparativa
    });

  } catch (err) {
    console.error('Error al cotizar:', err);
    res.status(500).json({ error: 'Error al procesar la cotización en el servidor.' });
  }
});

// 2. Descargar PDF de Cotización
app.post('/api/quote/pdf', async (req, res) => {
  const { cliente, edad, tipo_cobertura = 'colectivo', comparativas } = req.body;

  if (!cliente || !comparativas) {
    return res.status(400).json({ error: 'Faltan datos del cliente o la cotización para generar el PDF.' });
  }

  try {
    generarPdfCotizacion(res, cliente, edad, tipo_cobertura, comparativas);
  } catch (err) {
    console.error('Error al generar PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error del servidor al generar el archivo PDF.' });
    }
  }
});

// --- GESTIÓN DE PÓLIZAS ---

// Obtener pólizas según el rango
app.get('/api/policies', authenticateToken, async (req, res) => {
  try {
    let queryStr = 'SELECT * FROM polizas ORDER BY id DESC';
    let params = [];

    if (req.user.rango === 'cliente') {
      // Obtener el datos_personales.id del cliente asociado a este usuario_id
      const dp = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
      if (dp.rows.length === 0) return res.json([]);
      
      queryStr = 'SELECT * FROM polizas WHERE cliente_id = $1 ORDER BY id DESC';
      params = [dp.rows[0].id];
    } else if (req.user.rango === 'asesor') {
      // Obtener el asesores.id del asesor asociado a este usuario_id
      const ase = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (ase.rows.length === 0) return res.json([]);

      queryStr = 'SELECT * FROM polizas WHERE asesor_id = $1 ORDER BY id DESC';
      params = [ase.rows[0].id];
    }

    const polRes = await db.query(queryStr, params);
    res.json(polRes.rows);

  } catch (err) {
    console.error('Error al obtener pólizas:', err);
    res.status(500).json({ error: 'Error del servidor al cargar las pólizas.' });
  }
});

// Crear una póliza (Solicitud tras cotizar)
app.post('/api/policies', authenticateToken, async (req, res) => {
  const { compania_id, tipo_cobertura, suma_asegurada, prima_anual } = req.body;

  if (!compania_id || !tipo_cobertura || !suma_asegurada || !prima_anual) {
    return res.status(400).json({ error: 'Faltan detalles de la póliza para proceder.' });
  }

  try {
    // Buscar datos_personales del cliente logueado
    const clientRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (clientRes.rows.length === 0) {
      return res.status(400).json({ error: 'Debe rellenar sus datos personales en su Perfil antes de solicitar pólizas.' });
    }
    const cliente_id = clientRes.rows[0].id;

    // Asignar un asesor al azar o el asesor número 1
    const advisorsRes = await db.query('SELECT id FROM asesores ORDER BY id ASC LIMIT 1');
    const asesor_id = advisorsRes.rows.length > 0 ? advisorsRes.rows[0].id : null;

    // Generar un código único de póliza
    const codPoliza = `POL-${Math.floor(100000 + Math.random() * 900000)}`;

    const q = `
      INSERT INTO polizas (
        codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura,
        area, suma_asegurada, deducible, prima_anual, estado, pago_estado
      ) VALUES ($1, $2, $3, $4, $5, 'Salud', $6, 0, $7, 'negociacion', 'pendiente')
      RETURNING *
    `;
    const newPolRes = await db.query(q, [
      codPoliza, cliente_id, asesor_id, parseInt(compania_id), tipo_cobertura,
      parseFloat(suma_asegurada), parseFloat(prima_anual)
    ]);

    res.status(201).json({
      message: 'Solicitud de póliza creada en estado de negociación.',
      poliza: newPolRes.rows[0]
    });

  } catch (err) {
    console.error('Error al crear póliza:', err);
    res.status(500).json({ error: 'Error del servidor al registrar la póliza.' });
  }
});

// Modificar el estado de la póliza (Asesor / Admin)
app.put('/api/policies/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body; // 'negociacion', 'vigente', 'vencido', 'rechazado'

  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No está autorizado para cambiar el estado de las pólizas.' });
  }

  if (!['negociacion', 'vigente', 'vencido', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado de póliza inválido.' });
  }

  try {
    const q = 'UPDATE polizas SET estado = $1 WHERE id = $2 RETURNING *';
    const updateRes = await db.query(q, [estado, parseInt(id)]);
    
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Póliza no encontrada.' });
    }

    res.json({ message: 'Estado de póliza actualizado exitosamente.', poliza: updateRes.rows[0] });

  } catch (err) {
    console.error('Error al actualizar estado de póliza:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el estado.' });
  }
});

// --- RANGOS Y PANELES ESPECÍFICOS ---

// CLIENTE: 
// 1. Obtener asesores asignados a sus pólizas
app.get('/api/client/advisors', authenticateToken, async (req, res) => {
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
    console.error('Error al obtener asesores:', err);
    res.status(500).json({ error: 'Error en el servidor al cargar asesores.' });
  }
});

// 2. Obtener historial de pagos y próximo pago
app.get('/api/client/payments', authenticateToken, async (req, res) => {
  try {
    const cliRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (cliRes.rows.length === 0) return res.json([]);

    // Obtener pólizas de este cliente
    const polRes = await db.query('SELECT id FROM polizas WHERE cliente_id = $1', [cliRes.rows[0].id]);
    const polIds = polRes.rows.map(p => p.id);

    if (polIds.length === 0) return res.json([]);

    // En SQL de fallback o postgres podemos consultar la lista de pagos
    // Para simplificar, obtenemos todos los pagos y los filtramos en código
    const payRes = await db.query('SELECT * FROM pagos');
    const matchedPayments = payRes.rows.filter(pa => polIds.includes(pa.poliza_id));

    res.json(matchedPayments);
  } catch (err) {
    console.error('Error al obtener pagos:', err);
    res.status(500).json({ error: 'Error en el servidor al cargar historial de pagos.' });
  }
});

// ASESOR:
// 1. Obtener lista de clientes vinculados
app.get('/api/advisor/clients', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  try {
    const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
    if (aseRes.rows.length === 0) return res.json([]);
    const asesorId = aseRes.rows[0].id;

    // Buscar clientes únicos que tengan pólizas con este asesor
    const polRes = await db.query('SELECT DISTINCT cliente_id FROM polizas WHERE asesor_id = $1', [asesorId]);
    const clientIds = polRes.rows.map(r => r.cliente_id);

    if (clientIds.length === 0) return res.json([]);

    const clientsRes = await db.query('SELECT * FROM datos_personales');
    const matchedClients = clientsRes.rows
      .filter(c => clientIds.includes(c.id))
      .map(c => ({
        id: c.id,
        nombre: `${c.primer_nombre} ${c.primer_apellido}`,
        area: 'Salud',
        correo: c.usuario_id ? 'usuario@seguros.com' : '', // se rellena dinámicamente si es necesario
        telefono: `${c.codigo_area}-${c.numero_celular}`
      }));

    res.json(matchedClients);
  } catch (err) {
    console.error('Error al obtener clientes del asesor:', err);
    res.status(500).json({ error: 'Error del servidor al obtener clientes.' });
  }
});

// ADMIN:
// 1. Obtener lista de clientes para admin
app.get('/api/admin/clients', authenticateToken, async (req, res) => {
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
app.get('/api/admin/advisors', authenticateToken, async (req, res) => {
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
app.get('/api/admin/users', authenticateToken, async (req, res) => {
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
app.put('/api/admin/users/:id/role', authenticateToken, async (req, res) => {
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
    }

    res.json({ message: 'Rango de usuario actualizado exitosamente.', user: { id: updatedUser.id, correo: updatedUser.correo, rango: updatedUser.rango } });
  } catch (err) {
    console.error('Error al cambiar rango de usuario:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// 5. Carga masiva de tarifas (Admin Data)
app.post('/api/admin/data', authenticateToken, upload.single('archivo'), async (req, res) => {
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

    // Limpiar tarifas existentes e insertar nuevas
    // Si estamos en fallback JSON, podemos hacerlo de forma simple en db.js
    if (db.isFallback()) {
      // Obtener base de datos de fallback en caliente
      // (Se cargan en memoria)
      // Buscaremos las compañías registradas
      const compMap = {};
      const fallbackFilePath = './data/fallback_db.json';
      
      // Mapear compañías por nombre para obtener IDs
      const fallbackFileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fallbackFileContent);
      
      fData.companias_seguros.forEach(c => {
        compMap[c.nombre] = c.id;
      });

      // Crear nueva lista de tarifas
      const nuevasTarifas = parsedData.map((t, idx) => {
        const cId = compMap[t.compania];
        return {
          id: idx + 1,
          compania_id: cId || 1, // fallback si no coincide
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
      // Postgres: Vaciar tabla y repoblar
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

    res.json({ message: 'Carga masiva realizada con éxito.', count: parsedData.length });

  } catch (err) {
    console.error('Error al realizar carga masiva:', err);
    res.status(500).json({ error: 'Error al procesar el archivo. Verifique que sea un archivo JSON válido.' });
  }
});

// Levantar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${port}`);
});
