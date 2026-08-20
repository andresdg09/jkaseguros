import { db } from '../db/db.js';

/**
 * Extrae el porcentaje correspondiente al nivel del asesor según la regla de la matriz.
 * Niveles oficiales: asesor_1 (Senior), asesor_2 (Intermedio), asesor_3 (Junior).
 */
function getAdvisorPct(row, tipoAsesor) {
  if (!row) return 0;
  const t = (tipoAsesor || 'asesor_3').toLowerCase();
  
  if (t === 'asesor_3' || t === 'junior') {
    if (row.asesor_3 !== undefined && row.asesor_3 !== null) return parseFloat(row.asesor_3);
    return 10.0;
  }
  if (t === 'asesor_2' || t === 'intermedio') {
    if (row.asesor_2 !== undefined && row.asesor_2 !== null) return parseFloat(row.asesor_2);
    return 12.0;
  }
  if (t === 'asesor_1' || t === 'senior') {
    if (row.asesor_1 !== undefined && row.asesor_1 !== null) return parseFloat(row.asesor_1);
    return 15.0;
  }
  return parseFloat(row[t] || row.asesor_3 || row.asesor_1 || 10.0);
}

/**
 * Procesa y registra la comisión correspondiente a un pago marcado como pagado.
 * @param {number} pagoId - ID del pago realizado.
 */
export async function procesarComisionPago(pagoId) {
  try {
    // 1. Obtener detalles del pago
    const payRes = await db.query('SELECT * FROM pagos WHERE id = $1', [parseInt(pagoId)]);
    if (payRes.rows.length === 0) return;
    const pago = payRes.rows[0];

    if (pago.estado_pago !== 'pagado') {
      console.log(`[Comisiones] Pago ID ${pagoId} no está en estado 'pagado'.`);
      return;
    }

    // 2. Verificar si ya existe comisión registrada para este pago
    const checkComm = await db.query('SELECT id FROM historico_comisiones WHERE pago_id = $1', [parseInt(pagoId)]);
    if (checkComm.rows.length > 0) {
      console.log(`[Comisiones] Comisión ya registrada para el Pago ID ${pagoId}.`);
      return checkComm.rows[0];
    }

    // 3. Obtener detalles de la póliza
    const polRes = await db.query('SELECT * FROM polizas WHERE id = $1', [pago.poliza_id]);
    if (polRes.rows.length === 0) return;
    const poliza = polRes.rows[0];

    // 4. Obtener detalles de la compañía de seguros
    const compRes = await db.query('SELECT * FROM companias_seguros WHERE id = $1', [poliza.compania_id]);
    const compania = compRes.rows.length > 0 ? compRes.rows[0] : null;

    // 5. Obtener perfil del asesor
    let tipoAsesor = 'asesor_3';
    let asesorNombre = 'Asesor Desconocido';
    if (poliza.asesor_id) {
      const advRes = await db.query('SELECT nombre, tipo_asesor FROM asesores WHERE id = $1', [poliza.asesor_id]);
      if (advRes.rows.length > 0) {
        tipoAsesor = advRes.rows[0].tipo_asesor || 'asesor_3';
        asesorNombre = advRes.rows[0].nombre || 'Asesor';
      }
    }

    // 6. Consultar la matriz de comisiones
    let totalComisionPct = 0;
    let asesorPct = 0;
    let matchedRule = false;

    // Buscar reglas para esta aseguradora
    let matrixRes = await db.query(
      'SELECT * FROM matriz_comisiones WHERE compania_id = $1 AND LOWER(ramo) = LOWER($2)',
      [poliza.compania_id, poliza.area || 'Salud']
    );

    // Si no encuentra por ramo exacto, buscar reglas de la compañía en general
    if (matrixRes.rows.length === 0) {
      matrixRes = await db.query(
        'SELECT * FROM matriz_comisiones WHERE compania_id = $1',
        [poliza.compania_id]
      );
    }

    if (matrixRes.rows.length > 0) {
      // Buscar mejor coincidencia según plan y tipo_negocio
      let matchedRow = null;
      const planName = (poliza.plan || '').toLowerCase();
      const bizType = (poliza.tipo_negocio || 'nuevo').toLowerCase();

      for (const row of matrixRes.rows) {
        const prod = (row.producto_modalidad || '').toLowerCase();
        if (planName && prod.includes(planName)) {
          matchedRow = row;
          break;
        }
        if (prod.includes(bizType)) {
          matchedRow = row;
          break;
        }
      }

      // Si no hay coincidencia específica, tomamos la primera de esa aseguradora
      if (!matchedRow) {
        matchedRow = matrixRes.rows[0];
      }

      totalComisionPct = parseFloat(matchedRow.total_comision || 0);
      asesorPct = getAdvisorPct(matchedRow, tipoAsesor);
      matchedRule = true;
    }

    // 7. Aplicar lógica de comisiones personalizadas por asesor (comisiones_asesores)
    if (poliza.asesor_id && poliza.compania_id) {
      try {
        const customRes = await db.query(
          'SELECT porcentaje FROM comisiones_asesores WHERE asesor_id = $1 AND compania_id = $2',
          [poliza.asesor_id, poliza.compania_id]
        );
        if (customRes.rows.length > 0 && parseFloat(customRes.rows[0].porcentaje) > 0) {
          asesorPct = parseFloat(customRes.rows[0].porcentaje);
        }
      } catch (errCustom) {
        console.error('Error al consultar comisiones personalizadas:', errCustom);
      }
    }

    // 8. Aplicar anulación a nivel de póliza (override)
    if (poliza.comision_porcentaje !== null && poliza.comision_porcentaje !== undefined && parseFloat(poliza.comision_porcentaje) > 0) {
      asesorPct = parseFloat(poliza.comision_porcentaje);
    }

    // 9. Si no encontramos regla en la matriz o totalComisionPct es 0, usamos los porcentajes de la compañía
    if (totalComisionPct === 0 && compania) {
      totalComisionPct = parseFloat(compania.comision_compania || 20.0);
      if (asesorPct === 0) {
        asesorPct = parseFloat(compania.comision_asesor_estandar || 10.0);
      }
    }

    // Seguridad: si aún es 0, garantizar valores estándar para evitar 0% injusto
    if (totalComisionPct === 0) totalComisionPct = 20.0;
    if (asesorPct === 0) asesorPct = 10.0;

    // 10. Calcular montos de comisiones estrictamente en Bolívares (VES) en base al monto aprobado
    const montoPagoVES = parseFloat(pago.monto_reportado || (parseFloat(pago.monto || 0) * 60));
    const comisionBrutaVES = (montoPagoVES * totalComisionPct) / 100;
    const pagoAsesorVES = (montoPagoVES * asesorPct) / 100;
    const margenBrokerVES = Math.max(0, comisionBrutaVES - pagoAsesorVES);

    // 11. Registrar en el histórico de comisiones
    const qInsert = `
      INSERT INTO historico_comisiones (
        pago_id, poliza_id, asesor_id, monto_pago,
        total_comision_porcentaje, asesor_porcentaje,
        comision_bruta, pago_asesor, margen_broker, fecha_pago, estado_corrida
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'pendiente')
      RETURNING *
    `;

    const insRes = await db.query(qInsert, [
      pago.id,
      poliza.id,
      poliza.asesor_id,
      montoPagoVES,
      totalComisionPct,
      asesorPct,
      parseFloat(comisionBrutaVES.toFixed(2)),
      parseFloat(pagoAsesorVES.toFixed(2)),
      parseFloat(margenBrokerVES.toFixed(2))
    ]);

    console.log(`[Comisiones] ✅ Comisión procesada para Pago ID ${pagoId}. Póliza ${poliza.codigo_poliza} (${poliza.plan || 'General'} - ${poliza.area || 'Salud'}). Asesor: ${asesorNombre} (Nivel: ${tipoAsesor}) -> Base Aprobada: Bs. ${montoPagoVES.toLocaleString('es-VE')} -> Ganancia Asesor: Bs. ${pagoAsesorVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${asesorPct}%), Margen Broker JKA: Bs. ${margenBrokerVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${(totalComisionPct - asesorPct).toFixed(1)}%).`);
    return insRes.rows[0];

  } catch (err) {
    console.error(`Error al procesar comisión para pago ID ${pagoId}:`, err);
  }
}

/**
 * Ejecuta una corrida de comisiones procesando todos los pagos pendientes de liquidar.
 * @param {string} tipoEjecucion - 'manual' o 'automatica'.
 * @param {string} cuentaDebitarParam - Cuenta de débito del Broker JKA (20 dígitos).
 */
export async function ejecutarCorridaComisiones(tipoEjecucion = 'manual', cuentaDebitarParam = '01910100201000123456') {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Evitar doble corrida automática el mismo día
    if (tipoEjecucion === 'automatica') {
      if (db.isFallback()) {
        const fData = db.getFallbackData();
        const checkRun = (fData.corridas_comisiones || []).find(
          r => r.tipo_ejecucion === 'automatica' && r.fecha_ejecucion.includes(todayStr)
        );
        if (checkRun) {
          console.log(`[Comisiones] Corrida automática ya realizada hoy (${todayStr}) en Fallback.`);
          return { count: 0, total: 0, message: 'Corrida automática ya ejecutada hoy.' };
        }
      } else {
        const checkRun = await db.query(
          `SELECT id FROM corridas_comisiones 
           WHERE tipo_ejecucion = 'automatica' AND fecha_ejecucion::text LIKE $1`,
          [`%${todayStr}%`]
        );
        if (checkRun.rows.length > 0) {
          console.log(`[Comisiones] Corrida automática ya realizada hoy (${todayStr}) en Postgres.`);
          return { count: 0, total: 0, message: 'Corrida automática ya ejecutada hoy.' };
        }
      }
    }

    // 1. Obtener comisiones pendientes
    let pendingComms = [];
    let asesoresListFromDb = [];

    if (db.isFallback()) {
      const fData = db.getFallbackData();
      const rawPending = (fData.historico_comisiones || []).filter(h => h.estado_corrida === 'pendiente');
      asesoresListFromDb = fData.asesores || [];
      pendingComms = rawPending.map(h => {
        const adv = asesoresListFromDb.find(a => parseInt(a.id) === parseInt(h.asesor_id)) || {};
        return {
          ...h,
          nombre: adv.nombre,
          correo: adv.correo,
          cedula: adv.cedula,
          banco: adv.banco,
          numero_cuenta: adv.numero_cuenta
        };
      });
    } else {
      const pendingRes = await db.query(
        `SELECT h.*, a.nombre, a.correo, a.cedula, a.banco, a.numero_cuenta
         FROM historico_comisiones h
         LEFT JOIN asesores a ON h.asesor_id = a.id
         WHERE h.estado_corrida = 'pendiente'`
      );
      pendingComms = pendingRes.rows;
    }

    if (pendingComms.length === 0) {
      return { count: 0, total: 0, message: 'No hay comisiones pendientes por liquidar.' };
    }

    // 2. Agrupar por Asesor para calcular pagos individuales
    const advisorsMap = {};
    let totalPagado = 0;

    pendingComms.forEach(c => {
      if (!c.asesor_id) return;
      const key = c.asesor_id;
      if (!advisorsMap[key]) {
        advisorsMap[key] = {
          id: key,
          nombre: c.nombre || 'Asesor Sin Nombre',
          correo: c.correo || 'info@jkaconsultores.com',
          cedula: c.cedula || 'V00000000',
          banco: c.banco || 'BNC',
          numero_cuenta: c.numero_cuenta || '00000000000000000000',
          totalComision: 0
        };
      }
      advisorsMap[key].totalComision += parseFloat(c.pago_asesor || 0);
      totalPagado += parseFloat(c.pago_asesor || 0);
    });

    const advisorsList = Object.values(advisorsMap).filter(adv => adv.totalComision > 0);

    if (advisorsList.length === 0) {
      return { count: 0, total: 0, message: 'No hay montos de comisiones mayores a 0 pendientes de pago.' };
    }

    // 3. Generar contenido BNC TXT (delimitado por tabulaciones)
    const nowTemp = new Date();
    const dia = String(nowTemp.getDate()).padStart(2, '0');
    const mes = String(nowTemp.getMonth() + 1).padStart(2, '0');
    const anio = nowTemp.getFullYear();
    const fechaPago = `${dia}/${mes}/${anio}`;
    const cuentaDebitar = (cuentaDebitarParam || '01910100201000123456').replace(/\D/g, '').padEnd(20, '0').substring(0, 20);

    let lines = [];
    let refNum = 1001;

    advisorsList.forEach(adv => {
      const col1 = fechaPago;
      const col2 = cuentaDebitar;
      
      const rawCta = adv.numero_cuenta || '';
      const col3 = rawCta.replace(/\D/g, '').substring(0, 20).padEnd(20, '0');
      
      const col4 = adv.totalComision.toFixed(2).replace('.', ',');
      
      const rawNombre = adv.nombre || 'Asesor Sin Nombre';
      const cleanDesc = `Abono de Comisiones Asesor ${rawNombre}`
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .substring(0, 60);
      const col5 = cleanDesc;
      
      const rawCed = adv.cedula || '';
      const cleanCedula = rawCed.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'V00000000';
      const col6 = cleanCedula;
      
      const cleanNombre = rawNombre
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .substring(0, 80);
      const col7 = cleanNombre;
      
      const col8 = (adv.correo || '').substring(0, 100);
      const col9 = String(refNum++);

      lines.push(`${col1}\t${col2}\t${col3}\t${col4}\t${col5}\t${col6}\t${col7}\t${col8}\t${col9}`);
    });

    const fileContent = lines.join('\n');

    // 4. Crear registro de la corrida en la base de datos
    let newRunId;
    if (db.isFallback()) {
      const fData = db.getFallbackData();
      newRunId = fData.corridas_comisiones.length > 0 
        ? Math.max(...fData.corridas_comisiones.map(r => r.id)) + 1 
        : 1;

      fData.corridas_comisiones.push({
        id: newRunId,
        fecha_ejecucion: new Date().toISOString(),
        tipo_ejecucion: tipoEjecucion,
        total_pagado: parseFloat(totalPagado.toFixed(2)),
        cantidad_asesores: advisorsList.length,
        archivo_txt: fileContent,
        created_at: new Date().toISOString()
      });
      
      fData.historico_comisiones.forEach((h, idx) => {
        if (h.estado_corrida === 'pendiente') {
          fData.historico_comisiones[idx].estado_corrida = 'procesado';
          fData.historico_comisiones[idx].corrida_id = newRunId;
        }
      });

      db.saveFallback();
    } else {
      const insRes = await db.query(
        `INSERT INTO corridas_comisiones (tipo_ejecucion, total_pagado, cantidad_asesores, archivo_txt)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tipoEjecucion, parseFloat(totalPagado.toFixed(2)), advisorsList.length, fileContent]
      );
      newRunId = insRes.rows[0].id;

      await db.query(
        `UPDATE historico_comisiones 
         SET estado_corrida = 'procesado', corrida_id = $1 
         WHERE estado_corrida = 'pendiente'`,
        [newRunId]
      );
    }

    console.log(`[Comisiones] Corrida de comisiones ID #${newRunId} ejecutada con éxito. Total liquidado: Bs. ${totalPagado.toLocaleString('es-VE', { minimumFractionDigits: 2 })} a ${advisorsList.length} asesores.`);

    return {
      runId: newRunId,
      total: parseFloat(totalPagado.toFixed(2)),
      count: advisorsList.length,
      archivo_txt: fileContent,
      message: `Corrida realizada con éxito. Se procesaron Bs. ${totalPagado.toLocaleString('es-VE', { minimumFractionDigits: 2 })} a ${advisorsList.length} asesores.`
    };

  } catch (err) {
    console.error('Error al ejecutar corrida de comisiones:', err);
    throw err;
  }
}

/**
 * Inicia el temporizador de revisión de comisiones para ejecución en días específicos.
 */
export function iniciarCronComisiones() {
  console.log('⏰ Iniciando cron de comisiones automáticas (Lunes, Miércoles y Viernes)...');
  
  setInterval(async () => {
    try {
      const now = new Date();
      const day = now.getDay();
      const hours = now.getHours();

      // Correr los Lunes (1), Miércoles (3) y Viernes (5), a las 8:00 AM
      if ((day === 1 || day === 3 || day === 5) && hours === 8) {
        console.log('[Cron Comisiones] Disparando corrida automática...');
        await ejecutarCorridaComisiones('automatica');
      }
    } catch (err) {
      console.error('[Cron Comisiones] Error al ejecutar cron:', err);
    }
  }, 1000 * 60 * 60);
}
