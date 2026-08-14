import express from 'express';
import { db } from '../db/db.js';
import { generarPdfCotizacion, generarPdfBuffer } from '../services/pdfGenerator.js';
import { registrarAccion } from '../db/logger.js';

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
  const { cliente, edad, suma_asegurada, comparativas, email, asesor } = req.body;

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
    let planCardsHtml = '';
    const cleanPhone = (asesor && asesor.telefono) ? asesor.telefono.replace(/[^0-9]/g, '') : '584121234567';
    const advisorName = (asesor && asesor.nombre) ? asesor.nombre : 'Asesor JKA Seguros';

    comparativas.forEach(comp => {
      const waMsg = `Hola ${advisorName}, estoy interesado en contratar el seguro de salud de *${comp.nombre}* (Plan ${comp.plan || 'N/A'}) con una prima anual de *$${comp.prima}* para la suma asegurada de *$${comp.suma_asegurada || suma_asegurada}*. Por favor contácteme.`;
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`;
      
      const isBest = !!comp.recomendada;
      const cardBg = isBest ? '#eff6ff' : '#ffffff';
      const cardBorder = isBest ? '#2563eb' : '#cbd5e1';
      const badgeHtml = isBest ? `
        <div style="background-color: #10b981; color: #ffffff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-bottom: 10px;">
          RECOMENDACIÓN JKA
        </div>
      ` : '';

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
        plan_cards: planCardsHtml
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

export default router;
