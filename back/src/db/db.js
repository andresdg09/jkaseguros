import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { companiasSemilla, tarifasSemilla } from './seedData.js';

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
  tarifas: []
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
  console.log('🌱 Sembrando base de datos JSON local...');
  
  // Agregar Compañías
  fallbackData.companias_seguros = companiasSemilla.map((c, i) => ({
    id: i + 1,
    ...c,
    created_at: new Date().toISOString()
  }));

  // Agregar Tarifas
  fallbackData.tarifas = tarifasSemilla.map((t, i) => {
    const comp = fallbackData.companias_seguros.find(c => c.nombre === t.compania);
    return {
      id: i + 1,
      compania_id: comp ? comp.id : null,
      tipo_cobertura: t.tipo_cobertura,
      edad_min: t.edad_min,
      edad_max: t.edad_max,
      suma_asegurada: t.suma_asegurada,
      prima: t.prima,
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

  // Agregar un Asesor por defecto
  fallbackData.usuarios.push({
    id: 2,
    correo: 'asesor@jkaseguros.com',
    contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123 hashed
    rango: 'asesor',
    created_at: new Date().toISOString()
  });

  fallbackData.asesores.push({
    id: 1,
    usuario_id: 2,
    nombre: 'Juan Pérez (Asesor)',
    codigo_asesor: 'ASE-001',
    correo: 'asesor@jkaseguros.com',
    telefono: '0412-1234567',
    created_at: new Date().toISOString()
  });

  saveFallback();
  console.log('✅ Base de datos JSON sembrada exitosamente con tarifas e info de compañías.');
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

  // 7. INSERT INTO datos_personales
  if (cleanSql.startsWith('INSERT INTO datos_personales')) {
    const [
      usuario_id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
    ] = params;
    
    const newId = fallbackData.datos_personales.length ? Math.max(...fallbackData.datos_personales.map(d => d.id)) + 1 : 1;
    const newPerson = {
      id: newId,
      usuario_id: usuario_id ? parseInt(usuario_id) : null,
      primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular,
      created_at: new Date().toISOString()
    };
    
    // Si ya existe uno con este usuario_id, lo quitamos
    if (usuario_id) {
      fallbackData.datos_personales = fallbackData.datos_personales.filter(d => d.usuario_id !== parseInt(usuario_id));
    }
    
    fallbackData.datos_personales.push(newPerson);
    saveFallback();
    return { rows: [newPerson] };
  }

  // 8. UPDATE datos_personales
  if (cleanSql.startsWith('UPDATE datos_personales SET')) {
    // Para simplificar, si es un update, buscaremos por usuario_id
    const usuario_id = parseInt(params[params.length - 1]); // Asumimos que usuario_id es el último parámetro en la query
    const idx = fallbackData.datos_personales.findIndex(d => d.usuario_id === usuario_id);
    if (idx !== -1) {
      // Reemplazamos/actualizamos los campos del perfil
      const [
        primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
      ] = params;
      
      fallbackData.datos_personales[idx] = {
        ...fallbackData.datos_personales[idx],
        primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, tipo_documento, nro_documento, genero, estado_civil, codigo_area, numero_celular
      };
      
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

  if (cleanSql.startsWith('SELECT * FROM asesores')) {
    return { rows: fallbackData.asesores };
  }

  // 10. SELECT * FROM companias_seguros
  if (cleanSql.startsWith('SELECT * FROM companias_seguros')) {
    return { rows: fallbackData.companias_seguros };
  }

  // 11. SELECT * FROM tarifas
  if (cleanSql.startsWith('SELECT * FROM tarifas')) {
    return { rows: fallbackData.tarifas };
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

  // 13. INSERT INTO polizas
  if (cleanSql.startsWith('INSERT INTO polizas')) {
    const [codigo_poliza, cliente_id, asesor_id, compania_id, tipo_cobertura, area, suma_asegurada, deducible, prima_anual, estado, pago_estado] = params;
    const newId = fallbackData.polizas.length ? Math.max(...fallbackData.polizas.map(p => p.id)) + 1 : 1;
    const newPol = {
      id: newId,
      codigo_poliza,
      cliente_id: parseInt(cliente_id),
      asesor_id: asesor_id ? parseInt(asesor_id) : null,
      compania_id: parseInt(compania_id),
      tipo_cobertura,
      area: area || 'Salud',
      suma_asegurada: parseFloat(suma_asegurada),
      deducible: parseFloat(deducible || 0),
      prima_anual: parseFloat(prima_anual),
      estado: estado || 'negociacion',
      pago_estado: pago_estado || 'pendiente',
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
      monto: parseFloat(prima_anual),
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
    return { rows: [newPay] };
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
