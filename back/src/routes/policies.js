import express from 'express';
import fs from 'fs';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

export async function generarPagosFraccionados(polizaId, primaAnual, frecuenciaPago, fechaInicioStr = null, preservePaid = false) {
  const pid = parseInt(polizaId);
  if (preservePaid) {
    // Solo eliminar cuotas pendientes/rechazadas no pagadas para preservar el histórico de pagos del cliente
    await db.query("DELETE FROM pagos WHERE poliza_id = $1 AND estado_pago NOT IN ('pagado', 'en_revision')", [pid]);
  } else {
    await db.query('DELETE FROM pagos WHERE poliza_id = $1', [pid]);
  }

  const freq = (frecuenciaPago || 'contado').toLowerCase();
  const numCuotas = freq === 'contado' ? 1 : 
                    freq === 'semestral' ? 2 : 
                    freq === 'cuatrimestral' ? 3 : 
                    (freq === 'trimestral' || freq === '4_cuotas' || freq === 'cuatro_cuotas') ? 4 : 
                    freq === 'bimestral' ? 6 : 12;

  const mesesIntervalo = freq === 'contado' ? 0 : 
                         freq === 'semestral' ? 6 : 
                         freq === 'cuatrimestral' ? 4 : 
                         (freq === 'trimestral' || freq === '4_cuotas' || freq === 'cuatro_cuotas') ? 3 : 
                         freq === 'bimestral' ? 2 : 1;

  const montoBase = parseFloat((primaAnual / numCuotas).toFixed(2));
  
  let baseDate = new Date();
  if (fechaInicioStr) {
    const parsed = new Date(fechaInicioStr + 'T12:00:00');
    if (!isNaN(parsed.getTime())) baseDate = parsed;
  }
  
  for (let i = 1; i <= numCuotas; i++) {
    const monto = (i === numCuotas)
      ? parseFloat((primaAnual - (montoBase * (numCuotas - 1))).toFixed(2))
      : montoBase;
      
    const dueDate = new Date(baseDate.getTime());
    if (i > 1 && mesesIntervalo > 0) {
      dueDate.setMonth(dueDate.getMonth() + ((i - 1) * mesesIntervalo));
    }
    const fechaVencimiento = dueDate.toISOString().split('T')[0];

    await db.query(
      `INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento, cuota_numero, cuota_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pid, monto, 'pendiente', null, fechaVencimiento, i, numCuotas]
    );
  }
}

// Obtener pólizas según el rango
router.get('/', authenticateToken, async (req, res) => {
  try {
    let queryStr = `
      SELECT 
        p.*, 
        (c.primer_nombre || ' ' || c.primer_apellido) AS cliente_nombre,
        comp.nombre AS compania_nombre,
        a.nombre AS asesor_nombre
      FROM polizas p
      LEFT JOIN datos_personales c ON p.cliente_id = c.id
      LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
      LEFT JOIN asesores a ON p.asesor_id = a.id
      ORDER BY p.id DESC
    `;
    let params = [];

    if (req.user.rango === 'cliente') {
      // Obtener el datos_personales.id del cliente asociado a este usuario_id
      const dp = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
      if (dp.rows.length === 0) return res.json([]);
      
      queryStr = `
        SELECT 
          p.*, 
          (c.primer_nombre || ' ' || c.primer_apellido) AS cliente_nombre,
          comp.nombre AS compania_nombre,
          a.nombre AS asesor_nombre
        FROM polizas p
        LEFT JOIN datos_personales c ON p.cliente_id = c.id
        LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
        LEFT JOIN asesores a ON p.asesor_id = a.id
        WHERE p.cliente_id = $1
        ORDER BY p.id DESC
      `;
      params = [dp.rows[0].id];
    } else if (req.user.rango === 'asesor') {
      // Obtener el asesores.id del asesor asociado a este usuario_id
      const ase = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (ase.rows.length === 0) return res.json([]);

      queryStr = `
        SELECT 
          p.*, 
          (c.primer_nombre || ' ' || c.primer_apellido) AS cliente_nombre,
          comp.nombre AS compania_nombre,
          a.nombre AS asesor_nombre
        FROM polizas p
        LEFT JOIN datos_personales c ON p.cliente_id = c.id
        LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
        LEFT JOIN asesores a ON p.asesor_id = a.id
        WHERE p.asesor_id = $1
        ORDER BY p.id DESC
      `;
      params = [ase.rows[0].id];
    }

    const polRes = await db.query(queryStr, params);
    res.json(polRes.rows);

  } catch (err) {
    console.error('Error al obtener pólizas:', err);
    res.status(500).json({ error: 'Error del servidor al cargar las pólizas.' });
  }
});

// Crear una póliza (Solicitud tras cotizar o creación directa por Admin/Asesor)
router.post('/', authenticateToken, async (req, res) => {
  const { 
    compania_id, plan, suma_asegurada, prima_anual, asesor_id, cliente_id,
    frecuencia_pago, tipo_negocio, tipo_cobertura, bono_pronto_pago, emision_online
  } = req.body;

  if (!compania_id || !suma_asegurada || !prima_anual) {
    return res.status(400).json({ error: 'Faltan detalles de la póliza para proceder.' });
  }

  try {
    let finalClienteId = null;
    if ((req.user.rango === 'admin' || req.user.rango === 'asesor') && cliente_id) {
      finalClienteId = parseInt(cliente_id);
    } else {
      // Buscar datos_personales del cliente logueado
      const clientRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
      if (clientRes.rows.length === 0) {
        return res.status(400).json({ error: 'Debe rellenar sus datos personales en su Perfil antes de solicitar pólizas.' });
      }
      finalClienteId = clientRes.rows[0].id;
    }

    // Asignar el asesor seleccionado o el asesor logueado o el primer asesor en la base de datos
    let finalAsesorId = asesor_id ? parseInt(asesor_id) : null;
    if (!finalAsesorId && req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length > 0) {
        finalAsesorId = aseRes.rows[0].id;
      }
    }
    if (!finalAsesorId) {
      const advisorsRes = await db.query('SELECT id FROM asesores ORDER BY id ASC LIMIT 1');
      finalAsesorId = advisorsRes.rows.length > 0 ? advisorsRes.rows[0].id : null;
    }

    // Código único de póliza (o el provisto por el usuario/compañía)
    const codPoliza = req.body.codigo_poliza && String(req.body.codigo_poliza).trim() !== ''
      ? String(req.body.codigo_poliza).trim()
      : `POL-${Math.floor(100000 + Math.random() * 900000)}`;

    // Si es administrador el que crea la póliza, se crea como "vigente" directamente por defecto.
    // Si es cliente, se crea en estado de "negociacion"
    const initialStatus = req.body.estado || (req.user.rango === 'admin' ? 'vigente' : 'negociacion');

    const freq = frecuencia_pago || 'contado';
    const bizType = tipo_negocio || 'nuevo';
    const covType = tipo_cobertura || 'individual';
    const pronto = bono_pronto_pago === true || bono_pronto_pago === 'true';
    const online = emision_online === true || emision_online === 'true';

    let areaVal = req.body.area;
    if (!areaVal && plan && compania_id) {
      try {
        const tRes = await db.query(
          'SELECT ramo FROM tarifas WHERE compania_id = $1 AND plan = $2 LIMIT 1',
          [parseInt(compania_id), plan]
        );
        if (tRes.rows.length > 0) areaVal = tRes.rows[0].ramo;
      } catch (err) {
        console.error('Error al buscar ramo de la tarifa:', err);
      }
    }
    if (!areaVal) areaVal = 'Salud';

    const deducibleVal = req.body.deducible !== undefined && req.body.deducible !== null && !isNaN(parseFloat(req.body.deducible))
      ? parseFloat(req.body.deducible)
      : 0;

    const q = `
      INSERT INTO polizas (
        codigo_poliza, cliente_id, asesor_id, compania_id, plan,
        area, suma_asegurada, deducible, prima_anual, estado, pago_estado,
        frecuencia_pago, tipo_negocio, tipo_cobertura, bono_pronto_pago, emision_online
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendiente', $11, $12, $13, $14, $15)
      RETURNING *
    `;
    const newPolRes = await db.query(q, [
      codPoliza, finalClienteId, finalAsesorId, parseInt(compania_id), plan || null,
      areaVal,
      parseFloat(suma_asegurada), deducibleVal, parseFloat(prima_anual), initialStatus,
      freq, bizType, covType, pronto, online
    ]);

    const newPol = newPolRes.rows[0];

    // Crear cuotas de pago fraccionados
    await generarPagosFraccionados(newPol.id, parseFloat(prima_anual), freq);

    // Registrar en logs de actividad
    await registrarAccion(req.user.id, req.user.correo, 'CREACION_POLIZA', `Póliza ${codPoliza} creada en estado ${initialStatus} por ${req.user.correo}.`);

    // Obtener datos del cliente de forma compatible
    let clientEmail = null;
    let clientName = 'Cliente';
    try {
      const dpRes = await db.query('SELECT * FROM datos_personales WHERE id = $1', [finalClienteId]);
      if (dpRes.rows.length > 0) {
        const dp = dpRes.rows[0];
        clientName = `${dp.primer_nombre} ${dp.primer_apellido}`;
        const uRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [dp.usuario_id]);
        if (uRes.rows.length > 0) {
          clientEmail = uRes.rows[0].correo;
        }
      }
    } catch (errCli) {
      console.error('Error al consultar datos de cliente para envío de correo:', errCli);
    }

    // Obtener nombre de la compañía
    let compName = 'Aseguradora';
    try {
      const compRes = await db.query('SELECT * FROM companias_seguros WHERE id = $1', [parseInt(compania_id)]);
      if (compRes.rows.length > 0) {
        compName = compRes.rows[0].nombre;
      }
    } catch (errComp) {
      console.error('Error al consultar compañía para envío de correo:', errComp);
    }

    // Map company to PDF
    let pdfFilename = 'SM.764_Solic_Pol_Seg_Salud_Global_Benefits.pdf'; // Default to mercantil if not matched
    const lowerName = compName.toLowerCase();
    if (lowerName.includes('mercantil')) pdfFilename = 'SM.764_Solic_Pol_Seg_Salud_Global_Benefits.pdf';
    else if (lowerName.includes('caracas')) pdfFilename = 'SolicitudSegurosSaludIndividualMonedaExtranjera.pdf';
    else if (lowerName.includes('venezuela')) pdfFilename = 'Solicitud de Seguro HCM Individual 08-2025.pdf';
    else if (lowerName.includes('mapfre')) pdfFilename = 'E0306021_Solicitud de Seguro salud individual_2026.pdf';

    const hostname = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${hostname}`;
    const downloadUrl = `${baseUrl}/docs/${pdfFilename}`;

    // Enviar correo automático con la documentación
    if (clientEmail) {
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

      // Enviar correo vía EmailJS
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
      }).then(res => {
        if (!res.ok) console.error('Error al enviar correo de bienvenida de póliza a EmailJS');
      }).catch(err => {
        console.error('Error en fetch de EmailJS al enviar condicionado de póliza:', err);
      });
    }

    res.status(201).json({
      message: `Póliza creada exitosamente en estado: ${initialStatus}.`,
      poliza: newPol
    });

  } catch (err) {
    console.error('Error al crear póliza:', err);
    res.status(500).json({ error: 'Error del servidor al registrar la póliza.' });
  }
});

// Modificar el estado de la póliza (Asesor / Admin)
router.put('/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { estado, motivo_rechazo } = req.body; // 'negociacion', 'vigente', 'vencido', 'rechazado', 'anulada'

  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No está autorizado para cambiar el estado de las pólizas.' });
  }

  if (!['negociacion', 'vigente', 'vencido', 'rechazado', 'anulada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado de póliza inválido.' });
  }

  try {
    let oldStatus = '';
    let primaAnual = 0;
    let updatedPol;

    if (db.isFallback()) {
      const fData = db.getFallbackData();

      const idx = fData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Póliza no encontrada.' });

      // Si es asesor, verificar que le pertenezca la póliza
      if (req.user.rango === 'asesor') {
        const aseRes = fData.asesores.find(a => a.usuario_id === req.user.id);
        if (!aseRes || fData.polizas[idx].asesor_id !== aseRes.id) {
          return res.status(403).json({ error: 'No autorizado para modificar esta póliza.' });
        }
      }

      oldStatus = fData.polizas[idx].estado;
      primaAnual = parseFloat(fData.polizas[idx].prima_anual || 0);

      fData.polizas[idx].estado = estado;
      fData.polizas[idx].motivo_rechazo = estado === 'rechazado' ? (motivo_rechazo || '') : null;

      // Si cambia a vigente y no tenía pagos, o si queremos registrar cobro
      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = fData.pagos.find(pa => pa.poliza_id === parseInt(id));
        if (!checkPay) {
          const payId = fData.pagos.length > 0 ? Math.max(...fData.pagos.map(pa => pa.id)) + 1 : 1;
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          fData.pagos.push({
            id: payId,
            poliza_id: parseInt(id),
            monto: primaAnual,
            fecha_pago: new Date().toISOString().split('T')[0],
            estado_pago: 'pendiente',
            referencia: null,
            fecha_vencimiento: nextMonth.toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
        }
      }

      updatedPol = fData.polizas[idx];
      db.saveFallback();
    } else {
      // Postgres
      const oldRes = await db.query('SELECT estado, prima_anual, asesor_id, frecuencia_pago FROM polizas WHERE id = $1', [parseInt(id)]);
      if (oldRes.rows.length === 0) return res.status(404).json({ error: 'Póliza no encontrada.' });
      
      // Si es asesor, verificar que le pertenezca la póliza
      if (req.user.rango === 'asesor') {
        const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
        if (aseRes.rows.length === 0 || oldRes.rows[0].asesor_id !== aseRes.rows[0].id) {
          return res.status(403).json({ error: 'No autorizado para modificar esta póliza.' });
        }
      }

      oldStatus = oldRes.rows[0].estado;
      primaAnual = parseFloat(oldRes.rows[0].prima_anual || 0);

      const q = 'UPDATE polizas SET estado = $1, motivo_rechazo = $2 WHERE id = $3 RETURNING *';
      const motivoVal = estado === 'rechazado' ? (motivo_rechazo || '') : null;
      const updateRes = await db.query(q, [estado, motivoVal, parseInt(id)]);
      updatedPol = updateRes.rows[0];

      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = await db.query('SELECT id FROM pagos WHERE poliza_id = $1', [parseInt(id)]);
        if (checkPay.rows.length === 0) {
          await generarPagosFraccionados(parseInt(id), primaAnual, oldRes.rows[0].frecuencia_pago || 'contado');
        }
      }
    }

    // Registrar en logs
    await registrarAccion(req.user.id, req.user.correo, 'CAMBIO_ESTADO_POLIZA', `Póliza ${updatedPol.codigo_poliza} cambió de estado a: ${estado} (Motivo: ${motivo_rechazo || 'N/A'})`);

    res.json({ message: 'Estado de póliza actualizado exitosamente.', poliza: updatedPol });

  } catch (err) {
    console.error('Error al actualizar estado de póliza:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el estado.' });
  }
});

// Reasignar asesor de póliza (Admin)
router.put('/:id/advisor', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { asesor_id } = req.body;

  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado para reasignar asesores.' });
  }

  try {
    const aid = asesor_id ? parseInt(asesor_id) : null;
    const q = 'UPDATE polizas SET asesor_id = $1 WHERE id = $2 RETURNING *';
    const updateRes = await db.query(q, [aid, parseInt(id)]);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Póliza no encontrada.' });
    }

    const updatedPol = updateRes.rows[0];

    // Registrar en logs
    await registrarAccion(req.user.id, req.user.correo, 'REASIGNACION_ASESOR', `Póliza ${updatedPol.codigo_poliza} reasignada a asesor_id ${aid}`);

    res.json({ message: 'Asesor reasignado exitosamente.', poliza: updatedPol });
  } catch (err) {
    console.error('Error al reasignar asesor de póliza:', err);
    res.status(500).json({ error: 'Error del servidor al reasignar asesor.' });
  }
});

// Guardar múltiples pólizas en lote (bulk)
router.post('/bulk', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  const { policies } = req.body;

  if (!Array.isArray(policies)) {
    return res.status(400).json({ error: 'El cuerpo debe ser una lista de pólizas.' });
  }

  try {
    let advisorId = null;
    if (req.user.rango === 'asesor') {
      if (db.isFallback()) {
        const fData = db.getFallbackData();
        const aseRes = fData.asesores.find(a => a.usuario_id === req.user.id);
        if (!aseRes) return res.status(403).json({ error: 'Asesor no encontrado.' });
        advisorId = aseRes.id;
      } else {
        const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
        if (aseRes.rows.length === 0) return res.status(403).json({ error: 'Asesor no encontrado.' });
        advisorId = aseRes.rows[0].id;
      }
    }

    if (db.isFallback()) {
      const fData = db.getFallbackData();

      for (const policy of policies) {
        const { id, plan, suma_asegurada, prima_anual, estado, motivo_rechazo, frecuencia_pago, tipo_negocio, tipo_cobertura } = policy;
        const idx = fData.polizas.findIndex(p => p.id === parseInt(id));
        if (idx === -1) continue;

        // Si es asesor, verificar que le pertenezca la póliza
        if (req.user.rango === 'asesor' && fData.polizas[idx].asesor_id !== advisorId) {
          continue;
        }

        const oldStatus = fData.polizas[idx].estado;
        const oldFreq = fData.polizas[idx].frecuencia_pago;
        const newFreq = frecuencia_pago || fData.polizas[idx].frecuencia_pago || 'contado';
        
        // El asesor no puede cambiar el asesor asignado ni la compañía
        fData.polizas[idx] = {
          ...fData.polizas[idx],
          plan,
          suma_asegurada: parseFloat(suma_asegurada),
          deducible: policy.deducible !== undefined ? parseFloat(policy.deducible) : (fData.polizas[idx].deducible || 0),
          prima_anual: parseFloat(prima_anual),
          estado,
          motivo_rechazo: estado === 'rechazado' ? (motivo_rechazo || '') : null,
          frecuencia_pago: newFreq,
          tipo_negocio: tipo_negocio || fData.polizas[idx].tipo_negocio || 'nuevo',
          tipo_cobertura: tipo_cobertura || fData.polizas[idx].tipo_cobertura || 'individual'
        };

        // Si es administrador, también puede cambiar asesor y compañía
        if (req.user.rango === 'admin') {
          fData.polizas[idx].asesor_id = policy.asesor_id ? parseInt(policy.asesor_id) : null;
          fData.polizas[idx].compania_id = parseInt(policy.compania_id);
        }

        const existingPays = (fData.pagos || []).filter(pa => pa.poliza_id === parseInt(id));
        if (existingPays.length === 0 || oldFreq !== newFreq) {
          await generarPagosFraccionados(parseInt(id), parseFloat(prima_anual), newFreq);
        }
      }

      db.saveFallback();
    } else {
      for (const policy of policies) {
        const { id, plan, suma_asegurada, deducible, prima_anual, estado, motivo_rechazo, frecuencia_pago, tipo_negocio, tipo_cobertura } = policy;
        const oldRes = await db.query('SELECT estado, asesor_id, frecuencia_pago FROM polizas WHERE id = $1', [parseInt(id)]);
        if (oldRes.rows.length === 0) continue;

        // Si es asesor, verificar que le pertenezca la póliza
        if (req.user.rango === 'asesor' && oldRes.rows[0].asesor_id !== advisorId) {
          continue;
        }

        const oldStatus = oldRes.rows[0].estado;
        const oldFreq = oldRes.rows[0].frecuencia_pago;
        const newFreq = frecuencia_pago || oldFreq || 'contado';
        const motivoVal = estado === 'rechazado' ? (motivo_rechazo || '') : null;
        const bizType = tipo_negocio || 'nuevo';
        const covType = tipo_cobertura || 'individual';

        if (req.user.rango === 'admin') {
          const q = `
            UPDATE polizas
            SET asesor_id = $1, compania_id = $2, plan = $3, suma_asegurada = $4, deducible = $5, prima_anual = $6, estado = $7, motivo_rechazo = $8,
                frecuencia_pago = $9, tipo_negocio = $10, tipo_cobertura = $11
            WHERE id = $12
          `;
          await db.query(q, [
            policy.asesor_id ? parseInt(policy.asesor_id) : null, parseInt(policy.compania_id), plan, parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima_anual),
            estado, motivoVal, newFreq, bizType, covType, parseInt(id)
          ]);
        } else {
          // Asesor: no puede reasignar compañía ni asesor
          const q = `
            UPDATE polizas
            SET plan = $1, suma_asegurada = $2, deducible = $3, prima_anual = $4, estado = $5, motivo_rechazo = $6,
                frecuencia_pago = $7, tipo_negocio = $8, tipo_cobertura = $9
            WHERE id = $10
          `;
          await db.query(q, [
            plan, parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima_anual), estado, motivoVal,
            newFreq, bizType, covType, parseInt(id)
          ]);
        }

        const checkPay = await db.query('SELECT id FROM pagos WHERE poliza_id = $1', [parseInt(id)]);
        if (checkPay.rows.length === 0 || oldFreq !== newFreq) {
          await generarPagosFraccionados(parseInt(id), parseFloat(prima_anual), newFreq);
        }
      }
    }

    await registrarAccion(req.user.id, req.user.correo, 'MODIFICACION_POLIZAS_LOTE', `Modificadas en lote ${policies.length} pólizas.`);
    res.json({ message: 'Pólizas actualizadas en lote correctamente.', count: policies.length });
  } catch (err) {
    console.error('Error al actualizar pólizas en lote:', err);
    res.status(500).json({ error: 'Error al actualizar pólizas en lote.' });
  }
});

// Actualizar póliza completa (Admin)
router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  const { id } = req.params;
  const { 
    asesor_id, compania_id, plan, suma_asegurada, deducible, prima_anual, estado, motivo_rechazo,
    frecuencia_pago, tipo_negocio, tipo_cobertura, bono_pronto_pago, emision_online 
  } = req.body;

  try {
    if (db.isFallback()) {
      const fData = db.getFallbackData();

      const idx = fData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Póliza no encontrada.' });

      const oldStatus = fData.polizas[idx].estado;

      fData.polizas[idx] = {
        ...fData.polizas[idx],
        asesor_id: asesor_id ? parseInt(asesor_id) : null,
        compania_id: parseInt(compania_id),
        plan,
        suma_asegurada: parseFloat(suma_asegurada),
        deducible: deducible !== undefined ? parseFloat(deducible) : (fData.polizas[idx].deducible || 0),
        prima_anual: parseFloat(prima_anual),
        estado,
        motivo_rechazo: estado === 'rechazado' ? (motivo_rechazo || '') : null,
        frecuencia_pago: frecuencia_pago || fData.polizas[idx].frecuencia_pago || 'contado',
        tipo_negocio: tipo_negocio || fData.polizas[idx].tipo_negocio || 'nuevo',
        tipo_cobertura: tipo_cobertura || fData.polizas[idx].tipo_cobertura || 'individual',
        bono_pronto_pago: bono_pronto_pago !== undefined ? (bono_pronto_pago === true || bono_pronto_pago === 'true') : fData.polizas[idx].bono_pronto_pago,
        emision_online: emision_online !== undefined ? (emision_online === true || emision_online === 'true') : fData.polizas[idx].emision_online
      };

      // Si cambia a vigente y no tenía pagos, o si queremos regenerar cobro
      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = fData.pagos.find(pa => pa.poliza_id === parseInt(id));
        if (!checkPay) {
          await generarPagosFraccionados(parseInt(id), parseFloat(prima_anual), fData.polizas[idx].frecuencia_pago);
        }
      }

      db.saveFallback();
    } else {
      // PostgreSQL
      const oldRes = await db.query('SELECT estado, frecuencia_pago FROM polizas WHERE id = $1', [parseInt(id)]);
      if (oldRes.rows.length === 0) return res.status(404).json({ error: 'Póliza no encontrada.' });
      const oldStatus = oldRes.rows[0].estado;

      const q = `
        UPDATE polizas
        SET asesor_id = $1, compania_id = $2, plan = $3, suma_asegurada = $4, deducible = $5, prima_anual = $6, estado = $7, motivo_rechazo = $8,
            frecuencia_pago = $9, tipo_negocio = $10, tipo_cobertura = $11, bono_pronto_pago = $12, emision_online = $13
        WHERE id = $14
      `;
      const motivoVal = estado === 'rechazado' ? (motivo_rechazo || '') : null;
      const freqVal = frecuencia_pago || oldRes.rows[0].frecuencia_pago || 'contado';
      const bizType = tipo_negocio || 'nuevo';
      const covType = tipo_cobertura || 'individual';
      const pronto = bono_pronto_pago === true || bono_pronto_pago === 'true';
      const online = emision_online === true || emision_online === 'true';

      await db.query(q, [
        asesor_id ? parseInt(asesor_id) : null, parseInt(compania_id), plan, parseFloat(suma_asegurada), parseFloat(deducible || 0), parseFloat(prima_anual), 
        estado, motivoVal, freqVal, bizType, covType, pronto, online, parseInt(id)
      ]);

      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = await db.query('SELECT id FROM pagos WHERE poliza_id = $1', [parseInt(id)]);
        if (checkPay.rows.length === 0) {
          await generarPagosFraccionados(parseInt(id), parseFloat(prima_anual), freqVal);
        }
      }
    }

    await registrarAccion(req.user.id, req.user.correo, 'MODIFICACION_POLIZA', `Póliza ID ${id} modificada por administrador.`);
    res.json({ message: 'Póliza modificada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al modificar póliza.' });
  }
});

// Renovar póliza y regenerar cuotas de pago (Asesor / Admin)
router.post('/:id/renew', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No autorizado para renovar pólizas.' });
  }

  const { id } = req.params;
  const { fecha_renovacion, frecuencia_pago, prima_anual, suma_asegurada, deducible, observaciones } = req.body;

  try {
    const polId = parseInt(id);
    let poliza = null;
    let advisorId = null;

    if (req.user.rango === 'asesor') {
      const aseRes = await db.query('SELECT id FROM asesores WHERE usuario_id = $1', [req.user.id]);
      if (aseRes.rows.length === 0) return res.status(403).json({ error: 'Asesor no encontrado.' });
      advisorId = aseRes.rows[0].id;
    }

    const polRes = await db.query('SELECT * FROM polizas WHERE id = $1', [polId]);
    if (polRes.rows.length === 0) {
      return res.status(404).json({ error: 'Póliza no encontrada.' });
    }
    poliza = polRes.rows[0];

    if (req.user.rango === 'asesor' && poliza.asesor_id && poliza.asesor_id !== advisorId) {
      return res.status(403).json({ error: 'No autorizado para renovar una póliza asignada a otro asesor.' });
    }

    const renewalDate = fecha_renovacion || new Date().toISOString().split('T')[0];
    const freqAnt = poliza.frecuencia_pago || 'contado';
    const freqNueva = frecuencia_pago || freqAnt;
    const finalPrima = prima_anual !== undefined && !isNaN(parseFloat(prima_anual)) ? parseFloat(prima_anual) : parseFloat(poliza.prima_anual || 0);
    const finalSuma = suma_asegurada !== undefined && !isNaN(parseFloat(suma_asegurada)) ? parseFloat(suma_asegurada) : parseFloat(poliza.suma_asegurada || 0);
    const finalDeducible = deducible !== undefined && !isNaN(parseFloat(deducible)) ? parseFloat(deducible) : parseFloat(poliza.deducible || 0);

    // 1. Actualizar póliza
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const pIdx = fData.polizas.findIndex(p => p.id === polId);
      if (pIdx !== -1) {
        fData.polizas[pIdx].tipo_negocio = 'renovacion';
        fData.polizas[pIdx].estado = 'vigente';
        fData.polizas[pIdx].pago_estado = 'pendiente';
        fData.polizas[pIdx].fecha_renovacion = renewalDate;
        fData.polizas[pIdx].frecuencia_pago = freqNueva;
        fData.polizas[pIdx].prima_anual = finalPrima;
        fData.polizas[pIdx].suma_asegurada = finalSuma;
        fData.polizas[pIdx].deducible = finalDeducible;
      }
      db.saveFallback();
    } else {
      const updateSql = `
        UPDATE polizas
        SET tipo_negocio = 'renovacion',
            estado = 'vigente',
            pago_estado = 'pendiente',
            fecha_renovacion = $1,
            frecuencia_pago = $2,
            prima_anual = $3,
            suma_asegurada = $4,
            deducible = $5
        WHERE id = $6
        RETURNING *
      `;
      await db.query(updateSql, [renewalDate, freqNueva, finalPrima, finalSuma, finalDeducible, polId]);
    }

    // 2. Registrar en renovaciones_polizas
    const insRenSql = `
      INSERT INTO renovaciones_polizas (
        poliza_id, cliente_id, asesor_id, fecha_renovacion, frecuencia_anterior, frecuencia_nueva, prima_anual, suma_asegurada, observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const renRes = await db.query(insRenSql, [
      polId,
      parseInt(poliza.cliente_id),
      advisorId || poliza.asesor_id || null,
      renewalDate,
      freqAnt,
      freqNueva,
      finalPrima,
      finalSuma,
      observaciones || null
    ]);

    // 3. Generar nuevo cronograma de pagos a partir de la fecha de renovación preservando los pagos pagados
    await generarPagosFraccionados(polId, finalPrima, freqNueva, renewalDate, true);

    // 4. Registrar en logs de actividad
    await registrarAccion(
      req.user.id,
      req.user.correo,
      'RENOVACION_POLIZA',
      `Póliza ${poliza.codigo_poliza} renovada con fecha ${renewalDate}. Frecuencia: ${freqAnt} ➔ ${freqNueva}, Prima: $${finalPrima}`
    );

    res.json({
      message: `Póliza ${poliza.codigo_poliza} renovada exitosamente. Nuevas fechas de pago generadas desde ${renewalDate}.`,
      renovacion: renRes.rows && renRes.rows.length > 0 ? renRes.rows[0] : null
    });

  } catch (err) {
    console.error('Error al renovar póliza:', err);
    res.status(500).json({ error: 'Error del servidor al renovar la póliza.' });
  }
});

export default router;
