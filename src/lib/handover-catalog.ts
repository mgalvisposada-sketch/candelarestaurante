/**
 * Catálogo de empalme — Candela (fast food mexicano + tragos, una sede).
 *
 * Contexto de diseño:
 * - Emilio (socio ~20%) entrega la administración pero sigue como socio/chef.
 * - Ha pedido inyección de capital (“el restaurante no da”); los socios no han
 *   completado el 100% por falta de confianza en números, presupuesto alto,
 *   Holding burocrático y Publicidad sin estrategia visible.
 * - Steven (~30%) puede refinanciar si hay claridad; Esteban (~10%) ayudará a
 *   administrar. Grupo A (~20%) y Persona X (~20%) solo se conocen vía Emilio.
 *
 * Objetivo del acta: tranquilidad para el resto de socios — quién puso qué,
 * a dónde fue, qué hay, qué se debe, y qué se afirma sin prueba.
 *
 * Orden = temperatura: de lo tangible/conocido a lo más sensible (capital,
 * Holding/Publicidad, aportes por socio).
 */
export const HANDOVER_DOMAINS = [
  {
    value: "documentos",
    label: "Papeles y accesos",
    ask: "¿Qué papeles y accesos se entregan hoy para que nadie dependa de un solo puente?",
    expect:
      "Checklist de documentos y accesos (banco, correo, pasarelas, drive…). También lo que NO se entrega hoy.",
    href: "/documentos",
    hrefLabel: "Ver documentos",
  },
  {
    value: "activos",
    label: "Equipos del local",
    ask: "¿Qué equipos y bienes del restaurante se reciben?",
    expect:
      "Dos listas distintas: (1) cocina/barra que produce, (2) salón/servicio al cliente. No mezclar.",
  },
  {
    value: "inventario",
    label: "Inventario de apertura",
    ask: "¿Qué hay hoy en cocina y barra (orden de magnitud)?",
    expect:
      "Estimados de alimentos y de licores/tragos. No es conteo SKU del POS.",
  },
  {
    value: "contratos",
    label: "Contratos del local",
    ask: "¿Qué contratos o compromisos del local siguen vivos?",
    expect:
      "Arriendo, servicios, gas, internet, apps de domicilio, proveedores clave — con o sin papel.",
  },
  {
    value: "operacion",
    label: "Cómo está vendiendo",
    ask: "¿Cómo se ve la venta real de esta sede (sin juzgar, con números)?",
    expect:
      "Ventas por canal y qué se ha hecho (o no) para mover la venta. Declarado vale si no hay reporte formal.",
  },
  {
    value: "personal",
    label: "Gente del restaurante",
    ask: "¿Quién trabaja y cuánto cuesta la gente que mueve el local?",
    expect:
      "Costo aproximado de cocina/barra/servicio y acuerdos especiales (fijos, %, fuera de nómina). Admin/Holding va en gastos.",
  },
  {
    value: "gastos",
    label: "En qué se gasta",
    ask: "¿Cómo se reparte el gasto mensual — sobre todo Holding y Publicidad?",
    expect:
      "Solo gastos (arriendo, servicios, Holding, publicidad…). No insumos ni food cost: eso es costo, no gasto.",
  },
  {
    value: "presupuesto",
    label: "Presupuesto de gastos",
    ask: "Del presupuesto que usan hoy, ¿qué líneas son gastos y por cuánto?",
    expect:
      "Solo líneas de gasto (Holding, Publicidad, arriendo, servicios, admin…). Insumos/food cost son costo: no van aquí.",
  },
  {
    value: "cxc",
    label: "Quién nos debe",
    ask: "¿Quién le debe a Candela?",
    expect: "Terceros, eventos, vales. Incluye cobros de palabra si existen.",
  },
  {
    value: "cxp",
    label: "Proveedores y deudas",
    ask: "¿A quién se le debe y qué hay que pagar para no parar cocina/barra?",
    expect:
      "Proveedores con saldo. Marca en nota lo urgente y lo que es solo de palabra.",
    href: "/proveedores",
    hrefLabel: "Ver proveedores",
  },
  {
    value: "tributario",
    label: "Impuestos",
    ask: "¿Qué hay pendiente con impuestos — o quién lo sabe?",
    expect:
      "Obligaciones, sanciones o “preguntar al contador”. Mejor “no sé + fuente” que inventar.",
  },
  {
    value: "tesoreria",
    label: "Dónde está la plata hoy",
    ask: "¿Cuánta plata hay hoy y en qué cuentas/caja/pasarelas?",
    expect:
      "Bancos, caja del local y datáfonos/pasarelas. Preferible con extracto o captura; si no, declarado.",
    href: "/tesoreria",
    hrefLabel: "Ver tesorería",
  },
  {
    value: "capital",
    label: "Capital de socios",
    ask: "¿Quién inyectó, cuánto falta y a dónde fue la plata?",
    expect:
      "Aportes por socio, destino de lo inyectado, monto para sanear y checklist para refinanciar.",
    href: "/capital",
    hrefLabel: "Ver capital",
  },
  {
    value: "prestamos",
    label: "Préstamos y plata a devolver",
    ask: "¿Qué plata se acordó devolver (préstamo) y no es capital?",
    expect:
      "Préstamos de socios u otros, y aportes cuyo carácter (capital vs préstamo) aún no está claro.",
    href: "/prestamos",
    hrefLabel: "Ver préstamos",
  },
  {
    value: "socios",
    label: "Mapa de socios",
    ask: "Confirmemos participación y qué información llega solo por un puente",
    expect:
      "% por socio según acta + qué datos hoy solo existen vía Emilio.",
    href: "/socios",
    hrefLabel: "Ver socios",
  },
  {
    value: "otros",
    label: "Lo que falta decir",
    ask: "¿Hay algo más que los socios deban saber para decidir con tranquilidad?",
    expect:
      "Riesgos, promesas, contactos delicados o temas sensibles.",
  },
] as const;

export type HandoverDomain = (typeof HANDOVER_DOMAINS)[number]["value"];

export type HandoverAnswerMode = "list" | "single" | "confirm" | "docs";

export const DEFAULT_HANDOVER_ITEMS: Array<{
  domain: HandoverDomain;
  item_key: string;
  label: string;
  ask: string;
  answerMode: HandoverAnswerMode;
  expect?: string;
  answerHint?: string;
  help?: string;
}> = [
  // ——— 1. Documentos ———
  {
    domain: "documentos",
    item_key: "documentos_entregados",
    label: "Documentos entregados",
    ask: "¿Qué papeles oficiales se listan hoy — y cuáles aún faltan?",
    answerMode: "docs",
    expect:
      "Un renglón por documento: RUT, Cámara, estatutos, actas, poderes, contratos de arriendo… Monto 0.",
    answerHint:
      "Cómo llenar: en la nota de cada renglón escribe entregado / falta / parcial. Si un documento no está, igual créalo y márcalo “falta”.",
  },
  {
    domain: "documentos",
    item_key: "accesos_claves",
    label: "Accesos y claves",
    ask: "¿Qué accesos administrativos se registran hoy?",
    answerMode: "docs",
    expect:
      "Banco, correo empresa, DIAN, drive/cloud, pasarelas, apps de domicilio, POS admin si aplica. Monto 0.",
    answerHint:
      "Cómo llenar: un renglón por sistema. En la nota: quién lo tiene o “pendiente de entregar”. Si no aplica, “ninguno”.",
  },
  {
    domain: "documentos",
    item_key: "reportes_entregados",
    label: "Reportes y archivos de números",
    ask: "¿Qué Excel, reportes o carpetas de números se registran (aunque estén incompletos)?",
    answerMode: "docs",
    expect:
      "Presupuestos, flujos, listados de CxP, extractos, reportes de venta. Monto 0.",
    answerHint:
      "Cómo llenar: lista el archivo aunque esté a medias. En la nota: completo / parcial / no disponible.",
  },

  // ——— 2. Activos ———
  {
    domain: "activos",
    item_key: "activos_cocina_barra",
    label: "Equipos cocina y barra",
    ask: "¿Qué equipos de cocina y de barra (tragos) se registran?",
    answerMode: "list",
    expect:
      "Solo máquinas/muebles de producir: plancha, freidora, neveras, estación de tragos… Monto opcional.",
    answerHint:
      "Cómo llenar: solo cocina/barra. Mesas, sillas y datáfonos van en la siguiente pregunta. Monto opcional; estado en la nota (ok / regular / dañado).",
  },
  {
    domain: "activos",
    item_key: "activos_salon_otros",
    label: "Salón y servicio",
    ask: "¿Qué hay en el salón o para atender clientes (muebles, datáfonos, etc.)?",
    answerMode: "list",
    expect: "Mesas, sillas, TV, datáfonos, cámaras… Monto opcional.",
    answerHint:
      "Cómo llenar: solo salón/servicio. Neveras y freidoras van en cocina/barra.",
  },

  // ——— 3. Inventario ———
  {
    domain: "inventario",
    item_key: "inventario_alimentos",
    label: "Alimentos",
    ask: "¿Cuánto estimas el inventario de alimentos hoy (incluye soft drinks / aguas)?",
    answerMode: "single",
    expect:
      "Orden de magnitud en COP. Puedes anclarte en compras de la última semana.",
    answerHint:
      "Cómo llenar: un estimado en pesos (no conteo SKU del POS). El alcohol va en “Licores”. Si no sabes el valor exacto, pon un aproximado y marca “Sin prueba”.",
  },
  {
    domain: "inventario",
    item_key: "inventario_licores",
    label: "Licores y tragos",
    ask: "¿Cuánto estimas el inventario de licores / barra de tragos hoy?",
    answerMode: "list",
    expect:
      "Ideal: renglones por categoría (tequila, mezcal, cerveza…). Si solo hay un total, úsalo.",
    answerHint:
      "Cómo llenar: aquí es el stock (botellas), no las máquinas de barra. Puedes poner categorías o un solo total.",
  },

  // ——— 4. Contratos ———
  {
    domain: "contratos",
    item_key: "compromisos_contratos",
    label: "Contratos vigentes",
    ask: "¿Qué contratos o compromisos del local siguen vivos?",
    answerMode: "list",
    expect:
      "Arriendo, gas, internet, aseo, apps (Rappi/iFood/etc.), mantenimiento. Canon en monto; vencimiento en nota.",
    answerHint:
      "Cómo llenar: nombre del contrato + monto si hay. En la nota: con papel / de palabra, y fecha de vencimiento si la conoces.",
  },

  // ——— 5. Operación ———
  {
    domain: "operacion",
    item_key: "ventas_por_canal",
    label: "Ventas por canal",
    ask: "En el mes más reciente disponible, ¿cuánto se vendió por canal?",
    answerMode: "list",
    expect:
      "Un renglón por canal: salón, domicilio, Rappi/apps, tragos si se separa. Monto = venta del mes (o promedio).",
    answerHint:
      "Cómo llenar: un renglón por canal con el monto. Si es estimado, en Fuente escribe “estimado” o el nombre del reporte.",
  },
  {
    domain: "operacion",
    item_key: "acciones_comerciales",
    label: "Acciones para vender",
    ask: "¿Qué acciones se han hecho en los últimos 60–90 días para mover ventas?",
    answerMode: "list",
    expect:
      "Promos, menú, redes, alianzas, horarios, eventos… Un renglón por acción. Monto = costo si hubo.",
    answerHint:
      "Cómo llenar: una fila por acción. Si no hubo ninguna, deja un renglón “Ninguna en el período” con monto 0.",
  },

  // ——— 6. Personal ———
  {
    domain: "personal",
    item_key: "costo_personal_operativo",
    label: "Costo gente operativa",
    ask: "¿Cuánto sale al mes cocina, barra y servicio (aprox.)?",
    answerMode: "list",
    expect:
      "Renglones por rol o turno (cocina, meseros, bartender…). Si solo hay un total, un renglón “operativo”.",
    answerHint:
      "Cómo llenar: solo gente del local. Admin/oficina no va aquí: eso se llena en «Desglose Holding» (bloque En qué se gasta).",
  },
  {
    domain: "personal",
    item_key: "acuerdos_personales",
    label: "Acuerdos especiales",
    ask: "¿Hay pagos fijos, % o acuerdos fuera de la nómina formal?",
    answerMode: "list",
    expect: "Persona/rol + monto o % + frecuencia. Incluye acuerdos con chef/socios si aplican.",
    answerHint:
      "Cómo llenar: persona o rol + monto o % + cada cuánto. Si no hay, renglón “Ninguno” con 0.",
  },

  // ——— 7. Gastos ———
  {
    domain: "gastos",
    item_key: "gasto_fijos_local",
    label: "Fijos del local",
    ask: "¿Cuáles son los gastos fijos mensuales de esta única sede?",
    answerMode: "list",
    expect:
      "Arriendo, servicios, gas, internet, aseo, alarmas… Un renglón por concepto. No pongas insumos ni licores (eso es costo).",
    answerHint:
      "Cómo llenar: un concepto = un renglón. No pongas insumos ni licores de reventa (son costo, no gasto).",
  },
  {
    domain: "gastos",
    item_key: "gasto_holding",
    label: "Desglose Holding",
    ask: "En la línea Holding del presupuesto, ¿qué gastos exactos entran y por cuánto?",
    answerMode: "list",
    expect:
      "Desglosar: sueldos admin, honorarios, software, contador, “oficina”, otros.",
    answerHint:
      "Cómo llenar: separa el Holding en conceptos. Si solo conoces el total, pon un renglón “Holding (sin desglose)” y anótalo en la nota.",
  },
  {
    domain: "gastos",
    item_key: "gasto_publicidad",
    label: "Desglose Publicidad",
    ask: "¿Qué se ha gastado en publicidad y qué se hizo a cambio?",
    answerMode: "list",
    expect:
      "Un renglón por gasto: meta ads, diseñador, pauta, influencers… Monto + en la nota qué se vio a cambio.",
    answerHint:
      "Cómo llenar: monto en la fila; en la nota escribe qué campaña o resultado se conoce (o “sin detalle”).",
  },

  // ——— 8. Presupuesto (enfoque: gastos, no costos) ———
  {
    domain: "presupuesto",
    item_key: "presupuesto_lineas",
    label: "Líneas de gasto del presupuesto",
    ask: "Del presupuesto actual, ¿cuáles son las líneas de gasto y sus montos?",
    answerMode: "list",
    expect:
      "Solo gastos: Holding, Publicidad, arriendo, servicios, admin… Idealmente del mismo archivo que se entrega.",
    answerHint:
      "Cómo llenar: copia solo líneas de gasto. Insumos/food cost/licores de reventa no van aquí (son costo). Si aparecen en el Excel, en notas escribe “hay líneas de costo aparte”.",
  },

  // ——— 9. CxC ———
  {
    domain: "cxc",
    item_key: "cuentas_por_cobrar",
    label: "Quién nos debe",
    ask: "¿Quién le debe a Candela y cuánto?",
    answerMode: "list",
    expect:
      "Un renglón por tercero. Incluye eventos, vales y cobros de palabra. Si no hay, “ninguno” con 0.",
    answerHint:
      "Cómo llenar: deudor + monto. Si no hay nadie, “Ninguno” con 0.",
  },

  // ——— 10. CxP ———
  {
    domain: "cxp",
    item_key: "cuentas_por_pagar",
    label: "Deuda a proveedores",
    ask: "¿Qué proveedores tienen saldo y cuáles urge pagar para no parar?",
    answerMode: "list",
    expect:
      "Un renglón por proveedor. En la nota: urgente / de palabra / con factura.",
    answerHint:
      "Cómo llenar: proveedor + monto. En la nota marca: urgente / con factura / de palabra.",
  },

  // ——— 11. Tributario ———
  {
    domain: "tributario",
    item_key: "obligaciones_tributarias",
    label: "Impuestos pendientes",
    ask: "¿Qué impuestos, sanciones o acuerdos de pago están pendientes?",
    answerMode: "list",
    expect:
      "IVA, retefuente, sanciones, acuerdos… o renglón “contador” con nota de contacto.",
    answerHint:
      "Cómo llenar: un renglón por obligación. Si no lo maneja quien llena, pon “Preguntar a contador” y el contacto en la nota.",
  },

  // ——— 12. Tesorería ———
  {
    domain: "tesoreria",
    item_key: "bancos",
    label: "Bancos",
    ask: "¿En qué bancos hay plata y cuánto en cada uno a la fecha de corte?",
    answerMode: "list",
    expect: "Un renglón por cuenta. Ideal con extracto o captura.",
    answerHint:
      "Cómo llenar: banco/cuenta + saldo. Si no hay extracto, pon el saldo y en Fuente escribe de dónde salió el número.",
  },
  {
    domain: "tesoreria",
    item_key: "caja",
    label: "Caja del local",
    ask: "¿Cuánto efectivo hay hoy en caja / caja fuerte del restaurante?",
    answerMode: "single",
    expect: "Conteo o estimado. Si queda pendiente, anótalo.",
    answerHint:
      "Cómo llenar: un solo monto del efectivo físico. Si aún no se contó, déjalo pendiente o estimado y dilo en notas.",
  },
  {
    domain: "tesoreria",
    item_key: "pasarelas",
    label: "Datáfonos y pasarelas",
    ask: "¿Qué datáfonos o pasarelas tienen saldo por consignar?",
    answerMode: "list",
    expect: "Bold, PayU, datáfono banco, etc. Si no hay, “ninguno” con 0.",
    answerHint:
      "Cómo llenar: medio + saldo pendiente de consignar. Si no hay, “Ninguno” con 0.",
  },

  // ——— 13. Capital ———
  {
    domain: "capital",
    item_key: "capital_inyectado_por_socio",
    label: "Capital ya inyectado por socio",
    ask: "¿Cuánto capital ha inyectado cada socio hasta hoy?",
    answerMode: "list",
    expect:
      "Un renglón por socio (Grupo A, Emilio, Steven, Persona X, Esteban…). Monto = lo efectivamente aportado.",
    answerHint:
      "Cómo llenar: un renglón por socio con el monto aportado. Si no estás seguro, pon el dato y marca el estado “Sin prueba”.",
  },
  {
    domain: "capital",
    item_key: "capital_pendiente_por_socio",
    label: "Capital pendiente por socio",
    ask: "De lo comprometido, ¿cuánto falta por inyectar cada socio?",
    answerMode: "list",
    expect:
      "Mismos socios. Monto = faltante. En nota: si estaba condicionado a reportes/claridad.",
    answerHint:
      "Cómo llenar: mismos socios que arriba. Monto = lo que falta. Condiciones en la nota si las hay.",
  },
  {
    domain: "capital",
    item_key: "capital_destino_inyeccion",
    label: "A dónde fue el capital inyectado",
    ask: "Del capital que sí entró, ¿a qué se destinó?",
    answerMode: "list",
    expect:
      "Un renglón por destino: proveedores, arriendo, nómina, Holding, publicidad, caja, deudas…",
    answerHint:
      "Cómo llenar: un destino = un renglón con monto. Si no hay desglose, un renglón “Sin desglose disponible” y explícalo en notas.",
  },
  {
    domain: "capital",
    item_key: "capital_saneamiento",
    label: "Capital para sanear ya",
    ask: "Para no parar y poner al día lo urgente, ¿qué monto hace falta ahora?",
    answerMode: "single",
    expect:
      "Estimado anclado a CxP crítica / arriendo / caja. Incluye el colchón de las próximas semanas si aplica.",
    answerHint:
      "Cómo llenar: un estimado en COP. En notas puedes desglosar (CxP + arriendo + colchón).",
  },
  {
    domain: "capital",
    item_key: "claridad_para_refinanciar",
    label: "Qué falta para refinanciar con tranquilidad",
    ask: "¿Qué información o soportes faltan para poder revisar una refinanciación con claridad?",
    answerMode: "list",
    expect:
      "Un renglón por requisito: extractos, CxP, desglose Holding, evidencia de publicidad… Monto 0.",
    answerHint:
      "Cómo llenar: checklist (monto 0). Cada renglón = un soporte o dato que aún falta.",
  },

  // ——— 14. Préstamos ———
  {
    domain: "prestamos",
    item_key: "deuda_socios",
    label: "Préstamos y aportes a devolver",
    ask: "¿Qué plata de socios (u otros) se acordó devolver — o aún no está claro si es capital o préstamo?",
    answerMode: "list",
    expect:
      "Socio/acreedor + monto + en nota: préstamo / banco / carácter aún ambiguo. Si no hay, “ninguno” con 0.",
    answerHint:
      "Cómo llenar: acreedor + monto. En la nota: préstamo / banco / aún sin clasificar. No confundir con el % de participación.",
  },

  // ——— 15. Socios ———
  {
    domain: "socios",
    item_key: "composicion_accionaria",
    label: "Participación",
    ask: "Según acta o Cámara: ¿quiénes son los socios y con qué %?",
    answerMode: "list",
    expect:
      "Renglones esperados: Grupo A 20%, Emilio 20%, Steven 30%, Persona X 20%, Esteban 10% (ajustar si el acta dice otra cosa). % en la nota; monto 0.",
    answerHint:
      "Cómo llenar: socio + % en la nota (monto 0). Si el acta dice distinto, usa el del acta y coméntalo en notas.",
  },
  {
    domain: "socios",
    item_key: "informacion_solo_puente",
    label: "Datos que aún no están documentados",
    ask: "¿Qué datos de socios o aportes aún no tienen soporte compartido (solo se conocen de forma oral)?",
    answerMode: "list",
    expect:
      "Ej. confirmación de aportes, extractos pendientes de compartir. Monto 0; detalle en nota.",
    answerHint:
      "Cómo llenar: lista qué falta documentar o compartir. El objetivo es completar papeles/accesos, no señalar a nadie.",
  },

  // ——— 16. Otros ———
  {
    domain: "otros",
    item_key: "otros_riesgos",
    label: "Avisos operativos y contactos clave",
    ask: "¿Hay algo (aviso, promesa o contacto) que convenga registrar para la continuidad del local?",
    answerMode: "list",
    expect:
      "Avisos, promesas, contactos de proveedores/arrendador. Monto 0 si no hay plata.",
    answerHint:
      "Cómo llenar: un renglón por aviso o contacto. Si no hay nada, “Ninguno” con 0.",
  },
];

export function domainLabel(domain: string): string {
  return HANDOVER_DOMAINS.find((d) => d.value === domain)?.label ?? domain;
}

export function domainMeta(domain: string) {
  return HANDOVER_DOMAINS.find((d) => d.value === domain) ?? null;
}

export function itemGuide(itemKey: string) {
  return DEFAULT_HANDOVER_ITEMS.find((i) => i.item_key === itemKey) ?? null;
}

export function itemAsk(itemKey: string, fallbackLabel: string): string {
  const guide = itemGuide(itemKey);
  if (guide?.ask) return guide.ask;
  // Preguntas viejas de catálogos anteriores: guía clara + opción de quitarlas
  const legacy: Record<string, string> = {
    activos_administrativos:
      "¿Qué equipos importantes se reciben? (pregunta antigua — quítala si ya tienes cocina/barra y salón)",
    inventario_otros:
      "¿Hay otro inventario relevante? (pregunta antigua — puedes quitarla)",
    inventario_bebidas:
      "Bebidas soft (pregunta antigua — ya va dentro de alimentos)",
    inventario_empaques:
      "Empaques (pregunta antigua — poco crítica; puedes quitarla)",
    ticket_y_volumen:
      "Ticket y ritmo (pregunta antigua — se cubre en ventas por canal)",
    diagnostico_no_da:
      "Por qué “no da” (pregunta antigua — se cubre en ventas/acciones)",
    costo_personal_mensual:
      "Admin/Holding gente (pregunta antigua — va en desglose Holding)",
    sst_costo: "SST/ARL (pregunta antigua — anótalo en “lo que falta decir”)",
  };
  return legacy[itemKey] ?? fallbackLabel;
}

export function itemExpect(itemKey: string): string | null {
  return itemGuide(itemKey)?.expect ?? itemGuide(itemKey)?.help ?? null;
}

export function itemAnswerMode(itemKey: string): HandoverAnswerMode {
  return itemGuide(itemKey)?.answerMode ?? "single";
}

export function itemAnswerHint(itemKey: string): string | null {
  return itemGuide(itemKey)?.answerHint ?? null;
}

/**
 * Renglones mínimos prearmados para la indagación en vivo.
 * El facilitador marca entregado/falta, montos o notas; no parte de cero.
 */
export const HANDOVER_SEED_LINES: Record<string, string[]> = {
  // Documentos
  documentos_entregados: [
    "RUT",
    "Cámara de Comercio (certificado existencia)",
    "Estatutos / reforma estatutaria",
    "Acta de composición societaria / participación",
    "Contrato de arriendo del local",
    "Poderes / representaciones legales",
    "Contratos con proveedores clave",
    "Pólizas (si aplican)",
  ],
  accesos_claves: [
    "Banca en línea (usuario/token)",
    "Correo corporativo",
    "DIAN / factura electrónica",
    "Drive / nube de archivos",
    "Pasarelas / datáfonos (Bold, banco, etc.)",
    "Apps de domicilio (Rappi/iFood/admin)",
    "POS / sistema de ventas (acceso admin)",
    "Redes sociales del local",
  ],
  reportes_entregados: [
    "Presupuesto vigente (Excel/PDF)",
    "Flujo de caja / control de gastos",
    "Listado CxP proveedores",
    "Extractos bancarios recientes",
    "Reporte de ventas (último mes)",
    "Detalle Holding",
    "Detalle Publicidad / pauta",
  ],

  // Activos
  activos_cocina_barra: [
    "Plancha / freidora",
    "Neveras / congeladores",
    "Campana / extracción",
    "Estación de preparación",
    "Estación de tragos / barra",
    "Licuadoras / equipos menores cocina",
  ],
  activos_salon_otros: [
    "Mesas y sillas",
    "Datáfonos",
    "TV / audio",
    "Cámaras de seguridad",
    "Caja registradora / impresora",
    "Aire acondicionado",
  ],

  // Inventario
  inventario_licores: [
    "Tequila / mezcal",
    "Cerveza",
    "Licores / destilados otros",
    "Vinos / espumosos (si aplica)",
    "Insumos de coctelería",
  ],

  // Contratos
  compromisos_contratos: [
    "Arriendo del local",
    "Gas",
    "Energía / agua",
    "Internet / telefonía",
    "Aseo / residuos",
    "Apps de domicilio (comisión/contrato)",
    "Mantenimiento equipos",
  ],

  // Operación
  ventas_por_canal: [
    "Salón",
    "Domicilio propio",
    "Apps (Rappi/iFood/etc.)",
    "Tragos / barra",
    "Eventos / otros",
  ],
  acciones_comerciales: [
    "Promos de menú / combos",
    "Pauta en redes / Meta Ads",
    "Influencers / canjes",
    "Cambios de horario o carta",
    "Alianzas / eventos",
    "Ninguna acción relevante (anotar si aplica)",
  ],

  // Personal
  costo_personal_operativo: [
    "Cocina",
    "Barra / bartender",
    "Meseros / servicio",
    "Domicilios (si aplica)",
    "Turnos extras / dominicales",
  ],
  acuerdos_personales: [
    "Acuerdo chef / cocina",
    "Acuerdo socio-admin",
    "Porcentajes / comisiones",
    "Ninguno (anotar si aplica)",
  ],

  // Gastos
  gasto_fijos_local: [
    "Arriendo",
    "Energía",
    "Agua",
    "Gas",
    "Internet",
    "Aseo / vigilancia",
    "Seguros / alarmas",
  ],
  gasto_holding: [
    "Sueldos / honorarios admin",
    "Contador / externos",
    "Software / herramientas",
    "Oficina / imprevistos Holding",
    "Otros Holding",
  ],
  gasto_publicidad: [
    "Pauta digital (Meta/Google/etc.)",
    "Diseño / agencia",
    "Influencers / canjes",
    "Impresos / material",
    "Otros publicidad",
  ],

  // Presupuesto (solo gastos)
  presupuesto_lineas: [
    "Holding",
    "Publicidad",
    "Arriendo",
    "Servicios (energía/gas/agua/internet)",
    "Nómina operativa (gasto de gente)",
    "Otros gastos",
  ],

  // CxC / CxP
  cuentas_por_cobrar: [
    "Cliente / convenio 1",
    "Evento / vale",
    "Cobro de palabra (si hay)",
    "Ninguno (si aplica)",
  ],
  cuentas_por_pagar: [
    "Proveedor alimentos",
    "Proveedor licores",
    "Proveedor empaques",
    "Urgente (sin esto para cocina/barra)",
    "De palabra / sin factura",
  ],

  // Tributario
  obligaciones_tributarias: [
    "IVA",
    "Retención en la fuente",
    "ICA / otros",
    "Sanción / acuerdo de pago",
    "Preguntar a contador (si no se sabe)",
  ],

  // Tesorería
  bancos: [
    "Cuenta principal (banco)",
    "Cuenta secundaria (si hay)",
  ],
  pasarelas: [
    "Datáfono banco",
    "Bold / pasarela",
    "Otro medio",
    "Ninguno pendiente",
  ],

  // Capital
  capital_inyectado_por_socio: [
    "Grupo A",
    "Emilio",
    "Steven",
    "Persona X",
    "Esteban",
  ],
  capital_pendiente_por_socio: [
    "Grupo A",
    "Emilio",
    "Steven",
    "Persona X",
    "Esteban",
  ],
  capital_destino_inyeccion: [
    "Proveedores / CxP",
    "Arriendo",
    "Nómina",
    "Holding",
    "Publicidad",
    "Caja / operación",
    "Otro destino",
  ],
  claridad_para_refinanciar: [
    "Extractos bancarios al corte",
    "CxP completa con soportes",
    "Desglose Holding",
    "Evidencia de Publicidad (qué se pagó vs qué se hizo)",
    "Ventas por canal último mes",
    "Accesos compartidos (banco/drive)",
    "Confirmación aportes Grupo A y Persona X",
  ],

  // Préstamos
  deuda_socios: [
    "Préstamo Emilio",
    "Préstamo Steven",
    "Crédito bancario / otro",
    "Aporte aún ambiguo (capital vs préstamo)",
    "Ninguno (si aplica)",
  ],

  // Socios
  composicion_accionaria: [
    "Grupo A (20%)",
    "Emilio (20%)",
    "Steven (30%)",
    "Persona X (20%)",
    "Esteban (10%)",
  ],
  informacion_solo_puente: [
    "Si Grupo A ya inyectó todo lo comprometido",
    "Si Persona X ya inyectó todo lo comprometido",
    "Extractos / reportes que solo maneja Emilio",
    "Acuerdos verbales con proveedores",
    "Otro dato solo oral",
  ],

  // Otros
  otros_riesgos: [
    "Riesgo operativo",
    "Promesa hecha a tercero",
    "Contacto delicado (arrendador / proveedor)",
    "Tema sensible a manejar",
    "Ninguno adicional",
  ],
};

export function itemSeedLines(itemKey: string): string[] {
  return HANDOVER_SEED_LINES[itemKey] ?? [];
}

/**
 * Preguntas que ya no van en la guía de reunión (solapes o poco útiles en vivo).
 * Al preparar la sesión se limpian de la base.
 */
export const OBSOLETE_HANDOVER_KEYS = [
  // Catálogos viejos
  "activos_administrativos",
  "equipos_importantes",
  "inventario_inicial",
  "inventario_inicial_resumen",
  "inventario_otros",
  "costo_personal_mensual_old",
  // Recorte reunión: solapes / detalle que se captura en otra pregunta
  "inventario_bebidas",
  "inventario_empaques",
  "ticket_y_volumen",
  "diagnostico_no_da",
  "costo_personal_mensual",
  "gasto_otros_variables",
  "presupuesto_minimo_viable",
  "cxc_en_el_aire",
  "cxp_critica",
  "cxp_verbales",
  "sanciones_acuerdos",
  "sst_costo",
  "otros_saldos",
  "liquidez_total",
  "capital_funcionamiento",
  "otras_deudas_financieras",
  "aportes_sin_clasificar",
  "relaciones_clave",
] as const;

const OBSOLETE_LABEL_PATTERNS = [
  /activos?\s*administrativ/i,
  /equipos?\s*importantes?/i,
  /inventario\s*inicial/i,
];

const CURRENT_HANDOVER_KEYS = new Set(
  DEFAULT_HANDOVER_ITEMS.map((item) => item.item_key),
);

export function isCurrentHandoverKey(itemKey: string): boolean {
  return CURRENT_HANDOVER_KEYS.has(itemKey);
}

export function isObsoleteHandoverKey(itemKey: string): boolean {
  const key = itemKey.trim().toLowerCase();
  if ((OBSOLETE_HANDOVER_KEYS as readonly string[]).includes(key)) return true;
  // Variantes de slug (guiones, espacios, etc.)
  const normalized = key.replace(/[\s-]+/g, "_");
  if ((OBSOLETE_HANDOVER_KEYS as readonly string[]).includes(normalized)) {
    return true;
  }
  return (
    normalized.includes("activos_administrativ") ||
    normalized.includes("equipos_importantes") ||
    normalized.includes("inventario_inicial")
  );
}

export function isObsoleteHandoverItem(item: {
  item_key: string;
  label?: string | null;
}): boolean {
  if (isObsoleteHandoverKey(item.item_key)) return true;
  const label = item.label?.trim() ?? "";
  if (!label) return false;
  return OBSOLETE_LABEL_PATTERNS.some((re) => re.test(label));
}

/** Pregunta que ya no pertenece a la guía actual (residuo o catálogo viejo). */
export function isRetiredHandoverItem(item: {
  item_key: string;
  label?: string | null;
}): boolean {
  return (
    isObsoleteHandoverItem(item) || !isCurrentHandoverKey(item.item_key)
  );
}

/**
 * Ejemplos de llenado (capacitación): cómo completar cada pregunta
 * sin mezclar temas y con lenguaje neutro.
 */
export const HANDOVER_EXAMPLES: Record<string, string> = {
  documentos_entregados:
    "Ejemplo: RUT → entregado; estatutos → falta. En cada nota escribe entregado / falta / parcial. Aquí no van equipos ni montos de plata.",
  accesos_claves:
    "Ejemplo: banca en línea, correo, drive, admin de Rappi. En la nota: quién lo tiene o “pendiente”.",
  reportes_entregados:
    "Ejemplo: Excel de presupuesto, listado CxP, extracto bancario. Aunque esté incompleto, se lista y se marca parcial.",
  activos_cocina_barra:
    "Ejemplo: plancha, freidora, nevera, estación de barra. No pongas mesas ni datáfonos (eso es salón).",
  activos_salon_otros:
    "Ejemplo: mesas, sillas, TV, datáfonos, cámaras. No pongas neveras ni freidoras (eso es cocina/barra).",
  inventario_alimentos:
    "Ejemplo: un estimado en COP de lo que hay para cocinar + soft drinks. No es conteo SKU. El alcohol va en licores.",
  inventario_licores:
    "Ejemplo: tequila, mezcal, cerveza (stock). Las máquinas de barra van en equipos, no aquí.",
  compromisos_contratos:
    "Ejemplo: arriendo, gas, internet, Rappi. En la nota: con papel o de palabra; vencimiento si se conoce.",
  ventas_por_canal:
    "Ejemplo: salón $X, Rappi $Y, tragos $Z. En Fuente indica el reporte o si es estimado.",
  acciones_comerciales:
    "Ejemplo: promo 2x1, pauta Instagram, cambio de carta. Si no hubo acciones, renglón “Ninguna” con 0.",
  costo_personal_operativo:
    "Ejemplo: cocina, meseros, bartender. Admin/oficina se llena después en Desglose Holding.",
  acuerdos_personales:
    "Ejemplo: % al chef, fijo mensual a un rol. Si no hay, “Ninguno” con 0.",
  gasto_fijos_local:
    "Ejemplo: arriendo, luz, gas, internet. No insumos ni licores de reventa (son costo).",
  gasto_holding:
    "Ejemplo: sueldo admin, contador, software. Si solo hay total, un renglón “Holding (sin desglose)” + nota.",
  gasto_publicidad:
    "Ejemplo: Meta Ads $X — en la nota la campaña o “sin detalle”. No mezclar con Holding.",
  presupuesto_lineas:
    "Ejemplo: Holding $X, Publicidad $Y, Arriendo $Z. No copies insumos/food cost aquí.",
  cuentas_por_cobrar:
    "Ejemplo: evento $X, convenio $Y. Si no hay, “Ninguno” con 0.",
  cuentas_por_pagar:
    "Ejemplo: proveedor tortillas $X. En la nota: urgente / con factura / de palabra.",
  obligaciones_tributarias:
    "Ejemplo: IVA, retefuente. Si no se maneja aquí, “Preguntar a contador” + contacto en nota.",
  bancos:
    "Ejemplo: Bancolombia ahorros $X. Si no hay extracto, anota la fuente del número.",
  caja:
    "Ejemplo: efectivo contado en caja fuerte $X. Distinto del saldo del banco.",
  pasarelas:
    "Ejemplo: Bold $X por consignar. Si no hay, “Ninguno” con 0.",
  capital_inyectado_por_socio:
    "Ejemplo: un renglón por socio con el monto aportado. Distinto de préstamo y del % de participación.",
  capital_pendiente_por_socio:
    "Ejemplo: Socio A falta $Y. Condiciones (si hay) en la nota.",
  capital_destino_inyeccion:
    "Ejemplo: $ a proveedores, $ a Holding, $ a publicidad. Un destino por renglón.",
  capital_saneamiento:
    "Ejemplo: estimado para poner al día lo urgente + colchón corto. Detalle en notas.",
  claridad_para_refinanciar:
    "Ejemplo: extractos, CxP, desglose Holding (monto 0; es checklist de lo que falta).",
  deuda_socios:
    "Ejemplo: préstamo de un socio $X. En nota: préstamo / banco / sin clasificar. No es el %.",
  composicion_accionaria:
    "Ejemplo: socio + % en la nota (monto 0). Usa lo del acta si está disponible.",
  informacion_solo_puente:
    "Ejemplo: “confirmación de aporte pendiente de documento”, “extracto por compartir”. Lista qué falta documentar.",
  otros_riesgos:
    "Ejemplo: aviso a un proveedor, contacto del arrendador. Si no hay, “Ninguno”.",
};

export function itemExample(itemKey: string): string | null {
  return HANDOVER_EXAMPLES[itemKey] ?? null;
}

export function sanitizeItemComments(
  itemKey: string,
  comments: string | null | undefined,
): string {
  const raw = comments?.trim() ?? "";
  if (!raw) return "";
  const guide = itemGuide(itemKey);
  const polluted = [guide?.expect, guide?.help, guide?.answerHint]
    .filter(Boolean)
    .map((s) => String(s).trim());
  const legacy = [
    "Pide extracto o captura del saldo por cuenta.",
    "Conteo físico el día del corte.",
    "Saldos de Bold, PayU, u otros medios de pago.",
    "Puede ser la suma de bancos + caja + pasarelas.",
    "Usa el desglose: un renglón por tercero.",
    "Suma de cuentas bancarias a la fecha de corte",
    "Puede coincidir con la suma de bancos + caja + pasarelas",
    "Puede dejarse en 0 si solo se declara estado; detalle en módulo Socios",
    "Use comentarios para listar RUT, Cámara, estatutos, etc.",
    "Un solo monto del conteo físico del día.",
    "Respuesta: el número que salió al contar billetes y monedas.",
    "La respuesta es la lista de cuentas + saldos, no un solo número suelto.",
    "No dejes la pregunta en el aire: o listas saldos, o dejas explícito que no hay.",
    "Si no cuadra con la suma de arriba, explica la diferencia en las notas.",
    "La respuesta es la lista de deudores, no solo el total.",
    "Un monto estimado de apertura (no el inventario diario del POS).",
    "La respuesta es la lista de acreedores, no solo un total suelto.",
    "Aquí la respuesta es la lista de socios, no un valor en pesos.",
    "La respuesta es el inventario de documentos, no un valor en pesos.",
  ];
  if (polluted.includes(raw) || legacy.includes(raw)) return "";
  return comments ?? "";
}

export function verificationLabel(status: string): string {
  if (status === "CONFIRMADO") return "Con prueba";
  if (status === "DECLARADO") return "Sin prueba";
  return "Pendiente";
}

export function verificationHint(status: string): string {
  if (status === "CONFIRMADO")
    return "Hay extracto, factura, acta u otro soporte.";
  if (status === "DECLARADO")
    return "Hay cifra o relato, todavía sin soporte. Es válido y queda en el acta.";
  return "Aún no se indaga este punto; se puede saltar y volver después.";
}

export function slugifyItemKey(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || `item_${Date.now()}`
  );
}
