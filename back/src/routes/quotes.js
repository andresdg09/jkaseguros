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

// 1. Obtener cotización comparativa
router.post('/', async (req, res) => {
  const { fecha_nacimiento, suma_asegurada } = req.body;

  if (!fecha_nacimiento) {
    return res.status(400).json({ error: 'La fecha de nacimiento es requerida para calcular la cotización.' });
  }
  if (!suma_asegurada) {
    return res.status(400).json({ error: 'La suma asegurada es requerida para calcular la cotización.' });
  }

  const sumaAsegurada = parseFloat(suma_asegurada);
  const edadReal = calcularEdad(fecha_nacimiento);

  // Métrica: Ajuste de edad sumándole 6 meses.
  // Restamos 6 meses a la fecha de nacimiento para simular que nació 6 meses antes (es 6 meses mayor).
  const cumpleAjustado = new Date(fecha_nacimiento);
  cumpleAjustado.setMonth(cumpleAjustado.getMonth() - 6);
  const edadTarifa = calcularEdad(cumpleAjustado);

  try {
    // Cargar todas las tarifas que ofrecen la suma asegurada solicitada para la edad calculada
    const tarifasRes = await db.query('SELECT t.*, c.nombre AS compania_nombre FROM tarifas t LEFT JOIN companias_seguros c ON t.compania_id = c.id', []);
    const tarifasAplicables = tarifasRes.rows.filter(t =>
      parseFloat(t.suma_asegurada) === sumaAsegurada &&
      edadTarifa >= parseInt(t.edad_min) &&
      edadTarifa <= parseInt(t.edad_max)
    );

    // Agrupar por compañía y quedarnos con el plan de menor prima para cada una
    const porCompania = new Map();
    tarifasAplicables.forEach(t => {
      const key = t.compania_id;
      const actual = porCompania.get(key);
      if (!actual || parseFloat(t.prima) < parseFloat(actual.prima)) {
        porCompania.set(key, t);
      }
    });

    let comparativa = [...porCompania.values()].map(t => {
      const prima = parseFloat(t.prima);
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
        recomendada: false
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

    // Registrar cotización anónima o del usuario en los logs
    await registrarAccion(null, 'cotizador_publico', 'COTIZACION', `Cotización calculada para edad ${edadReal} (tarifa evaluada para ${edadTarifa}), suma asegurada: $${sumaAsegurada}`);

    res.json({
      edad: edadReal, // Retorna edad REAL al cliente
      suma_asegurada: sumaAsegurada,
      comparativa
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
        cotizacion_pdf: pdfBase64
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
