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

// Helper: Puntuación de calidad de cobertura (JKA Expert Matrix)
function getCalidadScore(nombre, tipo) {
  const norm = nombre.toLowerCase();
  if (tipo === 'colectivo') {
    if (norm.includes('caracas')) return 44;
    if (norm.includes('universitas')) return 39;
    if (norm.includes('mercantil')) return 38;
    if (norm.includes('pirámides') || norm.includes('piramides')) return 32;
    if (norm.includes('occidental')) return 24;
    if (norm.includes('hispanas') || norm.includes('hispana')) return 21;
    return 25; // default
  } else {
    // individual
    if (norm.includes('caracas')) return 43;
    if (norm.includes('occidental')) return 40;
    if (norm.includes('pirámides') || norm.includes('piramides')) return 36;
    if (norm.includes('mercantil')) return 35;
    if (norm.includes('universitas')) return 35;
    if (norm.includes('hispanas') || norm.includes('hispana')) return 29;
    return 30; // default
  }
}

// 1. Obtener cotización comparativa
router.post('/', async (req, res) => {
  const { fecha_nacimiento, tipo_cobertura = 'colectivo' } = req.body;

  if (!fecha_nacimiento) {
    return res.status(400).json({ error: 'La fecha de nacimiento es requerida para calcular la cotización.' });
  }

  const edadReal = calcularEdad(fecha_nacimiento);

  // Métrica: Ajuste de edad sumándole 6 meses.
  // Restamos 6 meses a la fecha de nacimiento para simular que nació 6 meses antes (es 6 meses mayor).
  const cumpleAjustado = new Date(fecha_nacimiento);
  cumpleAjustado.setMonth(cumpleAjustado.getMonth() - 6);
  const edadTarifa = calcularEdad(cumpleAjustado);

  try {
    // Cargar Compañías de Seguros
    const compRes = await db.query('SELECT * FROM companias_seguros ORDER BY id ASC');
    const companias = compRes.rows;

    // Cargar Tarifas para la edad dada y cobertura
    const tarifasRes = await db.query('SELECT * FROM tarifas WHERE tipo_cobertura = $1', [tipo_cobertura]);
    const tarifas = tarifasRes.rows;

    // Comparar tarifas mapeando por edad ajustada
    let comparativa = companias.map(comp => {
      // Buscar tarifa que calce con la edad de cálculo (edadTarifa)
      const tarifa = tarifas.find(t => t.compania_id === comp.id && edadTarifa >= t.edad_min && edadTarifa <= t.edad_max);
      const prima = tarifa ? parseFloat(tarifa.prima) : null;
      const calidadScore = getCalidadScore(comp.nombre, tipo_cobertura);

      // Calcular relación calidad/precio (índice de valor)
      // Si no hay prima, el índice es 0.
      const relacion_calidad_precio = prima ? parseFloat(((calidadScore / prima) * 100).toFixed(2)) : 0;

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
        
        prima,
        suma_asegurada_tarifa: tarifa ? parseFloat(tarifa.suma_asegurada) : null,
        calidadScore,
        relacion_calidad_precio,
        recomendada: false
      };
    });

    // Identificar la mejor opción costo/calidad (mayor relación calidad/precio)
    const opcionesValidas = comparativa.filter(item => item.prima !== null);
    if (opcionesValidas.length > 0) {
      const mejorOpcion = opcionesValidas.reduce((prev, current) => {
        return (prev.relacion_calidad_precio > current.relacion_calidad_precio) ? prev : current;
      });
      
      // Marcarla en la comparativa
      comparativa = comparativa.map(item => {
        if (item.id === mejorOpcion.id) {
          return { ...item, recomendada: true };
        }
        return item;
      });
    }

    // Registrar cotización anónima o del usuario en los logs
    await registrarAccion(null, 'cotizador_publico', 'COTIZACION', `Cotización calculada para edad ${edadReal} (tarifa evaluada para ${edadTarifa}), tipo: ${tipo_cobertura}`);

    res.json({
      edad: edadReal, // Retorna edad REAL al cliente
      tipo_cobertura,
      comparativa
    });

  } catch (err) {
    console.error('Error al cotizar:', err);
    res.status(500).json({ error: 'Error al procesar la cotización en el servidor.' });
  }
});

// 2. Descargar PDF de Cotización
router.post('/pdf', async (req, res) => {
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

// 3. Enviar Cotización por correo vía EmailJS
router.post('/email', async (req, res) => {
  const { cliente, edad, tipo_cobertura = 'colectivo', comparativas, email } = req.body;

  if (!cliente || !comparativas) {
    return res.status(400).json({ error: 'Faltan datos del cliente o la cotización para enviar por correo.' });
  }

  const targetEmail = email || cliente.correo;
  if (!targetEmail) {
    return res.status(400).json({ error: 'No se especificó ningún correo destinatario.' });
  }

  try {
    // Generar PDF en memoria
    const pdfBuffer = await generarPdfBuffer(cliente, edad, tipo_cobertura, comparativas);
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
        solicitud_ref: `Cuadro Comparativo de Seguro de Salud (${tipo_cobertura === 'colectivo' ? 'Colectivo' : 'Individual'})`,
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
