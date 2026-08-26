import { db } from '../db/db.js';
import { registrarAccion } from '../db/logger.js';
import fs from 'fs';

// Helper para enviar correo vía EmailJS
async function enviarCorreoEmailJS(toEmail, userName, subject, htmlContent) {
  try {
    const emailjsPayload = {
      service_id: 'service_271yuq8',
      template_id: 'template_068mrut',
      user_id: 'jgnK_ClSfIQ6PBYqd',
      accessToken: 's2Qg_q1KjxfL6H28PVCIQ',
      template_params: {
        user_name: userName,
        to_email: toEmail,
        fecha: new Date().toLocaleDateString('es-VE'),
        solicitud_ref: subject,
        plan_cards: htmlContent,
        cotizacion_pdf: '' // vacío para notificaciones
      }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailjsPayload)
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Error al enviar recordatorio vía EmailJS:', txt);
    }
  } catch (err) {
    console.error('Excepción en enviarCorreoEmailJS:', err);
  }
}

// Función principal para verificar y procesar recordatorios
export async function procesarRecordatoriosPolizas() {
  console.log('⏰ Ejecutando cron de recordatorios de pólizas en negociación...');
  try {
    // 1. Obtener pólizas en negociación
    let polizas = [];
    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      try {
        const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
        const fData = JSON.parse(fileContent);
        polizas = fData.polizas
          .filter(p => p.estado === 'negociacion')
          .map(p => {
            const cliente = fData.datos_personales.find(d => d.id === p.cliente_id);
            const asesor = fData.asesores.find(a => a.id === p.asesor_id);
            const compania = fData.companias_seguros.find(c => c.id === p.compania_id);
            const clientUser = fData.usuarios.find(u => u.id === (cliente ? cliente.usuario_id : null));
            const advisorUser = fData.usuarios.find(u => u.id === (asesor ? asesor.usuario_id : null));
            return {
              ...p,
              cliente_nombre: cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : 'Cliente',
              cliente_correo: clientUser ? clientUser.correo : null,
              cliente_telefono: cliente ? `${cliente.codigo_area}${cliente.numero_celular}` : '',
              asesor_nombre: asesor ? asesor.nombre : 'Asesor JKA',
              asesor_correo: advisorUser ? advisorUser.correo : 'contacto@jkaseguros.com',
              asesor_telefono: asesor ? asesor.telefono : '584121234567',
              compania_nombre: compania ? compania.nombre : 'Aseguradora'
            };
          });
      } catch (e) {
        console.error('Error leyendo fallback en recordatorio:', e);
      }
    } else {
      const q = `
        SELECT p.*, 
               (c.primer_nombre || ' ' || c.primer_apellido) AS cliente_nombre,
               u_cli.correo AS cliente_correo,
               (c.codigo_area || c.numero_celular) AS cliente_telefono,
               a.nombre AS asesor_nombre,
               u_ase.correo AS asesor_correo,
               a.telefono AS asesor_telefono,
               comp.nombre AS compania_nombre
        FROM polizas p
        LEFT JOIN datos_personales c ON p.cliente_id = c.id
        LEFT JOIN usuarios u_cli ON c.usuario_id = u_cli.id
        LEFT JOIN asesores a ON p.asesor_id = a.id
        LEFT JOIN usuarios u_ase ON a.usuario_id = u_ase.id
        LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
        WHERE p.estado = 'negociacion'
      `;
      const res = await db.query(q);
      polizas = res.rows;
    }

    const ahora = new Date();

    for (const p of polizas) {
      const fechaCreacion = new Date(p.created_at);
      const diffMs = ahora.getTime() - fechaCreacion.getTime();
      const diffHoras = diffMs / (1000 * 60 * 60);

      const recordatorio24 = p.recordatorio_24h || false;
      const recordatorio48 = p.recordatorio_48h || false;
      const recordatorio5d = p.recordatorio_5d || false;

      // --- CASO 1: 10 DÍAS (240 horas) -> ANULACIÓN AUTOMÁTICA ---
      if (diffHoras >= 240) {
        console.log(`🚫 Anulando póliza ${p.codigo_poliza} por superar los 10 días de negociación.`);
        
        // Actualizar en base de datos
        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.polizas.findIndex(pol => pol.id === p.id);
          if (idx !== -1) {
            fData.polizas[idx].estado = 'anulada';
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query("UPDATE polizas SET estado = 'anulada' WHERE id = $1", [p.id]);
        }

        // Registrar en logs
        await registrarAccion(null, 'sistema', 'ANULACION_AUTOMATICA', `La póliza ${p.codigo_poliza} ha sido anulada automáticamente tras 10 días en negociación.`);

        // Notificar al cliente
        if (p.cliente_correo) {
          const clienteHtml = `
            <div style="background-color: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #b91c1c; margin-top: 0;">Oferta de Seguro Vencida</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Te informamos que la oferta de seguro de salud con código <strong>${p.codigo_poliza}</strong> de la compañía <strong>${p.compania_nombre}</strong> ha superado el plazo máximo de validez (10 días de negociación) y ha quedado <strong>anulada</strong>.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Si aún estás interesado, por favor comunícate con tu asesor para generar una nueva cotización con tarifas actualizadas.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(p.cliente_correo, p.cliente_nombre, `Oferta Vencida y Anulada: Póliza ${p.codigo_poliza}`, clienteHtml);
        }

        // Notificar al asesor
        if (p.asesor_correo) {
          const asesorHtml = `
            <div style="background-color: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #b91c1c; margin-top: 0;">Notificación: Póliza Anulada por Vencimiento</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                La solicitud de póliza <strong>${p.codigo_poliza}</strong> del cliente <strong>${p.cliente_nombre}</strong> (${p.compania_nombre}) ha sido anulada automáticamente ya que transcurrieron 10 días en estado de negociación sin concretarse.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(p.asesor_correo, p.asesor_nombre, `Anulada por Vencimiento: Póliza ${p.codigo_poliza}`, asesorHtml);
        }
      } 
      // --- CASO 2: 5 DÍAS (120 horas) -> ÚLTIMO RECORDATORIO AL ASESOR ---
      else if (diffHoras >= 120 && !recordatorio5d) {
        console.log(`⚠️ Enviando recordatorio de 5 días al asesor de la póliza ${p.codigo_poliza}.`);
        
        // Actualizar en base de datos
        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.polizas.findIndex(pol => pol.id === p.id);
          if (idx !== -1) {
            fData.polizas[idx].recordatorio_5d = true;
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query("UPDATE polizas SET recordatorio_5d = true WHERE id = $1", [p.id]);
        }

        // Registrar en logs
        await registrarAccion(null, 'sistema', 'ALERTA_5D_NEGOCIACION', `Recordatorio de 5 días de negociación enviado al asesor para póliza ${p.codigo_poliza}.`);

        // Notificar al asesor
        if (p.asesor_correo) {
          const asesorHtml = `
            <div style="background-color: #fee2e2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #991b1b; margin-top: 0;">⚠️ Último Recordatorio: Póliza en Negociación (5 días)</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                La póliza <strong>${p.codigo_poliza}</strong> del cliente <strong>${p.cliente_nombre}</strong> sigue en negociación después de 5 días. 
              </p>
              <p style="font-size: 14px; color: #b91c1c; font-weight: bold; line-height: 1.5;">
                Importante: Le quedan 5 días de vigencia antes de ser anulada automáticamente por el sistema.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(p.asesor_correo, p.asesor_nombre, `⚠️ Último Recordatorio: Póliza ${p.codigo_poliza} (5 días)`, asesorHtml);
        }
      }
      // --- CASO 3: 2 DÍAS (48 horas) -> SEGUIMIENTO AL ASESOR ---
      else if (diffHoras >= 48 && !recordatorio48) {
        console.log(`⚠️ Enviando recordatorio de 2 días al asesor de la póliza ${p.codigo_poliza}.`);

        // Actualizar en base de datos
        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.polizas.findIndex(pol => pol.id === p.id);
          if (idx !== -1) {
            fData.polizas[idx].recordatorio_48h = true;
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query("UPDATE polizas SET recordatorio_48h = true WHERE id = $1", [p.id]);
        }

        // Registrar en logs
        await registrarAccion(null, 'sistema', 'ALERTA_48H_NEGOCIACION', `Recordatorio de 48 horas de negociación enviado al asesor para póliza ${p.codigo_poliza}.`);

        // Notificar al asesor
        if (p.asesor_correo) {
          const asesorHtml = `
            <div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #b45309; margin-top: 0;">Seguimiento de Negociación (48 Horas)</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Estimado asesor, la solicitud de póliza <strong>${p.codigo_poliza}</strong> del cliente <strong>${p.cliente_nombre}</strong> de <strong>${p.compania_nombre}</strong> lleva 2 días en negociación.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Por favor revise el estatus del caso e impulse la negociación con el asegurado.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(p.asesor_correo, p.asesor_nombre, `Seguimiento de Caso: Póliza ${p.codigo_poliza} (48h)`, asesorHtml);
        }
      }
      // --- CASO 4: 24 HORAS (1 día) -> RECORDATORIO AL CLIENTE Y ALERTA AL ASESOR ---
      else if (diffHoras >= 24 && !recordatorio24) {
        console.log(`✉️ Enviando recordatorios de 24 horas para la póliza ${p.codigo_poliza}.`);

        // Actualizar en base de datos
        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.polizas.findIndex(pol => pol.id === p.id);
          if (idx !== -1) {
            fData.polizas[idx].recordatorio_24h = true;
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query("UPDATE polizas SET recordatorio_24h = true WHERE id = $1", [p.id]);
        }

        // Registrar en logs
        await registrarAccion(null, 'sistema', 'RECORDATORIO_24H', `Recordatorios de 24h sin respuesta enviados para póliza ${p.codigo_poliza}.`);

        // A. Notificar al cliente
        if (p.cliente_correo) {
          let rawAsesorPhone = p.asesor_telefono ? p.asesor_telefono.replace(/[^0-9]/g, '') : '584121234567';
          if (rawAsesorPhone.startsWith('0')) rawAsesorPhone = '58' + rawAsesorPhone.substring(1);
          const waClientMsg = `Hola ${p.asesor_nombre}, le escribo para continuar con mi cotización de seguros de salud con código ${p.codigo_poliza}.`;
          const waClientLink = `https://api.whatsapp.com/send?phone=${rawAsesorPhone}&text=${encodeURIComponent(waClientMsg)}`;

          const clienteHtml = `
            <div style="background-color: #f8fafc; border: 1.5px solid #2563eb; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #1e3a8a; margin-top: 0;">¿Tienes alguna duda sobre tu Cotización?</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Hola <strong>${p.cliente_nombre}</strong>, te saludamos de <strong>Protección y Seguros 360</strong>. Queremos recordarte que tu asesor <strong>${p.asesor_nombre}</strong> te preparó una cotización de seguro médico (${p.compania_nombre}) con código <strong>${p.codigo_poliza}</strong> hace 24 horas.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Estamos a tu total disposición para ayudarte con cualquier duda o ajuste que requieras.
              </p>
              <div style="text-align: center; margin-top: 20px;">
                <a href="${waClientLink}" target="_blank" style="background-color: #25d366; color: #ffffff; padding: 11px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 2px 4px rgba(37,211,102,0.2);">
                  💬 Contactar a mi Asesor por WhatsApp
                </a>
              </div>
            </div>
          `;
          await enviarCorreoEmailJS(p.cliente_correo, p.cliente_nombre, `Recordatorio: Tu Cotización en Protección y Seguros 360 (${p.codigo_poliza})`, clienteHtml);
        }

        // B. Notificar al asesor
        if (p.asesor_correo) {
          let rawClientPhone = p.cliente_telefono ? p.cliente_telefono.replace(/[^0-9]/g, '') : '';
          if (rawClientPhone.startsWith('0')) rawClientPhone = '58' + rawClientPhone.substring(1);
          const waFollowMsg = `Hola *${p.cliente_nombre}*, te saluda ${p.asesor_nombre} de *Protección y Seguros 360*. Te escribo para saber si pudiste revisar la cotización de salud de ${p.compania_nombre} que te envié ayer y si tienes alguna duda. ¡Feliz día!`;
          const waFollowLink = rawClientPhone ? `https://api.whatsapp.com/send?phone=${rawClientPhone}&text=${encodeURIComponent(waFollowMsg)}` : '#';

          const mailtoFollowSubject = `Seguimiento de Cotización Protección y Seguros 360 - Póliza ${p.codigo_poliza}`;
          const mailtoFollowBody = `Hola ${p.cliente_nombre},\n\nEspero que te encuentres muy bien. Te escribo para saber si lograste revisar el cuadro comparativo del seguro de salud de ${p.compania_nombre} que te envié y si tienes alguna inquietud.\n\nQuedo a tu disposición.\n\nSaludos cordiales,\n${p.asesor_nombre}\nProtección y Seguros 360`;
          const mailtoFollowLink = p.cliente_correo ? `mailto:${p.cliente_correo}?subject=${encodeURIComponent(mailtoFollowSubject)}&body=${encodeURIComponent(mailtoFollowBody)}` : '#';

          const advisorHtml = `
            <div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #b45309; margin-top: 0;">⚠️ Alerta: 24h Sin Respuesta del Asegurado</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                El cliente <strong>${p.cliente_nombre}</strong> no ha respondido a la oferta de la póliza <strong>${p.codigo_poliza}</strong> (${p.compania_nombre}) en las últimas 24 horas.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.5; margin-bottom: 20px;">
                Te facilitamos las siguientes opciones para contactar y hacerle seguimiento directo al cliente:
              </p>
              <div style="text-align: center; margin-top: 15px;">
                ${cleanClientPhone ? `
                  <a href="${waFollowLink}" target="_blank" style="background-color: #25d366; color: #ffffff; padding: 10px 18px; font-size: 12px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px; box-shadow: 0 2px 4px rgba(37,211,102,0.2);">
                    💬 Enviar WhatsApp de Seguimiento
                  </a>
                ` : ''}
                ${p.cliente_correo ? `
                  <a href="${mailtoFollowLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 10px 18px; font-size: 12px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                    ✉️ Enviar Correo de Seguimiento
                  </a>
                ` : ''}
              </div>
            </div>
          `;
          await enviarCorreoEmailJS(p.asesor_correo, p.asesor_nombre, `⚠️ Alerta: 24h sin respuesta de ${p.cliente_nombre} (${p.codigo_poliza})`, advisorHtml);
        }
      }
    }

    // Procesar también recordatorios de cuotas y pagos
    await procesarRecordatoriosPagos();
  } catch (err) {
    console.error('Error en procesarRecordatoriosPolizas:', err);
  }
}

/**
 * Procesa recordatorios de cuotas y pagos vencidos / próximos a vencer:
 * - 2 días antes del vencimiento a las 2:00 PM de Venezuela (14:00 VET).
 * - El día del vencimiento a las 2:00 PM de Venezuela (14:00 VET) -> marca como 'vencido' y notifica a cliente y asesor.
 */
export async function procesarRecordatoriosPagos() {
  console.log('⏰ Ejecutando cron de cobranza y recordatorios de pagos (2:00 PM VET)...');
  try {
    let pagos = [];

    if (db.isFallback()) {
      const fallbackFilePath = './data/fallback_db.json';
      try {
        const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
        const fData = JSON.parse(fileContent);
        pagos = fData.pagos
          .filter(pa => pa.estado_pago === 'pendiente' || pa.estado_pago === 'vencido')
          .map(pa => {
            const pol = fData.polizas.find(p => p.id === pa.poliza_id);
            const cliente = pol ? fData.datos_personales.find(d => d.id === pol.cliente_id) : null;
            const asesor = pol ? fData.asesores.find(a => a.id === pol.asesor_id) : null;
            const compania = pol ? fData.companias_seguros.find(c => c.id === pol.compania_id) : null;
            const clientUser = fData.usuarios.find(u => u.id === (cliente ? cliente.usuario_id : null));
            const advisorUser = fData.usuarios.find(u => u.id === (asesor ? asesor.usuario_id : null));

            return {
              ...pa,
              poliza_codigo: pol ? pol.codigo_poliza : `POL-${pa.poliza_id}`,
              poliza_plan: pol ? pol.plan : 'Seguro',
              cliente_nombre: cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : 'Cliente',
              cliente_correo: clientUser ? clientUser.correo : null,
              cliente_telefono: cliente ? `${cliente.codigo_area}${cliente.numero_celular}` : '',
              asesor_nombre: asesor ? asesor.nombre : 'Asesor Comercial',
              asesor_correo: advisorUser ? advisorUser.correo : 'contacto@jkaseguros.com',
              asesor_telefono: asesor ? asesor.telefono : '',
              compania_nombre: compania ? compania.nombre : 'Aseguradora'
            };
          });
      } catch (e) {
        console.error('Error leyendo fallback en recordatorios de pagos:', e);
      }
    } else {
      const q = `
        SELECT pa.*,
               p.codigo_poliza,
               p.plan AS poliza_plan,
               (c.primer_nombre || ' ' || c.primer_apellido) AS cliente_nombre,
               u_cli.correo AS cliente_correo,
               (c.codigo_area || c.numero_celular) AS cliente_telefono,
               a.nombre AS asesor_nombre,
               u_ase.correo AS asesor_correo,
               a.telefono AS asesor_telefono,
               comp.nombre AS compania_nombre
        FROM pagos pa
        JOIN polizas p ON pa.poliza_id = p.id
        LEFT JOIN datos_personales c ON p.cliente_id = c.id
        LEFT JOIN usuarios u_cli ON c.usuario_id = u_cli.id
        LEFT JOIN asesores a ON p.asesor_id = a.id
        LEFT JOIN usuarios u_ase ON a.usuario_id = u_ase.id
        LEFT JOIN companias_seguros comp ON p.compania_id = comp.id
        WHERE pa.estado_pago IN ('pendiente', 'vencido')
      `;
      const res = await db.query(q);
      pagos = res.rows;
    }

    const ahora = new Date();

    for (const pa of pagos) {
      if (!pa.fecha_vencimiento) continue;

      const vDateStr = typeof pa.fecha_vencimiento === 'string' ? pa.fecha_vencimiento.split('T')[0] : new Date(pa.fecha_vencimiento).toISOString().split('T')[0];
      // Vencimiento a las 2:00 PM de Venezuela (14:00 VET = UTC-4)
      const fechaVencimiento2pm = new Date(`${vDateStr}T14:00:00-04:00`);
      // 2 días antes a las 2:00 PM (48h antes)
      const fecha2diasAntes2pm = new Date(fechaVencimiento2pm.getTime() - 48 * 60 * 60 * 1000);

      const cuotaLabel = pa.cuota_numero && pa.cuota_total ? `Cuota #${pa.cuota_numero} de ${pa.cuota_total}` : 'Cuota de Seguro';
      const montoFmt = `$${parseFloat(pa.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      // --- CASO 1: RECORDATORIO 2 DÍAS ANTES (48 horas antes a las 2:00 PM VET) ---
      if (ahora >= fecha2diasAntes2pm && ahora < fechaVencimiento2pm && !pa.recordatorio_2d) {
        console.log(`✉️ Enviando recordatorio preventivo de 2 días para ${cuotaLabel} de la póliza ${pa.codigo_poliza}.`);

        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.pagos.findIndex(p => p.id === pa.id);
          if (idx !== -1) {
            fData.pagos[idx].recordatorio_2d = true;
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query('UPDATE pagos SET recordatorio_2d = true WHERE id = $1', [pa.id]);
        }

        await registrarAccion(null, 'sistema', 'RECORDATORIO_PAGO_2D', `Recordatorio de pago 2 días antes enviado para ${cuotaLabel} de póliza ${pa.codigo_poliza}.`);

        // Correo al Cliente
        if (pa.cliente_correo) {
          const clientePayHtml = `
            <div style="background-color: #eff6ff; border: 1.5px solid #2563eb; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #1e3a8a; margin-top: 0;">📅 Recordatorio Preventivo de Pago</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Estimado(a) <strong>${pa.cliente_nombre}</strong>, te recordamos que tu <strong>${cuotaLabel}</strong> por un monto de <strong>${montoFmt}</strong> correspondiente a tu póliza <strong>${pa.codigo_poliza}</strong> (${pa.compania_nombre}) vence en 2 días: <strong>${vDateStr} a las 2:00 PM</strong>.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                Puedes ingresar a tu panel de cliente para reportar tu pago en Bolívares (VES) a la tasa oficial BCV y mantener tu cobertura médica activa sin interrupciones.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(pa.cliente_correo, pa.cliente_nombre, `Recordatorio: ${cuotaLabel} por ${montoFmt} vence en 2 días (${pa.codigo_poliza})`, clientePayHtml);
        }

        // Alerta al Asesor
        if (pa.asesor_correo) {
          const asesorPayHtml = `
            <div style="background-color: #f8fafc; border: 1.5px solid #64748b; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
              <h3 style="color: #1e293b; margin-top: 0;">📋 Control de Cobranza: Cuota próxima a vencer (2 días)</h3>
              <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                La <strong>${cuotaLabel}</strong> de tu cliente <strong>${pa.cliente_nombre}</strong> (${pa.codigo_poliza} - ${pa.compania_nombre}) por <strong>${montoFmt}</strong> vence el <strong>${vDateStr} a las 2:00 PM</strong>.
              </p>
            </div>
          `;
          await enviarCorreoEmailJS(pa.asesor_correo, pa.asesor_nombre, `Cobranza Preventiva: ${pa.cliente_nombre} - ${cuotaLabel} (${pa.codigo_poliza})`, asesorPayHtml);
        }
      }

      // --- CASO 2: VENCIMIENTO DEL PAGO (A partir de las 2:00 PM VET del día de vencimiento) ---
      if (ahora >= fechaVencimiento2pm && pa.estado_pago === 'pendiente') {
        console.log(`⚠️ Marcando cuota ${cuotaLabel} de la póliza ${pa.codigo_poliza} como VENCIDA (2:00 PM VET superada).`);

        // Actualizar a estado 'vencido'
        if (db.isFallback()) {
          const fallbackFilePath = './data/fallback_db.json';
          const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
          const fData = JSON.parse(fileContent);
          const idx = fData.pagos.findIndex(p => p.id === pa.id);
          if (idx !== -1) {
            fData.pagos[idx].estado_pago = 'vencido';
            fData.pagos[idx].recordatorio_vencido = true;
            fs.writeFileSync(fallbackFilePath, JSON.stringify(fData, null, 2), 'utf8');
          }
        } else {
          await db.query("UPDATE pagos SET estado_pago = 'vencido', recordatorio_vencido = true WHERE id = $1", [pa.id]);
        }

        await registrarAccion(null, 'sistema', 'CUOTA_VENCIDA', `La ${cuotaLabel} de la póliza ${pa.codigo_poliza} ha vencido hoy a las 2:00 PM.`);

        // Enviar notificación de cuota vencida
        if (!pa.recordatorio_vencido) {
          // Cliente
          if (pa.cliente_correo) {
            const clienteVencidoHtml = `
              <div style="background-color: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
                <h3 style="color: #b91c1c; margin-top: 0;">⚠️ Notificación de Cuota Vencida</h3>
                <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                  Estimado(a) <strong>${pa.cliente_nombre}</strong>, te informamos que tu <strong>${cuotaLabel}</strong> por <strong>${montoFmt}</strong> correspondiente a la póliza <strong>${pa.codigo_poliza}</strong> (${pa.compania_nombre}) ha <strong>vencido hoy a las 2:00 PM</strong>.
                </p>
                <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                  Por favor realiza y reporta tu pago a la brevedad posible para evitar la suspensión temporal de los servicios y coberturas de tu seguro médico.
                </p>
              </div>
            `;
            await enviarCorreoEmailJS(pa.cliente_correo, pa.cliente_nombre, `⚠️ Urgente: ${cuotaLabel} Vencida (${pa.codigo_poliza})`, clienteVencidoHtml);
          }

          // Asesor
          if (pa.asesor_correo) {
            const asesorVencidoHtml = `
              <div style="background-color: #fee2e2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 20px; font-family: sans-serif; text-align: left;">
                <h3 style="color: #991b1b; margin-top: 0;">⚠️ Alerta de Morosidad: Cuota Vencida</h3>
                <p style="font-size: 14px; color: #334155; line-height: 1.5;">
                  La <strong>${cuotaLabel}</strong> del cliente <strong>${pa.cliente_nombre}</strong> (${pa.codigo_poliza} - ${pa.compania_nombre}) por <strong>${montoFmt}</strong> ha vencido hoy a las 2:00 PM sin registrar pago.
                </p>
              </div>
            `;
            await enviarCorreoEmailJS(pa.asesor_correo, pa.asesor_nombre, `⚠️ Cuota Vencida: ${pa.cliente_nombre} - ${cuotaLabel} (${pa.codigo_poliza})`, asesorVencidoHtml);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error en procesarRecordatoriosPagos:', err);
  }
}
