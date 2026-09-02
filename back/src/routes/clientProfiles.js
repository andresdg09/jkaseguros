import express from 'express';
import crypto from 'crypto';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

/**
 * Motor de Scoring y Potencialidad para Cross-Selling
 */
export function calcularPotencialidades(cliente, perfil = {}, polizas = []) {
  // 1. Calcular edad a partir de fecha_nacimiento
  let edad = 35;
  if (cliente.fecha_nacimiento) {
    const nac = new Date(cliente.fecha_nacimiento);
    const diff = Date.now() - nac.getTime();
    const ageDt = new Date(diff);
    edad = Math.abs(ageDt.getUTCFullYear() - 1970) || 35;
  }

  // Pólizas activas existentes
  const tieneSaludActiva = polizas.some(p => (p.area || '').toLowerCase().includes('salud') || (p.plan || '').toLowerCase().includes('salud'));
  const tieneVidaActiva = polizas.some(p => (p.area || '').toLowerCase().includes('vida') || (p.plan || '').toLowerCase().includes('vida'));
  const tieneAutoActivo = polizas.some(p => (p.area || '').toLowerCase().includes('auto') || (p.area || '').toLowerCase().includes('vehic'));
  const tienePatrimonialActivo = polizas.some(p => (p.area || '').toLowerCase().includes('hogar') || (p.area || '').toLowerCase().includes('empres'));

  const dependientes = parseInt(perfil.dependientes_economicos || cliente.numero_hijos || 0);
  const esSosten = perfil.sosten_principal !== false;
  const tieneDeuda = perfil.tiene_hipoteca_deuda === true;
  const esCasado = (cliente.estado_civil || '').toLowerCase().includes('casad');
  const ingresosAltos = (perfil.rango_ingresos || '').includes('3,000') || (perfil.rango_ingresos || '').includes('6,000');
  const ahorroAlto = (perfil.capacidad_ahorro || '').toLowerCase() === 'alta';
  const ahorroMedio = (perfil.capacidad_ahorro || '').toLowerCase() === 'media';
  const viajaFrecuente = (perfil.frecuencia_viajes || '').toLowerCase().includes('frecuente') || (perfil.frecuencia_viajes || '').toLowerCase().includes('internacional');
  const deportesFrecuentes = (perfil.practica_deportes || '').toLowerCase().includes('frecuente') || (perfil.practica_deportes || '').toLowerCase().includes('alto');
  const poseeAutos = perfil.posee_vehiculos === true || parseInt(perfil.cantidad_vehiculos || 0) > 0;
  const poseeCasas = perfil.posee_inmuebles === true || parseInt(perfil.cantidad_inmuebles || 0) > 0;
  const poseeNegocio = perfil.posee_empresa_negocio === true;
  const interes = (perfil.interes_principal || '').toLowerCase();

  // --- SCORE VIDA ---
  let scoreVida = 20;
  if (dependientes > 0) scoreVida += Math.min(35, dependientes * 15);
  if (esSosten) scoreVida += 20;
  if (tieneDeuda) scoreVida += 25;
  if (esCasado) scoreVida += 10;
  if (edad >= 25 && edad <= 55) scoreVida += 15;
  if (interes.includes('familia') || interes.includes('vida')) scoreVida += 25;
  if (tieneVidaActiva) scoreVida = Math.min(scoreVida, 45); // ya tiene, potencial de ampliación
  scoreVida = Math.min(100, Math.max(10, scoreVida));

  // --- SCORE SALUD / INTERNACIONAL ---
  let scoreSalud = 25;
  if (viajaFrecuente) scoreSalud += 30;
  if (ingresosAltos) scoreSalud += 25;
  if (dependientes > 0) scoreSalud += 20;
  if (deportesFrecuentes) scoreSalud += 15;
  if (interes.includes('salud')) scoreSalud += 25;
  if (tieneSaludActiva) scoreSalud = Math.min(scoreSalud, 50); // oportunidad de upgrade/colectivo
  scoreSalud = Math.min(100, Math.max(10, scoreSalud));

  // --- SCORE PATRIMONIAL (Vehículo / Hogar / Pyme) ---
  let scorePatrimonial = 15;
  if (poseeAutos) scorePatrimonial += 35;
  if (poseeCasas) scorePatrimonial += 30;
  if (poseeNegocio) scorePatrimonial += 35;
  if (ingresosAltos) scorePatrimonial += 15;
  if (interes.includes('patrimonio') || interes.includes('auto') || interes.includes('inmueble')) scorePatrimonial += 25;
  scorePatrimonial = Math.min(100, Math.max(10, scorePatrimonial));

  // --- SCORE RETIRO / AHORRO ---
  let scoreRetiro = 15;
  if (ahorroAlto) scoreRetiro += 35;
  else if (ahorroMedio) scoreRetiro += 20;
  if (ingresosAltos) scoreRetiro += 25;
  if (edad >= 28 && edad <= 55) scoreRetiro += 25;
  if (interes.includes('retiro') || interes.includes('ahorro') || interes.includes('futuro')) scoreRetiro += 30;
  scoreRetiro = Math.min(100, Math.max(10, scoreRetiro));

  // Determinar la principal oportunidad de venta cruzada
  const oportunidades = [
    { tipo: 'Seguro de Vida', score: scoreVida, clave: 'vida', activa: tieneVidaActiva },
    { tipo: 'Seguro de Salud', score: scoreSalud, clave: 'salud', activa: tieneSaludActiva },
    { tipo: 'Seguro Patrimonial / Auto', score: scorePatrimonial, clave: 'patrimonial', activa: tieneAutoActivo || tienePatrimonialActivo },
    { tipo: 'Plan de Retiro e Inversión', score: scoreRetiro, clave: 'retiro', activa: false }
  ];

  oportunidades.sort((a, b) => b.score - a.score);
  const topOportunidad = oportunidades[0];

  // Mensaje sugerido para WhatsApp
  let mensajeWhatsApp = `Hola ${cliente.primer_nombre || 'estimado/a'}, un gusto saludarte. Estaba revisando tu plan de protección en JKA Seguros y me gustaría presentarte una propuesta personalizada para cuidar a tu familia y optimizar tu cobertura. ¿Tendrás unos minutos hoy?`;
  if (topOportunidad.clave === 'vida' && dependientes > 0) {
    mensajeWhatsApp = `Hola ${cliente.primer_nombre}, un gusto saludarte. Pensando en la protección y futuro de tu familia (${dependientes} dependiente${dependientes > 1 ? 's' : ''}), tenemos opciones excelentes de Seguro de Vida con respaldo integral. ¿Te gustaría que te envíe una cotización rápida?`;
  } else if (topOportunidad.clave === 'salud' && viajaFrecuente) {
    mensajeWhatsApp = `Hola ${cliente.primer_nombre}, ¡espero que estés muy bien! Viendo tu dinamismo y viajes frecuentes, tenemos coberturas de salud internacional con atención médica VIP en cualquier lugar. ¿Te gustaría revisarlo?`;
  } else if (topOportunidad.clave === 'patrimonial' && poseeAutos) {
    mensajeWhatsApp = `Hola ${cliente.primer_nombre}, un saludo cordial. Contamos con nuevas tarifas y coberturas completas para vehículos y patrimonio con las mejores aseguradoras aliadas. ¿Deseas que evaluemos tu vehículo sin compromiso?`;
  } else if (topOportunidad.clave === 'retiro') {
    mensajeWhatsApp = `Hola ${cliente.primer_nombre}, un gusto saludarte. Estamos promoviendo planes de ahorro y retiro con rendimientos garantizados para asegurar tu tranquilidad futura. ¿Te interesaría conocer cómo funciona?`;
  }

  return {
    edad,
    scores: {
      vida: scoreVida,
      salud: scoreSalud,
      patrimonial: scorePatrimonial,
      retiro: scoreRetiro
    },
    topOportunidad,
    oportunidades,
    mensajeWhatsApp
  };
}

// 1. Obtener lista de clientes con sus perfiles 360 y métricas (Asesor / Admin)
router.get('/my-clients', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  try {
    let asesorId = null;
    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length === 0) return res.json([]);
      asesorId = aseRes.rows[0].id;
    }

    // Consulta de clientes
    let clientsQuery = `
      SELECT 
        dp.*,
        u.correo as usuario_correo,
        p360.id as perfil_id,
        p360.token_publico,
        p360.profesion_ocupacion,
        p360.empresa_trabajo,
        p360.nivel_educativo,
        p360.ciudad_residencia,
        p360.zona_sector,
        p360.tipo_vivienda,
        p360.fumador,
        p360.practica_deportes,
        p360.frecuencia_viajes,
        p360.sosten_principal,
        p360.dependientes_economicos,
        p360.edades_hijos,
        p360.nombre_conyuge,
        p360.prioridad_familiar,
        p360.rango_ingresos,
        p360.posee_vehiculos,
        p360.cantidad_vehiculos,
        p360.detalles_vehiculos,
        p360.posee_inmuebles,
        p360.cantidad_inmuebles,
        p360.posee_empresa_negocio,
        p360.nombre_empresa_ramo,
        p360.capacidad_ahorro,
        p360.tiene_hipoteca_deuda,
        p360.seguros_actuales,
        p360.experiencia_previa,
        p360.perfil_riesgo,
        p360.interes_principal,
        p360.canal_contacto,
        p360.horario_contacto,
        p360.notas_asesor,
        p360.actualizado_por_cliente,
        p360.updated_at as perfil_updated_at
      FROM datos_personales dp
      LEFT JOIN usuarios u ON dp.usuario_id = u.id
      LEFT JOIN perfiles_clientes_360 p360 ON dp.id = p360.cliente_id
    `;

    const queryParams = [];
    if (asesorId) {
      clientsQuery += `
        WHERE dp.asesor_id = $1 OR dp.id IN (SELECT cliente_id FROM polizas WHERE asesor_id = $1)
      `;
      queryParams.push(asesorId);
    }
    clientsQuery += ` ORDER BY dp.primer_nombre ASC, dp.primer_apellido ASC`;

    const clientsRes = await db.query(clientsQuery, queryParams);

    // Obtener pólizas de estos clientes para cálculo de scoring
    const polizasRes = await db.query('SELECT * FROM polizas');
    const allPolizas = polizasRes.rows;

    const result = await Promise.all(clientsRes.rows.map(async (row) => {
      // Si por alguna razón el cliente no tiene token_publico, generarlo
      let tokenPublico = row.token_publico;
      if (!tokenPublico) {
        tokenPublico = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        await db.query(`
          INSERT INTO perfiles_clientes_360 (cliente_id, token_publico)
          VALUES ($1, $2)
          ON CONFLICT (cliente_id) DO UPDATE SET token_publico = EXCLUDED.token_publico
        `, [row.id, tokenPublico]);
      }

      const clientPolizas = allPolizas.filter(p => parseInt(p.cliente_id) === parseInt(row.id));
      
      const analisis = calcularPotencialidades(row, row, clientPolizas);

      return {
        id: row.id,
        nombre_completo: `${row.primer_nombre} ${row.primer_apellido}`,
        primer_nombre: row.primer_nombre,
        segundo_nombre: row.segundo_nombre,
        primer_apellido: row.primer_apellido,
        segundo_apellido: row.segundo_apellido,
        fecha_nacimiento: row.fecha_nacimiento,
        tipo_documento: row.tipo_documento,
        nro_documento: row.nro_documento,
        genero: row.genero,
        estado_civil: row.estado_civil,
        telefono: `${row.codigo_area}-${row.numero_celular}`,
        codigo_area: row.codigo_area,
        numero_celular: row.numero_celular,
        correo: row.usuario_correo || 'N/A',
        numero_hijos: row.numero_hijos || 0,
        token_publico: tokenPublico,
        perfil_360: {
          profesion_ocupacion: row.profesion_ocupacion || '',
          empresa_trabajo: row.empresa_trabajo || '',
          nivel_educativo: row.nivel_educativo || '',
          ciudad_residencia: row.ciudad_residencia || '',
          zona_sector: row.zona_sector || '',
          tipo_vivienda: row.tipo_vivienda || '',
          fumador: row.fumador || 'No fumador',
          practica_deportes: row.practica_deportes || 'Ninguno',
          frecuencia_viajes: row.frecuencia_viajes || 'No viaja',
          sosten_principal: row.sosten_principal !== false,
          dependientes_economicos: row.dependientes_economicos || row.numero_hijos || 0,
          edades_hijos: row.edades_hijos || '',
          nombre_conyuge: row.nombre_conyuge || '',
          prioridad_familiar: row.prioridad_familiar || '',
          rango_ingresos: row.rango_ingresos || '',
          posee_vehiculos: row.posee_vehiculos || false,
          cantidad_vehiculos: row.cantidad_vehiculos || 0,
          detalles_vehiculos: row.detalles_vehiculos || '',
          posee_inmuebles: row.posee_inmuebles || false,
          cantidad_inmuebles: row.cantidad_inmuebles || 0,
          posee_empresa_negocio: row.posee_empresa_negocio || false,
          nombre_empresa_ramo: row.nombre_empresa_ramo || '',
          capacidad_ahorro: row.capacidad_ahorro || '',
          tiene_hipoteca_deuda: row.tiene_hipoteca_deuda || false,
          seguros_actuales: row.seguros_actuales || [],
          experiencia_previa: row.experiencia_previa || '',
          perfil_riesgo: row.perfil_riesgo || 'Moderado',
          interes_principal: row.interes_principal || '',
          canal_contacto: row.canal_contacto || 'WhatsApp',
          horario_contacto: row.horario_contacto || 'Indiferente',
          notas_asesor: row.notas_asesor || '',
          actualizado_por_cliente: row.actualizado_por_cliente,
          updated_at: row.perfil_updated_at
        },
        polizas_count: clientPolizas.length,
        polizas: clientPolizas,
        analisis
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('Error al obtener clientes 360:', err);
    res.status(500).json({ error: 'Error del servidor al obtener clientes 360.' });
  }
});

// 2. Obtener detalle 360 de un cliente individual (Asesor / Admin)
router.get('/:clienteId', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { clienteId } = req.params;
  try {
    const cliRes = await db.query(`
      SELECT dp.*, u.correo as usuario_correo, p360.*
      FROM datos_personales dp
      LEFT JOIN usuarios u ON dp.usuario_id = u.id
      LEFT JOIN perfiles_clientes_360 p360 ON dp.id = p360.cliente_id
      WHERE dp.id = $1
    `, [parseInt(clienteId)]);

    if (cliRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const row = cliRes.rows[0];
    const polRes = await db.query('SELECT * FROM polizas WHERE cliente_id = $1', [parseInt(clienteId)]);
    const clientPolizas = polRes.rows;

    const analisis = calcularPotencialidades(row, row, clientPolizas);

    res.json({
      cliente: row,
      polizas: clientPolizas,
      analisis
    });
  } catch (err) {
    console.error('Error al obtener perfil 360 de cliente:', err);
    res.status(500).json({ error: 'Error al consultar perfil 360.' });
  }
});

// 3. Guardar / Actualizar Perfil 360 completo (Asesor / Admin)
router.put('/:clienteId', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { clienteId } = req.params;
  const {
    numero_hijos,
    estado_civil,
    profesion_ocupacion,
    empresa_trabajo,
    nivel_educativo,
    ciudad_residencia,
    zona_sector,
    tipo_vivienda,
    fumador,
    practica_deportes,
    frecuencia_viajes,
    sosten_principal,
    dependientes_economicos,
    edades_hijos,
    nombre_conyuge,
    prioridad_familiar,
    rango_ingresos,
    posee_vehiculos,
    cantidad_vehiculos,
    detalles_vehiculos,
    posee_inmuebles,
    cantidad_inmuebles,
    posee_empresa_negocio,
    nombre_empresa_ramo,
    capacidad_ahorro,
    tiene_hipoteca_deuda,
    seguros_actuales,
    experiencia_previa,
    perfil_riesgo,
    interes_principal,
    telefono,
    codigo_area,
    numero_celular,
    horario_contacto,
    notas_asesor
  } = req.body;

  try {
    if (
      telefono !== undefined ||
      codigo_area !== undefined ||
      numero_celular !== undefined ||
      numero_hijos !== undefined ||
      estado_civil !== undefined
    ) {
      let cArea = codigo_area;
      let numCel = numero_celular;
      if (telefono && (!cArea || !numCel)) {
        const clean = telefono.replace(/[^0-9]/g, '');
        if (clean.length >= 10) {
          cArea = clean.slice(0, 4);
          numCel = clean.slice(4);
        } else {
          numCel = clean;
        }
      }

      const formattedPhone = (cArea && numCel) ? `${cArea}-${numCel}` : (telefono || numCel || null);

      await db.query(`
        UPDATE datos_personales 
        SET numero_hijos = COALESCE($1, numero_hijos),
            estado_civil = COALESCE($2, estado_civil),
            codigo_area = COALESCE($3, codigo_area),
            numero_celular = COALESCE($4, numero_celular),
            telefono = COALESCE($5, telefono)
        WHERE id = $6
      `, [
        numero_hijos !== undefined ? parseInt(numero_hijos) : null,
        estado_civil || null,
        cArea || null,
        numCel || null,
        formattedPhone,
        parseInt(clienteId)
      ]);
    }

    const tokenPublico = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    const updateQuery = `
      INSERT INTO perfiles_clientes_360 (
        cliente_id, token_publico, profesion_ocupacion, empresa_trabajo, nivel_educativo,
        ciudad_residencia, zona_sector, tipo_vivienda, fumador, practica_deportes,
        frecuencia_viajes, sosten_principal, dependientes_economicos, edades_hijos,
        nombre_conyuge, prioridad_familiar, rango_ingresos, posee_vehiculos,
        cantidad_vehiculos, detalles_vehiculos, posee_inmuebles, cantidad_inmuebles,
        posee_empresa_negocio, nombre_empresa_ramo, capacidad_ahorro, tiene_hipoteca_deuda,
        seguros_actuales, experiencia_previa, perfil_riesgo, interes_principal,
        canal_contacto, horario_contacto, notas_asesor, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32, $33, NOW()
      )
      ON CONFLICT (cliente_id) DO UPDATE SET
        profesion_ocupacion = EXCLUDED.profesion_ocupacion,
        empresa_trabajo = EXCLUDED.empresa_trabajo,
        nivel_educativo = EXCLUDED.nivel_educativo,
        ciudad_residencia = EXCLUDED.ciudad_residencia,
        zona_sector = EXCLUDED.zona_sector,
        tipo_vivienda = EXCLUDED.tipo_vivienda,
        fumador = EXCLUDED.fumador,
        practica_deportes = EXCLUDED.practica_deportes,
        frecuencia_viajes = EXCLUDED.frecuencia_viajes,
        sosten_principal = EXCLUDED.sosten_principal,
        dependientes_economicos = EXCLUDED.dependientes_economicos,
        edades_hijos = EXCLUDED.edades_hijos,
        nombre_conyuge = EXCLUDED.nombre_conyuge,
        prioridad_familiar = EXCLUDED.prioridad_familiar,
        rango_ingresos = EXCLUDED.rango_ingresos,
        posee_vehiculos = EXCLUDED.posee_vehiculos,
        cantidad_vehiculos = EXCLUDED.cantidad_vehiculos,
        detalles_vehiculos = EXCLUDED.detalles_vehiculos,
        posee_inmuebles = EXCLUDED.posee_inmuebles,
        cantidad_inmuebles = EXCLUDED.cantidad_inmuebles,
        posee_empresa_negocio = EXCLUDED.posee_empresa_negocio,
        nombre_empresa_ramo = EXCLUDED.nombre_empresa_ramo,
        capacidad_ahorro = EXCLUDED.capacidad_ahorro,
        tiene_hipoteca_deuda = EXCLUDED.tiene_hipoteca_deuda,
        seguros_actuales = EXCLUDED.seguros_actuales,
        experiencia_previa = EXCLUDED.experiencia_previa,
        perfil_riesgo = EXCLUDED.perfil_riesgo,
        interes_principal = EXCLUDED.interes_principal,
        canal_contacto = EXCLUDED.canal_contacto,
        horario_contacto = EXCLUDED.horario_contacto,
        notas_asesor = EXCLUDED.notas_asesor,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      parseInt(clienteId),
      tokenPublico,
      profesion_ocupacion || '',
      empresa_trabajo || '',
      nivel_educativo || '',
      ciudad_residencia || '',
      zona_sector || '',
      tipo_vivienda || 'Propia',
      fumador || 'No fumador',
      practica_deportes || 'Ninguno',
      frecuencia_viajes || 'No viaja',
      sosten_principal !== false,
      parseInt(dependientes_economicos || 0),
      edades_hijos || '',
      nombre_conyuge || '',
      prioridad_familiar || '',
      rango_ingresos || '',
      posee_vehiculos === true,
      parseInt(cantidad_vehiculos || 0),
      detalles_vehiculos || '',
      posee_inmuebles === true,
      parseInt(cantidad_inmuebles || 0),
      posee_empresa_negocio === true,
      nombre_empresa_ramo || '',
      capacidad_ahorro || '',
      tiene_hipoteca_deuda === true,
      JSON.stringify(seguros_actuales || []),
      experiencia_previa || '',
      perfil_riesgo || 'Moderado',
      interes_principal || '',
      canal_contacto || 'WhatsApp',
      horario_contacto || 'Indiferente',
      notas_asesor || ''
    ];

    const upRes = await db.query(updateQuery, values);

    await registrarAccion(
      req.user.id,
      req.user.correo,
      'ACTUALIZACION_PERFIL_360',
      `Asesor/Admin actualizó la ficha 360 del cliente ID ${clienteId}.`
    );

    res.json({
      message: 'Ficha 360 guardada exitosamente.',
      perfil: upRes.rows[0]
    });
  } catch (err) {
    console.error('Error al guardar perfil 360:', err);
    res.status(500).json({ error: 'Error del servidor al guardar la ficha 360.' });
  }
});

// 3.1. Actualizar rápidamente el teléfono de un cliente (Asesor / Admin)
router.patch('/:clienteId/phone', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { clienteId } = req.params;
  const { telefono, codigo_area, numero_celular } = req.body;

  try {
    let cArea = codigo_area;
    let numCel = numero_celular;
    if (telefono && (!cArea || !numCel)) {
      const clean = telefono.replace(/[^0-9]/g, '');
      if (clean.length >= 10) {
        cArea = clean.slice(0, 4);
        numCel = clean.slice(4);
      } else {
        numCel = clean;
      }
    }

    const formattedPhone = (cArea && numCel) ? `${cArea}-${numCel}` : (telefono || numCel);

    await db.query(`
      UPDATE datos_personales 
      SET codigo_area = COALESCE($1, codigo_area),
          numero_celular = COALESCE($2, numero_celular),
          telefono = COALESCE($3, telefono)
      WHERE id = $4
    `, [cArea || null, numCel || null, formattedPhone, parseInt(clienteId)]);

    await registrarAccion(
      req.user.id,
      req.user.correo,
      'ACTUALIZACION_TELEFONO_CLIENTE',
      `Asesor/Admin actualizó el teléfono del cliente ID ${clienteId} a ${formattedPhone}.`
    );

    res.json({
      success: true,
      message: 'Teléfono actualizado correctamente.',
      telefono: formattedPhone,
      codigo_area: cArea,
      numero_celular: numCel
    });
  } catch (err) {
    console.error('Error al actualizar teléfono del cliente:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar teléfono.' });
  }
});

// 4. Formulario Público: Obtener datos básicos para que el cliente los complete (Público)
router.get('/public/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const q = `
      SELECT 
        dp.id as cliente_id,
        dp.primer_nombre,
        dp.primer_apellido,
        dp.nro_documento,
        dp.tipo_documento,
        dp.fecha_nacimiento,
        dp.estado_civil,
        dp.codigo_area,
        dp.numero_celular,
        dp.numero_hijos,
        u.correo,
        p360.profesion_ocupacion,
        p360.empresa_trabajo,
        p360.ciudad_residencia,
        p360.zona_sector,
        p360.practica_deportes,
        p360.frecuencia_viajes,
        p360.dependientes_economicos,
        p360.prioridad_familiar,
        p360.interes_principal,
        p360.canal_contacto,
        p360.horario_contacto,
        p360.actualizado_por_cliente
      FROM perfiles_clientes_360 p360
      JOIN datos_personales dp ON p360.cliente_id = dp.id
      LEFT JOIN usuarios u ON dp.usuario_id = u.id
      WHERE p360.token_publico = $1
    `;
    const profileRes = await db.query(q, [token]);

    if (profileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Enlace no válido o expirado.' });
    }

    res.json(profileRes.rows[0]);
  } catch (err) {
    console.error('Error al obtener perfil público por token:', err);
    res.status(500).json({ error: 'Error al consultar formulario del cliente.' });
  }
});

// 5. Formulario Público: Guardar datos completados por el cliente (Público)
router.post('/public/:token', async (req, res) => {
  const { token } = req.params;
  const {
    codigo_area,
    numero_celular,
    estado_civil,
    numero_hijos,
    profesion_ocupacion,
    empresa_trabajo,
    ciudad_residencia,
    zona_sector,
    practica_deportes,
    frecuencia_viajes,
    dependientes_economicos,
    prioridad_familiar,
    interes_principal,
    canal_contacto,
    horario_contacto
  } = req.body;

  try {
    const profRes = await db.query('SELECT cliente_id FROM perfiles_clientes_360 WHERE token_publico = $1', [token]);
    if (profRes.rows.length === 0) {
      return res.status(404).json({ error: 'Enlace no válido o expirado.' });
    }
    const clienteId = profRes.rows[0].cliente_id;

    await db.query(`
      UPDATE datos_personales
      SET codigo_area = COALESCE($1, codigo_area),
          numero_celular = COALESCE($2, numero_celular),
          estado_civil = COALESCE($3, estado_civil),
          numero_hijos = COALESCE($4, numero_hijos)
      WHERE id = $5
    `, [codigo_area, numero_celular, estado_civil, numero_hijos, clienteId]);

    await db.query(`
      UPDATE perfiles_clientes_360
      SET profesion_ocupacion = COALESCE($1, profesion_ocupacion),
          empresa_trabajo = COALESCE($2, empresa_trabajo),
          ciudad_residencia = COALESCE($3, ciudad_residencia),
          zona_sector = COALESCE($4, zona_sector),
          practica_deportes = COALESCE($5, practica_deportes),
          frecuencia_viajes = COALESCE($6, frecuencia_viajes),
          dependientes_economicos = COALESCE($7, dependientes_economicos),
          prioridad_familiar = COALESCE($8, prioridad_familiar),
          interes_principal = COALESCE($9, interes_principal),
          canal_contacto = COALESCE($10, canal_contacto),
          horario_contacto = COALESCE($11, horario_contacto),
          actualizado_por_cliente = NOW(),
          updated_at = NOW()
      WHERE token_publico = $12
    `, [
      profesion_ocupacion,
      empresa_trabajo,
      ciudad_residencia,
      zona_sector,
      practica_deportes,
      frecuencia_viajes,
      dependientes_economicos,
      prioridad_familiar,
      interes_principal,
      canal_contacto,
      horario_contacto,
      token
    ]);

    res.json({
      message: '¡Tus datos han sido actualizados con éxito! Muchas gracias por confiar en JKA Seguros.'
    });
  } catch (err) {
    console.error('Error al guardar datos públicos del cliente:', err);
    res.status(500).json({ error: 'Error del servidor al guardar tus datos.' });
  }
});

// 6. Analítica Agregada de Clientes y Oportunidades de Cross-Selling (Asesor / Admin)
router.get('/analytics/summary', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'asesor' && req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  try {
    let asesorId = null;
    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length === 0) return res.json({});
      asesorId = aseRes.rows[0].id;
    }

    let q = `
      SELECT 
        dp.*,
        u.correo as usuario_correo,
        p360.*
      FROM datos_personales dp
      LEFT JOIN usuarios u ON dp.usuario_id = u.id
      LEFT JOIN perfiles_clientes_360 p360 ON dp.id = p360.cliente_id
    `;
    const params = [];
    if (asesorId) {
      q += ` WHERE dp.asesor_id = $1 OR dp.id IN (SELECT cliente_id FROM polizas WHERE asesor_id = $1)`;
      params.push(asesorId);
    }

    const clientsRes = await db.query(q, params);
    const polizasRes = await db.query('SELECT * FROM polizas');
    const allPolizas = polizasRes.rows;

    const totalClientes = clientsRes.rows.length;
    let completados360 = 0;
    let oportunidadesVida = [];
    let oportunidadesSalud = [];
    let oportunidadesPatrimonial = [];
    let oportunidadesRetiro = [];

    const gruposEdad = { '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    const estadosCiviles = { Soltero: 0, Casado: 0, Divorciado: 0, Viudo: 0, Otro: 0 };
    const rangosIngresos = { 'Menos de $1,000': 0, '$1,000 - $3,000': 0, '$3,000 - $6,000': 0, 'Más de $6,000': 0, 'No especificado': 0 };
    const intereses = {};

    clientsRes.rows.forEach(cli => {
      if (cli.profesion_ocupacion || cli.rango_ingresos || cli.interes_principal) {
        completados360++;
      }

      const clientPolizas = allPolizas.filter(p => parseInt(p.cliente_id) === parseInt(cli.id));
      const analisis = calcularPotencialidades(cli, cli, clientPolizas);

      if (analisis.edad <= 30) gruposEdad['18-30']++;
      else if (analisis.edad <= 45) gruposEdad['31-45']++;
      else if (analisis.edad <= 60) gruposEdad['46-60']++;
      else gruposEdad['60+']++;

      const civil = cli.estado_civil || 'Soltero';
      if (estadosCiviles[civil] !== undefined) estadosCiviles[civil]++;
      else estadosCiviles['Otro']++;

      const ing = cli.rango_ingresos || 'No especificado';
      if (rangosIngresos[ing] !== undefined) rangosIngresos[ing]++;
      else rangosIngresos['No especificado']++;

      const intKey = cli.interes_principal || 'General / Salud';
      intereses[intKey] = (intereses[intKey] || 0) + 1;

      const itemCard = {
        cliente_id: cli.id,
        nombre: `${cli.primer_nombre} ${cli.primer_apellido}`,
        telefono: `${cli.codigo_area}-${cli.numero_celular}`,
        correo: cli.usuario_correo,
        edad: analisis.edad,
        scores: analisis.scores,
        mensajeWhatsApp: analisis.mensajeWhatsApp,
        polizas_count: clientPolizas.length
      };

      if (analisis.scores.vida >= 65) oportunidadesVida.push({ ...itemCard, score: analisis.scores.vida });
      if (analisis.scores.salud >= 65) oportunidadesSalud.push({ ...itemCard, score: analisis.scores.salud });
      if (analisis.scores.patrimonial >= 65) oportunidadesPatrimonial.push({ ...itemCard, score: analisis.scores.patrimonial });
      if (analisis.scores.retiro >= 65) oportunidadesRetiro.push({ ...itemCard, score: analisis.scores.retiro });
    });

    oportunidadesVida.sort((a, b) => b.score - a.score);
    oportunidadesSalud.sort((a, b) => b.score - a.score);
    oportunidadesPatrimonial.sort((a, b) => b.score - a.score);
    oportunidadesRetiro.sort((a, b) => b.score - a.score);

    res.json({
      totalClientes,
      completados360,
      porcentajeCompletitud: totalClientes > 0 ? Math.round((completados360 / totalClientes) * 100) : 0,
      conteos: {
        vida: oportunidadesVida.length,
        salud: oportunidadesSalud.length,
        patrimonial: oportunidadesPatrimonial.length,
        retiro: oportunidadesRetiro.length
      },
      distribuciones: {
        gruposEdad,
        estadosCiviles,
        rangosIngresos,
        intereses
      },
      oportunidades: {
        vida: oportunidadesVida.slice(0, 15),
        salud: oportunidadesSalud.slice(0, 15),
        patrimonial: oportunidadesPatrimonial.slice(0, 15),
        retiro: oportunidadesRetiro.slice(0, 15)
      }
    });
  } catch (err) {
    console.error('Error al generar resumen analítico 360:', err);
    res.status(500).json({ error: 'Error al generar analítica de clientes.' });
  }
});

export default router;
