import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/db.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();
export const JWT_SECRET = process.env.JWT_SECRET || 'jkaseguros_secret_key_12345';

// Middleware de Autenticación
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no suministrado.' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
}

// Verificar existencia de usuario por correo o documento (evita duplicados)
router.post('/check-user', async (req, res) => {
  const { correo, nro_documento } = req.body;
  if (!correo && !nro_documento) {
    return res.status(400).json({ error: 'Faltan parámetros para verificar.' });
  }

  try {
    let exists = false;
    
    if (correo) {
      const emailCheck = await db.query('SELECT id FROM usuarios WHERE correo = $1', [correo.toLowerCase()]);
      if (emailCheck.rows.length > 0) exists = true;
    }

    if (!exists && nro_documento) {
      const docCheck = await db.query('SELECT id FROM datos_personales WHERE nro_documento = $1', [nro_documento]);
      if (docCheck.rows.length > 0) exists = true;
    }

    res.json({ exists });
  } catch (err) {
    console.error('Error al verificar usuario:', err);
    res.status(500).json({ error: 'Error del servidor al verificar usuario.' });
  }
});

// Registro de Usuario
router.post('/register', async (req, res) => {
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
    numero_hijos,
    rango
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
      [correo.toLowerCase(), hashContrasena, userRole]
    );
    const userId = userRes.rows[0].id;

    // Insertar Datos Personales
    const personalRes = await db.query(
      `INSERT INTO datos_personales (
        usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular, numero_hijos
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        userId, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil || 'Soltero', codigo_area, numero_celular,
        numero_hijos ? parseInt(numero_hijos) : 0
      ]
    );

    // Si es asesor, registrarlo automáticamente
    if (userRole === 'asesor') {
      const code = `ASE-${Math.floor(100 + Math.random() * 900)}`;
      await db.query(
        `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono) VALUES ($1, $2, $3, $4, $5)`,
        [userId, `${primer_nombre} ${primer_apellido}`, code, correo.toLowerCase(), `${codigo_area}-${numero_celular}`]
      );
    }

    // Generar JWT
    const token = jwt.sign({ id: userId, correo: correo.toLowerCase(), rango: userRole }, JWT_SECRET, { expiresIn: '24h' });

    // Log de actividad
    await registrarAccion(userId, correo.toLowerCase(), 'REGISTRO', `Usuario registrado como ${userRole}. Nombre: ${primer_nombre} ${primer_apellido}`);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: userId, correo: correo.toLowerCase(), rango: userRole },
      cliente: personalRes.rows[0]
    });

  } catch (err) {
    console.error('Error al registrar usuario:', err);
    res.status(500).json({ error: 'Error del servidor al registrar el usuario.' });
  }
});

// Registro de Asesores Autónomos (Público)
router.post('/register-asesor', async (req, res) => {
  const { correo, contrasena, nombre, cedula, telefono, banco, fecha_nacimiento, numero_cuenta } = req.body;

  if (!correo || !contrasena || !nombre || !cedula || !telefono || !banco || !fecha_nacimiento || !numero_cuenta) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar rellenos.' });
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

    await registrarAccion(newUserId, correo.toLowerCase(), 'REGISTRO_ASESOR_PUBLICO', `Asesor ${nombre} se registró. Solicitud pendiente de aprobación. Código: ${code}`);

    res.status(201).json({
      message: 'Solicitud de afiliación recibida con éxito. Su perfil se encuentra bajo revisión por el administrador.',
      requires_approval: true
    });
  } catch (err) {
    console.error('Error al registrar asesor autónomo:', err);
    res.status(500).json({ error: 'Error del servidor al registrar el asesor.' });
  }
});

// Inicio de Sesión
router.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  try {
    // Buscar usuario
    const userRes = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo.toLowerCase()]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas (usuario no encontrado).' });
    }

    const user = userRes.rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(contrasena, user.contrasena);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenciales inválidas (contraseña incorrecta).' });
    }

    // Buscar sus datos personales
    const personalRes = await db.query('SELECT * FROM datos_personales WHERE usuario_id = $1', [user.id]);
    const cliente = personalRes.rows[0] || null;

    // Buscar datos de asesor
    let asesor = null;
    if (user.rango === 'asesor') {
      const asesorRes = await db.query('SELECT * FROM asesores WHERE usuario_id = $1', [user.id]);
      asesor = asesorRes.rows[0] || null;
      
      if (asesor) {
        if (asesor.estado === 'pendiente') {
          return res.status(403).json({ error: 'Su solicitud de registro como asesor se encuentra pendiente de aprobación.' });
        }
        if (asesor.estado === 'rechazado') {
          return res.status(403).json({ error: 'Su solicitud de afiliación como asesor ha sido rechazada.' });
        }
      }
    }

    // Generar Token
    const token = jwt.sign({ id: user.id, correo: user.correo, rango: user.rango }, JWT_SECRET, { expiresIn: '24h' });

    // Log de actividad
    await registrarAccion(user.id, user.correo, 'INICIO_SESION', `Sesión iniciada correctamente.`);

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

export default router;
