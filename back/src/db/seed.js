import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { companiasSemilla, tarifasSemilla } from './seedData.js';

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

    // 2. Verificar si ya hay datos
    const checkComp = await client.query('SELECT COUNT(*) FROM companias_seguros');
    const compCount = parseInt(checkComp.rows[0].count);

    if (compCount > 0) {
      console.log('⚠️ Ya existen compañías registradas en la base de datos. Saltando siembra para evitar duplicados.');
      return;
    }

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

    // 5. Crear usuarios por defecto (Admin y Asesor)
    console.log('👥 Creando usuarios por defecto...');
    const hashedPass = await bcrypt.hash('admin123', 10);
    
    // Admin User
    const resAdmin = await client.query(
      `INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id`,
      ['admin@jkaseguros.com', hashedPass, 'admin']
    );
    console.log('👑 Administrador por defecto creado (admin@jkaseguros.com / admin123).');

    // Asesor User
    const resAsesor = await client.query(
      `INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING id`,
      ['asesor@jkaseguros.com', hashedPass, 'asesor']
    );
    
    // Registrar Asesor en tabla de asesores
    await client.query(
      `INSERT INTO asesores (usuario_id, nombre, codigo_asesor, correo, telefono) VALUES ($1, $2, $3, $4, $5)`,
      [resAsesor.rows[0].id, 'Juan Pérez (Asesor)', 'ASE-001', 'asesor@jkaseguros.com', '0412-1234567']
    );
    console.log('💼 Asesor por defecto creado (asesor@jkaseguros.com / admin123).');

    console.log('🎉 Siembra completada con éxito.');

  } catch (err) {
    console.error('❌ Error durante la siembra de base de datos:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

seed();
