import express from 'express';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

// CLIENTE: Obtener historial de pagos y próximo pago
router.get('/client', authenticateToken, async (req, res) => {
  try {
    const cliRes = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
    if (cliRes.rows.length === 0) return res.json([]);

    // Obtener pólizas de este cliente
    const polRes = await db.query('SELECT id FROM polizas WHERE cliente_id = $1', [cliRes.rows[0].id]);
    const polIds = polRes.rows.map(p => p.id);

    if (polIds.length === 0) return res.json([]);

    const payRes = await db.query('SELECT * FROM pagos');
    const matchedPayments = payRes.rows.filter(pa => polIds.includes(pa.poliza_id));

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
    const payRes = await db.query('SELECT * FROM pagos ORDER BY id DESC');
    let rows = payRes.rows;

    const polRes = await db.query('SELECT * FROM polizas');
    const cliRes = await db.query('SELECT * FROM datos_personales');
    const compRes = await db.query('SELECT * FROM companias_seguros');

    rows = rows.map(pa => {
      const pol = polRes.rows.find(p => p.id === pa.poliza_id);
      const cli = pol ? cliRes.rows.find(c => c.id === pol.cliente_id) : null;
      const compania = pol ? compRes.rows.find(c => c.id === pol.compania_id) : null;
      
      return {
        ...pa,
        poliza_codigo: pol ? pol.codigo_poliza : '',
        compania_nombre: compania ? compania.nombre : 'Seguros',
        cliente_nombre: cli ? `${cli.primer_nombre} ${cli.primer_apellido}` : 'Asociado'
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('Error al cargar pagos globales:', err);
    res.status(500).json({ error: 'Error del servidor al obtener pagos.' });
  }
});

// Reportar o actualizar estado de pago (Cliente, Admin, Asesor)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { referencia, estado_pago } = req.body;

  try {
    // Si es cliente, solo puede reportar referencia de su propio pago
    if (req.user.rango === 'cliente') {
      if (!referencia) {
        return res.status(400).json({ error: 'La referencia bancaria es requerida.' });
      }

      const dp = await db.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [req.user.id]);
      if (dp.rows.length === 0) return res.status(403).json({ error: 'Perfil de cliente no encontrado.' });
      const clienteId = dp.rows[0].id;

      const checkPay = await db.query('SELECT * FROM pagos WHERE id = $1', [parseInt(id)]);
      if (checkPay.rows.length === 0) return res.status(404).json({ error: 'Pago no encontrado.' });
      const polizaId = checkPay.rows[0].poliza_id;

      const checkPol = await db.query('SELECT * FROM polizas WHERE id = $1 AND cliente_id = $2', [polizaId, clienteId]);
      if (checkPol.rows.length === 0) {
        return res.status(403).json({ error: 'No está autorizado a modificar pagos ajenos.' });
      }

      const q = 'UPDATE pagos SET referencia = $1, estado_pago = $2 WHERE id = $3 RETURNING *';
      const updated = await db.query(q, [referencia, 'pagado', parseInt(id)]);
      
      await db.query("UPDATE polizas SET pago_estado = 'pagado' WHERE id = $1", [polizaId]);

      // Trazabilidad
      await registrarAccion(req.user.id, req.user.correo, 'PAGO_REPORTADO', `Cliente reportó pago ID ${id} de póliza ID ${polizaId}. Ref: ${referencia}`);

      return res.json({ message: 'Pago reportado correctamente.', pago: updated.rows[0] });
    }

    // Si es admin o asesor, puede actualizar estado de pago libremente
    if (req.user.rango === 'admin' || req.user.rango === 'asesor') {
      if (!estado_pago || !['pendiente', 'pagado', 'vencido'].includes(estado_pago)) {
        return res.status(400).json({ error: 'Estado de pago no válido.' });
      }

      const q = 'UPDATE pagos SET estado_pago = $1, referencia = $2 WHERE id = $3 RETURNING *';
      const refVal = referencia || null;
      const updated = await db.query(q, [estado_pago, refVal, parseInt(id)]);

      if (updated.rowCount === 0) return res.status(404).json({ error: 'Pago no encontrado.' });

      const payRecord = updated.rows[0];
      const polState = estado_pago === 'pagado' ? 'pagado' : 'pendiente';
      await db.query("UPDATE polizas SET pago_estado = $1 WHERE id = $2", [polState, payRecord.poliza_id]);

      // Trazabilidad
      await registrarAccion(req.user.id, req.user.correo, 'ACTUALIZACION_PAGO', `Estado de pago ID ${id} cambiado a ${estado_pago}`);

      return res.json({ message: 'Estado de pago actualizado exitosamente.', pago: payRecord });
    }

    res.status(403).json({ error: 'Rol no autorizado.' });

  } catch (err) {
    console.error('Error al actualizar pago:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar pago.' });
  }
});

export default router;
