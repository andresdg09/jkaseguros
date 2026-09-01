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

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(12).text('www.protecciónyseguros360.com', MARGIN, 26, { lineBreak: false });

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

// --- Constantes de layout de la tarjeta de aseguradora (compartidas entre la
// función que mide la altura necesaria y la que dibuja, para que nunca queden
// desincronizadas). Reproduce el "Cuadro Comparativo de Opciones" de la
// página web (front/src/app/page.js, sección de resultados de cotización). ---
const CARD_TOP_PAD = 8;
const CARD_HEADER_H = 30; // nombre + plan + línea divisoria
const CARD_GAP = 8;
const CARD_PRICEBOX_H = 80; // caja de precio única (etiqueta y valor en líneas separadas, para tarjetas angostas en 2 columnas)
const SECTION_TITLE_H = 9;
const GAP_XS = 4;
const DEDBOX_H = 20;
const GAP_SM = 6;
const GRID_ROWS = 8; // 15 servicios en grid de 2 columnas
const GRID_ROW_H = 10;
const GRID_H = GRID_ROWS * GRID_ROW_H;
const SECTION_DIVIDER_GAP = 10;
const EXTRAS_BOX_H = 74; // título + 5 filas con separador punteado
const PAYMENT_BOX_FIXED = 24; // título + paddings de la caja de formas de pago (sin las píldoras)
const CARD_BOTTOM_PAD = 10;

const PAY_CHIP_FONT = 6;
const PAY_CHIP_PAD_X = 5;
const PAY_CHIP_PAD_Y = 2.5;
const PAY_CHIP_GAP_X = 4;
const PAY_CHIP_GAP_Y = 4;
const PAY_CHIP_H = PAY_CHIP_FONT + PAY_CHIP_PAD_Y * 2;

// Frecuencias de pago con su color de píldora — igual a la tabla de colores
// usada en el comparativo web.
const PAYMENT_TYPES = [
  { flag: 'pago_contado', label: 'Contado (1)', bg: '#e0f2fe', fg: '#0369a1' },
  { flag: 'pago_semestral', label: 'Semestral (2)', bg: '#fef3c7', fg: '#b45309' },
  { flag: 'pago_cuatrimestral', label: 'Cuatrimestral (3)', bg: '#ffedd5', fg: '#c2410c' },
  { flag: 'pago_trimestral', label: 'Trimestral (4)', bg: '#f3e8ff', fg: '#7e22ce' },
  { flag: 'pago_bimestral', label: 'Bimestral (6)', bg: '#fce7f3', fg: '#9d174d' },
  { flag: 'pago_4_cuotas', label: '4 Cuotas (4)', bg: '#e0e7ff', fg: '#3730a3' },
  { flag: 'pago_mensual', label: 'Mensual (12)', bg: '#dcfce7', fg: '#15803d' }
];

/**
 * Calcula prima base, extras y sus costos individuales para una aseguradora.
 */
function calcularDatosFinancieros(comp) {
  const costoMat = parseExtraCost(comp.maternidad_costo);
  const costoAsist = parseExtraCost(comp.asist_intl_costo);
  const costoFuneral = parseExtraCost(comp.funeral_costo);
  const costoMuerteAcc = parseExtraCost(comp.muerte_accidental_costo);
  const costoInvalidez = parseExtraCost(comp.invalidez_permanente_costo);
  const totalExtras = costoMat + costoAsist + costoFuneral + costoMuerteAcc + costoInvalidez;
  const primaBase = parseFloat(comp.prima || 0);
  const primaConExtras = primaBase + totalExtras;
  return { costoMat, costoAsist, costoFuneral, costoMuerteAcc, costoInvalidez, totalExtras, primaBase, primaConExtras };
}

/**
 * Lista de 15 servicios del plan base para el grid de 2 columnas — mismos
 * campos y mismo orden que la sección "Coberturas y Beneficios Incluidos"
 * del tarifario (panel admin), no el comparativo de la web.
 */
function construirServiciosGrid(comp, fin) {
  return [
    { name: 'Atención Médica Primaria (AMP)', active: !!(comp.atencion_medica_primaria || comp.at_situ_medicamentos === 'INCL') },
    { name: 'Medicamentos Prescritos', active: !!comp.medicinas },
    { name: 'Consultas Médicas', active: !!comp.consultas_medicas },
    { name: 'Exámenes Lab e Imágenes', active: !!(comp.examenes_lab_imagenologia && comp.examenes_lab_imagenologia !== 'NO' && comp.examenes_lab_imagenologia !== 'false') },
    { name: 'Servicio de Ambulancia', active: !!(comp.ambulancia && comp.ambulancia !== 'NO' && comp.ambulancia !== 'false') },
    { name: 'Consultas Especialistas', active: !!comp.consultas },
    { name: 'Fisioterapia / Rehabilitación', active: !!comp.rehabilitacion },
    { name: 'Prótesis Quirúrgicas', active: !!comp.protesis },
    { name: 'Muleta + Silla de Ruedas', active: !!comp.muleta_silla_ruedas },
    { name: 'Oftalmología', active: !!comp.oftalmologia },
    { name: 'Odontología', active: !!comp.odontologia },
    { name: 'Muerte Accidental', active: !!((comp.muerte_accidental || comp.muerte_accidental_suma) && fin.costoMuerteAcc === 0) },
    { name: 'Invalidez Permanente', active: !!((comp.invalidez_permanente || comp.invalidez_permanente_suma) && fin.costoInvalidez === 0) },
    { name: 'Cobertura de Maternidad', active: !!((comp.maternidad || comp.maternidad_suma) && fin.costoMat === 0) },
    { name: 'Reembolso / Carta Aval', active: !!comp.reembolso_carta_aval }
  ];
}

/**
 * Recorta un texto (con "…") para que quepa dentro de `maxWidth` con la
 * fuente/tamaño ya seleccionados en `doc`. Usado en todo el texto que viene
 * de datos variables (nombre de aseguradora, plan, valores de coberturas)
 * para que nunca se monte con el texto vecino, sin importar cuán largo sea.
 */
function ajustarTexto(doc, text, maxWidth) {
  const str = String(text ?? '');
  if (maxWidth <= 0 || doc.widthOfString(str) <= maxWidth) return str;
  const elipsis = '…';
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidato = str.slice(0, mid) + elipsis;
    if (doc.widthOfString(candidato) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return lo === 0 ? elipsis : str.slice(0, lo) + elipsis;
}

/**
 * Coberturas extras opcionales (5 filas, siempre visibles) con el mismo
 * texto que arma el comparativo web ("Incluida en base" / "No incluida" /
 * suma + costo).
 */
function construirExtrasWeb(comp, fin) {
  const frase = (tieneCobertura, suma, costo, textoNo) => {
    if (!tieneCobertura) return textoNo;
    return costo > 0 ? `${suma || 'Cubierta'} (+ $${costo.toFixed(2)}/año)` : `${suma || 'Cubierta'} (Incluida en base)`;
  };
  return [
    { label: 'Muerte Accidental:', value: frase(!!(comp.muerte_accidental_suma || comp.muerte_accidental), comp.muerte_accidental_suma, fin.costoMuerteAcc, 'No incluida') },
    { label: 'Invalidez Permanente:', value: frase(!!(comp.invalidez_permanente_suma || comp.invalidez_permanente), comp.invalidez_permanente_suma, fin.costoInvalidez, 'No incluida') },
    { label: 'Maternidad:', value: frase(!!(comp.maternidad_suma || comp.maternidad), comp.maternidad_suma, fin.costoMat, 'No incluida') },
    { label: 'Asistencia de Viajes:', value: frase(!!comp.asist_intl_suma, comp.asist_intl_suma, fin.costoAsist, 'No incluida') },
    { label: 'Servicio Funeral:', value: frase(!!comp.funeral_suma, comp.funeral_suma, fin.costoFuneral, 'No incluido') }
  ];
}

/**
 * Píldoras de formas de pago aceptadas (una por cada frecuencia disponible;
 * "Contado" por defecto si no hay ninguna marcada).
 */
function construirChipsPago(comp) {
  const items = PAYMENT_TYPES.filter((p) => comp[p.flag]).map((p) => ({ label: p.label, bg: p.bg, fg: p.fg }));
  if (items.length === 0) items.push({ label: 'Contado', bg: '#f1f5f9', fg: '#475569' });
  return items;
}

/**
 * Distribuye píldoras en filas según el ancho disponible (flex-wrap). Solo
 * mide (widthOfString), no dibuja, así que se puede llamar tanto para medir
 * la altura de la tarjeta como para dibujarla sin riesgo de desincronización.
 */
function calcularFilasPildoras(doc, items, containerWidth, fontSize, padX, gapX) {
  doc.font('Helvetica-Bold').fontSize(fontSize);
  const rows = [[]];
  let curW = 0;
  items.forEach((it) => {
    const w = doc.widthOfString(it.label) + padX * 2;
    const row = rows[rows.length - 1];
    const extra = row.length > 0 ? gapX : 0;
    if (row.length > 0 && curW + extra + w > containerWidth) {
      rows.push([{ ...it, w }]);
      curW = w;
    } else {
      row.push({ ...it, w });
      curW += extra + w;
    }
  });
  return rows;
}

/**
 * Calcula la altura total que ocupará la tarjeta de una aseguradora, sin
 * dibujarla, para decidir si hace falta saltar de página antes (o cuánto
 * reducir `scale` para que todas quepan en la misma página). `scale` reduce
 * proporcionalmente todos los tamaños de fuente y espaciados verticales
 * (pero no el ancho de la tarjeta, que ya viene dado por la cantidad de
 * columnas) — así se puede achicar la tarjeta completa manteniendo las
 * proporciones cuando hay muchas aseguradoras para mostrar.
 */
function calcularAlturaTarjeta(doc, comp, width, scale = 1) {
  const s = scale;
  const contentW = width - 24;
  const chipsPago = construirChipsPago(comp);
  const filasPago = calcularFilasPildoras(doc, chipsPago, contentW - 16 * s, PAY_CHIP_FONT * s, PAY_CHIP_PAD_X * s, PAY_CHIP_GAP_X * s);
  const payChipH = PAY_CHIP_FONT * s + PAY_CHIP_PAD_Y * s * 2;
  const chipsH = filasPago.length * payChipH + (filasPago.length - 1) * PAY_CHIP_GAP_Y * s;
  const fixedSum = CARD_TOP_PAD + CARD_HEADER_H + CARD_GAP + CARD_PRICEBOX_H + CARD_GAP +
         SECTION_TITLE_H + GAP_XS + DEDBOX_H + GAP_SM + GRID_H + SECTION_DIVIDER_GAP +
         EXTRAS_BOX_H + CARD_GAP + PAYMENT_BOX_FIXED + CARD_BOTTOM_PAD;
  return fixedSum * s + chipsH;
}

/**
 * Dibuja una tarjeta de plan de seguro para una aseguradora, replicando el
 * "Cuadro Comparativo de Opciones" de la página web: nombre (oscuro) + plan
 * (azul) con línea divisoria, caja de precio única de ancho completo (prima
 * base y total con extras en una sola caja), caja de deducible, grid de 2
 * columnas con los 15 servicios del plan base, recuadro de coberturas extras
 * con separadores punteados, y píldoras de colores por forma de pago
 * (sin score de cobertura, no se muestra en el PDF).
 *
 * `scale` (por defecto 1) reduce proporcionalmente fuentes y espaciados
 * verticales — lo usa `dibujarPdf` para que todas las tarjetas quepan en una
 * sola página sin importar cuántas aseguradoras se estén comparando.
 *
 * `forcedHeight` (opcional) fuerza el alto del recuadro de la tarjeta a un
 * valor dado en vez del que necesitaría su propio contenido — así todas las
 * tarjetas de la comparativa quedan del mismo tamaño (se usa el alto de la
 * que más contenido tenga), aunque a alguna le sobre espacio libre al final.
 */
function dibujarTarjetaAseguradora(doc, x, y, width, comp, scale = 1, forcedHeight = null) {
  const s = scale;
  const padX = x + 12;
  const contentW = width - 24;
  const fin = calcularDatosFinancieros(comp);
  const hayExtras = fin.totalExtras > 0;
  const height = forcedHeight != null ? forcedHeight : calcularAlturaTarjeta(doc, comp, width, s);

  // Tarjeta blanca con borde gris, igual para todas las opciones — el
  // comparativo web no distingue visualmente un plan "recomendado".
  doc.roundedRect(x, y, width, height, 8).fill('#ffffff');
  doc.roundedRect(x, y, width, height, 8).lineWidth(1).stroke(COLORS.border);

  let cy = y + CARD_TOP_PAD * s;

  // --- Encabezado: nombre oscuro + plan azul + línea divisoria ---
  // Nombre y plan vienen de datos del tarifario (largo variable): se recortan
  // con "…" si no caben, en vez de desbordarse sobre el resto de la tarjeta.
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(10.5 * s);
  doc.text(ajustarTexto(doc, comp.nombre, contentW), padX, cy, { width: contentW, lineBreak: false });
  doc.fillColor(COLORS.secondary).font('Helvetica-Bold').fontSize(7.5 * s);
  doc.text(ajustarTexto(doc, `PLAN: ${(comp.plan || 'N/D').toUpperCase()}`, contentW), padX, cy + 14 * s, { width: contentW, lineBreak: false });
  doc.strokeColor(COLORS.border).lineWidth(1).moveTo(padX, cy + CARD_HEADER_H * s - 5 * s).lineTo(padX + contentW, cy + CARD_HEADER_H * s - 5 * s).stroke();
  cy += (CARD_HEADER_H + CARD_GAP) * s;

  // --- Caja de precio dual (una sola caja de ancho completo) ---
  // La etiqueta va en su propia línea (en vez de compartir renglón con el
  // valor, como en la web) para que quepa cómodamente en tarjetas angostas.
  const priceY = cy;
  const priceInnerX = padX + 10 * s;
  const priceBoxH = CARD_PRICEBOX_H * s;
  doc.roundedRect(padX, priceY, contentW, priceBoxH, 8).fill('#eff6ff');
  doc.roundedRect(padX, priceY, contentW, priceBoxH, 8).lineWidth(1).stroke(COLORS.border);
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(6.2 * s).text('PRIMA BASE (SIN EXTRAS)', priceInnerX, priceY + 8 * s, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(12 * s)
     .text(`$${fin.primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceInnerX, priceY + 17 * s, { continued: true, lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6 * s).text(' por año', { lineBreak: false });
  // Línea divisoria punteada
  doc.dash(2, { space: 2 }).strokeColor(COLORS.border).lineWidth(0.75)
     .moveTo(priceInnerX, priceY + 34 * s).lineTo(padX + contentW - 10 * s, priceY + 34 * s).stroke();
  doc.undash();
  if (hayExtras) {
    doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(6.3 * s).text('TOTAL CON EXTRAS', priceInnerX, priceY + 40 * s, { lineBreak: false });
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(10.5 * s)
       .text(`$${fin.primaConExtras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceInnerX, priceY + 49 * s, { lineBreak: false });
    doc.fillColor('#b45309').font('Helvetica').fontSize(5.8 * s).text(`(+$${fin.totalExtras.toFixed(2)} en extras)`, priceInnerX, priceY + 64 * s, { lineBreak: false });
  } else {
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(6.3 * s).text('PLAN COMPLETO', priceInnerX, priceY + 40 * s, { lineBreak: false });
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9.5 * s)
       .text(`$${fin.primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceInnerX, priceY + 49 * s, { lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.8 * s).text('(sin costos extras)', priceInnerX, priceY + 64 * s, { lineBreak: false });
  }
  cy += (CARD_PRICEBOX_H + CARD_GAP) * s;

  // --- Título "✓ INCLUIDO EN PLAN BASE:" ---
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(7.2 * s).text('✓ INCLUIDO EN PLAN BASE:', padX, cy, { lineBreak: false });
  cy += (SECTION_TITLE_H + GAP_XS) * s;

  // --- Caja de Deducible ---
  const deducibleVal = comp.deducible !== undefined && comp.deducible !== null && parseFloat(comp.deducible) > 0
    ? `$${Number(comp.deducible).toLocaleString('en-US')}`
    : '$0 (Sin deducible)';
  const dedboxH = DEDBOX_H * s;
  doc.roundedRect(padX, cy, contentW, dedboxH, 4).fill('#f8fafc');
  doc.roundedRect(padX, cy, contentW, dedboxH, 4).lineWidth(1).stroke(COLORS.border);
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(7 * s).text('Deducible:', padX + 8 * s, cy + 6 * s, { lineBreak: false });
  doc.fillColor(parseFloat(comp.deducible || 0) > 0 ? '#b45309' : '#15803d').font('Helvetica-Bold').fontSize(7 * s)
     .text(deducibleVal, padX, cy + 6 * s, { width: contentW - 8 * s, align: 'right' });
  cy += (DEDBOX_H + GAP_SM) * s;

  // --- Grid de servicios incluidos (2 columnas x 8 filas) ---
  const servicios = construirServiciosGrid(comp, fin);
  const gridColW = contentW / 2;
  const gridRowH = GRID_ROW_H * s;
  const gridLabelW = gridColW - 14 * s;
  servicios.forEach((sv, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const ix = padX + col * gridColW;
    const iy = cy + row * gridRowH;
    doc.fillColor(sv.active ? '#15803d' : COLORS.border).font('Helvetica-Bold').fontSize(6.5 * s).text(sv.active ? '✓' : '•', ix, iy, { width: 10 * s, lineBreak: false });
    doc.fillColor(sv.active ? COLORS.dark : '#94a3b8').font(sv.active ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5 * s);
    doc.text(ajustarTexto(doc, sv.name, gridLabelW), ix + 10 * s, iy, { width: gridLabelW, lineBreak: false });
  });
  cy += GRID_H * s;

  // Línea divisoria que cierra la sección "Incluido en Plan Base"
  doc.strokeColor(COLORS.border).lineWidth(1).moveTo(padX, cy + (SECTION_DIVIDER_GAP * s) / 2 - 1).lineTo(padX + contentW, cy + (SECTION_DIVIDER_GAP * s) / 2 - 1).stroke();
  cy += SECTION_DIVIDER_GAP * s;

  // --- Coberturas extras: recuadro gris, 5 filas con separador punteado ---
  const extras = construirExtrasWeb(comp, fin);
  const extraBoxY = cy;
  const extrasBoxH = EXTRAS_BOX_H * s;
  doc.roundedRect(padX, extraBoxY, contentW, extrasBoxH, 6).fill('#f8fafc');
  doc.roundedRect(padX, extraBoxY, contentW, extrasBoxH, 6).lineWidth(1).stroke(COLORS.border);
  const extrasTituloW = contentW - 16 * s;
  doc.fillColor(hayExtras ? '#b45309' : COLORS.primary).font('Helvetica-Bold').fontSize(6.2 * s);
  doc.text(ajustarTexto(doc, hayExtras ? '➕ COBERTURAS EXTRAS (CON COSTO):' : '➕ COBERTURAS ADICIONALES:', extrasTituloW), padX + 8 * s, extraBoxY + 7 * s, { width: extrasTituloW, lineBreak: false });
  extras.forEach((ext, idx) => {
    const rowY = extraBoxY + (19 + idx * 10) * s;
    // La etiqueta es siempre corta y fija, pero el VALOR viene del tarifario
    // (texto libre, largo variable) — se recorta según el espacio que deja
    // libre la etiqueta, para que nunca se monten entre sí.
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.3 * s);
    doc.text(ext.label, padX + 8 * s, rowY, { lineBreak: false });
    const labelW = doc.widthOfString(ext.label);
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(6.3 * s);
    const valueMaxW = Math.max(24 * s, contentW - 16 * s - labelW - 6 * s);
    doc.text(ajustarTexto(doc, ext.value, valueMaxW), padX, rowY, { width: contentW - 8 * s, align: 'right' });
    if (idx < extras.length - 1) {
      doc.dash(1, { space: 1.5 }).strokeColor(COLORS.border).lineWidth(0.5)
         .moveTo(padX + 8 * s, rowY + 8.5 * s).lineTo(padX + contentW - 8 * s, rowY + 8.5 * s).stroke();
      doc.undash();
    }
  });
  cy += extrasBoxH + CARD_GAP * s;

  // --- Formas de pago aceptadas: recuadro gris con píldoras de color ---
  const chipsPago = construirChipsPago(comp);
  const payChipFont = PAY_CHIP_FONT * s;
  const payChipPadX = PAY_CHIP_PAD_X * s;
  const payChipPadY = PAY_CHIP_PAD_Y * s;
  const payChipGapX = PAY_CHIP_GAP_X * s;
  const payChipGapY = PAY_CHIP_GAP_Y * s;
  const payChipH = payChipFont + payChipPadY * 2;
  const filasPago = calcularFilasPildoras(doc, chipsPago, contentW - 16 * s, payChipFont, payChipPadX, payChipGapX);
  const chipsH = filasPago.length * payChipH + (filasPago.length - 1) * payChipGapY;
  const payBoxY = cy;
  const payBoxH = PAYMENT_BOX_FIXED * s + chipsH;
  doc.roundedRect(padX, payBoxY, contentW, payBoxH, 6).fill('#f8fafc');
  doc.roundedRect(padX, payBoxY, contentW, payBoxH, 6).lineWidth(1).stroke(COLORS.border);
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(7 * s).text('Formas de Pago Aceptadas:', padX + 8 * s, payBoxY + 7 * s, { lineBreak: false });
  let chipY = payBoxY + 19 * s;
  filasPago.forEach((fila) => {
    let chipX = padX + 8 * s;
    fila.forEach((chip) => {
      doc.roundedRect(chipX, chipY, chip.w, payChipH, 3).fill(chip.bg);
      doc.fillColor(chip.fg).font('Helvetica-Bold').fontSize(payChipFont).text(chip.label, chipX, chipY + payChipPadY, { width: chip.w, align: 'center', lineBreak: false });
      chipX += chip.w + payChipGapX;
    });
    chipY += payChipH + payChipGapY;
  });
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
  const rowGap = 14;
  const colGap = 12;

  // El máximo de aseguradoras comparadas por PDF es 3, así que siempre entran
  // lado a lado en una sola fila (1, 2 o 3 columnas según cuántas haya). Si
  // por algún motivo llegaran más de 3, se arman filas adicionales de a 3 y
  // el escalado de abajo se encarga de que quepan igual en una sola página.
  const numComps = comparativas.length;
  const columns = Math.max(1, Math.min(numComps, 3));

  const cardW = (CONTENT_W - (columns - 1) * colGap) / columns;
  const filas = [];
  for (let i = 0; i < numComps; i += columns) {
    filas.push(comparativas.slice(i, i + columns));
  }

  // Se intenta encajar TODAS las tarjetas en el espacio vertical restante de
  // la página actual, reduciendo proporcionalmente su tamaño (fuentes y
  // espaciados) con `scale`. Si ni siquiera al tamaño mínimo legible entran,
  // se recurre al flujo anterior con salto de página por fila, a tamaño
  // completo.
  //
  // Todas las tarjetas usan el mismo alto — el de la que más contenido
  // necesite (calcularAlturaMaxima) — para que se vean del mismo tamaño en
  // vez de que cada una se ajuste solo a su propio contenido.
  const MIN_SCALE = 0.62;
  const calcularAlturaMaxima = (scale) => Math.max(...comparativas.map((comp) => calcularAlturaTarjeta(doc, comp, cardW, scale)));
  const alturaTotalFilas = (scale) => filas.length * calcularAlturaMaxima(scale) + (filas.length - 1) * rowGap;

  const availableH = (CONTACT_Y - 10) - cardY;
  const alturaSinEscalar = alturaTotalFilas(1);
  let scale = 1;
  if (alturaSinEscalar > availableH && availableH > 0) {
    scale = Math.max(MIN_SCALE, availableH / alturaSinEscalar);
  }

  if (alturaTotalFilas(scale) <= availableH) {
    // Todas las tarjetas caben en la página actual, sin saltos de página.
    const cardH = calcularAlturaMaxima(scale);
    filas.forEach((fila) => {
      fila.forEach((comp, j) => {
        const cardX = MARGIN + j * (cardW + colGap);
        dibujarTarjetaAseguradora(doc, cardX, cardY, cardW, comp, scale, cardH);
      });
      cardY += cardH + rowGap;
    });
  } else {
    // Demasiadas aseguradoras para una sola página incluso al tamaño mínimo:
    // se dibuja a tamaño completo (más legible) con salto de página por fila.
    const cardH = calcularAlturaMaxima(1);
    filas.forEach((fila) => {
      if (cardY + cardH > CONTACT_Y - 10) {
        // Cierra la página saliente con el bloque de contacto anclado al pie
        dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);
        doc.addPage();
        dibujarHeader(doc, 'SU PROPUESTA (CONTINUACIÓN)');
        cardY = 80;
      }
      fila.forEach((comp, j) => {
        const cardX = MARGIN + j * (cardW + colGap);
        dibujarTarjetaAseguradora(doc, cardX, cardY, cardW, comp, 1, cardH);
      });
      cardY += cardH + rowGap;
    });
  }

  // Contacta a tu asesor: siempre anclado justo arriba del pie de página
  dibujarContactoAsesor(doc, asesor, MARGIN, CONTACT_Y, CONTENT_W);

  // ==========================================
  // PÁGINA: SECCIÓN DE MARKETING / DISTRIBUCIÓN DE PROTECCIÓN
  // Orden: título → cuadro de atención → gráfica → título "El valor de
  // blindar tu esfuerzo" → carta personal. Todo debe caber en esta página.
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, '¿ESTÁ REALMENTE PROTEGIDO?');

  let mktY = 78;

  // 1. Título principal
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(15)
     .text('¿Sabías que un seguro de salud es solo una parte de la protección que necesitas?', MARGIN, mktY, { width: CONTENT_W });
  mktY = doc.y + 14;

  // 2. Cuadro de atención (ahora arriba de la gráfica)
  const calloutH = 40;
  doc.roundedRect(MARGIN, mktY, CONTENT_W, calloutH, 6).fill('#fff7ed');
  doc.roundedRect(MARGIN, mktY, CONTENT_W, calloutH, 6).stroke('#fed7aa');
  doc.fillColor('#9a3412').font('Helvetica-Bold').fontSize(8.5)
     .text('¡ATENCIÓN! HOY SOLO ESTÁS CUBRIENDO EL 20% DE TU PROTECCIÓN FINANCIERA IDEAL', MARGIN + 12, mktY + 8, { width: CONTENT_W - 24, lineBreak: false });
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5)
     .text('Con un seguro de salud contratado, aún te falta cubrir otras áreas importantes de tu vida, considerando tu perfil individual.', MARGIN + 12, mktY + 20, { width: CONTENT_W - 24 });
  mktY += calloutH + 16;

  // 3. Gráfica de distribución de protección financiera
  const chartCx = MARGIN + 90;
  const chartCy = mktY + 85;
  const chartRadius = 78;
  dibujarGraficoDistribucion(doc, chartCx, chartCy, chartRadius, MARGIN + 210, mktY + 20);
  mktY += 178;

  // 4. Título "El valor de blindar tu esfuerzo"
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(11.5)
     .text('El valor de blindar tu esfuerzo', MARGIN, mktY, { lineBreak: false });
  mktY += 18;

  // 5. Carta personal: fuente reducida y sin salto de página, para que todo
  // el texto entre en esta misma página junto con el título y la gráfica.
  const MKT_FONT = 7.8;
  const MKT_GAP = -0.2;

  const drawMktP = (texto, y) => {
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(MKT_FONT)
       .text(texto, MARGIN, y, { width: CONTENT_W, lineGap: MKT_GAP });
    return doc.y;
  };

  const drawMktItem = (num, lead, resto, y) => {
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(MKT_FONT)
       .text(`${num}) ${lead} `, MARGIN, y, { width: CONTENT_W, continued: true, lineGap: MKT_GAP });
    doc.font('Helvetica').text(resto, { lineGap: MKT_GAP });
    return doc.y;
  };

  mktY = drawMktP('Primero que nada, quiero felicitarte de corazón. Al dar el paso de solicitar tu seguro de salud, estás demostrando algo invaluable: el compromiso real de proteger tu vida y estar allí para quienes dependen de ti. Cuidar de tu bienestar físico es, sin duda, la base de todo.', mktY) + 5;
  mktY = drawMktP('Sin embargo, sabemos muy bien que la verdadera tranquilidad no se vive a medias; por eso, con la misma prioridad con la que hoy blindas tu salud, quiero ayudarte a proteger los otros pilares que sostienen tu mundo:', mktY) + 5;
  mktY = drawMktItem(1, 'El futuro de los tuyos (Seguro de Vida):', 'Tu salud estará respaldada, pero tu amor va más allá del presente. Si el día de mañana no llegaras a estar, una póliza de vida es la certeza de que los sueños de tus hijos, su educación y el sustento de tu hogar seguirán adelante, sin que ellos tengan que heredar cargas financieras ni desamparo en los momentos más difíciles.', mktY) + 4;
  mktY = drawMktItem(2, 'Tu verdadero refugio (Seguro de Hogar):', 'Tu cuerpo es tu primer templo, y tu casa el segundo. Ya seas propietario o inquilino, allí dentro está tu historia, tus recuerdos y el esfuerzo de tus años reflejado en cada mueble y equipo electrónico. Protégela frente a incendios, daños por agua o terremotos; que un imprevisto de la naturaleza jamás te arrebate lo que tanto te costó levantar.', mktY) + 4;
  mktY = drawMktItem(3, 'Tu tranquilidad en el camino (Seguro de Auto):', 'Tu vehículo es tu herramienta de movilidad diaria y parte de tu libertad. En nuestras vías, los riesgos de un accidente, una avería o un percance vial están a la orden del día. Asegurarlo te garantiza el auxilio inmediato y la cobertura de daños para que un mal momento en la calle no se convierta en una crisis para tu bolsillo.', mktY) + 4;
  mktY = drawMktItem(4, 'El escudo para tu profesión y ahorros (Responsabilidad Civil General o Profesional):', 'Has pasado años preparándote y construyendo una reputación. Un error involuntario en tu ejercicio profesional o un accidente fortuito de un tercero bajo tu responsabilidad pueden poner en riesgo los ahorros de toda tu vida en un instante. Esta cobertura es el blindaje legal y económico que responde por ti ante reclamos o demandas, manteniendo a salvo tu patrimonio de años.', mktY) + 4;
  mktY = drawMktP('Al unificar y centralizar todas tus soluciones de protección conmigo, no solo optimizas tus costos, sino que ganas algo que no tiene precio: simplificar tu vida y tener un único punto de contacto de absoluta confianza para todo lo que te importa.', mktY) + 8;

  doc.fillColor(COLORS.primary).font('Helvetica-BoldOblique').fontSize(8.3)
     .text('Elegir salud es cuidar el presente. Completar tu protección es blindar tu futuro.', MARGIN, mktY, { width: CONTENT_W, align: 'center' });
  mktY = doc.y;

  // Si el contenido fijo de esta página llegara a invadir la franja reservada
  // para el bloque de contacto (por ejemplo, en un tamaño de página distinto),
  // se abre una página nueva antes de anclarlo al pie.
  if (mktY > CONTACT_Y - 10) {
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
