import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function actualizarPagosHistoricos() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ No se encontró DATABASE_URL en el archivo .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    console.log('🔄 Conectado a PostgreSQL (Neon)...');
    console.log('⏳ Actualizando pagos vencidos y pendientes hasta la fecha de hoy...');

    // 1. Ver cuántos pagos se van a actualizar
    const checkRes = await client.query(`
      SELECT COUNT(*) as total
      FROM pagos
      WHERE (fecha_vencimiento <= CURRENT_DATE OR (fecha_vencimiento IS NULL AND fecha_pago <= CURRENT_DATE))
        AND estado_pago IN ('vencido', 'pendiente');
    `);

    const totalAfectados = parseInt(checkRes.rows[0].total, 10);
    console.log(`📋 Pagos encontrados para actualizar: ${totalAfectados}`);

    if (totalAfectados > 0) {
      // 2. Actualizar pagos a 'pagado' y rellenar fecha_pago con la fecha de vencimiento si era nula
      const updateRes = await client.query(`
        UPDATE pagos
        SET 
          estado_pago = 'pagado',
          fecha_pago = COALESCE(fecha_pago, fecha_vencimiento, CURRENT_DATE)
        WHERE (fecha_vencimiento <= CURRENT_DATE OR (fecha_vencimiento IS NULL AND fecha_pago <= CURRENT_DATE))
          AND estado_pago IN ('vencido', 'pendiente')
        RETURNING id, poliza_id, monto, fecha_vencimiento, fecha_pago, estado_pago;
      `);

      console.log(`✅ ¡Éxito! Se actualizaron ${updateRes.rowCount} pagos a estado 'pagado'.`);

      // 3. Opcional: Asegurar que las pólizas con pagos al día queden en estado 'vigente'
      const polizasRes = await client.query(`
        UPDATE polizas
        SET estado = 'vigente'
        WHERE id IN (
          SELECT DISTINCT poliza_id 
          FROM pagos 
          WHERE estado_pago = 'pagado'
        ) AND estado IN ('vencido', 'pendiente', 'negociacion');
      `);

      console.log(`📋 Pólizas actualizadas a 'vigente': ${polizasRes.rowCount}`);
    } else {
      console.log('ℹ️ No hay pagos vencidos o pendientes anteriores a hoy.');
    }

  } catch (error) {
    console.error('❌ Error al ejecutar actualización:', error);
  } finally {
    client.release();
    await pool.end();
    console.log('🏁 Proceso finalizado.');
  }
}

actualizarPagosHistoricos();
