import PDFDocument from 'pdfkit';

const PAGE_W = 595;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 515
const FOOTER_Y = 790;
// Posición vertical fija del bloque "Contacta a tu asesor": se ancla justo
// arriba del pie de página en TODAS las páginas del PDF.
const CONTACT_Y = FOOTER_Y - 65;

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
 * Dibuja el encabezado institucional sobre fondo blanco (marca en texto, sin logo)
 */
function dibujarHeader(doc, tituloPagina = '') {
  doc.rect(0, 0, PAGE_W, 65).fill('#ffffff');

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(15).text('Protección & Seguros 360', MARGIN, 24, { lineBreak: false });

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
// Alto base del cuadro de datos del asegurado: 4 filas (Prospecto/Documento,
// F. Nacimiento/Edad, Teléfono/Suma Asegurada, Fecha emisión/Vencimiento) más
// margen superior/inferior. Se le suma el espacio de los dependientes si aplica.
const DATOS_BOX_BASE_H = 84;

function dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada) {
  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = DATOS_BOX_BASE_H + depLines * 14;

  doc.rect(MARGIN, 92, CONTENT_W, boxH).fill(COLORS.lightBg);
  doc.rect(MARGIN, 92, CONTENT_W, boxH).stroke(COLORS.border);

  // Columnas de etiqueta/valor alineadas de forma consistente en las 4 filas,
  // para que ningún valor quede pegado a su etiqueta ni desalineado entre filas.
  const col1 = 55;
  const col2 = 310;
  const val1 = col1 + 90;
  const val2 = col2 + 95;
  const fechaHoy = new Date().toLocaleDateString('es-VE');
  const fechaNac = new Date(cliente.fecha_nacimiento).toLocaleDateString('es-VE');

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8);
  doc.text('Prospecto:', col1, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.primer_nombre} ${cliente.primer_apellido}`, val1, 100, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Documento:', col2, 100, { lineBreak: false }).font('Helvetica').text(`${prefijoDocumento(cliente.tipo_documento)}-${cliente.nro_documento}`, val2, 100, { lineBreak: false });

  doc.font('Helvetica-Bold').text('F. Nacimiento:', col1, 114, { lineBreak: false }).font('Helvetica').text(fechaNac, val1, 114, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Edad / Género:', col2, 114, { lineBreak: false }).font('Helvetica').text(`${edad} años / ${cliente.genero || 'N/A'}`, val2, 114, { lineBreak: false });

  doc.font('Helvetica-Bold').text('Teléfono:', col1, 128, { lineBreak: false }).font('Helvetica').text(cliente.telefono || 'N/A', val1, 128, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Suma Asegurada:', col2, 128, { lineBreak: false }).font('Helvetica-Bold').fillColor(COLORS.secondary).text(sumaFormateada, val2, 128, { lineBreak: false });

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text('Fecha de emisión:', col1, 142, { lineBreak: false }).font('Helvetica').text(fechaHoy, val1, 142, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Vencimiento:', col2, 142, { lineBreak: false }).fillColor(COLORS.muted).font('Helvetica').text('Válido por 10 días', val2, 142, { lineBreak: false });

  if (hasDeps) {
    let dy = 160;
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text('Dependientes:', col1, dy, { lineBreak: false });

    cliente.dependientes.forEach((dep, idx) => {
      const col = idx % 2 === 0 ? val1 : col2;
      const rowY = dy + Math.floor(idx / 2) * 14;
      const label = dep.relacion.charAt(0).toUpperCase() + dep.relacion.slice(1);
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8).text(`• ${label} (Edad: ${dep.edad} años)`, col, rowY, { lineBreak: false });
    });
  }
}

/**
 * Convierte el tipo de documento (p.ej. "Venezolano") en su prefijo abreviado
 * (V-, E-, P-) para mostrarlo junto a la cédula del asegurado.
 */
function prefijoDocumento(tipoDocumento) {
  const tipo = String(tipoDocumento || '').trim().toLowerCase();
  if (tipo.startsWith('extranjero')) return 'E';
  if (tipo.startsWith('pasaporte')) return 'P';
  if (tipo.startsWith('venezolano')) return 'V';
  // Si ya viene como una letra (V, E, P) u otro valor, se usa tal cual.
  return tipoDocumento ? String(tipoDocumento).charAt(0).toUpperCase() : 'V';
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

  // Grid de datos base (3 columnas de ancho desigual): Suma Asegurada y
  // Deducible ocupan solo lo que necesitan, para que Forma de Pago quede más
  // pegada a Deducible y tenga suficiente ancho para mostrar todos los
  // métodos de pago (incluso más de 3) sin cortarse.
  const baseData = [
    ['SUMA ASEGURADA', comp.suma_asegurada ? `$${Number(comp.suma_asegurada).toLocaleString('en-US')}` : 'Según cotización'],
    ['DEDUCIBLE', deducibleVal],
    ['FORMA DE PAGO', formaPagoVal]
  ];
  const colWidths = [leftW * 0.20, leftW * 0.24, leftW * 0.56];
  const colXs = [padX, padX + colWidths[0], padX + colWidths[0] + colWidths[1]];
  baseData.forEach(([label, val], i) => {
    const colX = colXs[i];
    const colW = colWidths[i];
    const rowY = incStartY + 9;
    const isForma = label === 'FORMA DE PAGO';
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(5.8).text(label, colX, rowY, { width: colW - 6, lineBreak: false });
    const isDed = label === 'DEDUCIBLE';
    const valColor = isDed ? (parseFloat(comp.deducible || 0) > 0 ? '#b45309' : COLORS.success) : COLORS.dark;
    if (isForma) {
      // Se permite ajustar en hasta 2 líneas (en vez de cortar en una sola)
      // para que quepan todas las formas de pago disponibles.
      doc.fillColor(valColor).font('Helvetica').fontSize(6.2).text(val, colX, rowY + 7, { width: colW - 6, height: 16 });
    } else {
      doc.fillColor(valColor).font(isDed ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8).text(val, colX, rowY + 7, { width: colW - 6, height: 10, lineBreak: false });
    }
  });

  // Servicios incluidos base (2 filas de 7 columnas)
  const servicios = [
    ['At. Primaria', comp.atencion_medica_primaria !== undefined ? comp.atencion_medica_primaria : comp.at_situ_medicamentos],
    ['Medicamentos', comp.medicinas],
    ['Consultas Médicas', comp.consultas_medicas],
    ['Exámenes', comp.examenes_lab_imagenologia],
    ['Ambulancia', comp.ambulancia],
    ['Rehabilitación', comp.rehabilitacion],
    ['Prótesis', comp.protesis],
    ['Muleta + Silla', comp.muleta_silla_ruedas],
    ['Maternidad', (comp.maternidad || comp.maternidad_suma) && costoMat === 0],
    ['Oftalmología', comp.oftalmologia],
    ['Odontología', comp.odontologia],
    ['Muerte Acc.', (comp.muerte_accidental || comp.muerte_accidental_suma) && costoMuerteAcc === 0],
    ['Invalidez Perm.', (comp.invalidez_permanente || comp.invalidez_permanente_suma) && costoInvalidez === 0]
  ];

  const servCols = 7;
  const servW = leftW / servCols;
  // +32 en vez de +27: dos líneas extra de aire para que la Forma de Pago en
  // dos líneas no choque con la fila de servicios incluidos.
  const servStartY = incStartY + 32;

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

  // Solo se listan aquí los adicionales que tienen un costo extra (p.ej. Asist.
  // Internacional, Gastos Funerarios). Si un beneficio (como Maternidad) ya viene
  // incluido gratis en el plan base, no debe repetirse en esta sección: ya se
  // muestra como incluido en "INCLUIDO EN EL PLAN BASE".
  const extrasList = [];
  if (costoMat > 0) {
    extrasList.push({
      nombre: 'Maternidad',
      suma: comp.maternidad_suma || 'Cubierta',
      costo: `+ $${costoMat.toFixed(2)}/año`
    });
  }
  if (costoMuerteAcc > 0) {
    extrasList.push({
      nombre: 'Muerte Accidental',
      suma: comp.muerte_accidental_suma || 'Cubierta',
      costo: `+ $${costoMuerteAcc.toFixed(2)}/año`
    });
  }
  if (costoInvalidez > 0) {
    extrasList.push({
      nombre: 'Invalidez Permanente',
      suma: comp.invalidez_permanente_suma || 'Cubierta',
      costo: `+ $${costoInvalidez.toFixed(2)}/año`
    });
  }
  if (costoAsist > 0) {
    extrasList.push({
      nombre: 'Asist. Internacional',
      suma: comp.asist_intl_suma || 'Cubierta',
      costo: `+ $${costoAsist.toFixed(2)}/año`
    });
  }
  if (costoFuneral > 0) {
    extrasList.push({
      nombre: 'Gastos Funerarios',
      suma: comp.funeral_suma || 'Cubierta',
      costo: `+ $${costoFuneral.toFixed(2)}/año`
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
  // Tres recuadros independientes, uno debajo del otro, en vez de un solo
  // cuadro con divisores: Prima Base, Extras y Total con Extras quedan cada
  // uno en su propio rectángulo para que se lea más específico y claro.
  const priceX = x + width - priceBoxW - 10;
  const priceY = y + 8;
  const priceH = height - 16;
  const hayExtras = totalExtras > 0;

  const boxGap = 4;
  const boxH1 = 36; // Prima Base (sin extras)
  const boxH2 = 27; // Extras
  const boxH3 = 36; // Total con Extras
  let py = priceY;

  // 1. Recuadro: Prima Base (sin extras)
  doc.roundedRect(priceX, py, priceBoxW, boxH1, 4).fill(isBest ? '#dbeafe' : '#f8fafc');
  doc.roundedRect(priceX, py, priceBoxW, boxH1, 4).lineWidth(1).stroke(isBest ? '#93c5fd' : COLORS.border);
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(6).text('PRIMA BASE (SIN EXTRAS)', priceX, py + 5, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(12)
     .text(`$${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceX, py + 13, { width: priceBoxW, align: 'center', lineBreak: false });
  const numDeps = comp.desglosePrimas ? comp.desglosePrimas.length - 1 : 0;
  const labelDeps = numDeps > 0 ? `(titular + ${numDeps} dep.)` : 'por año (plan base)';
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.3).text(labelDeps, priceX, py + 27, { width: priceBoxW, align: 'center', lineBreak: false });

  py += boxH1 + boxGap;

  // 2. Recuadro: Extras (costo adicional opcional)
  doc.roundedRect(priceX, py, priceBoxW, boxH2, 4).fill(hayExtras ? '#fff7ed' : '#f8fafc');
  doc.roundedRect(priceX, py, priceBoxW, boxH2, 4).lineWidth(1).stroke(hayExtras ? '#fed7aa' : COLORS.border);
  doc.fillColor(hayExtras ? '#b45309' : COLORS.muted).font('Helvetica-Bold').fontSize(6).text('EXTRAS', priceX, py + 5, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.fillColor(hayExtras ? '#b45309' : COLORS.muted).font('Helvetica-Bold').fontSize(9.5)
     .text(hayExtras ? `+ $${totalExtras.toFixed(2)}` : '$0.00', priceX, py + 14, { width: priceBoxW, align: 'center', lineBreak: false });

  py += boxH2 + boxGap;

  // 3. Recuadro: Total con Extras
  doc.roundedRect(priceX, py, priceBoxW, boxH3, 4).fill(hayExtras ? '#dcfce7' : '#f0fdf4');
  doc.roundedRect(priceX, py, priceBoxW, boxH3, 4).lineWidth(1).stroke('#86efac');
  doc.fillColor(COLORS.success).font('Helvetica-Bold').fontSize(6).text('TOTAL CON EXTRAS', priceX, py + 5, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.fillColor(COLORS.success).font('Helvetica-Bold').fontSize(12)
     .text(`$${primaConExtras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceX, py + 13, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.3).text(hayExtras ? 'con extras incluidos' : 'igual a la prima base', priceX, py + 27, { width: priceBoxW, align: 'center', lineBreak: false });
  // Nota: el Score de Cobertura ya no se muestra en el PDF (se sigue
  // calculando y usando internamente para elegir el plan recomendado).
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

  { tipo: 'h1', texto: '¿CUÁLES GASTOS CUBRE UNA PÓLIZA DE SEGURO?' },
  { tipo: 'p', texto: 'La póliza de salud brinda cobertura para gastos médicos por enfermedades y accidentes bajo los siguientes criterios:' },
  { tipo: 'bullets', items: ['COSTOS RAZONABLES', 'COSTOS USUALES Y RAZONABLES', 'COSTOS RAZONABLES, USUALES Y ACOSTUMBRADOS'] },
  { tipo: 'p', texto: 'Esto significa que algunos costos no serán asumidos por la compañía aseguradora, debiendo ser negociados y cubiertos por el asegurado con sus propios fondos.' },

  { tipo: 'h1', texto: 'PLAZOS DE ESPERA, EXCLUSIONES TEMPORALES Y DEFINITIVAS' },
  { tipo: 'p', texto: 'Toda póliza de salud emitida tiene PLAZOS DE ESPERA, EXCLUSIONES TEMPORALES Y DEFINITIVAS, desde la fecha de su emisión.' },
  { tipo: 'h2', texto: 'COBERTURA INMEDIATA' },
  { tipo: 'bullets', items: ['Accidentes amparados por la póliza y enfermedades virales'] },

  { tipo: 'h1', texto: 'AVISO LEGAL Y CONDICIONES DE USO' },
  { tipo: 'p', texto: 'El sitio web www.proteccionyseguros360.com es propiedad de Johann Joubert. El acceso y uso de este sitio web atribuyen la condición de usuario e implican la aceptación plena y sin reservas de todas y cada una de las disposiciones incluidas en este Aviso Legal.' },

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
  { tipo: 'p', texto: 'Nuestro compromiso durante la vigencia del contrato de seguro, es ofrecerle una asesoría especializada y orientación en cuanto al uso de la póliza y sus productos asociados, procesos de reclamos (reembolsos - carta aval) y/o resolución de conflictos exclusivamente ante la compañía de seguros, no ante instancias públicas administrativas centrales o descentralizadas.' }
];

/**
 * Convierte un título a formato "oración": todo en minúscula salvo la
 * primera letra (ignorando símbolos/números iniciales como "¿" o "1.").
 */
function tituloOracion(texto) {
  if (!texto) return texto;
  const minuscula = texto.toLowerCase();
  return minuscula.replace(/[a-zà-öø-ÿ]/i, (c) => c.toUpperCase());
}

// Tamaños de fuente e interlineado reducidos para que todo el contenido de
// Términos y Condiciones quepa en una sola página junto con la Nota de
// Asesoría (antes ocupaba dos páginas).
const TERMS_FONT = { h1: 8, h2: 7, p: 6.3, bullets: 6.3, nota: 6.2 };
const TERMS_LINE_GAP = -0.6;

/**
 * Calcula la altura que ocupará un bloque de Términos y Condiciones al dibujarlo,
 * sin dibujarlo (para decidir si hace falta saltar de página antes).
 */
function alturaBloqueTermino(doc, bloque, width) {
  switch (bloque.tipo) {
    case 'h1':
      doc.font('Helvetica-Bold').fontSize(TERMS_FONT.h1);
      return doc.heightOfString(tituloOracion(bloque.texto), { width, lineGap: TERMS_LINE_GAP }) + 6;
    case 'h2':
      doc.font('Helvetica-Bold').fontSize(TERMS_FONT.h2);
      return doc.heightOfString(tituloOracion(bloque.texto), { width, lineGap: TERMS_LINE_GAP }) + 4;
    case 'p':
      doc.font('Helvetica').fontSize(TERMS_FONT.p);
      return doc.heightOfString(bloque.texto, { width, lineGap: TERMS_LINE_GAP }) + 4;
    case 'bullets': {
      doc.font('Helvetica').fontSize(TERMS_FONT.bullets);
      let h = 2;
      bloque.items.forEach((item) => { h += doc.heightOfString(item, { width: width - 14, lineGap: TERMS_LINE_GAP }) + 2; });
      return h;
    }
    case 'numbered': {
      doc.font('Helvetica').fontSize(TERMS_FONT.bullets);
      let h = 2;
      bloque.items.forEach((item) => { h += doc.heightOfString(item, { width: width - 18, lineGap: TERMS_LINE_GAP }) + 2; });
      return h;
    }
    case 'nota':
      doc.font('Helvetica').fontSize(TERMS_FONT.nota);
      return doc.heightOfString(bloque.texto, { width: width - 16, lineGap: TERMS_LINE_GAP }) + 18;
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
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(TERMS_FONT.h1).text(tituloOracion(bloque.texto), x, y, { width, lineGap: TERMS_LINE_GAP });
      return doc.y - y + 2;
    case 'h2':
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(TERMS_FONT.h2).text(tituloOracion(bloque.texto), x, y, { width, lineGap: TERMS_LINE_GAP });
      return doc.y - y + 2;
    case 'p':
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(TERMS_FONT.p).text(bloque.texto, x, y, { width, lineGap: TERMS_LINE_GAP });
      return doc.y - y + 2;
    case 'bullets': {
      let cy = y;
      bloque.items.forEach((item) => {
        doc.fillColor(COLORS.dark).font('Helvetica').fontSize(TERMS_FONT.bullets).text('•', x, cy, { width: 12, lineBreak: false });
        doc.text(item, x + 14, cy, { width: width - 14, lineGap: TERMS_LINE_GAP });
        cy = doc.y + 1.5;
      });
      return cy - y;
    }
    case 'numbered': {
      let cy = y;
      bloque.items.forEach((item, i) => {
        doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(TERMS_FONT.bullets).text(`${i + 1}.`, x, cy, { width: 16, lineBreak: false });
        doc.font('Helvetica').text(item, x + 18, cy, { width: width - 18, lineGap: TERMS_LINE_GAP });
        cy = doc.y + 1.5;
      });
      return cy - y;
    }
    case 'nota': {
      const h = alturaBloqueTermino(doc, bloque, width);
      doc.rect(x, y, width, h).fill('#fff3cd');
      doc.rect(x, y, width, h).stroke('#ffeeba');
      doc.fillColor('#856404').font('Helvetica').fontSize(TERMS_FONT.nota).text(bloque.texto, x + 8, y + 8, { width: width - 16, lineGap: TERMS_LINE_GAP });
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
function dibujarTerminosCondiciones(doc, asesor, startY) {
  // El bloque de contacto queda anclado justo arriba del pie en TODAS las
  // páginas, así que el contenido de términos debe dejar de fluir antes de
  // llegar a esa franja reservada.
  const bottomLimit = CONTACT_Y - 10;
  let y = startY;

  const saltarPagina = () => {
    // Cierra la página saliente con su bloque de contacto anclado al pie
    // antes de pasar a la siguiente.
    dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);
    doc.addPage();
    dibujarHeader(doc, 'TÉRMINOS Y CONDICIONES');
    y = 80;
  };

  // No se dibuja un título "Términos y Condiciones" aquí: el título de la
  // página (arriba, en el encabezado) ya lo indica.
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
    y += usedH + 3;
  });

  // Cierra la última página de términos con su bloque de contacto al pie.
  dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);
}

/**
 * Dibuja el PDF estructurado en varias páginas
 */
function dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor) {
  const sumaFormateada = `$${Number(sumaAsegurada).toLocaleString('en-US')}`;

  // ==========================================
  // PÁGINA 1: DATOS DEL ASEGURADO + TARJETAS DE PLANES
  // ==========================================
  dibujarHeader(doc, `SU PROPUESTA (SUMA ASEGURADA ${sumaFormateada})`);

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(11)
     .text(`DIAGNÓSTICO Y COMPARATIVA DE SEGUROS DE SALUD (SUMA ASEGURADA ${sumaFormateada})`, MARGIN, 75, { lineBreak: false });

  dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada);

  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = DATOS_BOX_BASE_H + depLines * 14;

  const titleY = 92 + boxH + 16;
  const subtitleY = titleY + 13;
  const startCardsY = subtitleY + 20;

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Tu Comparativo Personalizado de Aseguradoras', MARGIN, titleY, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
     .text('Cada tarjeta resume el plan, la prima anual y los beneficios adicionales ofrecidos para la edad y suma asegurada cotizadas.', MARGIN, subtitleY, { width: CONTENT_W, lineBreak: false });

  let cardY = startCardsY;
  const cardH = 150;
  const cardGap = 22; // más espacio de separación entre tarjetas para que no se vean pegadas

  comparativas.forEach((comp) => {
    if (cardY + cardH > CONTACT_Y - 10) {
      // Cierra la página saliente con el bloque de contacto anclado al pie
      dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);
      doc.addPage();
      dibujarHeader(doc, 'SU PROPUESTA (CONTINUACIÓN)');
      cardY = 80;
    }
    dibujarTarjetaAseguradora(doc, MARGIN, cardY, CONTENT_W, cardH, comp, !!comp.recomendada);
    cardY += cardH + cardGap;
  });

  // Contacta a tu asesor: siempre anclado justo arriba del pie de página
  dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);

  // ==========================================
  // PÁGINA: SECCIÓN DE MARKETING / DISTRIBUCIÓN DE PROTECCIÓN
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, '¿ESTÁ REALMENTE PROTEGIDO?');

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

  // Si el contenido fijo de esta página llegara a invadir la franja reservada
  // para el bloque de contacto (por ejemplo, en un tamaño de página distinto),
  // se abre una página nueva antes de anclarlo al pie.
  if (boxesY + 82 > CONTACT_Y - 10) {
    doc.addPage();
    dibujarHeader(doc, '¿ESTÁ REALMENTE PROTEGIDO? (CONTINUACIÓN)');
  }
  dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);

  // ==========================================
  // PÁGINA: TÉRMINOS Y CONDICIONES
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, 'TÉRMINOS Y CONDICIONES');

  let condY = 80;

  // Nota de Asesoría: primer bloque de la página, antes del contenido legal.
  doc.rect(MARGIN, condY, CONTENT_W, 40).fill('#fff3cd');
  doc.rect(MARGIN, condY, CONTENT_W, 40).stroke('#ffeeba');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5).text('NOTA DE ASESORÍA:', MARGIN + 8, condY + 6, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Los precios aquí reflejados son de carácter informativo e ilustrativo y pueden cambiar según la cantidad definitiva de asegurados y regulaciones de la SUDEASEG. Comuníquese con su asesor asignado para formalizar la contratación.', MARGIN + 8, condY + 16, { width: CONTENT_W - 16 });

  condY += 52;

  // El bloque de contacto de esta página (y de las que sigan con los Términos
  // y Condiciones) se dibuja de forma uniforme, siempre anclado al pie, dentro
  // de dibujarTerminosCondiciones — así no queda un bloque "extra" a mitad de
  // página además del anclado al final.
  if (condY > CONTACT_Y - 10) {
    doc.addPage();
    dibujarHeader(doc, 'TÉRMINOS Y CONDICIONES (CONTINUACIÓN)');
    condY = 80;
  }

  // ==========================================
  // TÉRMINOS Y CONDICIONES (continúa en tantas páginas como haga falta)
  // ==========================================
  dibujarTerminosCondiciones(doc, asesor, condY);

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
