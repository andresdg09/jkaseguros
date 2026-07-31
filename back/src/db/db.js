import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { companiasSemilla, tarifasSemilla, asesoresSemilla, clientesSemilla } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jkaseguros',
};

let pool = null;
let isFallback = false;
let fallbackData = {
  usuarios: [],
  datos_personales: [],
  asesores: [],
  companias_seguros: [],
  polizas: [],
  pagos: [],
  tarifas: [],
  logs_actividad: []
};

const fallbackFilePath = path.join(__dirname, '../../data/fallback_db.json');

// Crear la carpeta data si no existe
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Inicializar el Fallback (JSON)
function initFallback() {
  isFallback = true;
  console.log('\x1b[33m%s\x1b[0m', '⚠️ No se pudo conectar a PostgreSQL. Activando Fallback de Base de Datos JSON local.');
  console.log(`Guardando datos en: ${fallbackFilePath}`);
  
  if (fs.existsSync(fallbackFilePath)) {
    try {
      const fileContent = fs.readFileSync(fallbackFilePath, 'utf8');
      fallbackData = JSON.parse(fileContent);
      console.log('✅ Base de datos JSON cargada exitosamente.');
    } catch (e) {
      console.error('Error cargando fallback_db.json, re-creando base de datos.', e);
      seedFallback();
    }
  } else {
    seedFallback();
  }
}

// Sembrar el Fallback
function seedFallback() {
  console.log('🌱 Sembrando base de datos JSON local (Fallback)...');
  
  // Agregar Compañías
  fallbackData.companias_seguros = companiasSemilla.map((c, i) => ({
    id: i + 1,
    ...c,
    created_at: new Date().toISOString()
  }));

  // Agregar Tarifas
  fallbackData.tarifas = tarifasSemilla.map((t, i) => {
    const comp = fallbackData.companias_seguros.find(c => c.nombre === t.compania);
    const { compania, ...rest } = t;
    return {
      id: i + 1,
      compania_id: comp ? comp.id : null,
      ...rest,
      created_at: new Date().toISOString()
    };
  });

  // Agregar un Administrador por defecto
  fallbackData.usuarios.push({
    id: 1,
    correo: 'admin@jkaseguros.com',
    contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123 hashed
    rango: 'admin',
    created_at: new Date().toISOString()
  });

  // Agregar Asesores Semilla
  asesoresSemilla.forEach((a, index) => {
    const uId = index + 2; // admin es 1, los asesores empiezan en 2
    fallbackData.usuarios.push({
      id: uId,
      correo: a.correo,
      contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123
      rango: 'asesor',
      created_at: new Date().toISOString()
    });
    
    fallbackData.asesores.push({
      id: index + 1,
      usuario_id: uId,
      nombre: a.nombre,
      codigo_asesor: a.codigo,
      correo: a.correo,
      telefono: a.telefono,
      created_at: new Date().toISOString()
    });
  });

  // Agregar Clientes Semilla
  clientesSemilla.forEach((c, index) => {
    const uId = index + 5; // admin es 1, asesores son 2, 3, 4. Clientes empiezan en 5
    fallbackData.usuarios.push({
      id: uId,
      correo: c.correo,
      contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123
      rango: 'cliente',
      created_at: new Date().toISOString()
    });

    fallbackData.datos_personales.push({
      id: index + 1,
      usuario_id: uId,
      primer_nombre: c.primer_nombre,
      segundo_nombre: c.segundo_nombre,
      primer_apellido: c.primer_apellido,
      segundo_apellido: c.segundo_apellido,
      fecha_nacimiento: c.fecha_nacimiento,
      tipo_documento: c.tipo_documento,
      nro_documento: c.nro_documento,
      genero: c.genero,
      estado_civil: c.estado_civil,
      codigo_area: c.codigo_area,
      numero_celular: c.numero_celular,
      created_at: new Date().toISOString()
    });
  });

  // Agregar Pólizas Semilla
  // Póliza 1: Roberto (Client ID 1, Advisor ID 1), Vigente, Pagado
  fallbackData.polizas.push({
    id: 1,
    codigo_poliza: 'POL-882731',
    cliente_id: 1,
    asesor_id: 1,
    compania_id: 1, // Mercantil Seguros
    plan: 'PLATINO',
    area: 'Salud',
    suma_asegurada: 5000,
    deducible: 0,
    prima_anual: 260,
    estado: 'vigente',
    pago_estado: 'pagado',
    created_at: new Date().toISOString()
  });

  fallbackData.pagos.push({
    id: 1,
    poliza_id: 1,
    monto: 260,
    fecha_pago: '2026-06-15',
    estado_pago: 'pagado',
    referencia: 'REF-99887766',
    fecha_vencimiento: '2026-06-15',
    created_at: new Date().toISOString()
  });

  // Póliza 2: Lucía (Client ID 2, Advisor ID 2), Negociación, Pendiente
  fallbackData.polizas.push({
    id: 2,
    codigo_poliza: 'POL-449201',
    cliente_id: 2,
    asesor_id: 2,
    compania_id: 2, // Seguros Caracas
    plan: 'SALUD INDIVIDUAL',
    area: 'Salud',
    suma_asegurada: 30000,
    deducible: 0,
    prima_anual: 340,
    estado: 'negociacion',
    pago_estado: 'pendiente',
    created_at: new Date().toISOString()
  });

  fallbackData.pagos.push({
    id: 2,
    poliza_id: 2,
    monto: 340,
    fecha_pago: new Date().toISOString().split('T')[0],
    estado_pago: 'pendiente',
    referencia: null,
    fecha_vencimiento: '2026-08-20',
    created_at: new Date().toISOString()
  });

  // Póliza 3: Alejandro (Client ID 3, Advisor ID 3), Vencido, Pendiente
  fallbackData.polizas.push({
    id: 3,
    codigo_poliza: 'POL-102938',
    cliente_id: 3,
    asesor_id: 3,
    compania_id: 3, // Seguros Venezuela
    plan: 'BRONCE',
    area: 'Salud',
    suma_asegurada: 50000,
    deducible: 0,
    prima_anual: 450,
    estado: 'vencido',
    pago_estado: 'pendiente',
    created_at: new Date().toISOString()
  });

  fallbackData.pagos.push({
    id: 3,
    poliza_id: 3,
    monto: 450,
    fecha_pago: new Date().toISOString().split('T')[0],
    estado_pago: 'pendiente',
    referencia: null,
    fecha_vencimiento: '2026-07-10',
    created_at: new Date().toISOString()
  });

  // Agregar Logs Semilla
  fallbackData.logs_actividad.push({
    id: 1,
    usuario_id: 1,
    correo_usuario: 'admin@jkaseguros.com',
    accion: 'REGISTRO',
    descripcion: 'Administrador inicial del sistema configurado.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 2,
    usuario_id: 2,
    correo_usuario: 'asesor@jkaseguros.com',
    accion: 'REGISTRO',
    descripcion: 'Asesor Juan Pérez registrado con código ASE-001.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 3,
    usuario_id: 3,
    correo_usuario: 'maria.delgado@jkaseguros.com',
    accion: 'REGISTRO',
    descripcion: 'Asesor María Delgado registrado con código ASE-002.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 4,
    usuario_id: 5,
    correo_usuario: 'roberto.mendoza@gmail.com',
    accion: 'REGISTRO',
    descripcion: 'Asegurado Roberto Mendoza registrado en el sistema.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 5,
    usuario_id: 5,
    correo_usuario: 'roberto.mendoza@gmail.com',
    accion: 'CREACION_POLIZA',
    descripcion: 'Póliza POL-882731 emitida y aprobada para Roberto Mendoza.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 6,
    usuario_id: 5,
    correo_usuario: 'roberto.mendoza@gmail.com',
    accion: 'PAGO_REPORTADO',
    descripcion: 'Roberto Mendoza reportó pago de cuota $260. Ref: REF-99887766.',
    created_at: new Date().toISOString()
  });

  saveFallback();
  console.log('✅ Base de datos JSON sembrada exitosamente con tarifas, compañías, asesores, clientes, pólizas y pagos.');
}

function saveFallback() {
  try {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(fallbackData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error al guardar base de datos JSON:', err);
  }
}

// Intentar conectar a PostgreSQL
try {
  pool = new pg.Pool(dbConfig);
  // Probar la conexión
  const client = await pool.connect();
  console.log('✅ Conexión establecida con PostgreSQL.');
  await client.query('ALTER TABLE datos_personales ADD COLUMN IF NOT EXISTS asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL;');
  await client.query('ALTER TABLE datos_personales ADD COLUMN IF NOT EXISTS numero_hijos INT DEFAULT 0;');

  // Migración de la Matriz de Tarifas: nueva estructura por plan/edad/suma asegurada con beneficios
  await client.query('ALTER TABLE tarifas DROP CONSTRAINT IF EXISTS tarifas_tipo_cobertura_check;');
  await client.query('ALTER TABLE tarifas DROP COLUMN IF EXISTS tipo_cobertura;');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS plan VARCHAR(100);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago VARCHAR(100);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad_suma VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad_costo VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_intl_suma VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_intl_costo VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS funeral_suma VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS funeral_costo VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS at_situ_medicamentos VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas_medicas VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS examenes_lab_imagenologia VARCHAR(50);');
  await client.query('ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS ambulancia VARCHAR(50);');

  // Pólizas: la modalidad colectivo/individual se reemplaza por el nombre de plan contratado
  await client.query('ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_tipo_cobertura_check;');
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='polizas' AND column_name='tipo_cobertura') THEN
        ALTER TABLE polizas RENAME COLUMN tipo_cobertura TO plan;
      END IF;
    END $$;
  `);
  await client.query('ALTER TABLE polizas ADD COLUMN IF NOT EXISTS plan VARCHAR(100);');
  await client.query('ALTER TABLE polizas ALTER COLUMN plan DROP NOT NULL;');

  client.release();
} catch (err) {
  pool = null;
  initFallback();
}

// Emulación de consultas SQL simples sobre JSON
function fallbackQuery(text, params = []) {
  const cleanSql = text.replace(/\s+/g, ' ').trim();
  
  // 1. SELECT * FROM usuarios WHERE correo = $1
  if (cleanSql.includes('FROM usuarios WHERE correo =')) {
    const email = params[0];
    const user = fallbackData.usuarios.find(u => u.correo?.toLowerCase() === email?.toLowerCase());
    return { rows: user ? [user] : [] };
  }
  
  // 2. SELECT * FROM usuarios WHERE id = $1
  if (cleanSql.includes('FROM usuarios WHERE id =')) {
    const id = parseInt(params[0]);
    const user = fallbackData.usuarios.find(u => u.id === id);
    return { rows: user ? [user] : [] };
  }

  // 3. SELECT * FROM usuarios
  if (cleanSql === 'SELECT * FROM usuarios' || cleanSql === 'SELECT * FROM usuarios ORDER BY id ASC') {
    return { rows: fallbackData.usuarios };
  }

  // 4. INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING *
  if (cleanSql.startsWith('INSERT INTO usuarios')) {
    const [correo, contrasena, rango] = params;
    const newId = fallbackData.usuarios.length ? Math.max(...fallbackData.usuarios.map(u => u.id)) + 1 : 1;
    const newUser = {
      id: newId,
      correo,
      contrasena,
      rango: rango || 'cliente',
      created_at: new Date().toISOString()
    };
    fallbackData.usuarios.push(newUser);
    saveFallback();
    return { rows: [newUser] };
  }

  // 5. UPDATE usuarios SET rango = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE usuarios SET rango =')) {
    const [rango, id] = params;
    const userIdx = fallbackData.usuarios.findIndex(u => u.id === parseInt(id));
    if (userIdx !== -1) {
      fallbackData.usuarios[userIdx].rango = rango;
      saveFallback();
      return { rows: [fallbackData.usuarios[userIdx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 6. SELECT * FROM datos_personales WHERE usuario_id = $1
  if (cleanSql.includes('FROM datos_personales WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    const details = fallbackData.datos_personales.find(d => d.usuario_id === userId);
    return { rows: details ? [details] : [] };
  }

  // 6b. SELECT id FROM datos_personales WHERE nro_documento = $1
  if (cleanSql.includes('FROM datos_personales WHERE nro_documento =')) {
    const doc = params[0];
    const details = fallbackData.datos_personales.find(d => d.nro_documento === doc);
    return { rows: details ? [details] : [] };
  }

  // 6c. SELECT FROM datos_personales WHERE asesor_id = $1
  if (cleanSql.includes('FROM datos_personales WHERE asesor_id =')) {
    const aseId = parseInt(params[0]);
    const details = fallbackData.datos_personales.filter(d => d.asesor_id === aseId);
    return { rows: details };
  }

  // 7. INSERT INTO datos_personales (columnas leídas dinámicamente del SQL para soportar distintos llamadores)
  if (cleanSql.startsWith('INSERT INTO datos_personales')) {
    const colMatch = cleanSql.match(/INSERT INTO datos_personales\s*\(([^)]+)\)/i);
    const columns = colMatch ? colMatch[1].split(',').map(c => c.trim()) : [];

    const newId = fallbackData.datos_personales.length ? Math.max(...fallbackData.datos_personales.map(d => d.id)) + 1 : 1;
    const newPerson = { id: newId, created_at: new Date().toISOString() };

    columns.forEach((col, i) => {
      let val = params[i];
      if (col === 'usuario_id' || col === 'asesor_id') val = val ? parseInt(val) : null;
      if (col === 'numero_hijos') val = (val !== undefined && val !== null && val !== '') ? parseInt(val) : 0;
      newPerson[col] = val;
    });

    // Si ya existe uno con este usuario_id, lo quitamos
    if (newPerson.usuario_id) {
      fallbackData.datos_personales = fallbackData.datos_personales.filter(d => d.usuario_id !== newPerson.usuario_id);
    }

    fallbackData.datos_personales.push(newPerson);
    saveFallback();
    return { rows: [newPerson] };
  }

  // 8. UPDATE datos_personales (columnas y WHERE leídos dinámicamente del SQL)
  if (cleanSql.startsWith('UPDATE datos_personales SET')) {
    const setMatch = cleanSql.match(/UPDATE datos_personales SET (.+) WHERE usuario_id = \$(\d+)/i);
    if (!setMatch) return { rows: [] };

    const whereParamIdx = parseInt(setMatch[2]) - 1;
    const usuario_id = parseInt(params[whereParamIdx]);
    const idx = fallbackData.datos_personales.findIndex(d => d.usuario_id === usuario_id);
    if (idx !== -1) {
      const assignments = setMatch[1].split(',').map(s => s.trim());
      assignments.forEach(assignment => {
        const [col, placeholder] = assignment.split('=').map(s => s.trim());
        const paramIdx = parseInt(placeholder.replace('$', '')) - 1;
        let val = params[paramIdx];
        if (col === 'numero_hijos') val = (val !== undefined && val !== null && val !== '') ? parseInt(val) : 0;
        fallbackData.datos_personales[idx][col] = val;
      });

      saveFallback();
      return { rows: [fallbackData.datos_personales[idx]] };
    }
    return { rows: [] };
  }

  // 9. SELECT * FROM asesores
  if (cleanSql.includes('FROM asesores WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    const advisor = fallbackData.asesores.find(a => a.usuario_id === userId);
    return { rows: advisor ? [advisor] : [] };
  }

  if (cleanSql.includes('FROM asesores ORDER BY id ASC LIMIT 1') || cleanSql.startsWith('SELECT id FROM asesores')) {
    const sorted = [...fallbackData.asesores].sort((a, b) => a.id - b.id);
    return { rows: sorted.length > 0 ? [{ id: sorted[0].id }] : [] };
  }

  if (cleanSql.includes('COALESCE(a.id, u.id)') || cleanSql.includes("u.rango = 'asesor'")) {
    const list = fallbackData.usuarios
      .filter(u => u.rango === 'asesor')
      .map(u => {
        const a = fallbackData.asesores.find(adv => adv.usuario_id === u.id);
        const dp = fallbackData.datos_personales.find(d => d.usuario_id === u.id);
        let nombre = u.correo;
        if (a && a.nombre) {
          nombre = a.nombre;
        } else if (dp && dp.primer_nombre) {
          nombre = `${dp.primer_nombre} ${dp.primer_apellido}`;
        }
        let tel = 'N/A';
        if (a && a.telefono) {
          tel = a.telefono;
        } else if (dp && dp.numero_celular) {
          tel = `${dp.codigo_area}-${dp.numero_celular}`;
        }
        return {
          id: a ? a.id : u.id,
          nombre,
          codigo_asesor: a ? a.codigo_asesor : `ASE-${u.id}`,
          telefono: tel,
          correo: u.correo
        };
      });
    list.sort((x, y) => x.nombre.localeCompare(y.nombre));
    return { rows: list };
  }

  if (cleanSql.startsWith('SELECT * FROM asesores')) {
    return { rows: fallbackData.asesores };
  }

  // 10. SELECT ... FROM companias_seguros (con o sin columnas explícitas / ORDER BY)
  if (cleanSql.includes('FROM companias_seguros')) {
    const sorted = [...fallbackData.companias_seguros];
    if (cleanSql.includes('ORDER BY nombre')) sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { rows: sorted };
  }

  // 11. SELECT * FROM tarifas
  if (cleanSql.startsWith('SELECT * FROM tarifas') || cleanSql.includes('FROM tarifas')) {
    const result = fallbackData.tarifas.map(t => {
      const comp = fallbackData.companias_seguros.find(c => c.id === t.compania_id);
      return {
        ...t,
        compania_nombre: comp ? comp.nombre : 'Desconocida'
      };
    });
    return { rows: result };
  }

  // 12. SELECT * FROM polizas
  if (cleanSql.startsWith('SELECT * FROM polizas') || cleanSql.includes('FROM polizas')) {
    let result = [...fallbackData.polizas];
    
    // Unir con cliente (datos_personales) y asesor (asesores) y compañía
    result = result.map(p => {
      const cliente = fallbackData.datos_personales.find(d => d.id === p.cliente_id);
      const asesor = fallbackData.asesores.find(a => a.id === p.asesor_id);
      const compania = fallbackData.companias_seguros.find(c => c.id === p.compania_id);
      return {
        ...p,
        cliente_nombre: cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : 'Cliente Desconocido',
        cliente_email: cliente ? fallbackData.usuarios.find(u => u.id === cliente.usuario_id)?.correo : '',
        asesor_nombre: asesor ? asesor.nombre : 'Sin Asesor',
        compania_nombre: compania ? compania.nombre : 'Desconocida'
      };
    });

    if (cleanSql.includes('cliente_id = $1')) {
      const cliId = parseInt(params[0]);
      result = result.filter(p => p.cliente_id === cliId);
    } else if (cleanSql.includes('asesor_id = $1')) {
      const aseId = parseInt(params[0]);
      result = result.filter(p => p.asesor_id === aseId);
    }
    
    return { rows: result };
  }

  // 13. INSERT INTO polizas (columnas y VALUES leídos del SQL: algunos valores son placeholders $n, otros literales)
  if (cleanSql.startsWith('INSERT INTO polizas')) {
    const colMatch = cleanSql.match(/INSERT INTO polizas\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    const columns = colMatch[1].split(',').map(c => c.trim());
    const valueExprs = colMatch[2].split(',').map(v => v.trim());

    const row = {};
    columns.forEach((col, i) => {
      const expr = valueExprs[i];
      const placeholderMatch = expr.match(/^\$(\d+)$/);
      let val;
      if (placeholderMatch) {
        val = params[parseInt(placeholderMatch[1]) - 1];
      } else if (/^'.*'$/.test(expr)) {
        val = expr.slice(1, -1);
      } else if (!isNaN(parseFloat(expr))) {
        val = parseFloat(expr);
      } else {
        val = expr;
      }
      row[col] = val;
    });

    const newId = fallbackData.polizas.length ? Math.max(...fallbackData.polizas.map(p => p.id)) + 1 : 1;
    const newPol = {
      id: newId,
      codigo_poliza: row.codigo_poliza,
      cliente_id: parseInt(row.cliente_id),
      asesor_id: row.asesor_id ? parseInt(row.asesor_id) : null,
      compania_id: parseInt(row.compania_id),
      plan: row.plan || null,
      area: row.area || 'Salud',
      suma_asegurada: parseFloat(row.suma_asegurada),
      deducible: parseFloat(row.deducible || 0),
      prima_anual: parseFloat(row.prima_anual),
      estado: row.estado || 'negociacion',
      pago_estado: row.pago_estado || 'pendiente',
      created_at: new Date().toISOString()
    };
    fallbackData.polizas.push(newPol);

    // Crear un pago automático pendiente para esta póliza
    const payId = fallbackData.pagos.length ? Math.max(...fallbackData.pagos.map(pa => pa.id)) + 1 : 1;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    fallbackData.pagos.push({
      id: payId,
      poliza_id: newId,
      monto: newPol.prima_anual,
      fecha_pago: new Date().toISOString().split('T')[0],
      estado_pago: 'pendiente',
      referencia: null,
      fecha_vencimiento: nextMonth.toISOString().split('T')[0],
      created_at: new Date().toISOString()
    });

    saveFallback();
    return { rows: [newPol] };
  }

  // 14. UPDATE polizas SET estado = $1
  if (cleanSql.startsWith('UPDATE polizas SET estado =')) {
    const [estado, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].estado = estado;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 15. SELECT * FROM pagos
  if (cleanSql.startsWith('SELECT * FROM pagos') || cleanSql.includes('FROM pagos')) {
    let result = [...fallbackData.pagos];
    
    if (cleanSql.includes('poliza_id = $1')) {
      const polId = parseInt(params[0]);
      result = result.filter(pa => pa.poliza_id === polId);
    } else if (cleanSql.includes('poliza_id IN (')) {
      // Filtrado por lista de ids de polizas del cliente
      const ids = params; // simplificamos asumiendo que los params son los ids
      result = result.filter(pa => ids.includes(pa.poliza_id));
    }
    
    // Cruzar con detalles de póliza
    result = result.map(pa => {
      const pol = fallbackData.polizas.find(p => p.id === pa.poliza_id);
      const compania = pol ? fallbackData.companias_seguros.find(c => c.id === pol.compania_id) : null;
      return {
        ...pa,
        poliza_codigo: pol ? pol.codigo_poliza : '',
        compania_nombre: compania ? compania.nombre : 'Seguros'
      };
    });

    return { rows: result };
  }

  // 16. INSERT INTO pagos
  if (cleanSql.startsWith('INSERT INTO pagos')) {
    const [poliza_id, monto, fecha_pago, estado_pago, referencia, fecha_vencimiento] = params;
    const newId = fallbackData.pagos.length ? Math.max(...fallbackData.pagos.map(pa => pa.id)) + 1 : 1;
    const newPay = {
      id: newId,
      poliza_id: parseInt(poliza_id),
      monto: parseFloat(monto),
      fecha_pago: fecha_pago || new Date().toISOString().split('T')[0],
      estado_pago: estado_pago || 'pendiente',
      referencia: referencia || null,
      fecha_vencimiento: fecha_vencimiento || null,
      created_at: new Date().toISOString()
    };
    fallbackData.pagos.push(newPay);
    saveFallback();
  }

  // 17. DELETE FROM asesores WHERE usuario_id = $1
  if (cleanSql.startsWith('DELETE FROM asesores WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    fallbackData.asesores = fallbackData.asesores.filter(a => a.usuario_id !== userId);
    saveFallback();
    return { rowCount: 1 };
  }

  // 18. UPDATE polizas SET asesor_id = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE polizas SET asesor_id =')) {
    const [asesorId, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].asesor_id = asesorId ? parseInt(asesorId) : null;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 19. UPDATE pagos SET referencia = $1, estado_pago = $2 WHERE id = $3 or UPDATE pagos SET estado_pago = $1 ...
  if (cleanSql.startsWith('UPDATE pagos SET')) {
    const id = parseInt(params[2]);
    const idx = fallbackData.pagos.findIndex(pa => pa.id === id);
    if (idx !== -1) {
      if (cleanSql.includes('referencia = $1, estado_pago = $2') || cleanSql.includes('referencia = $1 , estado_pago = $2')) {
        fallbackData.pagos[idx].referencia = params[0];
        fallbackData.pagos[idx].estado_pago = params[1];
      } else {
        fallbackData.pagos[idx].estado_pago = params[0];
        fallbackData.pagos[idx].referencia = params[1];
      }
      saveFallback();
      return { rows: [fallbackData.pagos[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 20. UPDATE polizas SET pago_estado = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE polizas SET pago_estado =')) {
    const [pago_estado, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].pago_estado = pago_estado;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 21. INSERT INTO logs_actividad
  if (cleanSql.startsWith('INSERT INTO logs_actividad')) {
    const [usuario_id, correo_usuario, accion, descripcion] = params;
    const newId = fallbackData.logs_actividad.length ? Math.max(...fallbackData.logs_actividad.map(l => l.id)) + 1 : 1;
    const newLog = {
      id: newId,
      usuario_id: usuario_id ? parseInt(usuario_id) : null,
      correo_usuario: correo_usuario || 'sistema',
      accion,
      descripcion,
      created_at: new Date().toISOString()
    };
    fallbackData.logs_actividad.push(newLog);
    saveFallback();
    return { rows: [newLog] };
  }

  // 22. SELECT * FROM logs_actividad
  if (cleanSql.startsWith('SELECT * FROM logs_actividad') || cleanSql.includes('FROM logs_actividad')) {
    const sorted = [...fallbackData.logs_actividad].sort((a, b) => b.id - a.id);
    return { rows: sorted };
  }

  console.log(`⚠️ Consulta SQL no emulada en fallback: "${cleanSql}"`);
  return { rows: [] };
}

// Exportar interfaz de consultas
export const db = {
  isFallback: () => isFallback,
  query: async (text, params) => {
    if (isFallback || !pool) {
      return fallbackQuery(text, params);
    }
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('Error ejecutando query en Postgres, reintentando con fallback.', err);
      // Intentar fallback si falla la BD en caliente
      if (!isFallback) initFallback();
      return fallbackQuery(text, params);
    }
  }
};
export default db;
