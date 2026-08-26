import express from 'express';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';
import { procesarComisionPago } from '../services/commissionService.js';
import { generarPagosFraccionados } from './policies.js';

const router = express.Router();

// CLIENTE: Obtener historial de pagos y próximo pago
router.get('/client', authenticateToken, async (req, res) => {
  try {
    const cliRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (cliRes.rows.length === 0) return res.json([]);

    // Obtener pólizas de este cliente
    const polRes = await db.query('SELECT * FROM polizas WHERE cliente_id = $1', [cliRes.rows[0].id]);
    const polIds = polRes.rows.map(p => p.id);

    if (polIds.length === 0) return res.json([]);

    let payRes = await db.query('SELECT * FROM pagos ORDER BY cuota_numero ASC, id ASC');
    
    // Auto-generar cuotas si alguna póliza del cliente aún no tiene registros en pagos
    let needRequery = false;
    for (const pol of polRes.rows) {
      const hasPay = payRes.rows.some(pa => String(pa.poliza_id) === String(pol.id));
      if (!hasPay && pol.prima_anual && parseFloat(pol.prima_anual) > 0) {
        try {
          await generarPagosFraccionados(pol.id, parseFloat(pol.prima_anual), pol.frecuencia_pago);
          needRequery = true;
        } catch (e) {
          console.error('Error al autogenerar pagos:', e);
        }
      }
    }
    if (needRequery) {
      payRes = await db.query('SELECT * FROM pagos ORDER BY cuota_numero ASC, id ASC');
    }

    const compRes = await db.query('SELECT * FROM companias_seguros');

    const matchedPayments = payRes.rows
      .filter(pa => polIds.includes(pa.poliza_id))
      .map(pa => {
        const pol = polRes.rows.find(p => p.id === pa.poliza_id);
        const comp = pol ? compRes.rows.find(c => c.id === pol.compania_id) : null;
        return {
          ...pa,
          poliza_codigo: pol ? pol.codigo_poliza : `POL-${pa.poliza_id}`,
          poliza_plan: pol ? pol.plan : '',
          poliza_frecuencia: pol ? pol.frecuencia_pago : 'contado',
          poliza_prima: pol ? pol.prima_anual : 0,
          compania_nombre: comp ? comp.nombre : 'Seguros'
        };
      });

    res.json(matchedPayments);
  } catch (err) {
    console.error('Error al obtener pagos de cliente:', err);
    res.status(500).json({ error: 'Error en el servidor al cargar historial de pagos.' });
  }
});

// ADMIN / ASESOR: Obtener todos los pagos globales
router.get('/admin', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'Acceso no autorizado.' });
  }

  try {
    const polRes = await db.query('SELECT * FROM polizas');
    let payRes = await db.query('SELECT * FROM pagos ORDER BY id DESC');
    let rows = payRes.rows;

    // Auto-generar cuotas si alguna póliza aún no tiene registros en pagos
    let needRequery = false;
    for (const pol of polRes.rows) {
      const hasPays = rows.some(pa => String(pa.poliza_id) === String(pol.id));
      if (!hasPays && pol.prima_anual && parseFloat(pol.prima_anual) > 0) {
        try {
          await generarPagosFraccionados(pol.id, parseFloat(pol.prima_anual), pol.frecuencia_pago);
          needRequery = true;
        } catch (e) {
          console.error('Auto-generación de pagos fraccionados para poliza:', pol.id, e);
        }
      }
    }
    if (needRequery) {
      payRes = await db.query('SELECT * FROM pagos ORDER BY id DESC');
      rows = payRes.rows;
    }

    const cliRes = await db.query('SELECT * FROM datos_personales');
    const compRes = await db.query('SELECT * FROM companias_seguros');
    const aseRes = await db.query('SELECT * FROM asesores');

    rows = rows.map(pa => {
      const pol = polRes.rows.find(p => String(p.id) === String(pa.poliza_id));
      const cli = pol ? cliRes.rows.find(c => String(c.id) === String(pol.cliente_id)) : null;
      const compania = pol ? compRes.rows.find(c => String(c.id) === String(pol.compania_id)) : null;
      const asesor = pol ? aseRes.rows.find(a => String(a.id) === String(pol.asesor_id)) : null;
      
      return {
        ...pa,
        asesor_id: pol ? pol.asesor_id : (pa.asesor_id || null),
        poliza_codigo: pol ? pol.codigo_poliza : (pa.poliza_codigo || ''),
        poliza_plan: pol ? pol.plan : (pa.poliza_plan || ''),
        poliza_frecuencia: pol ? pol.frecuencia_pago : (pa.poliza_frecuencia || 'contado'),
        poliza_prima: pol ? pol.prima_anual : (pa.poliza_prima || 0),
        compania_nombre: compania ? compania.nombre : (pa.compania_nombre || 'Seguros'),
        cliente_nombre: cli ? `${cli.primer_nombre} ${cli.primer_apellido}` : (pa.cliente_nombre || 'Asociado'),
        asesor_nombre: asesor ? asesor.nombre : (pa.asesor_nombre || 'Sin Asesor')
      };
    });

    console.log(`📡 [GET /payments/admin] Enviando ${rows.length} pagos globales al cliente (rango: ${req.user.rango})`);
    res.json(rows);
  } catch (err) {
    console.error('Error al cargar pagos globales:', err);
    res.status(500).json({ error: 'Error del servidor al obtener pagos.' });
  }
});

// ASESOR / CLIENTE: Reportar pago de cuota o prima (Estrictamente en Bolívares VES con Tasa BCV)
router.post('/report', authenticateToken, async (req, res) => {
  const { poliza_id, pago_id, monto_reportado_ves, tasa_bcv, monto_usd, referencia, fecha_pago, observaciones } = req.body;

  if ((!poliza_id && !pago_id) || !referencia || !monto_reportado_ves) {
    return res.status(400).json({ error: 'La referencia bancaria y el monto en Bolívares (VES) son requeridos.' });
  }

  try {
    const polId = poliza_id ? parseInt(poliza_id) : null;
    const payId = pago_id ? parseInt(pago_id) : null;

    let poliza = null;
    if (polId) {
      const polRes = await db.query('SELECT * FROM polizas WHERE id = $1', [polId]);
      if (polRes.rows.length > 0) poliza = polRes.rows[0];
    }

    const montoVES = parseFloat(monto_reportado_ves);
    const tasa = parseFloat(tasa_bcv || 0);
    // Si se pasa tasa BCV, calculamos el equivalente en USD; de lo contrario se usa monto_usd o la cuota
    let montoCalculadoUSD = 0;
    if (tasa > 0) {
      montoCalculadoUSD = parseFloat((montoVES / tasa).toFixed(2));
    } else if (monto_usd) {
      montoCalculadoUSD = parseFloat(monto_usd);
    } else if (poliza) {
      montoCalculadoUSD = parseFloat(poliza.prima_anual);
    }

    const fecha = fecha_pago || new Date().toISOString().split('T')[0];
    const obsDetalle = observaciones || (tasa > 0 ? `Pago reportado en Bs. ${montoVES.toLocaleString('es-VE')} a Tasa BCV: ${tasa}` : 'Pago reportado en Bolívares');

    let payRecord;
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      let existingPay = null;
      if (payId) {
        existingPay = fData.pagos.find(p => parseInt(p.id) === payId);
      } else if (polId) {
        existingPay = fData.pagos.find(p => parseInt(p.poliza_id) === polId && (p.estado_pago === 'pendiente' || p.estado_pago === 'en_revision'));
      }
      
      if (existingPay) {
        if (montoCalculadoUSD > 0) existingPay.monto = montoCalculadoUSD;
        existingPay.monto_reportado = montoVES;
        existingPay.moneda_pago = 'VES';
        existingPay.tasa_bcv = tasa > 0 ? tasa : null;
        existingPay.referencia = referencia;
        existingPay.fecha_pago = fecha;
        existingPay.estado_pago = 'en_revision';
        existingPay.observaciones = obsDetalle;
        existingPay.reportado_por = req.user.rango;
        payRecord = existingPay;
      } else {
        const newId = fData.pagos.length ? Math.max(...fData.pagos.map(p => p.id)) + 1 : 1;
        payRecord = {
          id: newId,
          poliza_id: polId || 1,
          monto: montoCalculadoUSD || (montoVES / 60),
          monto_reportado: montoVES,
          moneda_pago: 'VES',
          tasa_bcv: tasa > 0 ? tasa : null,
          fecha_pago: fecha,
          estado_pago: 'en_revision',
          referencia,
          cuota_numero: 1,
          cuota_total: 1,
          observaciones: obsDetalle,
          reportado_por: req.user.rango,
          created_at: new Date().toISOString()
        };
        fData.pagos.push(payRecord);
      }

      // Actualizar estado de la póliza
      const targetPolId = payRecord.poliza_id;
      const polIdx = fData.polizas.findIndex(p => parseInt(p.id) === parseInt(targetPolId));
      if (polIdx !== -1) fData.polizas[polIdx].pago_estado = 'en_revision';
      db.saveFallback();

    } else {
      let targetPayId = payId;
      if (!targetPayId && polId) {
        const existingRes = await db.query(
          "SELECT id FROM pagos WHERE poliza_id = $1 AND estado_pago IN ('pendiente', 'en_revision') ORDER BY id DESC LIMIT 1",
          [polId]
        );
        if (existingRes.rows.length > 0) targetPayId = existingRes.rows[0].id;
      }

      if (targetPayId) {
        const updRes = await db.query(
          `UPDATE pagos SET 
            monto = COALESCE(NULLIF($1, 0), monto),
            monto_reportado = $2,
            moneda_pago = 'VES',
            referencia = $3, 
            fecha_pago = $4,
            estado_pago = 'en_revision',
            observaciones = $5
           WHERE id = $6 RETURNING *`,
          [montoCalculadoUSD, montoVES, referencia, fecha, obsDetalle, targetPayId]
        );
        payRecord = updRes.rows[0];
      } else {
        const insRes = await db.query(
          `INSERT INTO pagos (poliza_id, monto, monto_reportado, moneda_pago, referencia, fecha_pago, estado_pago, observaciones)
           VALUES ($1, $2, $3, 'VES', $4, $5, 'en_revision', $6) RETURNING *`,
          [polId, montoCalculadoUSD, montoVES, referencia, fecha, obsDetalle]
        );
        payRecord = insRes.rows[0];
      }

      if (payRecord && payRecord.poliza_id) {
        await db.query("UPDATE polizas SET pago_estado = 'en_revision' WHERE id = $1", [payRecord.poliza_id]);
      }
    }

    console.log('💳 [POST /payments/report] Pago reportado con éxito:', payRecord);
    await registrarAccion(req.user.id, req.user.correo, 'PAGO_REPORTADO_VES', `Pago de Bs. ${montoVES.toLocaleString('es-VE')} reportado con Ref: ${referencia}. En revisión por Admin.`);

    res.json({ message: 'Pago en Bolívares reportado con éxito. Se encuentra En Revisión por el Administrador.', pago: payRecord });
  } catch (err) {
    console.error('Error al reportar pago en VES:', err);
    res.status(500).json({ error: 'Error del servidor al reportar pago.' });
  }
});

// ADMINISTRADOR: Verificar y Aprobar / Rechazar Pago Reportado
router.put('/:id/verify', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede verificar y aprobar pagos.' });
  }

  const { id } = req.params;
  const { accion, motivo_rechazo } = req.body; // 'aprobar' o 'rechazar'

  try {
    const payId = parseInt(id);
    let payRecord;

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const idx = fData.pagos.findIndex(p => p.id === payId);
      if (idx === -1) return res.status(404).json({ error: 'Pago no encontrado.' });
      
      payRecord = fData.pagos[idx];
      const polIdx = fData.polizas.findIndex(p => p.id === payRecord.poliza_id);

      if (accion === 'aprobar') {
        payRecord.estado_pago = 'pagado';
        if (polIdx !== -1) fData.polizas[polIdx].pago_estado = 'pagado';
      } else {
        payRecord.estado_pago = 'rechazado';
        payRecord.motivo_rechazo = motivo_rechazo || 'Comprobante no válido';
        if (polIdx !== -1) fData.polizas[polIdx].pago_estado = 'pendiente';
      }
      db.saveFallback();

    } else {
      const payRes = await db.query('SELECT * FROM pagos WHERE id = $1', [payId]);
      if (payRes.rows.length === 0) return res.status(404).json({ error: 'Pago no encontrado.' });
      payRecord = payRes.rows[0];

      if (accion === 'aprobar') {
        await db.query("UPDATE pagos SET estado_pago = 'pagado' WHERE id = $1", [payId]);
        await db.query("UPDATE polizas SET pago_estado = 'pagado' WHERE id = $1", [payRecord.poliza_id]);
      } else {
        await db.query("UPDATE pagos SET estado_pago = 'rechazado', motivo_rechazo = $1 WHERE id = $2", [motivo_rechazo || 'Rechazado', payId]);
        await db.query("UPDATE polizas SET pago_estado = 'pendiente' WHERE id = $1", [payRecord.poliza_id]);
      }
    }

    if (accion === 'aprobar') {
      // Liquidar comisión para la próxima corrida BNC
      await procesarComisionPago(payId);
      await registrarAccion(req.user.id, req.user.correo, 'PAGO_VERIFICADO_ADMIN', `Pago ID ${payId} verificado y aprobado. Comisión encolada.`);
      return res.json({ message: 'Pago verificado y aprobado con éxito. La comisión quedó registrada para la corrida del BNC.', pago: payRecord });
    } else {
      await registrarAccion(req.user.id, req.user.correo, 'PAGO_RECHAZADO_ADMIN', `Pago ID ${payId} rechazado. Motivo: ${motivo_rechazo || 'N/A'}`);
      return res.json({ message: 'El pago ha sido marcado como rechazado.', pago: payRecord });
    }

  } catch (err) {
    console.error('Error al verificar pago:', err);
    res.status(500).json({ error: 'Error del servidor al verificar pago.' });
  }
});

// Reportar o actualizar estado de pago simple
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { referencia, estado_pago } = req.body;

  try {
    if (req.user.rango === 'admin') {
      if (!estado_pago || !['pendiente', 'en_revision', 'pagado', 'vencido', 'rechazado'].includes(estado_pago)) {
        return res.status(400).json({ error: 'Estado de pago no válido.' });
      }

      const q = 'UPDATE pagos SET estado_pago = $1, referencia = $2 WHERE id = $3 RETURNING *';
      const refVal = referencia || null;
      const updated = await db.query(q, [estado_pago, refVal, parseInt(id)]);

      if (updated.rowCount === 0) return res.status(404).json({ error: 'Pago no encontrado.' });

      const payRecord = updated.rows[0];
      const polState = estado_pago === 'pagado' ? 'pagado' : estado_pago === 'en_revision' ? 'en_revision' : 'pendiente';
      await db.query("UPDATE polizas SET pago_estado = $1 WHERE id = $2", [polState, payRecord.poliza_id]);

      if (estado_pago === 'pagado') {
        await procesarComisionPago(parseInt(id));
      }

      await registrarAccion(req.user.id, req.user.correo, 'ACTUALIZACION_PAGO', `Estado de pago ID ${id} cambiado a ${estado_pago}`);
      return res.json({ message: 'Estado de pago actualizado exitosamente.', pago: payRecord });
    }

    res.status(403).json({ error: 'Solo el administrador puede actualizar directamente el estado.' });

  } catch (err) {
    console.error('Error al actualizar pago:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar pago.' });
  }
});

export default router;
