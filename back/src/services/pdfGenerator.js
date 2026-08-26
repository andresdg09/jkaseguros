import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAGE_W = 595;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 515
const FOOTER_Y = 790;

const COLORS = {
  primary: '#1e3a8a',
  secondary: '#2563eb',
  dark: '#0f172a',
  lightBg: '#f8fafc',
  border: '#cbd5e1',
  muted: '#64748b',
  success: '#10b981',
  amber: '#f59e0b'
};

// Datos del corredor de seguros, mostrados en el encabezado (bajo el título de
// cada página) y en el pie de página de todas las páginas del PDF.
const BROKER_INFO_LINES = [
  'Johann Joubert',
  'Corredor de la Actividad Aseguradora',
  'CAA-005236 –SUDEASEG',
  'Rif V-11414838-1'
];

/**
 * Busca la ruta del logo en la carpeta public
 */
function getLogoPath() {
  const possiblePaths = [
    path.join(__dirname, '../../../front/public/logo.png'),
    path.join(process.cwd(), '../front/public/logo.png'),
    path.join(process.cwd(), 'front/public/logo.png'),
    path.join(process.cwd(), 'public/logo.png'),
    path.join(process.cwd(), 'logo.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Dibuja el encabezado institucional JKA sobre fondo blanco
 */
function dibujarHeader(doc, logoPath, tituloPagina = '') {
  doc.rect(0, 0, PAGE_W, 65).fill('#ffffff');

  if (logoPath) {
    try {
      doc.image(logoPath, 40, 12, { fit: [160, 42] });
    } catch (e) {
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(16).text('PROTECCIÓN & SEGUROS 360', 40, 22);
    }
  } else {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(16).text('PROTECCIÓN & SEGUROS 360', 40, 22);
  }

  doc.fillColor(COLORS.primary).fontSize(8.5).font('Helvetica-Bold');
  doc.text((tituloPagina || 'COTIZACIÓN DE SEGUROS DE SALUD').toUpperCase(), 250, 16, { align: 'right', width: 305, lineBreak: false });

  doc.fillColor('#475569').font('Helvetica').fontSize(6.5);
  BROKER_INFO_LINES.forEach((line, i) => {
    doc.text(line, 250, 28 + i * 7.3, { align: 'right', width: 305, lineBreak: false });
  });

  doc.lineWidth(1.5).strokeColor(COLORS.primary).moveTo(40, 60).lineTo(555, 60).stroke();
}

/**
 * Dibuja el bloque de datos del asegurado
 */
function dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada) {
  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = 70 + depLines * 14;

  doc.rect(MARGIN, 92, CONTENT_W, boxH).fill(COLORS.lightBg);
  doc.rect(MARGIN, 92, CONTENT_W, boxH).stroke(COLORS.border);

  const col1 = 55;
  const col2 = 310;
  const fechaHoy = new Date().toLocaleDateString('es-VE');
  const fechaNac = new Date(cliente.fecha_nacimiento).toLocaleDateString('es-VE');

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8);
  doc.text('Prospecto:', col1, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.primer_nombre} ${cliente.primer_apellido}`, col1 + 60, 100, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Documento:', col2, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.tipo_documento}-${cliente.nro_documento}`, col2 + 65, 100, { lineBreak: false });

  doc.font('Helvetica-Bold').text('F. Nacimiento:', col1, 114, { lineBreak: false }).font('Helvetica').text(fechaNac, col1 + 75, 114, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Edad / Género:', col2, 114, { lineBreak: false }).font('Helvetica').text(`${edad} años / ${cliente.genero || 'N/A'}`, col2 + 75, 114, { lineBreak: false });

  doc.font('Helvetica-Bold').text('Teléfono:', col1, 128, { lineBreak: false }).font('Helvetica').text(cliente.telefono || 'N/A', col1 + 60, 128, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Suma Asegurada:', col2, 128, { lineBreak: false }).font('Helvetica-Bold').fillColor(COLORS.secondary).text(sumaFormateada, col2 + 85, 128, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text('Válido por 10 días', col2 + 85, 140, { lineBreak: false });

  if (hasDeps) {
    let dy = 154;
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text('Dependientes:', col1, dy, { lineBreak: false });
    
    cliente.dependientes.forEach((dep, idx) => {
      const col = idx % 2 === 0 ? col1 + 70 : col2;
      const rowY = dy + Math.floor(idx / 2) * 14;
      const label = dep.relacion.charAt(0).toUpperCase() + dep.relacion.slice(1);
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8).text(`• ${label} (Edad: ${dep.edad} años)`, col, rowY, { lineBreak: false });
    });
  }

  const footY = 92 + boxH + 3;
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text(`Fecha de emisión: ${fechaHoy}`, col1, footY, { lineBreak: false });
}

function parseExtraCost(costStr) {
  if (!costStr) return 0;
  const num = parseFloat(String(costStr).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * Dibuja una tarjeta de plan de seguro para una aseguradora con distinción clara
 * entre lo Incluido en el Plan Base y los Beneficios Extras (con costos y precio dual).
 */
function dibujarTarjetaAseguradora(doc, x, y, width, height, comp, isBest) {
  const cardBg = isBest ? '#eff6ff' : '#ffffff';
  const cardBorder = isBest ? COLORS.secondary : COLORS.border;

  doc.roundedRect(x, y, width, height, 6).fill(cardBg);
  doc.roundedRect(x, y, width, height, 6).lineWidth(isBest ? 1.5 : 1).stroke(cardBorder);

  const priceBoxW = 126;
  const leftW = width - priceBoxW - 26;
  const padX = x + 12;
  let topY = y + 8;

  // Nombre y plan
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(11).text(comp.nombre, padX, topY, { width: leftW, lineBreak: false });
  doc.fillColor(COLORS.secondary).font('Helvetica-Bold').fontSize(7.5).text(`PLAN: ${(comp.plan || 'N/A').toUpperCase()}`, padX, topY + 13, { width: leftW, lineBreak: false });

  const deducibleVal = comp.deducible !== undefined && comp.deducible !== null && parseFloat(comp.deducible) > 0 
    ? `$${Number(comp.deducible).toLocaleString('en-US')}` 
    : '$0 (Sin deducible)';

  const metodosPago = [];
  if (comp.pago_contado) metodosPago.push('Contado');
  if (comp.pago_semestral) metodosPago.push('Semestral');
  if (comp.pago_cuatrimestral) metodosPago.push('Cuatrimestral');
  if (comp.pago_trimestral) metodosPago.push('Trimestral');
  if (comp.pago_bimestral) metodosPago.push('Bimestral');
  if (comp.pago_4_cuotas) metodosPago.push('4 Cuotas');
  if (comp.pago_mensual) metodosPago.push('Mensual');
  const formaPagoVal = metodosPago.length > 0 ? metodosPago.join(', ') : (comp.pago || 'Consultar con asesor');

  // Parsear extras opcionales con costo
  const costoMat = parseExtraCost(comp.maternidad_costo);
  const costoAsist = parseExtraCost(comp.asist_intl_costo);
  const costoFuneral = parseExtraCost(comp.funeral_costo);
  const costoMuerteAcc = parseExtraCost(comp.muerte_accidental_costo);
  const costoInvalidez = parseExtraCost(comp.invalidez_permanente_costo);
  const totalExtras = costoMat + costoAsist + costoFuneral + costoMuerteAcc + costoInvalidez;
  const primaBase = parseFloat(comp.prima || 0);
  const primaConExtras = primaBase + totalExtras;

  // --- SECCIÓN 1 (ARRIBA): INCLUIDO EN EL PLAN BASE ---
  const incStartY = topY + 26;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(6.5).text('✓ INCLUIDO EN EL PLAN BASE:', padX, incStartY, { lineBreak: false });

  // Grid de datos base (3 columnas)
  const baseData = [
    ['SUMA ASEGURADA', comp.suma_asegurada ? `$${Number(comp.suma_asegurada).toLocaleString('en-US')}` : 'Según cotización'],
    ['DEDUCIBLE', deducibleVal],
    ['FORMA DE PAGO', formaPagoVal]
  ];
  const colW3 = leftW / 3;
  baseData.forEach(([label, val], i) => {
    const colX = padX + i * colW3;
    const rowY = incStartY + 9;
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(5.8).text(label, colX, rowY, { width: colW3 - 6, lineBreak: false });
    const isDed = label === 'DEDUCIBLE';
    const valColor = isDed ? (parseFloat(comp.deducible || 0) > 0 ? '#b45309' : COLORS.success) : COLORS.dark;
    doc.fillColor(valColor).font(isDed ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8).text(val, colX, rowY + 7, { width: colW3 - 6, height: 10, lineBreak: false });
  });

  // Servicios incluidos base (2 filas de 7 columnas)
  const servicios = [
    ['At. Primaria', comp.atencion_medica_primaria !== undefined ? comp.atencion_medica_primaria : comp.at_situ_medicamentos],
    ['Medicamentos', comp.medicinas],
    ['Cons. Médicas', comp.consultas_medicas],
    ['Exámenes', comp.examenes_lab_imagenologia],
    ['Ambulancia', comp.ambulancia],
    ['Rehabilitación', comp.rehabilitacion],
    ['Prótesis', comp.protesis],
    ['Muleta + Silla', comp.muleta_silla_ruedas],
    ['Consultas', comp.consultas],
    ['Maternidad', (comp.maternidad || comp.maternidad_suma) && costoMat === 0],
    ['Oftalmología', comp.oftalmologia],
    ['Odontología', comp.odontologia],
    ['Muerte Acc.', (comp.muerte_accidental || comp.muerte_accidental_suma) && costoMuerteAcc === 0],
    ['Invalidez Perm.', (comp.invalidez_permanente || comp.invalidez_permanente_suma) && costoInvalidez === 0]
  ];

  const servCols = 7;
  const servW = leftW / servCols;
  const servStartY = incStartY + 27;

  servicios.forEach(([label, val], idx) => {
    const col = idx % servCols;
    const row = Math.floor(idx / servCols);
    const itemX = padX + col * servW;
    const itemY = servStartY + row * 10.5;

    const incluido = val === true || (val && String(val).trim() !== '' && String(val).toUpperCase() !== 'NO' && String(val).toUpperCase() !== 'FALSE' && String(val).toUpperCase() !== '0');
    doc.circle(itemX + 2.5, itemY + 3, 2).fill(incluido ? COLORS.success : '#cbd5e1');
    doc.fillColor(incluido ? COLORS.dark : '#94a3b8').font(incluido ? 'Helvetica-Bold' : 'Helvetica').fontSize(4.9).text(label, itemX + 6, itemY, { width: servW - 7, lineBreak: false });
  });

  // --- SECCIÓN 2 (ABAJO): COBERTURAS Y BENEFICIOS EXTRAS (OPCIONALES) ---
  const extraStartY = servStartY + 23;
  const extraBoxW = leftW;
  const extraBoxH = 34;
  
  doc.roundedRect(padX, extraStartY, extraBoxW, extraBoxH, 4).fill('#f8fafc');
  doc.roundedRect(padX, extraStartY, extraBoxW, extraBoxH, 4).lineWidth(0.5).stroke('#e2e8f0');

  const extrasList = [];
  if (comp.maternidad_suma || costoMat > 0) {
    extrasList.push({
      nombre: 'Maternidad',
      suma: comp.maternidad_suma || 'Cubierta',
      costo: costoMat > 0 ? `+ $${costoMat.toFixed(2)}/año` : 'Incluida en base'
    });
  }
  if (comp.muerte_accidental_suma || costoMuerteAcc > 0) {
    extrasList.push({
      nombre: 'Muerte Accidental',
      suma: comp.muerte_accidental_suma || 'Cubierta',
      costo: costoMuerteAcc > 0 ? `+ $${costoMuerteAcc.toFixed(2)}/año` : 'Incluida en base'
    });
  }
  if (comp.invalidez_permanente_suma || costoInvalidez > 0) {
    extrasList.push({
      nombre: 'Invalidez Permanente',
      suma: comp.invalidez_permanente_suma || 'Cubierta',
      costo: costoInvalidez > 0 ? `+ $${costoInvalidez.toFixed(2)}/año` : 'Incluida en base'
    });
  }
  if (comp.asist_intl_suma || costoAsist > 0) {
    extrasList.push({
      nombre: 'Asist. Internacional',
      suma: comp.asist_intl_suma || 'Cubierta',
      costo: costoAsist > 0 ? `+ $${costoAsist.toFixed(2)}/año` : 'Incluida en base'
    });
  }
  if (comp.funeral_suma || costoFuneral > 0) {
    extrasList.push({
      nombre: 'Gastos Funerarios',
      suma: comp.funeral_suma || 'Cubierta',
      costo: costoFuneral > 0 ? `+ $${costoFuneral.toFixed(2)}/año` : 'Incluido en base'
    });
  }

  doc.fillColor(totalExtras > 0 ? '#b45309' : COLORS.primary).font('Helvetica-Bold').fontSize(6).text(
    totalExtras > 0 ? '➕ COBERTURAS EXTRAS DISPONIBLES (CON COSTO ADICIONAL):' : '➕ COBERTURAS ADICIONALES DEL PLAN:',
    padX + 6, extraStartY + 4, { lineBreak: false }
  );

  if (extrasList.length > 0) {
    const extCols = Math.min(extrasList.length, 4);
    const extColW = (extraBoxW - 12) / extCols;
    extrasList.slice(0, 4).forEach((ext, idx) => {
      const extX = padX + 6 + idx * extColW;
      const extY = extraStartY + 14;
      doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(5.6).text(ext.nombre, extX, extY, { width: extColW - 4, lineBreak: false });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.1).text(`${ext.suma} | `, extX, extY + 7, { continued: true });
      doc.fillColor(ext.costo.includes('+') ? '#b45309' : COLORS.success).font('Helvetica-Bold').fontSize(5.1).text(ext.costo, { lineBreak: false });
    });
  } else {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.8).text('✓ Este plan no requiere contratación de extras (cobertura integral en plan base).', padX + 6, extraStartY + 16, { lineBreak: false });
  }

  // --- CAJA DE PRECIO / PRIMA (DERECHA) ---
  const priceX = x + width - priceBoxW - 10;
  const priceY = y + 8;
  const priceH = height - 16;

  doc.roundedRect(priceX, priceY, priceBoxW, priceH, 5).fill(isBest ? '#dbeafe' : '#f8fafc');
  doc.roundedRect(priceX, priceY, priceBoxW, priceH, 5).lineWidth(1).stroke(isBest ? '#93c5fd' : COLORS.border);

  // 1. Bloque Superior: Precio Base
  let py = priceY + 6;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(6.5).text('PRIMA BASE (SIN EXTRAS)', priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
  py += 9;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(14)
     .text(`$${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
  py += 15;
  const numDeps = comp.desglosePrimas ? comp.desglosePrimas.length - 1 : 0;
  const labelDeps = numDeps > 0 ? `(titular + ${numDeps} dep.)` : 'por año (plan base)';
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.8).text(labelDeps, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });

  // Línea divisoria
  py += 10;
  doc.moveTo(priceX + 10, py).lineTo(priceX + priceBoxW - 10, py).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

  // 2. Bloque Inferior: Precio con Extras
  py += 5;
  if (totalExtras > 0) {
    doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(6.2).text('TOTAL CON EXTRAS', priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
    py += 8;
    doc.fillColor(COLORS.success).font('Helvetica-Bold').fontSize(12)
       .text(`$${primaConExtras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
    py += 13;
    doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(5.5).text(`(+ $${totalExtras.toFixed(2)} en extras opcionales)`, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
  } else {
    doc.fillColor(COLORS.success).font('Helvetica-Bold').fontSize(6.2).text('PLAN COMPLETO', priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
    py += 8;
    doc.fillColor(COLORS.success).font('Helvetica-Bold').fontSize(11)
       .text(`$${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
    py += 13;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.5).text('(sin costos adicionales)', priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
  }

  // 3. Score de Cobertura al final de la caja de precio
  py += 9;
  doc.moveTo(priceX + 12, py).lineTo(priceX + priceBoxW - 12, py).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
  py += 4;
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(6.5).text(`Score: ${comp.calidadScore ?? 0}/50 pts`, priceX, py, { width: priceBoxW, align: 'center', lineBreak: false });
}

/**
 * Dibuja un sector (slice) de un gráfico de torta usando aproximación poligonal
 */
function dibujarSectorTorta(doc, cx, cy, radius, startAngle, endAngle, color) {
  const steps = Math.max(2, Math.ceil(((endAngle - startAngle) / (Math.PI / 90))));
  doc.moveTo(cx, cy);
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  doc.closePath();
  doc.fillAndStroke(color, '#ffffff');
}

/**
 * Dibuja el gráfico de torta de distribución de protección financiera + leyenda
 */
function dibujarGraficoDistribucion(doc, cx, cy, radius, legendX, legendY) {
  const datos = [
    { label: 'Seguro de Salud', pct: 20, color: '#2563eb', grupo: 'Vida y Salud' },
    { label: 'Seguro de Vida', pct: 30, color: '#93c5fd', grupo: 'Vida y Salud' },
    { label: 'Seguro Patrimonial', pct: 25, color: COLORS.amber },
    { label: 'Responsabilidad Civil', pct: 25, color: COLORS.success }
  ];

  let angle = -Math.PI / 2; // Comenzar en las 12
  datos.forEach(d => {
    const span = (d.pct / 100) * Math.PI * 2;
    dibujarSectorTorta(doc, cx, cy, radius, angle, angle + span, d.color);
    angle += span;
  });

  // Leyenda
  let ly = legendY;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text('SEGURO DE VIDA Y SALUD — 50%', legendX, ly, { lineBreak: false });
  ly += 13;
  [datos[0], datos[1]].forEach(d => {
    doc.rect(legendX + 10, ly + 1, 8, 8).fill(d.color);
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(`${d.label} — ${d.pct}%`, legendX + 24, ly, { lineBreak: false });
    ly += 14;
  });
  ly += 4;
  [datos[2], datos[3]].forEach(d => {
    doc.rect(legendX, ly + 1, 8, 8).fill(d.color);
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text(`${d.label} — ${d.pct}%`, legendX + 14, ly - 1, { lineBreak: false });
    ly += 16;
  });

  return ly;
}

/**
 * Dibuja el bloque "Contacta a tu asesor" (nombre, teléfono y correo del asesor
 * que generó la cotización). Se repite en todas las páginas del PDF.
 * Devuelve la altura ocupada, para que quien llame pueda seguir posicionando.
 */
function dibujarContactoAsesor(doc, asesor, x, y, width) {
  const h = 50;
  doc.roundedRect(x, y, width, h, 6).fill('#eff6ff');
  doc.roundedRect(x, y, width, h, 6).stroke('#bfdbfe');
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9).text('CONTACTA A TU ASESOR', x + 12, y + 8, { lineBreak: false });

  if (asesor && asesor.nombre) {
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text(asesor.nombre, x + 12, y + 22, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5)
       .text(`Tel/WhatsApp: ${asesor.telefono || 'N/A'}   |   Correo: ${asesor.correo || 'N/A'}`, x + 12, y + 34, { lineBreak: false });
  } else {
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5)
       .text('Comunícate con tu corredor de seguros para ser atendido por un asesor certificado.', x + 12, y + 24, { width: width - 24 });
  }

  return h;
}

// Contenido legal de Términos y Condiciones, mostrado al final del PDF (a partir
// de la página 3, continuando en tantas páginas adicionales como haga falta).
const TERMINOS_CONTENIDO = [
  { tipo: 'h1', texto: 'LA PÓLIZA DE SEGURO: ES UN CONTRATO' },
  { tipo: 'p', texto: 'La póliza de seguro es un contrato que nace de la buena fe de las partes; será suscrita y emitida basada en la información solicitada y suministrada por el solicitante. La omisión de información con relación a alguna condición de salud actual, antecedente quirúrgico o médico (incluyendo la toma de medicamentos de forma rutinaria) de cualquiera de los solicitantes, puede tener consecuencias, por ejemplo: la no indemnización ante un reclamo, la anulación de la póliza y la imposibilidad de brindarle una asesoría y atención adecuada.' },

  { tipo: 'h1', texto: '¿CUÁLES GASTOS CUBRE UNA PÓLIZA DE SEGURO? CONCEPTOS APLICABLES' },
  { tipo: 'p', texto: 'La póliza de salud brinda cobertura para gastos médicos por enfermedades y accidentes bajo los siguientes criterios:' },
  { tipo: 'bullets', items: ['COSTOS RAZONABLES', 'COSTOS USUALES Y RAZONABLES', 'COSTOS RAZONABLES, USUALES Y ACOSTUMBRADOS'] },
  { tipo: 'p', texto: 'Esto significa que algunos costos no serán asumidos por la compañía aseguradora, debiendo ser negociados y cubiertos por el asegurado con sus propios fondos.' },

  { tipo: 'h1', texto: 'PLAZOS DE ESPERA, EXCLUSIONES TEMPORALES Y DEFINITIVAS' },
  { tipo: 'p', texto: 'Toda póliza de salud emitida tiene PLAZOS DE ESPERA, EXCLUSIONES TEMPORALES Y DEFINITIVAS, desde la fecha de su emisión.' },
  { tipo: 'h2', texto: 'COBERTURA INMEDIATA' },
  { tipo: 'bullets', items: ['Accidentes amparados por la póliza y enfermedades virales'] },

  { tipo: 'h1', texto: 'AVISO LEGAL Y CONDICIONES DE USO' },
  { tipo: 'p', texto: 'Bienvenido al sitio web www.proteccionyseguros360.com, propiedad de Johann Joubert. El acceso y uso de este sitio web atribuyen la condición de usuario e implican la aceptación plena y sin reservas de todas y cada una de las disposiciones incluidas en este Aviso Legal.' },

  { tipo: 'h2', texto: '1. Información General y Regulatoria' },
  { tipo: 'p', texto: 'De conformidad con la Ley de la Actividad Aseguradora de la República Bolivariana de Venezuela, se informa que el titular de este sitio web es Johann Joubert, titular de la Cédula de Identidad N° V-11.414.838, actuando en su carácter de Corredor de Seguros debidamente autorizado, certificado e inscrito ante la Superintendencia de la Actividad Aseguradora (SUDEASEG) bajo la Credencial de la Actividad Aseguradora N° CAA-005236. Su actividad principal es la mediación y asesoría independiente en la celebración de contratos de seguros.' },

  { tipo: 'h2', texto: '2. Exclusión de Responsabilidad por el Contenido' },
  { tipo: 'bullets', items: [
    'Carácter Informativo: Toda la información, herramientas de simulación, tarifas referenciales, artículos de opinión o descripciones de productos publicados en este sitio web se ofrecen exclusivamente a título informativo y orientativo basados en la información suministrada por las compañías de seguro. No constituyen una oferta vinculante ni un contrato de seguro.',
    'Modificaciones: Johann Joubert se reserva el derecho de modificar, actualizar o retirar cualquier contenido de este sitio web sin previo aviso. Las condiciones definitivas de cualquier seguro serán las que consten formalmente en la póliza emitida por la empresa de seguros correspondiente.'
  ] },

  { tipo: 'h2', texto: '3. Alcance de los Servicios y Limitación de Responsabilidad' },
  { tipo: 'bullets', items: [
    'Naturaleza del Intermediario: El corredor no es una empresa de seguros. Johann Joubert no asume riesgos, no emite pólizas de forma autónoma ni realiza el pago directo de indemnizaciones o reembolsos. Dichas obligaciones corresponden única y exclusivamente a las empresas de seguros autorizadas por la SUDEASEG con las que se contrate la póliza.',
    'Insolvencia de las Aseguradoras: El corredor no asume responsabilidad civil, financiera ni solidaria ante el retraso, negativa de pago, insolvencia, liquidación o quiebra de la empresa de seguros seleccionada por el cliente.',
    'Veracidad de los Datos: El usuario es el único responsable de la exactitud y veracidad de los datos introducidos en los formularios de cotización o contacto del sitio web. El corredor no se hace responsable por la pérdida de cobertura o el rechazo de suscripción derivados de información falsa, inexacta u omitida por el usuario.'
  ] },

  { tipo: 'h2', texto: '4. Uso del Sitio Web y Seguridad Tecnológica' },
  { tipo: 'bullets', items: [
    'Disponibilidad: No se garantiza la disponibilidad continua e ininterrumpida del sitio web debido a fallas técnicas, de conectividad o mantenimiento.',
    'Daños Tecnológicos: Johann Joubert no se hace responsable por los daños o perjuicios que puedan causar virus, malware o cualquier otro componente tecnológico lesivo en los sistemas informáticos del usuario a raíz del acceso o navegación en este portal.'
  ] },

  { tipo: 'h2', texto: '5. Propiedad Intelectual' },
  { tipo: 'p', texto: 'Todos los contenidos de este sitio web (textos, gráficos, logotipos, iconos, imágenes, así como el diseño gráfico y código fuente) son propiedad de Johann Joubert o de terceros que han autorizado su uso. Queda prohibida su reproducción, distribución o comunicación pública, total o parcial, con fines comerciales sin autorización expresa.' },

  { tipo: 'h2', texto: '6. Enlaces a Terceros (Links)' },
  { tipo: 'p', texto: 'Este sitio web puede contener enlaces a páginas de empresas de seguros u otros terceros. El corredor no ejerce ningún control sobre dichos sitios ni se hace responsable por sus contenidos, políticas de privacidad o el cumplimiento de sus obligaciones legales.' },

  { tipo: 'h2', texto: '7. Legislación Aplicable y Jurisdicción' },
  { tipo: 'p', texto: 'Las presentes condiciones se rigen en su totalidad por las leyes de la República Bolivariana de Venezuela. Para la resolución de cualquier controversia judicial derivada del uso de este sitio web, las partes se someten expresamente a la jurisdicción de los tribunales competentes de la ciudad de Caracas, Distrito Capital.' },

  { tipo: 'h1', texto: 'NUESTRO COMPROMISO COMO SU INTERMEDIARIO DE SEGUROS' },
  { tipo: 'p', texto: 'Nuestro compromiso durante la vigencia del contrato de seguro, es ofrecerle una asesoría especializada y orientación en cuanto al uso de la póliza y sus productos asociados, procesos de reclamos (reembolsos - carta aval) y/o resolución de conflictos exclusivamente ante la compañía de seguros, no ante instancias públicas administrativas centrales o descentralizadas.' },
  { tipo: 'p', texto: 'Son actividades propias de los intermediarios de seguros, las siguientes:' },
  { tipo: 'numbered', items: [
    'Promover y en su caso concluir, la contratación de seguro.',
    'Informar con oportunidad al asegurador sobre las verdaderas circunstancias del riesgo y agravaciones importantes que de éste tenga noticia.',
    'Ofrecer al asegurado el contrato más adecuado y conveniente a sus necesidades particulares e informarle sobre las condiciones, coberturas y requisitos de la misma.',
    'Vigilar para que los seguros contratados por su mediación permanezcan en vigor y sean plenamente eficaces.',
    'Asesorar a los asegurados y beneficiarios y asistirlos en los casos de siniestro, procurando se lleven a cabo las diligencias necesarias para la mayor discusión del riesgo.',
    'Procurar que en caso de siniestro se utilicen los elementos necesarios para que tanto el asegurador como el asegurado conozcan la verdadera dimensión y valor del daño.',
    'Participar en la cobranza de las primas, procurando que sean pagadas en los términos establecidos en las pólizas y en las leyes.',
    'Atender en todo tiempo a las necesidades de los asegurados, recabando de las entidades aseguradoras las condiciones, coberturas, documentos y servicios que sean necesarios.',
    'Realizar las diligencias que sean precisas para que en todo tiempo se cumplan las instrucciones recibidas, tanto del asegurador como del asegurado, y las diligencias contractuales y legales correspondientes.',
    'Actuar en todo caso con rectitud, profesionalidad y ética.'
  ] },
  { tipo: 'nota', texto: 'Por requerimiento de SUDEASEG y la compañía aseguradora al momento de suscribir la póliza deberá suministrar: DATOS PERSONALES Y DE CONTACTO, DECLARACIÓN DE SALUD ACTUAL Y CONDICIÓN DE SALUD EXISTENTE.' }
];

/**
 * Calcula la altura que ocupará un bloque de Términos y Condiciones al dibujarlo,
 * sin dibujarlo (para decidir si hace falta saltar de página antes).
 */
function alturaBloqueTermino(doc, bloque, width) {
  switch (bloque.tipo) {
    case 'h1':
      doc.font('Helvetica-Bold').fontSize(9.5);
      return doc.heightOfString(bloque.texto, { width }) + 12;
    case 'h2':
      doc.font('Helvetica-Bold').fontSize(8);
      return doc.heightOfString(bloque.texto, { width }) + 8;
    case 'p':
      doc.font('Helvetica').fontSize(7.5);
      return doc.heightOfString(bloque.texto, { width }) + 8;
    case 'bullets': {
      doc.font('Helvetica').fontSize(7.5);
      let h = 4;
      bloque.items.forEach((item) => { h += doc.heightOfString(item, { width: width - 14 }) + 5; });
      return h;
    }
    case 'numbered': {
      doc.font('Helvetica').fontSize(7.5);
      let h = 4;
      bloque.items.forEach((item) => { h += doc.heightOfString(item, { width: width - 18 }) + 5; });
      return h;
    }
    case 'nota':
      doc.font('Helvetica').fontSize(7);
      return doc.heightOfString(bloque.texto, { width: width - 16 }) + 24;
    default:
      return 0;
  }
}

/**
 * Dibuja un bloque de Términos y Condiciones en (x, y) y devuelve la altura
 * realmente ocupada.
 */
function dibujarBloqueTermino(doc, bloque, x, y, width) {
  switch (bloque.tipo) {
    case 'h1':
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5).text(bloque.texto, x, y, { width });
      return doc.y - y + 4;
    case 'h2':
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text(bloque.texto, x, y, { width });
      return doc.y - y + 4;
    case 'p':
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(bloque.texto, x, y, { width });
      return doc.y - y + 4;
    case 'bullets': {
      let cy = y;
      bloque.items.forEach((item) => {
        doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text('•', x, cy, { width: 12, lineBreak: false });
        doc.text(item, x + 14, cy, { width: width - 14 });
        cy = doc.y + 3;
      });
      return cy - y;
    }
    case 'numbered': {
      let cy = y;
      bloque.items.forEach((item, i) => {
        doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(7.5).text(`${i + 1}.`, x, cy, { width: 16, lineBreak: false });
        doc.font('Helvetica').text(item, x + 18, cy, { width: width - 18 });
        cy = doc.y + 3;
      });
      return cy - y;
    }
    case 'nota': {
      const h = alturaBloqueTermino(doc, bloque, width);
      doc.rect(x, y, width, h).fill('#fff3cd');
      doc.rect(x, y, width, h).stroke('#ffeeba');
      doc.fillColor('#856404').font('Helvetica').fontSize(7).text(bloque.texto, x + 8, y + 8, { width: width - 16 });
      return h;
    }
    default:
      return 0;
  }
}

/**
 * Dibuja la sección de Términos y Condiciones a partir de startY, saltando de
 * página (con encabezado y bloque de contacto) tantas veces como haga falta.
 */
function dibujarTerminosCondiciones(doc, logoPath, asesor, startY) {
  const bottomLimit = FOOTER_Y - 15;
  let y = startY;

  const saltarPagina = () => {
    doc.addPage();
    dibujarHeader(doc, logoPath, 'TÉRMINOS Y CONDICIONES');
    const contactoH = dibujarContactoAsesor(doc, asesor, MARGIN, 78, CONTENT_W);
    y = 78 + contactoH + 16;
  };

  if (y + 20 > bottomLimit) saltarPagina();
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(11).text('Términos y Condiciones', MARGIN, y, { lineBreak: false });
  y += 20;

  TERMINOS_CONTENIDO.forEach((bloque, i) => {
    // +10% de margen de seguridad: heightOfString() (usado para estimar sin dibujar)
    // no siempre coincide exactamente con la altura real que consume el texto ya
    // ajustado (wrapped) al dibujarlo, así que sobreestimamos un poco a propósito
    // para no quedarnos cortos y desbordar el pie de página.
    let h = alturaBloqueTermino(doc, bloque, CONTENT_W) * 1.1;
    // Un encabezado (h1/h2) nunca debe quedar solo al final de una página: si el
    // encabezado cabe pero el bloque que le sigue no, forzamos el salto de página
    // para ambos, evitando un título "huérfano".
    if ((bloque.tipo === 'h1' || bloque.tipo === 'h2') && TERMINOS_CONTENIDO[i + 1]) {
      h += alturaBloqueTermino(doc, TERMINOS_CONTENIDO[i + 1], CONTENT_W) * 1.1;
    }
    if (y + h > bottomLimit) saltarPagina();
    const usedH = dibujarBloqueTermino(doc, bloque, MARGIN, y, CONTENT_W);
    y += usedH + 6;
  });
}

/**
 * Dibuja el PDF estructurado en varias páginas
 */
function dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor) {
  const logoPath = getLogoPath();
  const sumaFormateada = `$${Number(sumaAsegurada).toLocaleString('en-US')}`;

  // ==========================================
  // PÁGINA 1: DATOS DEL ASEGURADO + TARJETAS DE PLANES
  // ==========================================
  dibujarHeader(doc, logoPath, `DIAGNÓSTICO (SUMA ASEGURADA ${sumaFormateada})`);

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(11)
     .text(`DIAGNÓSTICO Y COMPARATIVA DE SEGUROS DE SALUD (SUMA ASEGURADA ${sumaFormateada})`, MARGIN, 75, { lineBreak: false });

  dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada);

  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = 70 + depLines * 14;

  const titleY = 92 + boxH + 12;
  const subtitleY = titleY + 12;
  const startCardsY = subtitleY + 16;

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Tu Comparativo Personalizado de Aseguradoras', MARGIN, titleY, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
     .text('Cada tarjeta resume el plan, la prima anual y los beneficios adicionales ofrecidos para la edad y suma asegurada cotizadas.', MARGIN, subtitleY, { width: CONTENT_W, lineBreak: false });

  let cardY = startCardsY;
  const cardH = 150;
  const cardGap = 14;

  comparativas.forEach((comp) => {
    if (cardY + cardH > FOOTER_Y - 20) {
      doc.addPage();
      dibujarHeader(doc, logoPath, 'DIAGNÓSTICO (CONTINUACIÓN)');
      cardY = 80;
    }
    dibujarTarjetaAseguradora(doc, MARGIN, cardY, CONTENT_W, cardH, comp, !!comp.recomendada);
    cardY += cardH + cardGap;
  });

  // Contacta a tu asesor (se repite en todas las páginas)
  if (cardY + 50 > FOOTER_Y - 15) {
    doc.addPage();
    dibujarHeader(doc, logoPath, 'DIAGNÓSTICO (CONTINUACIÓN)');
    cardY = 80;
  }
  dibujarContactoAsesor(doc, asesor, MARGIN, cardY, CONTENT_W);

  // ==========================================
  // PÁGINA: SECCIÓN DE MARKETING / DISTRIBUCIÓN DE PROTECCIÓN
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, logoPath, 'PROTEGE TODO TU PATRIMONIO');

  let mktY = 78;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(15)
     .text('¿Sabías que un seguro de salud es solo una parte de tu protección?', MARGIN, mktY, { width: CONTENT_W });
  mktY += 34;
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8.5)
     .text('Una protección financiera completa cubre tu salud y tu vida, pero también tu patrimonio (vivienda, vehículo, negocio) y tu responsabilidad ante terceros. Mira cómo se distribuye una cobertura integral recomendada por Protección y Seguros 360:', MARGIN, mktY, { width: CONTENT_W });
  mktY += 46;

  const chartCx = MARGIN + 90;
  const chartCy = mktY + 85;
  const chartRadius = 78;
  dibujarGraficoDistribucion(doc, chartCx, chartCy, chartRadius, MARGIN + 210, mktY + 20);

  const calloutY = mktY + 180;
  doc.roundedRect(MARGIN, calloutY, CONTENT_W, 42, 6).fill('#fff7ed');
  doc.roundedRect(MARGIN, calloutY, CONTENT_W, 42, 6).stroke('#fed7aa');
  doc.fillColor('#9a3412').font('Helvetica-Bold').fontSize(8.5)
     .text('¡ATENCIÓN! HOY SOLO ESTÁS CUBRIENDO EL 20% DE TU PROTECCIÓN FINANCIERA IDEAL', MARGIN + 12, calloutY + 8, { width: CONTENT_W - 24, lineBreak: false });
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5)
     .text('Con un seguro de Salud contratado, aún te falta cubrir Vida, Patrimonio y Responsabilidad Civil. Conversa con tu asesor de Protección y Seguros 360 para armar un plan a tu medida.', MARGIN + 12, calloutY + 20, { width: CONTENT_W - 24 });

  let boxesY = calloutY + 56;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Conoce los seguros que completan tu protección', MARGIN, boxesY, { lineBreak: false });
  boxesY += 16;

  const productos = [
    { titulo: 'Seguro de Vida (30%)', color: '#93c5fd', desc: 'Garantiza estabilidad económica a tu familia ante un imprevisto, cubriendo deudas, educación y gastos del hogar.' },
    { titulo: 'Seguro Patrimonial (25%)', color: COLORS.amber, desc: 'Protege tu vivienda, vehículo o negocio ante incendios, robos, daños o desastres naturales.' },
    { titulo: 'Responsabilidad Civil (25%)', color: COLORS.success, desc: 'Te respalda ante reclamos por daños a terceros, evitando que un accidente comprometa tu patrimonio.' }
  ];

  const boxW = (CONTENT_W - 2 * 14) / 3;
  productos.forEach((p, i) => {
    const bx = MARGIN + i * (boxW + 14);
    doc.roundedRect(bx, boxesY, boxW, 82, 5).fill(COLORS.lightBg);
    doc.roundedRect(bx, boxesY, boxW, 82, 5).stroke(COLORS.border);
    doc.rect(bx, boxesY, 4, 82).fill(p.color);
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(7.5).text(p.titulo, bx + 12, boxesY + 10, { width: boxW - 20 });
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(6.8).text(p.desc, bx + 12, boxesY + 26, { width: boxW - 20, height: 50 });
  });

  // Contacta a tu asesor (se repite en todas las páginas)
  let contactoY2 = boxesY + 82 + 20;
  if (contactoY2 + 50 > FOOTER_Y - 15) {
    doc.addPage();
    dibujarHeader(doc, logoPath, 'PROTEGE TODO TU PATRIMONIO (CONTINUACIÓN)');
    contactoY2 = 80;
  }
  dibujarContactoAsesor(doc, asesor, MARGIN, contactoY2, CONTENT_W);

  // ==========================================
  // PÁGINA: CONDICIONES Y CONTACTO
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, logoPath, 'CONDICIONES Y CONTACTO');

  let condY = 80;

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Consideraciones Técnicas del Análisis', MARGIN, condY, { lineBreak: false });
  condY += 16;

  const features = [
    { title: 'Suma Asegurada:', desc: `Esta cotización refleja la suma asegurada de ${sumaFormateada} seleccionada. Cambiar la suma asegurada puede variar la prima y los beneficios disponibles.` },
    { title: 'Deducible:', desc: 'El deducible es el monto que corre por cuenta del asegurado antes de que la aseguradora empiece a indemnizar los gastos médicos cubiertos. Los planes con "$0 (Sin deducible)" brindan cobertura desde el primer gasto.' },
    { title: 'Maternidad y Asistencia Internacional:', desc: 'Cuando aparecen como "No incluida", la aseguradora no ofrece ese beneficio para el plan y edad cotizados; de estar disponibles, se indica el límite de cobertura y su costo anual adicional.' },
    { title: 'Condiciones de Pago:', desc: 'Varían según la aseguradora (contado, semestral, trimestral o mensual). Consulte con su asesor las condiciones exactas antes de formalizar la contratación.' }
  ];

  features.forEach(item => {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text(item.title, MARGIN, condY, { lineBreak: false });
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(item.desc, MARGIN, condY + 10, { width: CONTENT_W });
    condY += 32;
  });

  condY += 4;

  // Nota de Asesoría
  doc.rect(MARGIN, condY, CONTENT_W, 40).fill('#fff3cd');
  doc.rect(MARGIN, condY, CONTENT_W, 40).stroke('#ffeeba');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5).text('NOTA DE ASESORÍA:', MARGIN + 8, condY + 6, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Los precios aquí reflejados son de carácter informativo e ilustrativo y pueden cambiar según la cantidad definitiva de asegurados y regulaciones de la SUDEASEG. Comuníquese con su asesor asignado para formalizar la contratación.', MARGIN + 8, condY + 16, { width: CONTENT_W - 16 });

  condY += 52;

  // Contacta a tu asesor (se repite en todas las páginas)
  if (condY + 50 > FOOTER_Y - 15) {
    doc.addPage();
    dibujarHeader(doc, logoPath, 'CONDICIONES Y CONTACTO (CONTINUACIÓN)');
    condY = 80;
  }
  const contactoH3 = dibujarContactoAsesor(doc, asesor, MARGIN, condY, CONTENT_W);
  condY += contactoH3 + 16;

  // ==========================================
  // TÉRMINOS Y CONDICIONES (continúa en tantas páginas como haga falta)
  // ==========================================
  dibujarTerminosCondiciones(doc, logoPath, asesor, condY);

  // ==========================================
  // PIE DE PÁGINA GLOBAL DE TODAS LAS PÁGINAS
  // ==========================================
  const totalPages = doc.bufferedPageRange().count;
  const brokerFooterLine = BROKER_INFO_LINES.join(' | ');
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.muted).fontSize(6.5).font('Helvetica')
       .text(brokerFooterLine, MARGIN, FOOTER_Y - 9, { align: 'center', width: CONTENT_W, lineBreak: false });
    doc.fontSize(7)
       .text(`Página ${i + 1} de ${totalPages} | Documento emitido por Protección y Seguros 360`, MARGIN, FOOTER_Y, { align: 'center', width: CONTENT_W, lineBreak: false });
  }
}

/**
 * Genera un PDF de cotización comparativa para transmitir en respuesta Express
 */
export function generarPdfCotizacion(res, cliente, edad, sumaAsegurada, comparativas, asesor) {
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=cotizacion_360_${cliente.nro_documento}.pdf`);
  doc.pipe(res);

  dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor);

  doc.end();
}

/**
 * Genera un PDF en memoria y retorna un Buffer
 * @returns {Promise<Buffer>}
 */
export function generarPdfBuffer(cliente, edad, sumaAsegurada, comparativas, asesor) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor);

    doc.end();
  });
}
