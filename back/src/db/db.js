import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { companiasSemilla, tarifasSemilla, asesoresSemilla, clientesSemilla } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jkaseguros',
  // Proveedores como Neon/Render firman con una CA que Node no siempre trae confiada por defecto;
  // sin esto pg rechaza el handshake TLS y el pool nunca llega a conectar.
  ...(process.env.DATABASE_URL ? { ssl: { rejectUnauthorized: false } } : {}),
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
  logs_actividad: [],
  elearning_courses: [],
  elearning_modules: [],
  elearning_attempts: []
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
      if (!fallbackData.usuarios) fallbackData.usuarios = [];
      if (!fallbackData.datos_personales) fallbackData.datos_personales = [];
      if (!fallbackData.asesores) fallbackData.asesores = [];
      if (!fallbackData.companias_seguros) fallbackData.companias_seguros = [];
      if (!fallbackData.polizas) fallbackData.polizas = [];
      if (!fallbackData.pagos) fallbackData.pagos = [];
      if (!fallbackData.tarifas) fallbackData.tarifas = [];
      if (!fallbackData.logs_actividad) fallbackData.logs_actividad = [];
      if (!fallbackData.elearning_courses) fallbackData.elearning_courses = [];
      if (!fallbackData.elearning_modules) fallbackData.elearning_modules = [];
      if (!fallbackData.elearning_attempts) fallbackData.elearning_attempts = [];
      seedFallbackElearning();
      if (!fallbackData.tarifario_metadata) {
        fallbackData.tarifario_metadata = {
          version: '1.0.0',
          ultima_modificacion: new Date().toISOString(),
          usuario_correo: 'admin@jkaseguros.com'
        };
      }
      console.log('✅ Base de datos JSON cargada exitosamente.');
    } catch (e) {
      console.error('Error cargando fallback_db.json, re-creando base de datos.', e);
      seedFallback();
    }
  } else {
    seedFallback();
  }
}

// Sembrar e-learning en Fallback
function seedFallbackElearning() {
  if (!fallbackData.elearning_courses || fallbackData.elearning_courses.length === 0) {
    fallbackData.elearning_courses = [
      {
        id: 1,
        titulo: 'Curso básico de negociación',
        descripcion: 'Aprende los fundamentos y estrategias para cerrar acuerdos exitosos.',
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        titulo: 'Curso de seguros',
        descripcion: 'Conceptos fundamentales de pólizas de salud, vida y automotores.',
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        titulo: 'Curso de cómo se usa el sistema',
        descripcion: 'Guía rápida para cotizar y gestionar solicitudes en la plataforma JKA Seguros.',
        created_at: new Date().toISOString()
      }
    ];

    fallbackData.elearning_modules = [
      {
        id: 1,
        curso_id: 1,
        titulo: 'Introducción a la Negociación',
        contenido: 'La negociación es un proceso mediante el cual dos o más partes con intereses comunes o en conflicto buscan un acuerdo. Existen dos tipos principales:\n\n1. **Negociación Distributiva**: Del tipo ganar-perder, donde los recursos son fijos.\n2. **Negociación Integrativa**: Del tipo ganar-ganar, donde se busca ampliar los beneficios para ambas partes.\n\nEs clave conocer el MAAN (Mejor Alternativa a un Acuerdo Negociado), que define tu plan de escape si la negociación fracasa.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Qué caracteriza a una negociación distributiva?', opciones: ['Es del tipo ganar-perder', 'Es del tipo ganar-ganar'], correcta: 0 },
          { pregunta: '¿Qué es el MAAN (Mejor Alternativa a un Acuerdo Negociado)?', opciones: ['La opción que tienes si la negociación fracasa', 'Tu oferta inicial en la mesa'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        curso_id: 1,
        titulo: 'Estrategias de Cierre y Objeciones',
        contenido: 'El cierre es el momento culmen. Ante objeciones comunes como el precio:\n\n- No rebajes la prima de inmediato, destruye la percepción de valor.\n- Concéntrate en la cobertura de salud completa y el respaldo de la aseguradora.\n- Usa la técnica del "Sentir-Encontrar-Demostrar" para empatizar con el cliente antes de rebatir.',
        orden: 2,
        quiz_preguntas: [
          { pregunta: 'Ante una objeción de precio del cliente, ¿cuál es la mejor estrategia?', opciones: ['Bajar el precio o prima de inmediato sin justificación', 'Resaltar el valor del seguro, las coberturas y el respaldo de la aseguradora'], correcta: 1 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        curso_id: 2,
        titulo: 'Conceptos Fundamentales de Seguros',
        contenido: 'Para asesorar bien, debes dominar estos términos:\n\n- **Prima**: El pago que hace el cliente para mantener activa la cobertura.\n- **Suma Asegurada**: El límite máximo que la aseguradora pagará por un siniestro.\n- **Deducible**: El monto fijo que corre por cuenta del asegurado antes de que la aseguradora empiece a pagar.\n- **Siniestro**: El evento cubierto (enfermedad, accidente, etc.) que activa la póliza.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Qué es la prima en una póliza de seguro?', opciones: ['El costo que paga el cliente para mantener la póliza activa', 'El deducible que paga el cliente en la clínica'], correcta: 0 },
          { pregunta: 'Si una póliza tiene un deducible de $500 y el siniestro es de $2000, ¿cuánto cubre la aseguradora?', opciones: ['Cubre los $2000 completos', 'Cubre $1500 (restando el deducible)'], correcta: 1 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 4,
        curso_id: 2,
        titulo: 'Ramos de Seguros en Venezuela',
        contenido: 'Manejamos principalmente:\n\n1. **Salud / HCM**: Hospitalización, Cirugía y Maternidad.\n2. **Vida**: Cobertura por fallecimiento e invalidez.\n3. **Vehículos**: Daños propios y responsabilidad civil.\n\nEn JKA nos especializamos fuertemente en Salud Individual y Colectiva con las mejores aseguradoras del país (Mercantil, Seguros Caracas, Seguros Venezuela, Mapfre).',
        orden: 2,
        quiz_preguntas: [
          { pregunta: '¿Qué cubre primordialmente una póliza HCM?', opciones: ['Gastos médicos por Hospitalización, Cirugía y Maternidad', 'Daños materiales del vehículo del asegurado'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 5,
        curso_id: 3,
        titulo: 'Cotización y Creación de Pólizas',
        contenido: 'El flujo principal es:\n\n1. El cliente ingresa y cotiza en base a su edad y suma asegurada.\n2. Para cotizar con éxito, el cliente DEBE completar primero sus datos personales en su Perfil.\n3. La solicitud se crea inicialmente en estado **Negociación**.\n4. El asesor o administrador revisen y puede pasarla a **Vigente** cuando se formaliza.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Cuál es el estado inicial de una póliza cuando la solicita un cliente?', opciones: ['Vigente', 'Negociación'], correcta: 1 },
          { pregunta: '¿Qué sección del sistema es obligatoria rellenar antes de cotizar?', opciones: ['La pestaña de Perfil (Datos Personales)', 'La pestaña de Pagos'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 6,
        curso_id: 3,
        titulo: 'Reporte y Conciliación de Pagos',
        contenido: 'Una vez creada la póliza:\n\n- Se genera una cuota de pago pendiente.\n- El cliente reporta su transferencia bancaria ingresando el Número de Referencia.\n- El asesor o admin valida y marca el pago como "pagado" para que la póliza pase a estar activa y solvente.',
        orden: 2,
        quiz_preguntas: [
          { pregunta: '¿Qué campo debe ingresar obligatoriamente el asegurado para notificar un pago?', opciones: ['La referencia bancaria', 'El nombre de su asesor de confianza'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      }
    ];
    saveFallback();
  }
}

// Sembrar el Fallback
function seedFallback() {
  console.log('🌱 Sembrando base de datos JSON local (Fallback)...');
  seedFallbackElearning();
  
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
      contrasena: '$2a$10$JnHfHQevjvqfkZj0uJ9sIe1n1e86mib5e3HA2k7QLKFXbChH0OQcG', // 123456789
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
    const uId = index + 3; // admin es 1, asesor es 2. Clientes empiezan en 3
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
  // Póliza 1: Jorge Fanianos (Client ID 1, Advisor ID 1), Vigente, Pagado
  fallbackData.polizas.push({
    id: 1,
    codigo_poliza: 'POL-882731',
    cliente_id: 1,
    asesor_id: 1,
    compania_id: 1, // Mercantil Seguros
    plan: 'ACCESS',
    area: 'Salud',
    suma_asegurada: 50000,
    deducible: 0,
    prima_anual: 740,
    estado: 'vigente',
    pago_estado: 'pagado',
    created_at: new Date().toISOString()
  });

  fallbackData.pagos.push({
    id: 1,
    poliza_id: 1,
    monto: 740,
    fecha_pago: '2026-06-15',
    estado_pago: 'pagado',
    referencia: 'REF-99887766',
    fecha_vencimiento: '2026-06-15',
    created_at: new Date().toISOString()
  });

  // Póliza 2: Jorge Fanianos (Client ID 1, Advisor ID 1), Negociación, Pendiente
  fallbackData.polizas.push({
    id: 2,
    codigo_poliza: 'POL-449201',
    cliente_id: 1,
    asesor_id: 1,
    compania_id: 2, // Seguros Caracas
    plan: 'ACCESS',
    area: 'Salud',
    suma_asegurada: 30000,
    deducible: 0,
    prima_anual: 657,
    estado: 'negociacion',
    pago_estado: 'pendiente',
    created_at: new Date().toISOString()
  });

  fallbackData.pagos.push({
    id: 2,
    poliza_id: 2,
    monto: 657,
    fecha_pago: new Date().toISOString().split('T')[0],
    estado_pago: 'pendiente',
    referencia: null,
    fecha_vencimiento: '2026-08-20',
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
    correo_usuario: 'info@jkaconsultores.com',
    accion: 'REGISTRO',
    descripcion: 'Asesor Johann Joubert registrado con código ASE-001.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 3,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'REGISTRO',
    descripcion: 'Asegurado Jorge Fanianos registrado en el sistema.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 4,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'CREACION_POLIZA',
    descripcion: 'Póliza POL-882731 emitida y aprobada para Jorge Fanianos.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 5,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'PAGO_REPORTADO',
    descripcion: 'Jorge Fanianos reportó pago de cuota $740. Ref: REF-99887766.',
    created_at: new Date().toISOString()
  });

  fallbackData.tarifario_metadata = {
    version: '1.0.0',
    ultima_modificacion: new Date().toISOString(),
    usuario_correo: 'admin@jkaseguros.com'
  };

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

// Conexión a PostgreSQL, expuesta como función explícita (en vez de código top-level)
// para que index.js pueda hacer `await initDb()` y garantizar que el esquema base y
// las migraciones terminen ANTES de levantar rutas, el cron de recordatorios o
// cualquier otra consulta sobre asesores/usuarios/polizas.
export async function initDb() {
try {
  pool = new pg.Pool(dbConfig);
  // Probar la conexión
  const client = await pool.connect();
  console.log('✅ Conexión establecida con PostgreSQL.');

  // Asegurar que el esquema base exista antes de intentar cualquier migración/ALTER TABLE.
  // Sin esto, una base de datos nueva (ej. Neon recién creada) no tiene ninguna tabla todavía
  // y las migraciones de abajo fallan con "relation ... does not exist".
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await client.query(schemaSql);
  console.log('📋 Esquema base verificado/creado.');

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

  // Migración para recordatorios y estado 'anulada'
  await client.query('ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_24h BOOLEAN DEFAULT FALSE;');
  await client.query('ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_48h BOOLEAN DEFAULT FALSE;');
  await client.query('ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_5d BOOLEAN DEFAULT FALSE;');
  await client.query('ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_estado_check;');
  await client.query("ALTER TABLE polizas ADD CONSTRAINT polizas_estado_check CHECK (estado IN ('negociacion', 'vigente', 'vencido', 'rechazado', 'anulada'));");
  await client.query('ALTER TABLE polizas ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;');

  // Tabla de metadatos de tarifario
  await client.query(`
    CREATE TABLE IF NOT EXISTS tarifario_metadata (
      id SERIAL PRIMARY KEY,
      version VARCHAR(50) NOT NULL,
      ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      usuario_correo VARCHAR(150) NOT NULL
    );
  `);
  // Insertar por defecto si está vacía
  await client.query(`
    INSERT INTO tarifario_metadata (version, usuario_correo)
    SELECT '1.0.0', 'admin@jkaseguros.com'
    WHERE NOT EXISTS (SELECT 1 FROM tarifario_metadata);
  `);

  // Migraciones de E-Learning
  await client.query(`
    CREATE TABLE IF NOT EXISTS elearning_cursos (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(255) NOT NULL,
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS elearning_modulos (
      id SERIAL PRIMARY KEY,
      curso_id INT REFERENCES elearning_cursos(id) ON DELETE CASCADE,
      titulo VARCHAR(255) NOT NULL,
      contenido TEXT NOT NULL,
      orden INT NOT NULL,
      quiz_preguntas JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS elearning_intentos (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
      modulo_id INT REFERENCES elearning_modulos(id) ON DELETE CASCADE,
      puntaje INT NOT NULL,
      total_preguntas INT NOT NULL,
      aprobado BOOLEAN NOT NULL,
      respuestas_usuario JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seeder de cursos en PostgreSQL si está vacío
  const checkCursos = await client.query('SELECT count(*) FROM elearning_cursos');
  if (parseInt(checkCursos.rows[0].count) === 0) {
    console.log('🌱 Sembrando cursos de E-Learning en PostgreSQL...');
    // Curso 1: Negociación
    const c1 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso básico de negociación', 'Aprende los fundamentos y estrategias para cerrar acuerdos exitosos.') 
      RETURNING id
    `);
    const c1Id = c1.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Introducción a la Negociación', 'La negociación es un proceso mediante el cual dos o más partes con intereses comunes o en conflicto buscan un acuerdo. Existen dos tipos principales:\n\n1. **Negociación Distributiva**: Del tipo ganar-perder, donde los recursos son fijos.\n2. **Negociación Integrativa**: Del tipo ganar-ganar, donde se busca ampliar los beneficios para ambas partes.\n\nEs clave conocer el MAAN (Mejor Alternativa a un Acuerdo Negociado), que define tu plan de escape si la negociación fracasa.', 1, $2)
    `, [c1Id, JSON.stringify([
      { pregunta: '¿Qué caracteriza a una negociación distributiva?', opciones: ['Es del tipo ganar-perder', 'Es del tipo ganar-ganar'], correcta: 0 },
      { pregunta: '¿Qué es el MAAN (Mejor Alternativa a un Acuerdo Negociado)?', opciones: ['La opción que tienes si la negociación fracasa', 'Tu oferta inicial en la mesa'], correcta: 0 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Estrategias de Cierre y Objeciones', 'El cierre es el momento culmen. Ante objeciones comunes como el precio:\n\n- No rebajes la prima de inmediato, destruye la percepción de valor.\n- Concéntrate en la cobertura de salud completa y el respaldo de la aseguradora.\n- Usa la técnica del "Sentir-Encontrar-Demostrar" para empatizar con el cliente antes de rebatir.', 2, $2)
    `, [c1Id, JSON.stringify([
      { pregunta: 'Ante una objeción de precio del cliente, ¿cuál es la mejor estrategia?', opciones: ['Bajar el precio o prima de inmediato sin justificación', 'Resaltar el valor del seguro, las coberturas y el respaldo de la aseguradora'], correcta: 1 }
    ])]);

    // Curso 2: Seguros
    const c2 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso de seguros', 'Conceptos fundamentales de pólizas de salud, vida y automotores.') 
      RETURNING id
    `);
    const c2Id = c2.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Conceptos Fundamentales de Seguros', 'Para asesorar bien, debes dominar estos términos:\n\n- **Prima**: El pago que hace el cliente para mantener activa la cobertura.\n- **Suma Asegurada**: El límite máximo que la aseguradora pagará por un siniestro.\n- **Deducible**: El monto fijo que corre por cuenta del asegurado antes de que la aseguradora empiece a pagar.\n- **Siniestro**: El evento cubierto (enfermedad, accidente, etc.) que activa la póliza.', 1, $2)
    `, [c2Id, JSON.stringify([
      { pregunta: '¿Qué es la prima en una póliza de seguro?', opciones: ['El costo que paga el cliente para mantener la póliza activa', 'El deducible que paga el cliente en la clínica'], correcta: 0 },
      { pregunta: 'Si una póliza tiene un deducible de $500 y el siniestro es de $2000, ¿cuánto cubre la aseguradora?', opciones: ['Cubre los $2000 completos', 'Cubre $1500 (restando el deducible)'], correcta: 1 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Ramos de Seguros en Venezuela', 'Manejamos principalmente:\n\n1. **Salud / HCM**: Hospitalización, Cirugía y Maternidad.\n2. **Vida**: Cobertura por fallecimiento e invalidez.\n3. **Vehículos**: Daños propios y responsabilidad civil.\n\nEn JKA nos especializamos fuertemente en Salud Individual y Colectiva con las mejores aseguradoras del país (Mercantil, Seguros Caracas, Seguros Venezuela, Mapfre).', 2, $2)
    `, [c2Id, JSON.stringify([
      { pregunta: '¿Qué cubre primordialmente una póliza HCM?', opciones: ['Gastos médicos por Hospitalización, Cirugía y Maternidad', 'Daños materiales del vehículo del asegurado'], correcta: 0 }
    ])]);

    // Curso 3: Cómo se usa el sistema
    const c3 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso de cómo se usa el sistema', 'Guía rápida para cotizar y gestionar solicitudes en la plataforma JKA Seguros.') 
      RETURNING id
    `);
    const c3Id = c3.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Cotización y Creación de Pólizas', 'El flujo principal es:\n\n1. El cliente ingresa y cotiza en base a su edad y suma asegurada.\n2. Para cotizar con éxito, el cliente DEBE completar primero sus datos personales en su Perfil.\n3. La solicitud se crea inicialmente en estado **Negociación**.\n4. El asesor o administrador revisa y puede pasarla a **Vigente** cuando se formaliza.', 1, $2)
    `, [c3Id, JSON.stringify([
      { pregunta: '¿Cuál es el estado inicial de una póliza cuando la solicita un cliente?', opciones: ['Vigente', 'Negociación'], correcta: 1 },
      { pregunta: '¿Qué sección del sistema es obligatoria rellenar antes de cotizar?', opciones: ['La pestaña de Perfil (Datos Personales)', 'La pestaña de Pagos'], correcta: 0 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Reporte y Conciliación de Pagos', 'Una vez creada la póliza:\n\n- Se genera una cuota de pago pendiente.\n- El cliente reporta su transferencia bancaria ingresando el Número de Referencia.\n- El asesor o admin valida y marca el pago como "pagado" para que la póliza pase a estar activa y solvente.', 2, $2)
    `, [c3Id, JSON.stringify([
      { pregunta: '¿Qué campo debe ingresar obligatoriamente el asegurado para notificar un pago?', opciones: ['La referencia bancaria', 'El nombre de su asesor de confianza'], correcta: 0 }
    ])]);
  }

  client.release();
} catch (err) {
  console.error('❌ Error al conectar con PostgreSQL, activando fallback JSON:', err);
  pool = null;
  initFallback();
}
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
        recordatorio_24h: p.recordatorio_24h || false,
        recordatorio_48h: p.recordatorio_48h || false,
        recordatorio_5d: p.recordatorio_5d || false,
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

  // 14b. UPDATE polizas SET recordatorio_24h = ...
  if (cleanSql.includes('UPDATE polizas SET recordatorio_24h =')) {
    const [recordatorio_24h, recordatorio_48h, recordatorio_5d, estado, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].recordatorio_24h = !!recordatorio_24h;
      fallbackData.polizas[idx].recordatorio_48h = !!recordatorio_48h;
      fallbackData.polizas[idx].recordatorio_5d = !!recordatorio_5d;
      fallbackData.polizas[idx].estado = estado;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 14c. SELECT FROM tarifario_metadata
  if (cleanSql.includes('FROM tarifario_metadata')) {
    const meta = fallbackData.tarifario_metadata || {
      version: '1.0.0',
      ultima_modificacion: new Date().toISOString(),
      usuario_correo: 'admin@jkaseguros.com'
    };
    return { rows: [meta] };
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
  getFallbackData: () => fallbackData,
  saveFallback: () => saveFallback(),
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
