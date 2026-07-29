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
        logs_actividad 
      RESTART IDENTITY CASCADE
    `);

    // 3. Insertar Compañías de Seguros
    console.log('🏢 Registrando compañías de seguros y características...');
    const idMap = {}; // Nombre -> ID asignado en DB
    
    for (const c of companiasSemilla) {
      const q = `
        INSERT INTO companias_seguros (
          nombre, col_suma_salud, col_deducible, col_maternidad, col_suma_maternidad,
          col_cobertura_inmediata, col_examenes, col_espera_inicial, col_cantidad_minima,
          col_admisibilidad, col_preexistencias, col_admisibilidad_nuevas, col_preexistencias_nuevas,
          col_espera_nuevas, col_cobertura_geografica, col_asistencia_internacional, col_condiciones_pago,
          ind_admisibilidad, ind_suma_salud, ind_deducible, ind_maternidad, ind_deducible_maternidad,
          ind_asistencia_internacional, ind_espera_exterior, ind_examenes, ind_espera_vzla, ind_condiciones_pago
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        ) RETURNING id
      `;
      const params = [
        c.nombre, c.col_suma_salud, c.col_deducible, c.col_maternidad, c.col_suma_maternidad,
        c.col_cobertura_inmediata, c.col_examenes, c.col_espera_inicial, c.col_cantidad_minima,
        c.col_admisibilidad, c.col_preexistencias, c.col_admisibilidad_nuevas, c.col_preexistencias_nuevas,
        c.col_espera_nuevas, c.col_cobertura_geografica, c.col_asistencia_internacional, c.col_condiciones_pago,
        c.ind_admisibilidad, c.ind_suma_salud, c.ind_deducible, c.ind_maternidad, c.ind_deducible_maternidad,
        c.ind_asistencia_internacional, c.ind_espera_exterior, c.ind_examenes, c.ind_espera_vzla, c.ind_condiciones_pago
      ];
      
      const res = await client.query(q, params);
      idMap[c.nombre] = res.rows[0].id;
    }
    console.log('✅ Compañías registradas.');

    // 4. Insertar Tarifas
    console.log('📈 Registrando matriz de tarifas...');
    for (const t of tarifasSemilla) {
      const compania_id = idMap[t.compania];
      if (!compania_id) continue;
      
      const q = `
        INSERT INTO tarifas (
          compania_id, tipo_cobertura, edad_min, edad_max, suma_asegurada, prima
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(q, [compania_id, t.tipo_cobertura, t.edad_min, t.edad_max, t.suma_asegurada, t.prima]);
    }
    console.log('✅ Tarifas registradas.');

    // 5. Crear usuarios por defecto (Admin, Asesores y Clientes)
    console.log('👥 Creando usuarios por defecto, asesores y clientes...');
    const hashedPass = await bcrypt.hash('admin123', 10);
    
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
          [a.correo, hashedPass, 'asesor']
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
    console.log('💼 Asesores registrados (ASE-001, ASE-002, ASE-003).');

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
    console.log('👤 Clientes registrados (Roberto, Lucía, Alejandro).');

    // 6. Sembrar Pólizas y Pagos Muestra
    console.log('📜 Sembrando pólizas y cobranzas muestra...');
    const polizasCheck = await client.query('SELECT COUNT(*) FROM polizas');
    if (parseInt(polizasCheck.rows[0].count) === 0) {
      // Póliza 1: Roberto (Vigente, Pagado)
      const resPol1 = await client.query(`
        INSERT INTO polizas (codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura, suma_asegurada, deducible, prima_anual, estado, pago_estado)
        VALUES ('POL-882731', $1, $2, $3, 'colectivo', 5000, 0, 260, 'vigente', 'pagado') RETURNING id
      `, [clientDbIds[0], advisorDbIds[0], idMap['Seguros Pirámides'] || 1]);
      
      await client.query(`
        INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento)
        VALUES ($1, 260, 'pagado', 'REF-99887766', '2026-06-15')
      `, [resPol1.rows[0].id]);

      // Póliza 2: Lucía (Negociación, Pendiente)
      const resPol2 = await client.query(`
        INSERT INTO polizas (codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura, suma_asegurada, deducible, prima_anual, estado, pago_estado)
        VALUES ('POL-449201', $1, $2, $3, 'individual', 3000, 0, 340, 'negociacion', 'pendiente') RETURNING id
      `, [clientDbIds[1], advisorDbIds[1], idMap['Mercantil Seguros'] || 3]);

      await client.query(`
        INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento)
        VALUES ($1, 340, 'pendiente', null, '2026-08-20')
      `, [resPol2.rows[0].id]);

      // Póliza 3: Alejandro (Vencido, Pendiente)
      const resPol3 = await client.query(`
        INSERT INTO polizas (codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura, suma_asegurada, deducible, prima_anual, estado, pago_estado)
        VALUES ('POL-102938', $1, $2, $3, 'colectivo', 10000, 0, 450, 'vencido', 'pendiente') RETURNING id
      `, [clientDbIds[2], advisorDbIds[2], idMap['Seguros Caracas'] || 5]);

      await client.query(`
        INSERT INTO pagos (poliza_id, monto, estado_pago, referencia, fecha_vencimiento)
        VALUES ($1, 450, 'pendiente', null, '2026-07-10')
      `, [resPol3.rows[0].id]);
    }
    console.log('✅ Pólizas y pagos sembrados.');

    // 7. Sembrar Historial de Logs
    console.log('📝 Sembrando logs de trazabilidad...');
    const logsCheck = await client.query('SELECT COUNT(*) FROM logs_actividad');
    if (parseInt(logsCheck.rows[0].count) === 0) {
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('admin@jkaseguros.com', 'REGISTRO', 'Administrador inicial del sistema configurado.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('asesor@jkaseguros.com', 'REGISTRO', 'Asesor Juan Pérez registrado con código ASE-001.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('maria.delgado@jkaseguros.com', 'REGISTRO', 'Asesor María Delgado registrado con código ASE-002.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('roberto.mendoza@gmail.com', 'REGISTRO', 'Asegurado Roberto Mendoza registrado en el sistema.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('roberto.mendoza@gmail.com', 'CREACION_POLIZA', 'Póliza POL-882731 emitida y aprobada para Roberto Mendoza.')`);
      await client.query(`INSERT INTO logs_actividad (correo_usuario, accion, descripcion) VALUES ('roberto.mendoza@gmail.com', 'PAGO_REPORTADO', 'Roberto Mendoza reportó pago de cuota $260. Ref: REF-99887766.')`);
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
