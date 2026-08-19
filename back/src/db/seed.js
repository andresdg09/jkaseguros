import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { companiasSemilla, tarifasSemilla, asesoresSemilla, clientesSemilla } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jkaseguros';

async function seed() {
  function parsePagoMetodos(pagoStr) {
    const s = String(pagoStr || '').toUpperCase();
    return {
      pago_contado: s.includes('CONT') || s.includes('ANUAL') || s.includes('CONTADO'),
      pago_semestral: s.includes('SEM') || s.includes('SEMESTRAL'),
      pago_trimestral: s.includes('TRIM') || s.includes('TRIMESTRAL'),
      pago_mensual: s.includes('MENS') || s.includes('MEN') || s.includes('MENSUAL')
    };
  }
  console.log('🌱 Iniciando siembra de base de datos PostgreSQL...');
  
  const pool = new pg.Pool({ connectionString });
  let client;

  try {
    client = await pool.connect();
    console.log('🔌 Conectado a PostgreSQL.');

    // 1. Ejecutar Schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('📋 Esquema de tablas creado.');

    // 2. Limpiar tablas para siembra fresca
    console.log('🧹 Limpiando tablas existentes para una siembra limpia...');
    await client.query(`
      TRUNCATE TABLE 
        companias_seguros, 
        tarifas, 
        usuarios, 
        datos_personales, 
        asesores, 
        polizas, 
        pagos, 
        logs_actividad,
        matriz_comisiones,
        corridas_comisiones,
        historico_comisiones
      RESTART IDENTITY CASCADE
    `);

    // 3. Insertar Compañías de Seguros
    console.log('🏢 Registrando compañías de seguros...');
    const idMap = {}; // Nombre -> ID asignado en DB

    for (const c of companiasSemilla) {
      const res = await client.query(
        `INSERT INTO companias_seguros (nombre) VALUES ($1) RETURNING id`,
        [c.nombre]
      );
      idMap[c.nombre] = res.rows[0].id;
    }
    console.log('✅ Compañías registradas.');

    // 4. Insertar Tarifas (Matriz por plan / edad / suma asegurada, con beneficios)
    console.log('📈 Registrando matriz de tarifas...');
    for (const t of tarifasSemilla) {
      const compania_id = idMap[t.compania];
      if (!compania_id) continue;

      const metodos = parsePagoMetodos(t.pago);
      const q = `
        INSERT INTO tarifas (
          compania_id, edad_min, edad_max, suma_asegurada, prima,
          plan, pago, pago_contado, pago_semestral, pago_trimestral, pago_mensual,
          maternidad_suma, maternidad_costo, asist_intl_suma, asist_intl_costo,
          funeral_suma, funeral_costo, at_situ_medicamentos, consultas_medicas, examenes_lab_imagenologia, ambulancia, ramo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      `;
      await client.query(q, [
        compania_id, t.edad_min, t.edad_max, t.suma_asegurada, t.prima,
        t.plan, t.pago, metodos.pago_contado, metodos.pago_semestral, metodos.pago_trimestral, metodos.pago_mensual,
        t.maternidad_suma, t.maternidad_costo, t.asist_intl_suma, t.asist_intl_costo,
        t.funeral_suma, t.funeral_costo, t.at_situ_medicamentos, t.consultas_medicas, t.examenes_lab_imagenologia, t.ambulancia,
        t.ramo || 'Salud'
      ]);
    }
    console.log('✅ Tarifas registradas.');

    // 5. Crear usuarios por defecto (Admin, Asesores y Clientes)
    console.log('👥 Creando usuarios por defecto, asesores y clientes...');
    const hashedPass = await bcrypt.hash('admin123', 10);
    const advisorHashedPass = await bcrypt.hash('123456789', 10);
    
    // Admin User
    const adminCheck = await client.query('SELECT id FROM usuarios WHERE correo = $1', ['admin@jkaseguros.com']);
    let adminId;
    if (adminCheck.rows.length === 0) {
      const resAdmin = await client.query(
        `INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id`,
        ['admin@jkaseguros.com', hashedPass, 'admin']
      );
      adminId = resAdmin.rows[0].id;
    } else {
      adminId = adminCheck.rows[0].id;
    }
    console.log('👑 Administrador registrado (admin@jkaseguros.com / admin123).');
 
    // Registrar Asesores Semilla
    const advisorDbIds = [];
    for (const a of asesoresSemilla) {
      const userCheck = await client.query('SELECT id FROM usuarios WHERE correo = $1', [a.correo]);
      let userId;
      if (userCheck.rows.length === 0) {
        const res = await client.query(
          `INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id`,
          [a.correo, advisorHashedPass, 'asesor']
        );
        userId = res.rows[0].id;
      } else {
        userId = userCheck.rows[0].id;
      }
 
      const advCheck = await client.query('SELECT id FROM asesores WHERE usuario_id = $1', [userId]);
      let advId;
      if (advCheck.rows.length === 0) {
        const res = await client.query(
          `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [userId, a.nombre, a.codigo, a.correo, a.telefono]
        );
        advId = res.rows[0].id;
      } else {
        advId = advCheck.rows[0].id;
      }
      advisorDbIds.push(advId);
    }
    console.log('💼 Asesores registrados (ASE-001).');
 
    // Registrar Clientes Semilla
    const clientDbIds = [];
    for (const c of clientesSemilla) {
      const userCheck = await client.query('SELECT id FROM usuarios WHERE correo = $1', [c.correo]);
      let userId;
      if (userCheck.rows.length === 0) {
        const res = await client.query(
          `INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id`,
          [c.correo, hashedPass, 'cliente']
        );
        userId = res.rows[0].id;
      } else {
        userId = userCheck.rows[0].id;
      }
 
      const personalCheck = await client.query('SELECT id FROM datos_personales WHERE usuario_id = $1', [userId]);
      let clientDbId;
      if (personalCheck.rows.length === 0) {
        const res = await client.query(
          `INSERT INTO datos_personales (
            usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
            fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [
            userId, c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido,
            c.fecha_nacimiento, c.tipo_documento, c.nro_documento, c.genero, c.estado_civil, c.codigo_area, c.numero_celular
          ]
        );
        clientDbId = res.rows[0].id;
      } else {
        clientDbId = personalCheck.rows[0].id;
      }
      clientDbIds.push(clientDbId);
    }
    console.log('👤 Clientes registrados (Jorge Fanianos).');
 
    // 6. Sembrar Pólizas y Pagos Muestra
    console.log('📜 Sembrando pólizas y cobranzas muestra...');
    const polizasCheck = await client.query('SELECT COUNT(*) FROM polizas');
    if (parseInt(polizasCheck.rows[0].count) === 0) {
      // Póliza 1: Jorge (Vigente, Pagado)
      const resPol1 = await client.query(`
        INSERT INTO polizas (codigo_poliza, cliente_id, asesor_id, compania_id, plan, suma_asegurada, deducible, prima_anual, estado, pago_estado)
        VALUES ('POL-882731', $1, $2, $3, 'ACCESS', 50000, 0, 740, 'vigente', 'pagado') RETURNING id
      `, [clientDbIds[0], advisorDbIds[0], idMap['Mercantil Seguros'] || 1]);
 
      await client.query(`
        INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento)
        VALUES ($1, 740, 'pagado', 'REF-99887766', '2026-06-15')
      `, [resPol1.rows[0].id]);
 
      // Póliza 2: Jorge (Negociación, Pendiente)
      const resPol2 = await client.query(`
        INSERT INTO polizas (codigo_poliza, cliente_id, asesor_id, compania_id, plan, suma_asegurada, deducible, prima_anual, estado, pago_estado)
        VALUES ('POL-449201', $1, $2, $3, 'ACCESS', 30000, 0, 657, 'negociacion', 'pendiente') RETURNING id
      `, [clientDbIds[0], advisorDbIds[0], idMap['Seguros Caracas'] || 2]);
 
      await client.query(`
        INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento)
        VALUES ($1, 657, 'pendiente', null, '2026-08-20')
      `, [resPol2.rows[0].id]);
    }
    console.log('✅ Pólizas y pagos sembrados.');

    // 6.5 Sembrar Matriz de Comisiones
    console.log('📊 Sembrando matriz de comisiones...');
    const scId = idMap['Seguros Caracas'] || 2;
    const mfId = idMap['Mapfre Seguros'] || 4;
    const msId = idMap['Mercantil Seguros'] || 1;

    await client.query(`
      INSERT INTO matriz_comisiones (mercado, compania_id, ramo, producto_modalidad, total_comision, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente)
      VALUES 
        ('Nacionales', $1, 'Salud', 'Cobertura Nacionales - Nuevo - Renovacion', 22.5, 17.0, 15.0, 17.0, 0, 0),
        ('Nacionales', $2, 'Patrimoniales', 'Incendio', 40.0, 30.0, 28.0, 30.0, 0, 0),
        ('Internacionales', $3, 'Salud', 'Nuevo', 15.0, 0, 0, 0, 10.0, 8.0)
    `, [scId, mfId, msId]);
    console.log('✅ Matriz de comisiones sembrada.');

    // 7. Sembrar Historial de Logs
    console.log('📝 Sembrando logs de trazabilidad...');
    const logsCheck = await client.query('SELECT COUNT(*) FROM logs_actividad');
    if (parseInt(logsCheck.rows[0].count) === 0) {
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('admin@jkaseguros.com', 'REGISTRO', 'Administrador inicial del sistema configurado.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('info@jkaconsultores.com', 'REGISTRO', 'Asesor Johann Joubert registrado con código ASE-001.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('fanianosj@gmail.com', 'REGISTRO', 'Asegurado Jorge Fanianos registrado en el sistema.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('fanianosj@gmail.com', 'CREACION_POLIZA', 'Póliza POL-882731 emitida y aprobada para Jorge Fanianos.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('fanianosj@gmail.com', 'PAGO_REPORTADO', 'Jorge Fanianos reportó pago de cuota $740. Ref: REF-99887766.')`);
    }
    console.log('✅ Logs de actividad registrados.');

    console.log('🎉 Siembra completada con éxito.');

  } catch (err) {
    console.error('❌ Error durante la siembra de base de datos:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

seed();
