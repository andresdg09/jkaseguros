import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { generarPdfCotizacion, generarPdfBuffer } from '../services/pdfGenerator.js';
import { registrarAccion } from '../db/logger.js';
import { generarPagosFraccionados } from './policies.js';

const router = express.Router();

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

// Beneficios considerados para calcular el score de cobertura. Un campo vacío
// o con valor "NO" se entiende como beneficio no incluido en ese plan.
const BENEFIT_FIELDS = [
  'maternidad_suma', 'asist_intl_suma', 'funeral_suma',
  'at_situ_medicamentos', 'consultas_medicas', 'examenes_lab_imagenologia', 'ambulancia'
];

function tieneBeneficio(valor) {
  if (!valor) return false;
  const v = String(valor).trim().toUpperCase();
  return v !== '' && v !== 'NO';
}

// Helper: Puntuación de calidad de cobertura según cantidad de beneficios incluidos en el plan
function getCalidadScore(tarifa) {
  const incluidos = BENEFIT_FIELDS.filter(f => tieneBeneficio(tarifa[f])).length;
  return Math.round((incluidos / BENEFIT_FIELDS.length) * 50);
}

// Helper: Calcular comparativa para una suma asegurada
function calcularComparativa(tarifasRows, sumaAsegurada, edadTarifa, companiaIdsFiltrados, dependientes = []) {
  const validDeps = dependientes.filter(d => d.edad !== undefined && d.edad !== null && d.edad !== '' && !isNaN(parseInt(d.edad)));

  // 1. Filtrar tarifas por la suma asegurada solicitada
  let tarifasSuma = tarifasRows.filter(t => parseFloat(t.suma_asegurada) === parseFloat(sumaAsegurada));

  if (companiaIdsFiltrados && companiaIdsFiltrados.length > 0) {
    tarifasSuma = tarifasSuma.filter(t => companiaIdsFiltrados.includes(t.compania_id));
  }

  // 2. Agrupar tarifas por (compania_id, plan)
  const planesMap = new Map();
  tarifasSuma.forEach(t => {
    const key = `${t.compania_id}_${t.plan}`;
    if (!planesMap.has(key)) {
      planesMap.set(key, []);
    }
    planesMap.get(key).push(t);
  });

  // 3. Para cada plan, calcular el total de prima (titular + dependientes)
  const planesCalculados = [];
  for (const [key, rows] of planesMap.entries()) {
    // Buscar tarifa para el titular
    const titularRow = rows.find(t => edadTarifa >= parseInt(t.edad_min) && edadTarifa <= parseInt(t.edad_max));
    if (!titularRow) {
      continue; // Si el plan no cubre la edad del titular, se descarta
    }

    let totalPrima = parseFloat(titularRow.prima);
    let todosCubiertos = true;
    const desglosePrimas = [{ relacion: 'titular', edad: edadTarifa, prima: parseFloat(titularRow.prima) }];

    // Buscar tarifa para cada dependiente en este mismo plan
    for (const dep of validDeps) {
      const depEdad = parseInt(dep.edad);
      const depRow = rows.find(t => depEdad >= parseInt(t.edad_min) && depEdad <= parseInt(t.edad_max));
      if (!depRow) {
        todosCubiertos = false;
        break; // Si el plan no cubre a este dependiente, se descarta el plan
      }
      const depPrima = parseFloat(depRow.prima);
      totalPrima += depPrima;
      desglosePrimas.push({ relacion: dep.relacion, edad: depEdad, prima: depPrima });
    }

    if (!todosCubiertos) {
      continue;
    }

    planesCalculados.push({
      titularRow,
      totalPrima,
      desglosePrimas
    });
  }

  // 4. Agrupar por compañía de seguros y quedarnos con el plan de menor prima total
  const porCompania = new Map();
  planesCalculados.forEach(p => {
    const cid = p.titularRow.compania_id;
    const actual = porCompania.get(cid);
    if (!actual || p.totalPrima < actual.totalPrima) {
      porCompania.set(cid, p);
    }
  });

  let comparativa = [...porCompania.values()].map(p => {
    const t = p.titularRow;
    const prima = p.totalPrima;
    const calidadScore = getCalidadScore(t);
    const relacion_calidad_precio = prima ? parseFloat(((calidadScore / prima) * 100).toFixed(2)) : 0;

    return {
      id: t.compania_id,
      nombre: t.compania_nombre || 'Aseguradora',
      plan: t.plan,
      pago: t.pago,
      suma_asegurada: parseFloat(t.suma_asegurada),
      prima,
      pago_contado: !!t.pago_contado,
      pago_semestral: !!t.pago_semestral,
      pago_trimestral: !!t.pago_trimestral,
      pago_mensual: !!t.pago_mensual,
      maternidad_suma: t.maternidad_suma,
      maternidad_costo: t.maternidad_costo,
      asist_intl_suma: t.asist_intl_suma,
      asist_intl_costo: t.asist_intl_costo,
      funeral_suma: t.funeral_suma,
      funeral_costo: t.funeral_costo,
      at_situ_medicamentos: t.at_situ_medicamentos,
      consultas_medicas: t.consultas_medicas,
      examenes_lab_imagenologia: t.examenes_lab_imagenologia,
      ambulancia: t.ambulancia,
      calidadScore,
      relacion_calidad_precio,
      recomendada: false,
      desglosePrimas: p.desglosePrimas
    };
  });

  // Identificar la mejor opción costo/calidad (mayor relación calidad/precio)
  if (comparativa.length > 0) {
    const mejorOpcion = comparativa.reduce((prev, current) => {
      return (prev.relacion_calidad_precio > current.relacion_calidad_precio) ? prev : current;
    });
    comparativa = comparativa.map(item => item.id === mejorOpcion.id ? { ...item, recomendada: true } : item);
  }

  // Ordenar por prima ascendente para una comparación más clara
  comparativa.sort((a, b) => a.prima - b.prima);
  return comparativa;
}

// 1. Obtener cotización comparativa
router.post('/', async (req, res) => {
  const { fecha_nacimiento, suma_asegurada, suma_asegurada_2, compania_ids, dependientes } = req.body;

  if (!fecha_nacimiento) {
    return res.status(400).json({ error: 'La fecha de nacimiento es requerida para calcular la cotización.' });
  }
  if (!suma_asegurada) {
    return res.status(400).json({ error: 'La suma asegurada es requerida para calcular la cotización.' });
  }

  const sumaAsegurada = parseFloat(suma_asegurada);
  const edadReal = calcularEdad(fecha_nacimiento);

  // Métrica: Ajuste de edad sumándole 6 meses.
  const cumpleAjustado = new Date(fecha_nacimiento);
  cumpleAjustado.setMonth(cumpleAjustado.getMonth() - 6);
  const edadTarifa = calcularEdad(cumpleAjustado);

  try {
    // Validar restricción de un máximo de 3 aseguradoras seleccionadas
    if (compania_ids) {
      if (!Array.isArray(compania_ids) || compania_ids.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar al menos 1 compañía de seguros para realizar la cotización.' });
      }
      if (compania_ids.length > 3) {
        return res.status(400).json({ error: 'Puede seleccionar un máximo de 3 compañías de seguros para realizar la cotización.' });
      }
    }

    const companiaIdsFiltrados = (compania_ids && Array.isArray(compania_ids)) ? compania_ids.map(id => parseInt(id)) : null;

    // Cargar todas las tarifas
    const tarifasRes = await db.query('SELECT t.*, c.nombre AS compania_nombre FROM tarifas t LEFT JOIN companias_seguros c ON t.compania_id = c.id', []);

    // Calcular comparativa para la primera suma asegurada
    const comparativa = calcularComparativa(tarifasRes.rows, sumaAsegurada, edadTarifa, companiaIdsFiltrados, dependientes);

    // Calcular comparativa para la segunda suma asegurada (si se proporciona)
    let comparativa2 = null;
    if (suma_asegurada_2) {
      comparativa2 = calcularComparativa(tarifasRes.rows, parseFloat(suma_asegurada_2), edadTarifa, companiaIdsFiltrados, dependientes);
    }

    // Registrar en logs de trazabilidad
    let logsMsg = `Cotización calculada para edad ${edadReal}, suma asegurada: $${sumaAsegurada}`;
    if (suma_asegurada_2) {
      logsMsg += ` y segunda suma: $${suma_asegurada_2}`;
    }
    if (companiaIdsFiltrados) {
      logsMsg += `. Aseguradoras seleccionadas: ${companiaIdsFiltrados.join(', ')}`;
    }
    if (dependientes && dependientes.length > 0) {
      logsMsg += `. Dependientes: ${dependientes.length}`;
    }
    await registrarAccion(null, 'cotizador_publico', 'COTIZACION', logsMsg);

    res.json({
      edad: edadReal,
      suma_asegurada: sumaAsegurada,
      comparativa,
      ...(suma_asegurada_2 ? {
        suma_asegurada_2: parseFloat(suma_asegurada_2),
        comparativa_2: comparativa2
      } : {})
    });

  } catch (err) {
    console.error('Error al cotizar:', err);
    res.status(500).json({ error: 'Error al procesar la cotización en el servidor.' });
  }
});

// 2. Listar las sumas aseguradas disponibles en la matriz de tarifas (para el selector del cotizador)
router.get('/sums', async (req, res) => {
  try {
    const tarifasRes = await db.query('SELECT DISTINCT suma_asegurada FROM tarifas', []);
    const sums = [...new Set(tarifasRes.rows.map(t => parseFloat(t.suma_asegurada)))].sort((a, b) => a - b);
    res.json(sums);
  } catch (err) {
    console.error('Error al obtener sumas aseguradas:', err);
    res.status(500).json({ error: 'Error al obtener las sumas aseguradas disponibles.' });
  }
});

// 2b. Listar todas las tarifas completas con su compañía para asesores y cotizadores
router.get('/tariffs', async (req, res) => {
  try {
    const q = `
      SELECT t.*, c.nombre AS compania_nombre
      FROM tarifas t
      LEFT JOIN companias_seguros c ON t.compania_id = c.id
      ORDER BY t.compania_id ASC, t.plan ASC, t.suma_asegurada ASC, t.edad_min ASC
    `;
    const result = await db.query(q, []);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener tarifas:', err);
    res.status(500).json({ error: 'Error al obtener tarifas.' });
  }
});

// 3. Descargar PDF de Cotización
router.post('/pdf', async (req, res) => {
  const { cliente, edad, suma_asegurada, comparativas, asesor } = req.body;

  if (!cliente || !comparativas) {
    return res.status(400).json({ error: 'Faltan datos del cliente o la cotización para generar el PDF.' });
  }

  try {
    generarPdfCotizacion(res, cliente, edad, suma_asegurada, comparativas, asesor);
  } catch (err) {
    console.error('Error al generar PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error del servidor al generar el archivo PDF.' });
    }
  }
});

// 4. Enviar Cotización por correo vía EmailJS
router.post('/email', async (req, res) => {
  const { cliente, edad, suma_asegurada, comparativas, email, asesor, mensaje } = req.body;

  if (!cliente || !comparativas) {
    return res.status(400).json({ error: 'Faltan datos del cliente o la cotización para enviar por correo.' });
  }

  const targetEmail = email || cliente.correo;
  if (!targetEmail) {
    return res.status(400).json({ error: 'No se especificó ningún correo destinatario.' });
  }

  try {
    // Generar PDF en memoria
    const pdfBuffer = await generarPdfBuffer(cliente, edad, suma_asegurada, comparativas, asesor);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Generar bloque HTML de las tarjetas de planes para el cuerpo del correo
    let rawPhone = (asesor && asesor.telefono) ? asesor.telefono.replace(/[^0-9]/g, '') : '584121234567';
    if (rawPhone.startsWith('0')) rawPhone = '58' + rawPhone.substring(1);
    const cleanPhone = rawPhone;
    const advisorName = (asesor && asesor.nombre) ? asesor.nombre : 'Asesor Protección y Seguros 360';

    let planCardsHtml = '';
    comparativas.forEach(comp => {
      const waMsg = `Hola ${advisorName}, estoy interesado en contratar el seguro de salud de *${comp.nombre}* (Plan ${comp.plan || 'N/A'}) con una prima anual de *$${comp.prima}* para la suma asegurada de *$${comp.suma_asegurada || suma_asegurada}*. Por favor contácteme.`;
      const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
      
      const isBest = !!comp.recomendada;
      const cardBg = isBest ? '#eff6ff' : '#ffffff';
      const cardBorder = isBest ? '#2563eb' : '#cbd5e1';
      /* Insignia de recomendación comentada por requerimiento institucional
      const badgeHtml = isBest ? `
        <div style="background-color: #10b981; color: #ffffff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-bottom: 10px;">
          RECOMENDACIÓN JKA
        </div>
      ` : '';
      */
      const badgeHtml = '';

      planCardsHtml += `
        <div style="background-color: ${cardBg}; border: 1.5px solid ${cardBorder}; border-radius: 8px; margin-bottom: 20px; padding: 20px; font-family: sans-serif; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
          ${badgeHtml}
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align: top;">
                <span style="font-size: 18px; font-weight: bold; color: #1e3a8a; display: block;">${comp.nombre}</span>
                <span style="font-size: 13px; font-weight: bold; color: #2563eb; text-transform: uppercase;">PLAN: ${comp.plan || 'N/A'}</span>
              </td>
              <td align="right" style="vertical-align: top;">
                <div style="background-color: ${isBest ? '#dbeafe' : '#f1f5f9'}; padding: 10px 15px; border-radius: 6px; text-align: center; min-width: 100px; display: inline-block;">
                  <span style="font-size: 9px; color: #64748b; font-weight: bold; display: block; text-transform: uppercase; letter-spacing: 0.5px;">PRIMA ANUAL</span>
                  <span style="font-size: 18px; color: #1e3a8a; font-weight: bold; display: block;">$${Number(comp.prima).toLocaleString('en-US')}</span>
                  <span style="font-size: 8px; color: #94a3b8; display: block;">por año</span>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 12px; color: #334155; line-height: 1.5;">
              <tr>
                <td width="50%" style="padding: 4px 0;"><strong>Maternidad:</strong> ${comp.maternidad_suma ? comp.maternidad_suma + (comp.maternidad_costo ? ' (+' + comp.maternidad_costo + ')' : '') : 'No incluida'}</td>
                <td width="50%" style="padding: 4px 0;"><strong>Asistencia Intl:</strong> ${comp.asist_intl_suma ? comp.asist_intl_suma + (comp.asist_intl_costo ? ' (+' + comp.asist_intl_costo + ')' : '') : 'No incluida'}</td>
              </tr>
              <tr>
                <td width="50%" style="padding: 4px 0;"><strong>Funeral:</strong> ${comp.funeral_suma ? comp.funeral_suma + (comp.funeral_costo ? ' (+' + comp.funeral_costo + ')' : '') : 'No incluido'}</td>
                <td width="50%" style="padding: 4px 0;"><strong>Forma de Pago:</strong> ${comp.pago || 'Consultar'}</td>
              </tr>
            </table>
          </div>
          
          <div style="margin-top: 12px; font-size: 11px; color: #64748b; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
            <strong>Servicios:</strong>
            <span style="margin-right: 8px; color: ${comp.at_situ_medicamentos && comp.at_situ_medicamentos !== 'NO' ? '#10b981' : '#94a3b8'};">● At. Situ+Med</span>
            <span style="margin-right: 8px; color: ${comp.consultas_medicas && comp.consultas_medicas !== 'NO' ? '#10b981' : '#94a3b8'};">● Consultas</span>
            <span style="margin-right: 8px; color: ${comp.examenes_lab_imagenologia && comp.examenes_lab_imagenologia !== 'NO' ? '#10b981' : '#94a3b8'};">● Exámenes</span>
            <span style="color: ${comp.ambulancia && comp.ambulancia !== 'NO' ? '#10b981' : '#94a3b8'};">● Ambulancia</span>
          </div>

          <div style="margin-top: 10px; font-size: 11px; color: #1e3a8a; font-weight: bold;">
            Score de Cobertura: ${comp.calidadScore || 0}/50 pts
          </div>
          
          <div style="margin-top: 15px; text-align: center;">
            <a href="${waLink}" target="_blank" style="background-color: #25d366; color: #ffffff; padding: 10px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 211, 102, 0.2); line-height: 1.2;">
              💬 Solicitar este Plan por WhatsApp
            </a>
          </div>
        </div>
      `;
    });

    // Armar payload de la API de EmailJS
    const emailjsPayload = {
      service_id: 'service_271yuq8',
      template_id: 'template_068mrut',
      user_id: 'jgnK_ClSfIQ6PBYqd',
      accessToken: 's2Qg_q1KjxfL6H28PVCIQ',
      template_params: {
        user_name: `${cliente.primer_nombre} ${cliente.primer_apellido}`,
        to_email: targetEmail,
        fecha: new Date().toLocaleDateString('es-VE'),
        solicitud_ref: `Cuadro Comparativo de Seguro de Salud (Suma Asegurada $${Number(suma_asegurada).toLocaleString('en-US')})`,
        cotizacion_pdf: pdfBase64,
        plan_cards: planCardsHtml,
        // Nota: para que este texto aparezca en el correo, la plantilla en el
        // dashboard de EmailJS debe referenciar {{mensaje_personalizado}}.
        mensaje_personalizado: mensaje || 'Gracias por contactarte con nosotros. Adjunto encontrarás tu cotización de seguro de salud.'
      }
    };

    const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailjsPayload)
    });

    if (!emailjsRes.ok) {
      const errorText = await emailjsRes.text();
      console.error('Error de API EmailJS:', errorText);
      throw new Error(`EmailJS falló con estado ${emailjsRes.status}: ${errorText}`);
    }

    res.json({ message: 'Correo enviado con éxito mediante EmailJS.' });
  } catch (err) {
    console.error('Error al enviar correo de cotización:', err);
    res.status(500).json({ error: 'Error del servidor al procesar y enviar el correo electrónico.' });
  }
});

// 5. Guardar cotización para compartir por WhatsApp
router.post('/share', async (req, res) => {
  const { cliente, suma_asegurada, suma_asegurada_2, dependientes, comparativa, comparativa_2, asesor_id } = req.body;

  if (!cliente || !cliente.nro_documento || !cliente.correo) {
    return res.status(400).json({ error: 'Los datos del cliente son requeridos para guardar la cotización.' });
  }

  try {
    const token = crypto.randomUUID();
    const cleanAsesorId = asesor_id ? parseInt(asesor_id) : null;

    const query = `
      INSERT INTO cotizaciones (
        token, asesor_id, cliente_datos, suma_asegurada, suma_asegurada_2, dependientes, comparativa, comparativa_2
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `;
    const params = [
      token,
      cleanAsesorId,
      JSON.stringify(cliente),
      parseFloat(suma_asegurada),
      suma_asegurada_2 ? parseFloat(suma_asegurada_2) : null,
      JSON.stringify(dependientes || []),
      JSON.stringify(comparativa || []),
      JSON.stringify(comparativa_2 || [])
    ];

    await db.query(query, params);
    
    res.json({ token, message: 'Cotización guardada correctamente.' });
  } catch (err) {
    console.error('Error al guardar cotización compartida:', err);
    res.status(500).json({ error: 'Error del servidor al guardar la cotización.' });
  }
});

// 6. Obtener cotización compartida por token
router.get('/share/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const quoteRes = await db.query('SELECT * FROM cotizaciones WHERE token = $1', [token]);
    if (quoteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cotización no encontrada o enlace vencido.' });
    }

    const quote = quoteRes.rows[0];

    // Obtener información del asesor si tiene uno asignado
    let asesor = null;
    if (quote.asesor_id) {
      const aseRes = await db.query('SELECT * FROM asesores WHERE id = $1', [quote.asesor_id]);
      if (aseRes.rows.length > 0) {
        asesor = aseRes.rows[0];
      }
    }

    res.json({
      token: quote.token,
      cliente_datos: typeof quote.cliente_datos === 'string' ? JSON.parse(quote.cliente_datos) : quote.cliente_datos,
      suma_asegurada: parseFloat(quote.suma_asegurada),
      suma_asegurada_2: quote.suma_asegurada_2 ? parseFloat(quote.suma_asegurada_2) : null,
      dependientes: typeof quote.dependientes === 'string' ? JSON.parse(quote.dependientes) : quote.dependientes,
      comparativa: typeof quote.comparativa === 'string' ? JSON.parse(quote.comparativa) : quote.comparativa,
      comparativa_2: typeof quote.comparativa_2 === 'string' ? JSON.parse(quote.comparativa_2) : quote.comparativa_2,
      estado: quote.estado,
      created_at: quote.created_at,
      asesor
    });
  } catch (err) {
    console.error('Error al obtener cotización compartida:', err);
    res.status(500).json({ error: 'Error del servidor al recuperar la cotización.' });
  }
});

// 7. Aceptar cotización por parte del cliente (Public Link click en "Quiero esta")
router.post('/share/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { compania_id, plan, prima_anual, suma_asegurada, frecuencia_pago } = req.body;

  const validFrequencies = ['contado', 'semestral', 'trimestral', 'mensual'];
  const freq = validFrequencies.includes(frecuencia_pago) ? frecuencia_pago : 'contado';

  if (!compania_id || !plan || isNaN(prima_anual) || isNaN(suma_asegurada)) {
    return res.status(400).json({ error: 'Faltan parámetros de la oferta de seguro seleccionada.' });
  }

  try {
    // 1. Obtener la cotización
    const quoteRes = await db.query('SELECT * FROM cotizaciones WHERE token = $1', [token]);
    if (quoteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    const quote = quoteRes.rows[0];
    if (quote.estado === 'aceptada') {
      return res.status(400).json({ error: 'Esta cotización ya fue aceptada previamente.' });
    }

    const clienteDatos = typeof quote.cliente_datos === 'string' ? JSON.parse(quote.cliente_datos) : quote.cliente_datos;
    const { correo, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular } = clienteDatos;

    // 2. Registrar/buscar cliente en el sistema
    let finalClienteId = null;
    let clientEmail = correo.toLowerCase();
    let clientName = `${primer_nombre} ${primer_apellido}`;

    // Buscar si el número de documento ya existe en datos_personales
    const docExistRes = await db.query('SELECT * FROM datos_personales WHERE nro_documento = $1', [nro_documento]);
    
    if (docExistRes.rows.length > 0) {
      // El cliente ya existe
      finalClienteId = docExistRes.rows[0].id;
    } else {
      // No existe, buscar si el correo está registrado en usuarios
      const userExistRes = await db.query('SELECT * FROM usuarios WHERE correo = $1', [clientEmail]);
      let userId;

      if (userExistRes.rows.length > 0) {
        userId = userExistRes.rows[0].id;
      } else {
        // Registrar nuevo usuario
        const tempPassword = `PS360-${nro_documento}`;
        const salt = await bcrypt.genSalt(10);
        const hashContrasena = await bcrypt.hash(tempPassword, salt);

        const newUserRes = await db.query(
          'INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id',
          [clientEmail, hashContrasena, 'cliente']
        );
        userId = newUserRes.rows[0].id;
      }

      // Insertar Datos Personales del cliente
      const newPersonRes = await db.query(
        `INSERT INTO datos_personales (
          usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular, asesor_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          userId, primer_nombre, segundo_nombre || '', primer_apellido, segundo_apellido || '',
          fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil || 'Soltero',
          codigo_area, numero_celular, quote.asesor_id
        ]
      );
      finalClienteId = newPersonRes.rows[0].id;

      // Registrar acción de auditoría
      await registrarAccion(userId, clientEmail, 'AUTOREGISTRO_CLIENTE', `Cliente se autoregistró desde link de WhatsApp. Nombre: ${clientName}`);
    }

    // 3. Crear Póliza
    let areaVal = 'Salud';
    try {
      const tRes = await db.query(
        'SELECT ramo FROM tarifas WHERE compania_id = $1 AND plan = $2 AND prima = $3 AND suma_asegurada = $4 LIMIT 1',
        [parseInt(compania_id), plan, parseFloat(prima_anual), parseFloat(suma_asegurada)]
      );
      if (tRes.rows.length > 0) {
        areaVal = tRes.rows[0].ramo;
      } else {
        const tResFallback = await db.query(
          'SELECT ramo FROM tarifas WHERE compania_id = $1 AND plan = $2 LIMIT 1',
          [parseInt(compania_id), plan]
        );
        if (tResFallback.rows.length > 0) areaVal = tResFallback.rows[0].ramo;
      }
    } catch (errRamo) {
      console.error('Error al recuperar el ramo de la tarifa aceptada:', errRamo);
    }

    const codPoliza = `POL-${Math.floor(100000 + Math.random() * 900000)}`;
    const newPolRes = await db.query(
      `INSERT INTO polizas (
        codigo_poliza, cliente_id, asesor_id, compania_id, plan, area, suma_asegurada, prima_anual, estado, pago_estado, frecuencia_pago
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        codPoliza,
        finalClienteId,
        quote.asesor_id,
        parseInt(compania_id),
        plan,
        areaVal,
        parseFloat(suma_asegurada),
        parseFloat(prima_anual),
        'negociacion',
        'pendiente',
        freq
      ]
    );

    const newPol = newPolRes.rows[0];

    // 4. Generar Pagos Fraccionados según la frecuencia seleccionada por el cliente
    await generarPagosFraccionados(newPol.id, parseFloat(prima_anual), freq);

    // 5. Actualizar estado de la cotización
    await db.query("UPDATE cotizaciones SET estado = 'aceptada' WHERE token = $1", [token]);

    // 6. Obtener nombre de la compañía
    let compName = 'Aseguradora';
    const compRes = await db.query('SELECT nombre FROM companias_seguros WHERE id = $1', [parseInt(compania_id)]);
    if (compRes.rows.length > 0) {
      compName = compRes.rows[0].nombre;
    }

    // 7. Enviar Correo de condicionado/bienvenida vía EmailJS
    let pdfFilename = 'SM.764_Solic_Pol_Seg_Salud_Global_Benefits.pdf'; // Default
    const lowerName = compName.toLowerCase();
    if (lowerName.includes('mercantil')) pdfFilename = 'SM.764_Solic_Pol_Seg_Salud_Global_Benefits.pdf';
    else if (lowerName.includes('caracas')) pdfFilename = 'SolicitudSegurosSaludIndividualMonedaExtranjera.pdf';
    else if (lowerName.includes('venezuela')) pdfFilename = 'Solicitud de Seguro HCM Individual 08-2025.pdf';
    else if (lowerName.includes('mapfre')) pdfFilename = 'E0306021_Solicitud de Seguro salud individual_2026.pdf';

    const hostname = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${hostname}`;
    const downloadUrl = `${baseUrl}/docs/${pdfFilename}`;

    const emailHtml = `
      <div style="background-color: #f8fafc; border: 1.5px solid #2563eb; border-radius: 8px; padding: 25px; font-family: sans-serif; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
        <h3 style="color: #1e3a8a; margin-top: 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Documentación de Seguro - ${compName}</h3>
        <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 15px 0 15px 0;">
          Estimado cliente, te hacemos llegar el condicionado oficial y los documentos correspondientes para tu solicitud de seguro <strong>${plan || 'Salud'}</strong> con la compañía <strong>${compName}</strong>.
        </p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0; background-color: #f1f5f9; padding: 12px 15px; border-radius: 6px;">
          <strong>Código de Solicitud:</strong> ${codPoliza}<br>
          <strong>Suma Asegurada:</strong> $${Number(suma_asegurada).toLocaleString('en-US')}<br>
          <strong>Prima Anual:</strong> $${Number(prima_anual).toLocaleString('en-US')}
        </p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
          Por favor haz clic en el botón de abajo para descargar el condicionado de <strong>${compName}</strong>:
        </p>
        <div style="text-align: center; margin-bottom: 15px;">
          <a href="${downloadUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 4px 6px rgba(37,99,235,0.15);">
            📥 Descargar Condicionado de ${compName}
          </a>
        </div>
      </div>
    `;

    // Disparar EmailJS sin await para no bloquear la respuesta
    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: 'service_271yuq8',
        template_id: 'template_068mrut',
        user_id: 'jgnK_ClSfIQ6PBYqd',
        accessToken: 's2Qg_q1KjxfL6H28PVCIQ',
        template_params: {
          user_name: clientName,
          to_email: clientEmail,
          fecha: new Date().toLocaleDateString('es-VE'),
          solicitud_ref: `Confirmación de Póliza en Negociación - ${codPoliza}`,
          plan_cards: emailHtml,
          cotizacion_pdf: ''
        }
      })
    }).catch(errMail => {
      console.error('Error al enviar correo de cotización aceptada a EmailJS:', errMail);
    });

    res.json({
      message: '¡Cotización aceptada con éxito! Su solicitud de póliza ha sido creada.',
      poliza: newPol
    });

  } catch (err) {
    console.error('Error al aceptar cotización compartida:', err);
    res.status(500).json({ error: 'Error del servidor al procesar la cotización.' });
  }
});

export default router;
