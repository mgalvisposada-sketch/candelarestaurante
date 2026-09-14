/**
 * Catálogo de empalme — tono calibrado para entrega con información
 * parcial (p. ej. socio-fundador-chef). DECLARADO/PENDIENTE son estados
 * respetables: el acta es foto compartida para socios, no juicio.
 */
export const HANDOVER_DOMAINS = [
  {
    value: "tesoreria",
    label: "La plata que hay hoy",
    ask: "¿Cuánta plata hay hoy y dónde está?",
    expect:
      "Lista de bancos, efectivo operativo, pasarelas y otros saldos. El total se confirma al final. Si algo es estimado, se marca como declarado.",
    href: "/tesoreria",
    hrefLabel: "Ver bancos y caja",
  },
  {
    value: "cxc",
    label: "Quién nos debe",
    ask: "¿Quién le debe a Candela, aunque sea de palabra?",
    expect:
      "Deudores con papeles y también cuentas “en el aire” (eventos, convenios, promesas). Lo verbal también cuenta.",
  },
  {
    value: "inventario",
    label: "Inventario al abrir",
    ask: "¿Qué hay en bodega/cocina el día del corte (orden de magnitud)?",
    expect:
      "Estimados de apertura en alimentos, bebidas, licores y empaques. No es el inventario diario del POS ni un avalúo formal.",
  },
  {
    value: "activos",
    label: "Equipos y bienes",
    ask: "¿Qué equipos o bienes importantes se reciben?",
    expect:
      "Lista de equipos relevantes (neveras, freidoras, mobiliario). El valor es opcional si no se conoce.",
  },
  {
    value: "cxp",
    label: "Lo que debemos a proveedores",
    ask: "¿A quién se le debe y qué hay que pagar para no parar?",
    expect:
      "Saldos por proveedor (con o sin factura) y lo urgente para no cortar suministro. Incluye compromisos de palabra.",
    href: "/proveedores",
    hrefLabel: "Ver proveedores y deudas",
  },
  {
    value: "socios",
    label: "Los socios",
    ask: "Confirmemos juntos la participación según documentos",
    expect:
      "Contraste con acta/Cámara: nombre + %. Si algo no cuadra, se anota sin cerrar el tema hoy. El detalle fino vive en Socios.",
    href: "/socios",
    hrefLabel: "Ver socios",
  },
  {
    value: "prestamos",
    label: "Plata prestada a la empresa",
    ask: "¿Qué plata de socios u otros se acordó devolver?",
    expect:
      "Préstamos a devolver (no capital), créditos y aportes cuyo carácter aún no está claro. Dejarlo escrito protege a quien aportó.",
    href: "/prestamos",
    hrefLabel: "Ver préstamos",
  },
  {
    value: "personal",
    label: "Gente y pagos a personas",
    ask: "¿Qué costos de gente impactan la caja cada mes?",
    expect:
      "Costo admin aproximado y acuerdos especiales de pago (fijos, %, fuera de nómina formal). No es nómina completa.",
  },
  {
    value: "gastos",
    label: "Gastos del mes",
    ask: "¿Qué gastos fijos hay que cubrir para seguir abiertos?",
    expect:
      "Arriendo, servicios, software y otros fijos/variables conocidos. Lista preferible a un solo total.",
  },
  {
    value: "presupuesto",
    label: "Con cuánto se puede operar",
    ask: "¿Cuál es el mínimo mensual para no parar operación?",
    expect:
      "Estimado conjunto (puede ser declarado). Sirve para planificar, no para juzgar la gestión anterior.",
  },
  {
    value: "tributario",
    label: "Impuestos y DIAN",
    ask: "¿Qué hay pendiente con impuestos — o quién lo sabe?",
    expect:
      "Obligaciones, sanciones o saldos a favor si se conocen. Si lo lleva el contador, anotar contacto y lo que se cree pendiente.",
  },
  {
    value: "contratos",
    label: "Contratos y compromisos",
    ask: "¿Qué contratos o compromisos (aunque sean de palabra) siguen vivos?",
    expect:
      "Arriendo, servicios, proveedores clave, vencimientos y acuerdos verbales relevantes.",
  },
  {
    value: "sst",
    label: "Seguridad y salud",
    ask: "¿Hay costos o papeles de SST/ARL que debamos asumir?",
    expect:
      "Documentos y costo aproximado (no es el SG-SST completo). Puede quedar pendiente.",
  },
  {
    value: "documentos",
    label: "Papeles y accesos",
    ask: "¿Qué documentos y accesos se entregan hoy?",
    expect:
      "Papeles oficiales y accesos admin (banco, correo, pasarelas…). También listar lo que NO se entrega hoy.",
    href: "/documentos",
    hrefLabel: "Ver documentos",
  },
  {
    value: "capital",
    label: "Plata que falta",
    ask: "¿Qué colchón hace falta para sanear lo urgente y operar?",
    expect:
      "Dos cifras hacia adelante: poner al día lo crítico y caja para las próximas semanas. Es plan, no veredicto del pasado.",
    href: "/capital",
    hrefLabel: "Ver capital",
  },
  {
    value: "otros",
    label: "Otras cosas importantes",
    ask: "¿Hay algo más que la nueva administración deba saber?",
    expect:
      "Riesgos, promesas, relaciones clave o temas sensibles que no encajen arriba. Lo que “solo sabe quien operaba”.",
  },
] as const;

export type HandoverDomain = (typeof HANDOVER_DOMAINS)[number]["value"];

export type HandoverAnswerMode = "list" | "single" | "confirm" | "docs";

export const DEFAULT_HANDOVER_ITEMS: Array<{
  domain: HandoverDomain;
  item_key: string;
  label: string;
  ask: string;
  /** Cómo se responde esta pregunta en el formulario. */
  answerMode: HandoverAnswerMode;
  /** Instrucción corta de qué respuesta se espera (no va en notas). */
  expect?: string;
  answerHint?: string;
  help?: string;
}> = [
  {
    domain: "tesoreria",
    item_key: "bancos",
    label: "Bancos",
    ask: "¿En qué bancos hay plata y cuánto en cada uno?",
    answerMode: "list",
    expect: "Un renglón por cuenta (ej. Bancolombia ahorros, Davivienda).",
    answerHint:
      "Si no hay extracto hoy, deja el saldo declarado y anota de dónde sale (WhatsApp, Excel, memoria).",
  },
  {
    domain: "tesoreria",
    item_key: "caja",
    label: "Caja",
    ask: "¿Cuánto efectivo hay hoy para operar (caja del local / caja fuerte)?",
    answerMode: "single",
    expect:
      "Monto contado juntos o estimado del día. Si el conteo queda pendiente, anótalo en notas.",
    answerHint:
      "No es una auditoría sorpresa: es la foto del efectivo operativo. Estimado del chef/operación vale como declarado.",
  },
  {
    domain: "tesoreria",
    item_key: "pasarelas",
    label: "Datáfonos y pasarelas",
    ask: "¿Qué datáfonos o pasarelas tienen saldo y de cuánto?",
    answerMode: "list",
    expect: "Un renglón por medio (Bold, PayU, datáfono banco, etc.).",
    answerHint:
      "Si no hay saldos pendientes, deja un renglón “ninguno” con monto 0.",
  },
  {
    domain: "tesoreria",
    item_key: "otros_saldos",
    label: "Otra plata disponible",
    ask: "¿Hay plata del negocio fuera de bancos, caja o pasarelas?",
    answerMode: "list",
    expect:
      "Fiducia, cuenta de terceros, pendiente de consignar, etc. Si no hay, “ninguno” con 0.",
    answerHint:
      "Declararlo protege a quien operaba y a los socios. No es cacería: es dejar la foto completa.",
  },
  {
    domain: "tesoreria",
    item_key: "liquidez_total",
    label: "Total de plata disponible",
    ask: "¿Cuánta plata total entregan el día 1?",
    answerMode: "confirm",
    expect: "Un solo total. Debe parecerse a bancos + caja + pasarelas + otros.",
    answerHint:
      "Si no cuadra, no pasa nada: explica en notas (estimado, falta extracto, plata por consignar).",
  },
  {
    domain: "cxc",
    item_key: "cuentas_por_cobrar",
    label: "Quién nos debe",
    ask: "¿Quién le debe a Candela y cuánto?",
    answerMode: "list",
    expect: "Un renglón por tercero (cliente, convenio, evento) con monto estimado.",
    answerHint:
      "Incluye lo que tenga soporte y lo que solo se sepa de memoria. La lista importa más que la perfección.",
  },
  {
    domain: "cxc",
    item_key: "cxc_en_el_aire",
    label: "Cobros en el aire",
    ask: "¿Hay cobros prometidos o cuentas “en el aire” sin factura clara?",
    answerMode: "list",
    expect:
      "Un renglón por caso: quién + cuánto estimado + qué se acordó. Suele quedar como declarado.",
    answerHint:
      "Eventos, empresas amigas, vales o “me pagan la otra semana”. Si no hay, “ninguno” con 0.",
  },
  {
    domain: "inventario",
    item_key: "inventario_alimentos",
    label: "Alimentos",
    ask: "¿Cuánto estimas que hay en alimentos hoy (orden de magnitud)?",
    answerMode: "single",
    expect:
      "Estimado de apertura en COP. Puedes anclarte en compras recientes o semanas de operación.",
    answerHint: "No es food cost ni conteo SKU: es una foto para el día 1.",
  },
  {
    domain: "inventario",
    item_key: "inventario_bebidas",
    label: "Bebidas",
    ask: "¿Cuánto estimas que hay en bebidas hoy (orden de magnitud)?",
    answerMode: "single",
    expect: "Estimado de apertura en COP.",
  },
  {
    domain: "inventario",
    item_key: "inventario_licores",
    label: "Licores",
    ask: "¿Cuánto estimas que hay en licores hoy (orden de magnitud)?",
    answerMode: "single",
    expect: "Estimado de apertura. Si pueden hacer un conteo rápido juntos, mejor.",
  },
  {
    domain: "inventario",
    item_key: "inventario_empaques",
    label: "Empaques",
    ask: "¿Cuánto estimas que hay en empaques hoy?",
    answerMode: "single",
    expect: "Estimado o 0 si no es material (anótalo en notas).",
  },
  {
    domain: "inventario",
    item_key: "inventario_otros",
    label: "Otro inventario",
    ask: "¿Hay otro inventario relevante (aseo, uniformes, etc.) y de cuánto?",
    answerMode: "list",
    expect: "Si aplica, lista categorías; si no, “ninguno” con 0.",
  },
  {
    domain: "activos",
    item_key: "activos_administrativos",
    label: "Equipos y bienes",
    ask: "¿Qué equipos importantes se reciben? (valor solo si se conoce)",
    answerMode: "list",
    expect:
      "Un renglón por equipo o grupo. El monto puede ir en 0 si no hay avalúo.",
    answerHint:
      "La lista y el estado del equipo importan más que el peso exacto.",
  },
  {
    domain: "cxp",
    item_key: "cuentas_por_pagar",
    label: "Deuda total a proveedores",
    ask: "Para no cortar suministro: ¿qué proveedores tienen saldo y de cuánto?",
    answerMode: "list",
    expect:
      "Un renglón por proveedor (con factura o estimado). El total se suma solo.",
    answerHint:
      "Incluye saldos a medias o sin factura. El objetivo es continuidad, no juzgar la gestión anterior.",
  },
  {
    domain: "cxp",
    item_key: "cxp_critica",
    label: "Deudas urgentes",
    ask: "De esas deudas, ¿cuáles hay que pagar ya para no parar?",
    answerMode: "list",
    expect: "Solo las urgentes: proveedor + monto + por qué urge.",
    answerHint: "Este es el mapa de “apagafuegos” para los próximos días.",
  },
  {
    domain: "cxp",
    item_key: "cxp_verbales",
    label: "Compromisos de palabra",
    ask: "¿Hay compromisos de pago verbales o “de palabra” con proveedores?",
    answerMode: "list",
    expect: "Proveedor + monto + qué se acordó. Suele quedar declarado.",
    answerHint:
      "Muy común cuando se negociaba directo. Si no hay, “ninguno” con 0.",
  },
  {
    domain: "socios",
    item_key: "composicion_accionaria",
    label: "Participación de socios",
    ask: "Confirmemos juntos la participación según acta/Cámara (nombre + %)",
    answerMode: "list",
    expect:
      "Un renglón por socio (nombre + % en la nota; monto puede ir en 0). Si algo no cuadra, se anota sin pelearlo hoy.",
    answerHint:
      "Preferible contrastar documento. Si no hay acta a mano, déjalo declarado y marca la fuente.",
  },
  {
    domain: "prestamos",
    item_key: "deuda_socios",
    label: "Préstamos de socios",
    ask: "¿Qué aportes de socios se acordaron como préstamo a devolver (no como capital)?",
    answerMode: "list",
    expect: "Un renglón por préstamo/socio. Esto no es la participación accionaria.",
    answerHint:
      "Aunque sea verbal o a medias, listarlo protege a quien puso la plata — incluido quien entrega hoy.",
  },
  {
    domain: "prestamos",
    item_key: "otras_deudas_financieras",
    label: "Otras deudas financieras",
    ask: "¿Hay créditos bancarios u otras deudas financieras?",
    answerMode: "list",
    expect: "Si hay, lista acreedor + saldo; si no, “ninguno” con 0.",
  },
  {
    domain: "prestamos",
    item_key: "aportes_sin_clasificar",
    label: "Aportes sin clasificar",
    ask: "¿Hay plata de socios cuyo carácter (capital vs préstamo) aún no está claro?",
    answerMode: "list",
    expect:
      "Un renglón por aporte ambiguo + nota de qué se sabe. Dejar la ambigüedad escrita evita pelea después.",
    answerHint:
      "No hay que resolverlo hoy: hay que nombrarlo. Eso protege a todos los socios.",
  },
  {
    domain: "personal",
    item_key: "costo_personal_mensual",
    label: "Costo de personal",
    ask: "¿Cuánto sale al mes el personal administrativo (y lo que impacte caja admin)?",
    answerMode: "single",
    expect: "Monto mensual aproximado. Si es 0 o mínimo, dilo; no inventes.",
    answerHint:
      "Candela no es nómina completa: buscamos lo que afecta la caja administrativa.",
  },
  {
    domain: "personal",
    item_key: "acuerdos_personales",
    label: "Acuerdos especiales de pago",
    ask: "¿Hay pagos fijos o % a personas fuera de la nómina formal?",
    answerMode: "list",
    expect:
      "Persona/rol + monto o % + frecuencia. Incluye acuerdos con chef, socios u otros si aplican.",
    answerHint:
      "Tema sensible: se lista con respeto. Si no hay, “ninguno” con 0.",
  },
  {
    domain: "gastos",
    item_key: "gasto_mensual_actual",
    label: "Gasto mensual",
    ask: "¿Cuáles son los gastos fijos mensuales para seguir abiertos?",
    answerMode: "list",
    expect:
      "Ideal: renglones (arriendo, servicios, software…). Si solo hay un total, ponlo en monto.",
    answerHint:
      "Piensa en “qué hay que pagar sí o sí”, no solo en gastos de oficina.",
  },
  {
    domain: "presupuesto",
    item_key: "presupuesto_minimo_viable",
    label: "Mínimo para operar",
    ask: "Con lo que conoces del día a día, ¿cuál es el mínimo mensual para no parar?",
    answerMode: "single",
    expect: "Un número estimado o acordado. Puede quedar declarado.",
    answerHint: "Es planificación conjunta, no un examen de la gestión anterior.",
  },
  {
    domain: "tributario",
    item_key: "obligaciones_tributarias",
    label: "Impuestos pendientes",
    ask: "¿Qué impuestos están pendientes y por cuánto — o quién lo sabe?",
    answerMode: "list",
    expect:
      "Un renglón por obligación (IVA, retefuente, etc.) o nota con el contador a consultar.",
    answerHint:
      "Si no lo manejabas tú: anota quién sí y qué crees que está pendiente. “No sé” con fuente es mejor que inventar.",
  },
  {
    domain: "tributario",
    item_key: "sanciones_acuerdos",
    label: "Sanciones o acuerdos",
    ask: "¿Hay sanciones, acuerdos de pago o saldos a favor?",
    answerMode: "list",
    expect:
      "Lista cada uno; si no hay o no se sabe, “ninguno / preguntar a contador” con 0 y nota.",
  },
  {
    domain: "contratos",
    item_key: "compromisos_contratos",
    label: "Contratos vigentes",
    ask: "¿Qué contratos o compromisos (aunque sean de palabra) siguen vivos?",
    answerMode: "list",
    expect:
      "Un renglón por compromiso (arriendo, gas, internet…). Monto = canon si aplica; vencimiento en la nota.",
    answerHint: "Lo verbal también cuenta si afecta operación o caja.",
  },
  {
    domain: "sst",
    item_key: "sst_costo",
    label: "SST / ARL",
    ask: "¿Cuánto cuesta o qué compromiso de SST/ARL se entrega?",
    answerMode: "single",
    expect:
      "Monto aproximado o 0 si solo hay papeles / queda pendiente (detalla en notas).",
  },
  {
    domain: "documentos",
    item_key: "documentos_entregados",
    label: "Documentos entregados",
    ask: "¿Qué papeles oficiales se entregan hoy — y cuáles faltan?",
    answerMode: "docs",
    expect:
      "Lista RUT, Cámara, estatutos, poderes… El monto puede ir en 0. Anota también lo que no se entrega hoy.",
    answerHint:
      "Es un checklist, no un interrogatorio. Lo faltante queda pendiente explícito para los socios.",
  },
  {
    domain: "documentos",
    item_key: "accesos_claves",
    label: "Accesos y claves",
    ask: "¿Qué accesos administrativos se entregan hoy?",
    answerMode: "docs",
    expect:
      "Banco, correo, DIAN, cloud, pasarelas/datáfonos, drive, etc. Monto en 0.",
    answerHint:
      "Sin accesos la nueva admin no opera. Lista también lo que aún no se entrega.",
  },
  {
    domain: "capital",
    item_key: "capital_saneamiento",
    label: "Capital para sanear",
    ask: "Para no parar y poner al día lo urgente, ¿qué monto estimas que hace falta?",
    answerMode: "single",
    expect:
      "Estimado anclado a deudas críticas. Puede ser un rango explicado en notas.",
    answerHint:
      "Es plan hacia adelante, no una factura de la gestión anterior.",
  },
  {
    domain: "capital",
    item_key: "capital_funcionamiento",
    label: "Capital para operar",
    ask: "¿Qué colchón de caja necesitan las próximas 4–8 semanas?",
    answerMode: "single",
    expect: "Monto estimado para seguir operando día a día.",
    answerHint: "Piensa en nómina crítica, proveedores y imprevistos cercanos.",
  },
  {
    domain: "otros",
    item_key: "otros_riesgos",
    label: "Riesgos y promesas",
    ask: "¿Hay algo que la nueva administración deba saber para no sorprenderse?",
    answerMode: "list",
    expect:
      "Riesgos, promesas hechas, temas sensibles o “cosas que solo quien operaba sabe”. Monto 0 si no aplica dinero.",
    answerHint:
      "Dejarlo escrito evita pelea mañana. Si no hay nada, “ninguno” con 0.",
  },
  {
    domain: "otros",
    item_key: "relaciones_clave",
    label: "Relaciones clave",
    ask: "¿Hay proveedores, contactos o personas clave con las que hay que manejar el cambio con cuidado?",
    answerMode: "list",
    expect:
      "Nombre + por qué importa + cómo se sugiere el empalme. Monto 0 salvo acuerdo económico.",
    answerHint:
      "Ayuda a no romper relaciones operativas mientras cambia la administración.",
  },
];

export function domainLabel(domain: string): string {
  return (
    HANDOVER_DOMAINS.find((d) => d.value === domain)?.label ?? domain
  );
}

export function domainMeta(domain: string) {
  return HANDOVER_DOMAINS.find((d) => d.value === domain) ?? null;
}

export function itemGuide(itemKey: string) {
  return DEFAULT_HANDOVER_ITEMS.find((i) => i.item_key === itemKey) ?? null;
}

export function itemAsk(itemKey: string, fallbackLabel: string): string {
  return itemGuide(itemKey)?.ask ?? fallbackLabel;
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

/** Evita mostrar guías viejas que se guardaron por error en comments. */
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
    "Si no hay saldos pendientes, deja monto 0 o marca “Me lo dijeron” con nota “ninguno”.",
    "No dejes la pregunta en el aire: o listas saldos, o dejas explícito que no hay.",
    "Si no cuadra con la suma de arriba, explica la diferencia en las notas.",
    "La respuesta es la lista de deudores, no solo el total.",
    "Un monto estimado de apertura (no el inventario diario del POS).",
    "Un renglón por equipo o grupo (neveras, freidoras, mobiliario).",
    "La respuesta es la lista de acreedores, no solo un total suelto.",
    "Aquí la respuesta es la lista de socios, no un valor en pesos.",
    "Un monto mensual aproximado.",
    "Un solo número acordado o estimado.",
    "La respuesta es el inventario de documentos, no un valor en pesos.",
    "Un monto estimado de “apagar incendios”.",
    "Un monto estimado de caja para seguir abiertos.",
    "¿Cuánto efectivo contaron en caja / caja fuerte?",
    "Además de bancos, caja y pasarelas, ¿hay otra plata?",
    "¿A qué proveedores se les debe y cuánto a cada uno?",
    "¿A qué socios se les debe por préstamos y cuánto?",
    "¿Quiénes son los socios y con qué porcentaje?",
    "¿Cuánto capital hace falta para poner al día deudas críticas?",
    "¿Cuánto capital hace falta para operar el día a día?",
  ];
  if (polluted.includes(raw) || legacy.includes(raw)) return "";
  return comments ?? "";
}

export function verificationLabel(status: string): string {
  if (status === "CONFIRMADO") return "Lo vi / tengo prueba";
  if (status === "DECLARADO") return "Me lo dijeron";
  return "Aún no";
}

export function verificationHint(status: string): string {
  if (status === "CONFIRMADO") return "Hay extracto, factura, acta u otro soporte.";
  if (status === "DECLARADO")
    return "Hay cifra o relato, todavía sin soporte. Es válido y queda en el acta.";
  return "Todavía no se revisó este punto en la reunión.";
}

export function slugifyItemKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || `item_${Date.now()}`;
}
