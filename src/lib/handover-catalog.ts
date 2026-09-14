export const HANDOVER_DOMAINS = [
  {
    value: "tesoreria",
    label: "La plata que hay hoy",
    ask: "¿Cuánta plata hay hoy y dónde está?",
    expect:
      "Lista de bancos, conteo de caja y saldos de pasarelas. El total se confirma al final del bloque.",
    href: "/tesoreria",
    hrefLabel: "Ver bancos y caja",
  },
  {
    value: "cxc",
    label: "Quién nos debe",
    ask: "¿Quién le debe dinero a Candela y cuánto?",
    expect:
      "Lista de terceros (empresas, eventos, convenios) con montos y soporte si existe.",
  },
  {
    value: "inventario",
    label: "Inventario al abrir",
    ask: "¿Qué hay en bodega/cocina el día del corte (valor aproximado)?",
    expect:
      "Conteo o estimación de alimentos, bebidas, licores y empaques. No es el inventario diario del POS.",
  },
  {
    value: "activos",
    label: "Equipos y bienes",
    ask: "¿Qué equipos o bienes importantes se reciben?",
    expect: "Lista aproximada (neveras, freidoras, mobiliario) y valor estimado si se conoce.",
  },
  {
    value: "cxp",
    label: "Lo que debemos a proveedores",
    ask: "¿A quién se le debe y qué es urgente pagar?",
    expect:
      "Facturas pendientes, proveedores críticos y deudas que no pueden esperar.",
    href: "/proveedores",
    hrefLabel: "Ver proveedores y deudas",
  },
  {
    value: "socios",
    label: "Los socios",
    ask: "¿Quiénes son los socios y con qué porcentaje?",
    expect: "Acta o documento de participación. El detalle fino vive en Socios.",
    href: "/socios",
    hrefLabel: "Ver socios",
  },
  {
    value: "prestamos",
    label: "Plata prestada a la empresa",
    ask: "¿Hay préstamos de socios u otros que la empresa deba devolver?",
    expect: "Montos, a quién se debe y si hay cuotas o acuerdos.",
    href: "/prestamos",
    hrefLabel: "Ver préstamos",
  },
  {
    value: "personal",
    label: "Gente y nómina admin",
    ask: "¿Cuánto cuesta el personal administrativo al mes?",
    expect: "Cifra aproximada mensual y compromisos conocidos (no es nómina completa).",
  },
  {
    value: "gastos",
    label: "Gastos del mes",
    ask: "¿Cuánto se gasta al mes en administración (arriendo, servicios, etc.)?",
    expect: "Estimado mensual de gastos fijos/variables de oficina y administración.",
  },
  {
    value: "presupuesto",
    label: "Con cuánto se puede operar",
    ask: "¿Cuál es el mínimo mensual para mantener el negocio abierto?",
    expect: "Número de presupuesto mínimo viable acordado o estimado.",
  },
  {
    value: "tributario",
    label: "Impuestos y DIAN",
    ask: "¿Qué impuestos, sanciones o acuerdos de pago están pendientes?",
    expect: "Calendario, saldos, sanciones o saldos a favor si los hay.",
  },
  {
    value: "contratos",
    label: "Contratos firmados",
    ask: "¿Qué contratos o compromisos importantes siguen vigentes?",
    expect: "Arriendo, servicios, proveedores clave y fechas de vencimiento.",
  },
  {
    value: "sst",
    label: "Seguridad y salud",
    ask: "¿Hay costos o papeles de SST/ARL que debamos asumir?",
    expect: "Documentos y costo aproximado (no es el SG-SST completo).",
  },
  {
    value: "documentos",
    label: "Papeles de la empresa",
    ask: "¿Qué documentos oficiales se entregan hoy?",
    expect: "RUT, Cámara de Comercio, estatutos, poderes, contratos, etc.",
    href: "/documentos",
    hrefLabel: "Ver documentos",
  },
  {
    value: "capital",
    label: "Plata que falta",
    ask: "¿Cuánto capital hace falta para sanear y para operar?",
    expect: "Dos cifras: saneamiento (apagando incendios) y funcionamiento (seguir abiertos).",
    href: "/capital",
    hrefLabel: "Ver capital",
  },
  {
    value: "otros",
    label: "Otras cosas importantes",
    ask: "¿Hay algo más que la nueva administración deba saber?",
    expect: "Cualquier tema que no encaje arriba: claves, accesos, riesgos, promesas hechas.",
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
    answerHint: "La respuesta es la lista de cuentas + saldos, no un solo número suelto.",
  },
  {
    domain: "tesoreria",
    item_key: "caja",
    label: "Caja",
    ask: "¿Cuánto efectivo contaron en caja / caja fuerte?",
    answerMode: "single",
    expect: "Un solo monto del conteo físico del día.",
    answerHint: "Respuesta: el número que salió al contar billetes y monedas.",
  },
  {
    domain: "tesoreria",
    item_key: "pasarelas",
    label: "Datáfonos y pasarelas",
    ask: "¿Qué datáfonos o pasarelas tienen saldo y de cuánto?",
    answerMode: "list",
    expect: "Un renglón por medio (Bold, PayU, datafono banco, etc.).",
    answerHint: "Si no hay saldos pendientes, deja monto 0 o marca “Me lo dijeron” con nota “ninguno”.",
  },
  {
    domain: "tesoreria",
    item_key: "otros_saldos",
    label: "Otra plata disponible",
    ask: "Además de bancos, caja y pasarelas, ¿hay otra plata?",
    answerMode: "list",
    expect: "Si hay, lista dónde (fiducia, cuenta especial…). Si no hay, anota “ninguno” con monto 0.",
    answerHint: "No dejes la pregunta en el aire: o listas saldos, o dejas explícito que no hay.",
  },
  {
    domain: "tesoreria",
    item_key: "liquidez_total",
    label: "Total de plata disponible",
    ask: "¿Cuánta plata total entregan el día 1?",
    answerMode: "confirm",
    expect: "Un solo total. Debe parecerse a bancos + caja + pasarelas + otros.",
    answerHint: "Si no cuadra con la suma de arriba, explica la diferencia en las notas.",
  },
  {
    domain: "cxc",
    item_key: "cuentas_por_cobrar",
    label: "Quién nos debe",
    ask: "¿Quién le debe a Candela y cuánto?",
    answerMode: "list",
    expect: "Un renglón por tercero (cliente, convenio, evento).",
    answerHint: "La respuesta es la lista de deudores, no solo el total.",
  },
  {
    domain: "inventario",
    item_key: "inventario_alimentos",
    label: "Alimentos",
    ask: "¿Cuánto vale aproximadamente el inventario de alimentos?",
    answerMode: "single",
    expect: "Un monto estimado de apertura (no el inventario diario del POS).",
  },
  {
    domain: "inventario",
    item_key: "inventario_bebidas",
    label: "Bebidas",
    ask: "¿Cuánto vale aproximadamente el inventario de bebidas?",
    answerMode: "single",
  },
  {
    domain: "inventario",
    item_key: "inventario_licores",
    label: "Licores",
    ask: "¿Cuánto vale aproximadamente el inventario de licores?",
    answerMode: "single",
  },
  {
    domain: "inventario",
    item_key: "inventario_empaques",
    label: "Empaques",
    ask: "¿Cuánto vale aproximadamente el inventario de empaques?",
    answerMode: "single",
  },
  {
    domain: "inventario",
    item_key: "inventario_otros",
    label: "Otro inventario",
    ask: "¿Hay otro inventario relevante (aseo, uniformes, etc.) y de cuánto?",
    answerMode: "list",
    expect: "Si aplica, lista categorías; si no, anota “ninguno” con 0.",
  },
  {
    domain: "activos",
    item_key: "activos_administrativos",
    label: "Equipos y bienes",
    ask: "¿Qué equipos importantes se reciben y a cuánto se estiman?",
    answerMode: "list",
    expect: "Un renglón por equipo o grupo (neveras, freidoras, mobiliario).",
  },
  {
    domain: "cxp",
    item_key: "cuentas_por_pagar",
    label: "Deuda total a proveedores",
    ask: "¿A qué proveedores se les debe y cuánto a cada uno?",
    answerMode: "list",
    expect: "Un renglón por proveedor. El total se suma solo.",
    answerHint: "La respuesta es la lista de acreedores, no solo un total suelto.",
  },
  {
    domain: "cxp",
    item_key: "cxp_critica",
    label: "Deudas urgentes",
    ask: "De esas deudas, ¿cuáles hay que pagar ya para no parar?",
    answerMode: "list",
    expect: "Solo las urgentes: proveedor + monto + por qué urge.",
  },
  {
    domain: "socios",
    item_key: "composicion_accionaria",
    label: "Participación de socios",
    ask: "¿Quiénes son los socios y con qué porcentaje?",
    answerMode: "list",
    expect: "Un renglón por socio (nombre + % en la nota; monto puede ir en 0).",
    answerHint: "Aquí la respuesta es la lista de socios, no un valor en pesos.",
  },
  {
    domain: "prestamos",
    item_key: "deuda_socios",
    label: "Préstamos de socios",
    ask: "¿A qué socios se les debe por préstamos y cuánto?",
    answerMode: "list",
    expect: "Un renglón por préstamo/socio (esto no es la participación accionaria).",
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
    domain: "personal",
    item_key: "costo_personal_mensual",
    label: "Costo de personal",
    ask: "¿Cuánto sale al mes el personal administrativo?",
    answerMode: "single",
    expect: "Un monto mensual aproximado.",
  },
  {
    domain: "gastos",
    item_key: "gasto_mensual_actual",
    label: "Gasto mensual",
    ask: "¿Cuánto se gasta al mes en administración?",
    answerMode: "list",
    expect: "Ideal: renglones (arriendo, servicios, software…). Si solo hay un total, ponlo en monto.",
  },
  {
    domain: "presupuesto",
    item_key: "presupuesto_minimo_viable",
    label: "Mínimo para operar",
    ask: "¿Cuál es el presupuesto mínimo mensual para no cerrar?",
    answerMode: "single",
    expect: "Un solo número acordado o estimado.",
  },
  {
    domain: "tributario",
    item_key: "obligaciones_tributarias",
    label: "Impuestos pendientes",
    ask: "¿Qué impuestos están pendientes y por cuánto?",
    answerMode: "list",
    expect: "Un renglón por obligación (IVA, retefuente, etc.).",
  },
  {
    domain: "tributario",
    item_key: "sanciones_acuerdos",
    label: "Sanciones o acuerdos",
    ask: "¿Hay sanciones, acuerdos de pago o saldos a favor?",
    answerMode: "list",
    expect: "Lista cada uno; si no hay, “ninguno” con 0.",
  },
  {
    domain: "contratos",
    item_key: "compromisos_contratos",
    label: "Contratos vigentes",
    ask: "¿Qué contratos importantes siguen vivos?",
    answerMode: "list",
    expect: "Un renglón por contrato (arriendo, gas, internet…). Monto = canon si aplica.",
  },
  {
    domain: "sst",
    item_key: "sst_costo",
    label: "SST / ARL",
    ask: "¿Cuánto cuesta o qué compromiso de SST/ARL se entrega?",
    answerMode: "single",
    expect: "Monto aproximado o 0 si solo entregan papeles (detalla en notas).",
  },
  {
    domain: "documentos",
    item_key: "documentos_entregados",
    label: "Documentos entregados",
    ask: "¿Qué papeles oficiales se entregan hoy?",
    answerMode: "docs",
    expect: "Lista RUT, Cámara, estatutos, poderes… El monto puede ir en 0.",
    answerHint: "La respuesta es el inventario de documentos, no un valor en pesos.",
  },
  {
    domain: "capital",
    item_key: "capital_saneamiento",
    label: "Capital para sanear",
    ask: "¿Cuánto capital hace falta para poner al día deudas críticas?",
    answerMode: "single",
    expect: "Un monto estimado de “apagar incendios”.",
  },
  {
    domain: "capital",
    item_key: "capital_funcionamiento",
    label: "Capital para operar",
    ask: "¿Cuánto capital hace falta para operar el día a día?",
    answerMode: "single",
    expect: "Un monto estimado de caja para seguir abiertos.",
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
  // También textos viejos conocidos de versiones anteriores
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
  if (status === "DECLARADO") return "La cifra existe, pero todavía no hay soporte.";
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
