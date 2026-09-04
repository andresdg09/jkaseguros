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
        const cDesde = c.cliente_desde 
          ? (typeof c.cliente_desde === 'string' ? c.cliente_desde.split('T')[0] : new Date(c.cliente_desde).toISOString().split('T')[0])
          : (c.created_at ? (typeof c.created_at === 'string' ? c.created_at.split('T')[0] : new Date(c.created_at).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]);
        return {
          id: c.id,
          id_cliente: c.id,
          nombre: `${c.primer_nombre} ${c.primer_apellido}`,
          primer_nombre: c.primer_nombre,
          segundo_nombre: c.segundo_nombre,
          primer_apellido: c.primer_apellido,
          segundo_apellido: c.segundo_apellido,
          fecha_nacimiento: c.fecha_nacimiento,
          cliente_desde: cDesde,
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
    const clientIdsFromPols = polRes.rows.map(r => parseInt(r.cliente_id)).filter(id => !isNaN(id));

    const directClientsRes = await db.query('SELECT id FROM datos_personales WHERE asesor_id = $1', [asesorId]);
    const clientIdsFromDirect = directClientsRes.rows.map(r => parseInt(r.id)).filter(id => !isNaN(id));

    const clientIds = [...new Set([...clientIdsFromPols, ...clientIdsFromDirect])];

    if (clientIds.length === 0) return res.json([]);

    const clientsRes = await db.query('SELECT * FROM datos_personales');
    const usersRes = await db.query('SELECT id, correo FROM usuarios');

    const matchedClients = clientsRes.rows
      .filter(c => clientIds.includes(parseInt(c.id)))
      .map(c => {
        const userObj = usersRes.rows.find(u => u.id === c.usuario_id);
        const cDesde = c.cliente_desde 
          ? (typeof c.cliente_desde === 'string' ? c.cliente_desde.split('T')[0] : new Date(c.cliente_desde).toISOString().split('T')[0])
          : (c.created_at ? (typeof c.created_at === 'string' ? c.created_at.split('T')[0] : new Date(c.created_at).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]);
        return {
          id: c.id,
          id_cliente: c.id,
          nombre: `${c.primer_nombre} ${c.primer_apellido}`,
          primer_nombre: c.primer_nombre,
          segundo_nombre: c.segundo_nombre,
          primer_apellido: c.primer_apellido,
          segundo_apellido: c.segundo_apellido,
          fecha_nacimiento: c.fecha_nacimiento,
          cliente_desde: cDesde,
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
    const tempPassword = `PS360-${nro_documento}`;
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
      message: 'Cliente registrado exitosamente. La contraseña temporal es PS360-[Nro. Documento]',
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

// 5. ASESOR: Enviar documentación de seguros por correo (Salud, Vida, Vehiculo, Hogar)
router.post('/advisor/send-document', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { cliente_id, tipo_seguro } = req.body;

  if (!cliente_id || !tipo_seguro) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos: cliente_id y tipo_seguro.' });
  }

  try {
    // 1. Obtener datos personales del cliente de manera compatible
    const dpRes = await db.query('SELECT * FROM datos_personales WHERE id = $1', [parseInt(cliente_id)]);
    if (dpRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }
    const dp = dpRes.rows[0];

    // 2. Obtener correo del usuario asociado al cliente
    const uRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [dp.usuario_id]);
    if (uRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario de cliente no encontrado.' });
    }
    const clientEmail = uRes.rows[0].correo;

    const hostname = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${hostname}`;

    // Configurar detalles según tipo de seguro
    let subject = '';
    let downloadUrl = '';
    let displayTipo = '';

    switch (tipo_seguro.toLowerCase()) {
      case 'salud':
        subject = `Documentación de Seguro de Salud - Protección y Seguros 360`;
        downloadUrl = `${baseUrl}/docs/seguro_salud_jka.pdf`;
        displayTipo = 'Salud';
        break;
      case 'vida':
        subject = `Documentación de Seguro de Vida - Protección y Seguros 360`;
        downloadUrl = `${baseUrl}/docs/seguro_vida_jka.pdf`;
        displayTipo = 'Vida';
        break;
      case 'vehiculo':
      case 'vehículo':
        subject = `Documentación de Seguro de Vehículo - Protección y Seguros 360`;
        downloadUrl = `${baseUrl}/docs/seguro_vehiculo_jka.pdf`;
        displayTipo = 'Vehículo';
        break;
      case 'hogar':
      case 'patrimonial':
        subject = `Documentación de Seguro Hogar y Patrimonial - Protección y Seguros 360`;
        downloadUrl = `${baseUrl}/docs/seguro_hogar_jka.pdf`;
        displayTipo = 'Hogar y Patrimonial';
        break;
      default:
        return res.status(400).json({ error: 'Tipo de seguro no soportado. Debe ser Salud, Vida, Vehiculo o Hogar.' });
    }

    // Cuerpo HTML interactivo
    const htmlContent = `
      <div style="background-color: #f8fafc; border: 1.5px solid #2563eb; border-radius: 8px; padding: 25px; font-family: sans-serif; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
        <h3 style="color: #1e3a8a; margin-top: 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Documentación de Seguro de ${displayTipo}</h3>
        <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 15px 0 15px 0;">
          Estimado cliente, de acuerdo a lo conversado con tu asesor de Protección y Seguros 360, te hacemos llegar la información detallada y la documentación oficial para tu solicitud de <strong>Seguro de ${displayTipo}</strong>.
        </p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
          Por favor haz clic en el botón de abajo para descargar y revisar los términos del seguro, coberturas y requisitos necesarios para su emisión:
        </p>
        <div style="text-align: center; margin-bottom: 15px;">
          <a href="${downloadUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 4px 6px rgba(37,99,235,0.15);">
            📥 Descargar Documentación PDF
          </a>
        </div>
      </div>
    `;

    // 3. Enviar correo vía EmailJS
    const emailjsPayload = {
      service_id: 'service_271yuq8',
      template_id: 'template_068mrut',
      user_id: 'jgnK_ClSfIQ6PBYqd',
      accessToken: 's2Qg_q1KjxfL6H28PVCIQ',
      template_params: {
        user_name: `${dp.primer_nombre} ${dp.primer_apellido}`,
        to_email: clientEmail,
        fecha: new Date().toLocaleDateString('es-VE'),
        solicitud_ref: `Envío de Documentación de Seguro de ${displayTipo}`,
        plan_cards: htmlContent,
        cotizacion_pdf: ''
      }
    };

    const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailjsPayload)
    });

    if (!emailjsRes.ok) {
      const errorText = await emailjsRes.text();
      console.error('Error de API EmailJS en envío de docs:', errorText);
      throw new Error(`EmailJS falló con código ${emailjsRes.status}`);
    }

    // 4. Registrar acción en logs
    await registrarAccion(
      req.user.id,
      req.user.correo,
      'ENVIO_DOCUMENTACION',
      `Asesor envió documentación de ${displayTipo} al cliente ${dp.primer_nombre} ${dp.primer_apellido} (${clientEmail}).`
    );

    res.json({ message: 'Documentación enviada por correo electrónico con éxito.' });
  } catch (err) {
    console.error('Error al enviar documentación:', err);
    res.status(500).json({ error: 'Error interno al enviar la documentación por correo.' });
  }
});

export default router;
