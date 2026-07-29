import express from 'express';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';
import { registrarAccion } from '../db/logger.js';

const router = express.Router();

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
  const { compania_id, tipo_cobertura, suma_asegurada, prima_anual, asesor_id, cliente_id } = req.body;

  if (!compania_id || !tipo_cobertura || !suma_asegurada || !prima_anual) {
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

    // Asignar el asesor seleccionado o el primer asesor en la base de datos
    let finalAsesorId = asesor_id ? parseInt(asesor_id) : null;
    if (!finalAsesorId) {
      const advisorsRes = await db.query('SELECT id FROM asesores ORDER BY id ASC LIMIT 1');
      finalAsesorId = advisorsRes.rows.length > 0 ? advisorsRes.rows[0].id : null;
    }

    // Generar un código único de póliza
    const codPoliza = `POL-${Math.floor(100000 + Math.random() * 900000)}`;

    // Si es administrador el que crea la póliza, se crea como "vigente" directamente.
    // Si es cliente, se crea en estado de "negociacion"
    const initialStatus = req.user.rango === 'admin' ? 'vigente' : 'negociacion';

    const q = `
      INSERT INTO polizas (
        codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura,
        area, suma_asegurada, deducible, prima_anual, estado, pago_estado
      ) VALUES ($1, $2, $3, $4, $5, 'Salud', $6, 0, $7, $8, 'pendiente')
      RETURNING *
    `;
    const newPolRes = await db.query(q, [
      codPoliza, finalClienteId, finalAsesorId, parseInt(compania_id), tipo_cobertura,
      parseFloat(suma_asegurada), parseFloat(prima_anual), initialStatus
    ]);

    const newPol = newPolRes.rows[0];

    // Crear pago pendiente automático en PostgreSQL (en Fallback ya se maneja internamente)
    if (!db.isFallback()) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const fechaVencimiento = nextMonth.toISOString().split('T')[0];
      
      await db.query(
        `INSERT INTO pagos (poliza_id, monto, estado_pago, fecha_vencimiento) VALUES ($1, $2, 'pendiente', $3)`,
        [newPol.id, parseFloat(prima_anual), fechaVencimiento]
      );
    }

    // Registrar en logs de actividad
    await registrarAccion(req.user.id, req.user.correo, 'CREACION_POLIZA', `Póliza ${codPoliza} creada en estado ${initialStatus} por ${req.user.correo}.`);

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
  const { estado } = req.body; // 'negociacion', 'vigente', 'vencido', 'rechazado'

  if (req.user.rango !== 'admin' && req.user.rango !== 'asesor') {
    return res.status(403).json({ error: 'No está autorizado para cambiar el estado de las pólizas.' });
  }

  if (!['negociacion', 'vigente', 'vencido', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado de póliza inválido.' });
  }

  try {
    const q = 'UPDATE polizas SET estado = $1 WHERE id = $2 RETURNING *';
    const updateRes = await db.query(q, [estado, parseInt(id)]);
    
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Póliza no encontrada.' });
    }

    const updatedPol = updateRes.rows[0];

    // Registrar en logs
    await registrarAccion(req.user.id, req.user.correo, 'CAMBIO_ESTADO_POLIZA', `Póliza ${updatedPol.codigo_poliza} cambió de estado a: ${estado}`);

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

// Actualizar póliza completa (Admin)
router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user.rango !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  const { id } = req.params;
  const { asesor_id, compania_id, tipo_cobertura, suma_asegurada, prima_anual, estado } = req.body;

  try {
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      const fData = JSON.parse(fileContent);
      
      const idx = fData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx === -1) return res.status(404).json({ error: 'Póliza no encontrada.' });

      const oldStatus = fData.polizas[idx].estado;

      fData.polizas[idx] = {
        ...fData.polizas[idx],
        asesor_id: asesor_id ? parseInt(asesor_id) : null,
        compania_id: parseInt(compania_id),
        tipo_cobertura,
        suma_asegurada: parseFloat(suma_asegurada),
        prima_anual: parseFloat(prima_anual),
        estado
      };

      // Si cambia a vigente y no tenía pagos, o si queremos regenerar cobro
      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = fData.pagos.find(pa => pa.poliza_id === parseInt(id));
        if (!checkPay) {
          const payId = fData.pagos.length > 0 ? Math.max(...fData.pagos.map(pa => pa.id)) + 1 : 1;
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          fData.pagos.push({
            id: payId,
            poliza_id: parseInt(id),
            monto: parseFloat(prima_anual),
            fecha_pago: new Date().toISOString().split('T')[0],
            estado_pago: 'pendiente',
            referencia: null,
            fecha_vencimiento: nextMonth.toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
        }
      }

      fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
    } else {
      // PostgreSQL
      const oldRes = await db.query('SELECT estado FROM polizas WHERE id = $1', [parseInt(id)]);
      if (oldRes.rows.length === 0) return res.status(404).json({ error: 'Póliza no encontrada.' });
      const oldStatus = oldRes.rows[0].estado;

      const q = `
        UPDATE polizas 
        SET asesor_id = $1, compania_id = $2, tipo_cobertura = $3, suma_asegurada = $4, prima_anual = $5, estado = $6 
        WHERE id = $7
      `;
      await db.query(q, [
        asesor_id ? parseInt(asesor_id) : null, parseInt(compania_id), tipo_cobertura, parseFloat(suma_asegurada), parseFloat(prima_anual), estado, parseInt(id)
      ]);

      if (estado === 'vigente' && oldStatus !== 'vigente') {
        const checkPay = await db.query('SELECT id FROM pagos WHERE poliza_id = $1', [parseInt(id)]);
        if (checkPay.rows.length === 0) {
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          const fechaVencimiento = nextMonth.toISOString().split('T')[0];
          await db.query(
            `INSERT INTO pagos (poliza_id, monto, estado_pago, fecha_vencimiento) VALUES ($1, $2, 'pendiente', $3)`,
            [parseInt(id), parseFloat(prima_anual), fechaVencimiento]
          );
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

export default router;
