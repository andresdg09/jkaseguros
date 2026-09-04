import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
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
// o con valor "NO" / false se entiende como beneficio no incluido en ese plan.
const BENEFIT_FIELDS = [
  'atencion_medica_primaria', 'at_situ_medicamentos', 'medicinas', 'consultas_medicas', 'examenes_lab_imagenologia', 'ambulancia',
  'rehabilitacion', 'protesis', 'muleta_silla_ruedas', 'consultas', 'maternidad', 'maternidad_suma',
  'oftalmologia', 'oftalmologia_suma', 'odontologia', 'odontologia_suma', 'muerte_accidental', 'muerte_accidental_suma', 'invalidez_permanente', 'invalidez_permanente_suma',
  'asist_intl_suma', 'funeral_suma', 'reembolso_carta_aval', 'examenes_especiales', 'asist_intl', 'consultas_suma',
  'asist_medica_primaria_suma', 'odonto_oftal_suma', 'fisio_psico_suma', 'dermato_nutricion_suma'
];

function tieneBeneficio(valor) {
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === null || valor === undefined || valor === 0) return false;
  const v = String(valor).trim().toUpperCase();
  return v !== '' && v !== 'NO' && v !== 'FALSE' && v !== '0';
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
      deducible: parseFloat(t.deducible || 0),
      prima,
      pago_contado: !!(t.pago_contado === true || t.pago_contado === 'true' || t.pago_contado === 1),
      pago_semestral: !!(t.pago_semestral === true || t.pago_semestral === 'true' || t.pago_semestral === 1),
      pago_cuatrimestral: !!(t.pago_cuatrimestral === true || t.pago_cuatrimestral === 'true' || t.pago_cuatrimestral === 1),
      pago_trimestral: !!(t.pago_trimestral === true || t.pago_trimestral === 'true' || t.pago_trimestral === 1),
      pago_bimestral: !!(t.pago_bimestral === true || t.pago_bimestral === 'true' || t.pago_bimestral === 1),
      pago_4_cuotas: !!(t.pago_4_cuotas === true || t.pago_4_cuotas === 'true' || t.pago_4_cuotas === 1),
      pago_mensual: !!(t.pago_mensual === true || t.pago_mensual === 'true' || t.pago_mensual === 1),
      maternidad_suma: t.maternidad_suma || '',
      maternidad_costo: t.maternidad_costo || '',
      asist_intl_suma: t.asist_intl_suma || '',
      asist_intl_costo: t.asist_intl_costo || '',
      funeral_suma: t.funeral_suma || '',
      funeral_costo: t.funeral_costo || '',
      at_situ_medicamentos: t.at_situ_medicamentos || '',
      atencion_medica_primaria: !!(t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL' || t.at_situ_medicamentos === 'INCL'),
      medicinas: !!(t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL'),
      consultas_medicas: t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false'))) : false,
      rehabilitacion: !!(t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL'),
      protesis: !!(t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL'),
      muleta_silla_ruedas: !!(t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL'),
      examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
      consultas: !!(t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL'),
      consultas_suma: t.consultas_suma || '',
      consultas_costo: t.consultas_costo || '',
      maternidad: !!(t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL'),
      oftalmologia: !!(t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL'),
      oftalmologia_suma: t.oftalmologia_suma || '',
      oftalmologia_costo: t.oftalmologia_costo || '',
      odontologia: !!(t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL'),
      odontologia_suma: t.odontologia_suma || '',
      odontologia_costo: t.odontologia_costo || '',
      muerte_accidental: !!(t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL'),
      muerte_accidental_suma: t.muerte_accidental_suma || '',
      muerte_accidental_costo: t.muerte_accidental_costo || '',
      invalidez_permanente: !!(t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL'),
      invalidez_permanente_suma: t.invalidez_permanente_suma || '',
      invalidez_permanente_costo: t.invalidez_permanente_costo || '',
      ambulancia: t.ambulancia || '',
      reembolso_carta_aval: !!(t.reembolso_carta_aval === true || t.reembolso_carta_aval === 'true' || t.reembolso_carta_aval === 'INCL'),
      examenes_especiales: !!(t.examenes_especiales === true || t.examenes_especiales === 'true' || t.examenes_especiales === 'INCL'),
      asist_intl: !!(t.asist_intl === true || t.asist_intl === 'true' || t.asist_intl === 'INCL'),
      asist_medica_primaria_suma: t.asist_medica_primaria_suma || '',
      asist_medica_primaria_costo: t.asist_medica_primaria_costo || '',
      odonto_oftal_suma: t.odonto_oftal_suma || '',
      odonto_oftal_costo: t.odonto_oftal_costo || '',
      fisio_psico_suma: t.fisio_psico_suma || '',
      fisio_psico_costo: t.fisio_psico_costo || '',
      dermato_nutricion_suma: t.dermato_nutricion_suma || '',
      dermato_nutricion_costo: t.dermato_nutricion_costo || '',
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
    const fromTariffs = tarifasRes.rows.map(t => parseFloat(t.suma_asegurada)).filter(Boolean);
    const sums = [...new Set(fromTariffs)].sort((a, b) => a - b);
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
      const dedLabel = comp.deducible > 0 ? `$${Number(comp.deducible).toLocaleString('en-US')}` : '$0 (Sin deducible)';
      const dedWa = comp.deducible > 0 ? `, deducible de *$${Number(comp.deducible).toLocaleString('en-US')}*` : ' (Sin deducible)';
      const waMsg = `Hola ${advisorName}, estoy interesado en contratar el seguro de salud de *${comp.nombre}* (Plan ${comp.plan || 'N/A'})${dedWa} con una prima anual de *$${comp.prima}* para la suma asegurada de *$${comp.suma_asegurada || suma_asegurada}*. Por favor contácteme.`;
      const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
      
      const isBest = !!comp.recomendada;
      const cardBg = isBest ? '#eff6ff' : '#ffffff';
      const cardBorder = isBest ? '#2563eb' : '#cbd5e1';

      // Parsear costos extras
      const parseExtraCost = (costStr) => {
        if (!costStr) return 0;
        const num = parseFloat(String(costStr).replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
      };
      const costoMat = parseExtraCost(comp.maternidad_costo);
      const costoAsist = parseExtraCost(comp.asist_intl_costo);
      const costoFuneral = parseExtraCost(comp.funeral_costo);
      const costoMuerteAcc = parseExtraCost(comp.muerte_accidental_costo);
      const costoInvalidez = parseExtraCost(comp.invalidez_permanente_costo);
      const totalExtras = costoMat + costoAsist + costoFuneral + costoMuerteAcc + costoInvalidez;
      const primaBase = parseFloat(comp.prima || 0);
      const primaConExtras = primaBase + totalExtras;

      // Métodos de pago
      const metodosPago = [];
      if (comp.pago_contado) metodosPago.push('Contado');
      if (comp.pago_semestral) metodosPago.push('Semestral');
      if (comp.pago_cuatrimestral) metodosPago.push('Cuatrimestral');
      if (comp.pago_trimestral) metodosPago.push('Trimestral');
      if (comp.pago_bimestral) metodosPago.push('Bimestral');
      if (comp.pago_4_cuotas) metodosPago.push('4 Cuotas');
      if (comp.pago_mensual) metodosPago.push('Mensual');
      const formaPagoVal = metodosPago.length > 0 ? metodosPago.join(', ') : (comp.pago || 'Consultar');

      // Lista de extras opcionales con costo
      const extrasList = [];
      if (comp.maternidad_suma || costoMat > 0) {
        extrasList.push(`<strong>Maternidad:</strong> ${comp.maternidad_suma || 'Cubierta'} <span style="color: ${costoMat > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">(${costoMat > 0 ? '+ $' + costoMat.toFixed(2) + '/año' : 'Incluida en base'})</span>`);
      }
      if (comp.muerte_accidental_suma || costoMuerteAcc > 0) {
        extrasList.push(`<strong>Muerte Accidental:</strong> ${comp.muerte_accidental_suma || 'Cubierta'} <span style="color: ${costoMuerteAcc > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">(${costoMuerteAcc > 0 ? '+ $' + costoMuerteAcc.toFixed(2) + '/año' : 'Incluida en base'})</span>`);
      }
      if (comp.invalidez_permanente_suma || costoInvalidez > 0) {
        extrasList.push(`<strong>Invalidez Permanente:</strong> ${comp.invalidez_permanente_suma || 'Cubierta'} <span style="color: ${costoInvalidez > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">(${costoInvalidez > 0 ? '+ $' + costoInvalidez.toFixed(2) + '/año' : 'Incluida en base'})</span>`);
      }
      if (comp.asist_intl_suma || costoAsist > 0) {
        extrasList.push(`<strong>Asist. Internacional:</strong> ${comp.asist_intl_suma || 'Cubierta'} <span style="color: ${costoAsist > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">(${costoAsist > 0 ? '+ $' + costoAsist.toFixed(2) + '/año' : 'Incluida en base'})</span>`);
      }
      if (comp.funeral_suma || costoFuneral > 0) {
        extrasList.push(`<strong>Gastos Funerarios:</strong> ${comp.funeral_suma || 'Cubierta'} <span style="color: ${costoFuneral > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">(${costoFuneral > 0 ? '+ $' + costoFuneral.toFixed(2) + '/año' : 'Incluido en base'})</span>`);
      }

      // Lista de servicios base
      const serviciosBase = [
        { name: 'At. Primaria', active: !!(comp.atencion_medica_primaria || comp.at_situ_medicamentos === 'INCL') },
        { name: 'Medicamentos', active: !!comp.medicinas },
        { name: 'Cons. Médicas', active: !!comp.consultas_medicas },
        { name: 'Exámenes', active: !!(comp.examenes_lab_imagenologia && comp.examenes_lab_imagenologia !== 'NO') },
        { name: 'Ambulancia', active: !!(comp.ambulancia && comp.ambulancia !== 'NO') },
        { name: 'Rehabilitación', active: !!comp.rehabilitacion },
        { name: 'Prótesis', active: !!comp.protesis },
        { name: 'Muleta+Silla', active: !!comp.muleta_silla_ruedas },
        { name: 'Consultas', active: !!comp.consultas },
        { name: 'Maternidad', active: !!((comp.maternidad || comp.maternidad_suma) && costoMat === 0) },
        { name: 'Oftalmología', active: !!comp.oftalmologia },
        { name: 'Odontología', active: !!comp.odontologia },
        { name: 'Muerte Acc.', active: !!((comp.muerte_accidental || comp.muerte_accidental_suma) && costoMuerteAcc === 0) },
        { name: 'Invalidez Perm.', active: !!((comp.invalidez_permanente || comp.invalidez_permanente_suma) && costoInvalidez === 0) }
      ];

      planCardsHtml += `
        <div style="background-color: ${cardBg}; border: 1.5px solid ${cardBorder}; border-radius: 8px; margin-bottom: 20px; padding: 20px; font-family: sans-serif; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align: top;">
                <span style="font-size: 18px; font-weight: bold; color: #1e3a8a; display: block;">${comp.nombre}</span>
                <span style="font-size: 13px; font-weight: bold; color: #2563eb; text-transform: uppercase;">PLAN: ${comp.plan || 'N/A'}</span>
              </td>
              <td align="right" style="vertical-align: top;">
                <div style="background-color: ${isBest ? '#dbeafe' : '#f8fafc'}; border: 1px solid ${isBest ? '#93c5fd' : '#e2e8f0'}; padding: 10px 14px; border-radius: 8px; text-align: center; min-width: 135px; display: inline-block;">
                  <span style="font-size: 9px; color: #1e3a8a; font-weight: bold; display: block; text-transform: uppercase; letter-spacing: 0.5px;">PRIMA BASE (SIN EXTRAS)</span>
                  <span style="font-size: 18px; color: #1e3a8a; font-weight: bold; display: block;">$${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style="font-size: 8px; color: #64748b; display: block; margin-bottom: 6px;">por año</span>
                  <div style="border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 4px;">
                    ${totalExtras > 0 ? `
                      <span style="font-size: 8.5px; color: #b45309; font-weight: bold; display: block; text-transform: uppercase;">TOTAL CON EXTRAS</span>
                      <span style="font-size: 14px; color: #15803d; font-weight: bold; display: block;">$${primaConExtras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style="font-size: 7.5px; color: #b45309; display: block;">(+ $${totalExtras.toFixed(2)} en extras)</span>
                    ` : `
                      <span style="font-size: 8.5px; color: #15803d; font-weight: bold; display: block; text-transform: uppercase;">PLAN COMPLETO</span>
                      <span style="font-size: 13px; color: #15803d; font-weight: bold; display: block;">$${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style="font-size: 7.5px; color: #64748b; display: block;">(sin costos extras)</span>
                    `}
                  </div>
                </div>
              </td>
            </tr>
          </table>
          
          {/* SECCIÓN 1: INCLUIDO EN PLAN BASE */}
          <div style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
            <span style="font-size: 11px; font-weight: bold; color: #1e3a8a; display: block; margin-bottom: 6px;">✓ INCLUIDO EN EL PLAN BASE:</span>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 12px; color: #334155; line-height: 1.5;">
              <tr>
                <td width="33%" style="padding: 3px 0;"><strong>Suma Asegurada:</strong> $${Number(comp.suma_asegurada || suma_asegurada).toLocaleString('en-US')}</td>
                <td width="33%" style="padding: 3px 0;"><strong>Deducible:</strong> <span style="color: ${comp.deducible > 0 ? '#b45309' : '#15803d'}; font-weight: bold;">${dedLabel}</span></td>
                <td width="34%" style="padding: 3px 0;"><strong>Formas de Pago:</strong> ${formaPagoVal}</td>
              </tr>
            </table>

            <div style="margin-top: 8px; font-size: 11px; color: #475569; display: flex; flex-wrap: wrap; gap: 6px;">
              ${serviciosBase.map(s => `
                <span style="display: inline-block; margin-right: 8px; margin-bottom: 4px; font-size: 10.5px; color: ${s.active ? '#15803d' : '#94a3b8'}; font-weight: ${s.active ? 'bold' : 'normal'};">
                  ${s.active ? '●' : '○'} ${s.name}
                </span>
              `).join('')}
            </div>
          </div>

          {/* SECCIÓN 2: BENEFICIOS Y COBERTURAS EXTRAS OPCIONALES */}
          <div style="margin-top: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; font-size: 11px;">
            <strong style="color: ${totalExtras > 0 ? '#b45309' : '#1e3a8a'}; display: block; margin-bottom: 4px;">
              ${totalExtras > 0 ? '➕ Coberturas Extras Opcionales (con costo adicional):' : '➕ Coberturas Adicionales:'}
            </strong>
            ${extrasList.length > 0 ? `
              <div style="line-height: 1.6; color: #334155;">
                ${extrasList.map(e => `<div>• ${e}</div>`).join('')}
              </div>
            ` : `
              <span style="color: #64748b;">✓ Plan integral sin costo de extras adicionales.</span>
            `}
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
  const { compania_id, plan, prima_anual, suma_asegurada, frecuencia_pago, deducible } = req.body;

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
        codigo_poliza, cliente_id, asesor_id, compania_id, plan, area, suma_asegurada, deducible, prima_anual, estado, pago_estado, frecuencia_pago
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        codPoliza,
        finalClienteId,
        quote.asesor_id,
        parseInt(compania_id),
        plan,
        areaVal,
        parseFloat(suma_asegurada),
        parseFloat(deducible || 0),
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

// 8. Obtener todas las propuestas / cotizaciones enviadas (Admin: todas con asesor; Asesor: solo las suyas)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user?.rango;
    const userId = req.user?.id;

    let quotesQuery = '';
    let queryParams = [];

    if (userRole === 'admin') {
      quotesQuery = `
        SELECT c.*, 
               a.codigo_asesor,
               COALESCE(dp.primer_nombre || ' ' || dp.primer_apellido, a.codigo_asesor, 'Asesor') AS asesor_nombre,
               a.telefono AS asesor_telefono
        FROM cotizaciones c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        LEFT JOIN datos_personales dp ON a.datos_personales_id = dp.id
        ORDER BY c.id DESC
      `;
    } else if (userRole === 'asesor') {
      const aseRes = await db.query('SELECT id, codigo_asesor FROM asesores WHERE usuario_id = $1', [userId]);
      if (aseRes.rows.length === 0) {
        return res.json({ quotes: [], summary: { totalQuotes: 0, totalPrimas: 0, totalAccepted: 0, totalPending: 0, totalRemindersPending: 0 } });
      }
      const asesorId = aseRes.rows[0].id;
      const codigoAsesor = aseRes.rows[0].codigo_asesor;

      quotesQuery = `
        SELECT c.*, 
               $2 AS codigo_asesor,
               'Mi Asesoría' AS asesor_nombre
        FROM cotizaciones c
        WHERE c.asesor_id = $1
        ORDER BY c.id DESC
      `;
      queryParams = [asesorId, codigoAsesor];
    } else {
      return res.status(403).json({ error: 'Acceso no autorizado a propuestas.' });
    }

    const result = await db.query(quotesQuery, queryParams);

    let totalPrimasSum = 0;
    let totalAccepted = 0;
    let totalPending = 0;
    let totalRemindersPending = 0;

    const formattedQuotes = result.rows.map(q => {
      const clienteDatos = typeof q.cliente_datos === 'string' ? JSON.parse(q.cliente_datos) : (q.cliente_datos || {});
      const comparativa = typeof q.comparativa === 'string' ? JSON.parse(q.comparativa) : (q.comparativa || []);
      const dependientes = typeof q.dependientes === 'string' ? JSON.parse(q.dependientes) : (q.dependientes || []);

      // Extraer primas disponibles en la comparativa
      const primas = comparativa.map(c => parseFloat(c.prima_total || c.prima || 0)).filter(p => p > 0);
      const minPrima = primas.length ? Math.min(...primas) : 0;
      const maxPrima = primas.length ? Math.max(...primas) : 0;
      const primaRepresentativa = primas.length ? primas[0] : 0;

      totalPrimasSum += primaRepresentativa;
      if (q.estado === 'aceptada') totalAccepted++;
      else totalPending++;

      // Verificar si hay recordatorios pendientes
      const hasPendingReminder = (!q.recordatorio_24h || !q.recordatorio_48h || !q.recordatorio_5d) && q.estado !== 'aceptada';
      if (hasPendingReminder) totalRemindersPending++;

      return {
        id: q.id,
        token: q.token,
        asesor_id: q.asesor_id,
        asesor_nombre: q.asesor_nombre || 'Sin asesor',
        asesor_codigo: q.asesor_codigo || '—',
        cliente_nombre: `${clienteDatos.primer_nombre || ''} ${clienteDatos.primer_apellido || ''}`.trim() || 'Prospecto',
        cliente_documento: `${clienteDatos.tipo_documento || 'V'}-${clienteDatos.nro_documento || ''}`,
        cliente_correo: clienteDatos.correo || '',
        cliente_telefono: clienteDatos.codigo_area && clienteDatos.numero_celular ? `${clienteDatos.codigo_area}${clienteDatos.numero_celular}` : (clienteDatos.telefono || ''),
        suma_asegurada: parseFloat(q.suma_asegurada || 0),
        suma_asegurada_2: q.suma_asegurada_2 ? parseFloat(q.suma_asegurada_2) : null,
        total_dependientes: dependientes.length,
        opciones_cotizadas: comparativa.length,
        prima_representativa: primaRepresentativa,
        min_prima: minPrima,
        max_prima: maxPrima,
        estado: q.estado || 'pendiente',
        recordatorio_24h: !!q.recordatorio_24h,
        recordatorio_48h: !!q.recordatorio_48h,
        recordatorio_5d: !!q.recordatorio_5d,
        notas_seguimiento: q.notas_seguimiento || '',
        ultimo_contacto: q.ultimo_contacto,
        created_at: q.created_at
      };
    });

    res.json({
      quotes: formattedQuotes,
      summary: {
        totalQuotes: formattedQuotes.length,
        totalPrimas: parseFloat(totalPrimasSum.toFixed(2)),
        totalAccepted,
        totalPending,
        totalRemindersPending
      }
    });
  } catch (err) {
    console.error('Error al obtener lista de propuestas y cotizaciones:', err);
    res.status(500).json({ error: 'Error del servidor al recuperar las propuestas.' });
  }
});

// 9. Actualizar recordatorios y notas de seguimiento de una cotización
router.patch('/:id/reminders', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { recordatorio_24h, recordatorio_48h, recordatorio_5d, notas_seguimiento, ultimo_contacto } = req.body;

  try {
    const quoteId = parseInt(id);
    const updateQuery = `
      UPDATE cotizaciones 
      SET recordatorio_24h = $1,
          recordatorio_48h = $2,
          recordatorio_5d = $3,
          notas_seguimiento = $4,
          ultimo_contacto = $5
      WHERE id = $6
      RETURNING *
    `;
    const params = [
      !!recordatorio_24h,
      !!recordatorio_48h,
      !!recordatorio_5d,
      notas_seguimiento || '',
      ultimo_contacto || new Date().toISOString(),
      quoteId
    ];

    const result = await db.query(updateQuery, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    res.json({
      message: 'Recordatorios actualizados exitosamente.',
      quote: result.rows[0]
    });
  } catch (err) {
    console.error('Error al actualizar recordatorios de cotización:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar los recordatorios.' });
  }
});

export { calcularComparativa };
export default router;
