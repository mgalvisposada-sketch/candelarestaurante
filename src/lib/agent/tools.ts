import type OpenAI from "openai";
import { createNoveltyAction } from "@/app/(app)/personal/payroll-ops-actions";
import { searchKnowledgeBase } from "@/lib/agent/kb";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { subDays, subMonths } from "date-fns";
import { APP_TIMEZONE, formatDateCO, todayInBogota } from "@/lib/dates";
import { suggestedPurchaseQty } from "@/lib/inventory/cost";
import { computeLoanKpis } from "@/lib/loans";
import { apDocumentBalance, formatCOP, money } from "@/lib/money";
import type { OrgContext } from "@/lib/org-context";
import { fetchPendingActions } from "@/lib/pending-actions";
import { ctxCanAccess } from "@/lib/permissions";
import { APP_MODULES } from "@/lib/permissions-catalog";
import {
  mapEmployeeSchedule,
  mapLegalParamsRow,
  mapScheduleRow,
} from "@/lib/payroll/mappers";
import { simulateBiweekly } from "@/lib/payroll/simulate-biweekly";
import type {
  EmploymentContractType,
  PayrollScheduleInput,
} from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";
import {
  sumAvailableBalances,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";

/** Adjunto que el runner promociona al cliente (CSV/Excel). */
export type AgentAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

const ATTACHMENT_MARKER = "__candelaAttachment";

export const AGENT_TOOL_DEFINITIONS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "search_knowledge_base",
    description:
      "Busca en la base de conocimiento completa de Candela (todos los módulos, flujos, reglas y límites). Úsala para conectar conceptos o explicar cómo funciona algo.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Tema o pregunta (ej. aval de caja, recetas, domingo nómina)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_modules",
    description:
      "Lista módulos de la app con rutas y submódulos. Útil para orientación general.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_organization_snapshot",
    description:
      "Datos de la organización actual, rol del usuario y permisos efectivos.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_liquidity_and_obligations",
    description:
      "Resumen de liquidez (tesorería), CxP abierta, deuda de préstamos y capital reciente. Requiere permiso de inicio o tesorería.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_pending_actions",
    description:
      "Bandeja de pendientes reales (compras, novedades, pagos, inventario, avales de caja).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_employees",
    description:
      "Empleados activos con tipo de contrato, salario y horario. Úsalo al aclarar alcance (quién entra en un cálculo) antes de simular.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_payroll_context",
    description:
      "Horario Candela (incluye works_sunday) y parámetros legales de nómina vigentes.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_payroll_periods",
    description:
      "Lista periodos de nómina REALES en la base (año, mes, quincena, estado). Úsalo antes de hablar de 'quincenas liquidadas' o históricas. No inventes periodos.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "simulate_open_sundays_cost",
    description:
      "SOLO después de aclarar alcance con el usuario. Simula costo de abrir domingo(s) y oneSunday. period_source: current|latest_liquidated|custom. staff_scope: all_active_labor|selected (+ employee_ids CSV). Horario domingo: sunday_entry/exit HH:mm o vacío=Horario Candela/empleado; sunday_break_minutes=-1 default.",
    parameters: {
      type: "object",
      properties: {
        period_source: {
          type: "string",
          enum: ["current", "latest_liquidated", "custom"],
        },
        year: {
          type: "integer",
          description: "Solo custom; si no, 0",
        },
        month: {
          type: "integer",
          description: "Solo custom 1-12; si no, 0",
        },
        half: {
          type: "integer",
          description: "Solo custom 1|2; si no, 0",
        },
        staff_scope: {
          type: "string",
          enum: ["all_active_labor", "selected"],
          description:
            "all_active_labor = todos laborales activos (no POR_TURNO/prestación). selected = solo employee_ids.",
        },
        employee_ids: {
          type: "string",
          description:
            "IDs separados por coma si staff_scope=selected. Si all_active_labor, enviar cadena vacía.",
        },
        sunday_entry: {
          type: "string",
          description: "HH:mm del domingo o vacío para usar horario del empleado/Candela",
        },
        sunday_exit: {
          type: "string",
          description: "HH:mm del domingo o vacío",
        },
        sunday_break_minutes: {
          type: "integer",
          description: "Minutos de descanso ese domingo; -1 = default del empleado/Candela",
        },
      },
      required: [
        "period_source",
        "year",
        "month",
        "half",
        "staff_scope",
        "employee_ids",
        "sunday_entry",
        "sunday_exit",
        "sunday_break_minutes",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_products_to_buy",
    description:
      "Lista productos a comprar / sin stock. filter: sin_stock (existencia ≤ 0), bajo_minimo (stock ≤ mínimo), a_comprar (unión). Si el usuario pide Excel/CSV/archivo, export_csv=true. Devuelve filas y, si exporta, un adjunto descargable.",
    parameters: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["sin_stock", "bajo_minimo", "a_comprar"],
        },
        export_csv: {
          type: "boolean",
          description: "true si pidió Excel, CSV o archivo descargable",
        },
        limit: {
          type: "integer",
          description: "Máximo de filas en el resumen JSON (export CSV puede ir hasta 2000)",
        },
      },
      required: ["filter", "export_csv", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_kitchen_recipes",
    description: "Recetas/BOM de cocina con cantidad de líneas.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_open_purchase_requests",
    description: "Solicitudes de compra abiertas o en curso (resumen).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_suppliers_summary",
    description: "Proveedores activos (compra/gasto).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "rank_suppliers_by_purchases",
    description:
      "Ranking gerencial de proveedores (suma facturas CxP del periodo). report_level=ejecutivo (default): tabla con #facturas, total y categorías/qué se le compra — SIN listar facturas ni cada producto. report_level=proveedor_detalle: desglose de facturas/productos SOLO si focus_supplier tiene nombre o id. period_preset: last_30_days|last_90_days|last_12_months|this_year|custom.",
    parameters: {
      type: "object",
      properties: {
        period_preset: {
          type: "string",
          enum: [
            "last_30_days",
            "last_90_days",
            "last_12_months",
            "this_year",
            "custom",
          ],
        },
        start_date: {
          type: "string",
          description: "yyyy-mm-dd solo si custom; si no, cadena vacía",
        },
        end_date: {
          type: "string",
          description: "yyyy-mm-dd solo si custom; si no, cadena vacía",
        },
        metric: {
          type: "string",
          enum: ["facturado", "pagado"],
        },
        source_scope: {
          type: "string",
          enum: ["compras", "all"],
        },
        top_n: {
          type: "integer",
          description: "Proveedores en el ranking (default 10, máx 30)",
        },
        report_level: {
          type: "string",
          enum: ["ejecutivo", "proveedor_detalle"],
          description:
            "ejecutivo=resumen gerencial; proveedor_detalle=solo con focus_supplier",
        },
        focus_supplier: {
          type: "string",
          description:
            "Nombre o id del proveedor para detalle fino. Vacío en modo ejecutivo.",
        },
      },
      required: [
        "period_preset",
        "start_date",
        "end_date",
        "metric",
        "source_scope",
        "top_n",
        "report_level",
        "focus_supplier",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "create_shift_novelty",
    description:
      "Crea una novedad de turno (anticipo, descuento, bono, permiso). SOLO si el usuario confirmó explícitamente en el chat (user_confirmed=true). No usar para horas extra/ausencias/turno laborado.",
    parameters: {
      type: "object",
      properties: {
        employee_id: { type: "string" },
        novelty_date: {
          type: "string",
          description: "Fecha yyyy-mm-dd",
        },
        novelty_type: {
          type: "string",
          enum: [
            "PERMISO_REMUNERADO",
            "PERMISO_NO_REMUNERADO",
            "ANTICIPO",
            "DESCUENTO_AUTORIZADO",
            "BONO_OCASIONAL",
          ],
        },
        minutes: { type: "string", description: "Minutos o vacío" },
        amount: { type: "string", description: "Monto COP o vacío" },
        notes: { type: "string" },
        user_confirmed: {
          type: "boolean",
          description:
            "true solo si el usuario dijo explícitamente que confirme/ejecute",
        },
      },
      required: [
        "employee_id",
        "novelty_date",
        "novelty_type",
        "minutes",
        "amount",
        "notes",
        "user_confirmed",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
];

type ToolArgs = Record<string, unknown>;

function deny(msg: string) {
  return JSON.stringify({ ok: false, error: msg });
}

function ok(data: unknown) {
  return JSON.stringify({ ok: true, data });
}

/** Quincena calendario según fecha de hoy en America/Bogota. */
function currentBiweeklyInBogota(): {
  year: number;
  month: number;
  half: 1 | 2;
  today: string;
} {
  const today = todayInBogota(); // yyyy-mm-dd
  const [ys, ms, ds] = today.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  return {
    year,
    month,
    half: day <= 15 ? 1 : 2,
    today,
  };
}

async function requireOrg(ctx: OrgContext) {
  if (!ctx.organization) throw new Error("Sin organización");
  return ctx.organization;
}

export async function executeAgentTool(
  name: string,
  rawArgs: string,
  ctx: OrgContext,
): Promise<string> {
  let args: ToolArgs = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as ToolArgs) : {};
  } catch {
    return deny("Argumentos JSON inválidos");
  }

  try {
    switch (name) {
      case "search_knowledge_base":
        return ok(
          await searchKnowledgeBase(String(args.query ?? ""), 5),
        );

      case "list_modules":
        return ok(
          APP_MODULES.map((m) => ({
            key: m.key,
            label: m.label,
            href: m.href,
            mvp: m.mvp,
            submodules: m.submodules.map((s) => ({
              key: s.key,
              label: s.label,
              description: s.description ?? null,
            })),
          })),
        );

      case "get_organization_snapshot":
        return ok({
          organization: ctx.organization
            ? {
                id: ctx.organization.id,
                legal_name: ctx.organization.legal_name,
                trade_name: ctx.organization.trade_name,
                nit: ctx.organization.nit,
                municipality: ctx.organization.municipality,
                timezone: ctx.organization.timezone,
                currency: ctx.organization.currency,
                administrative_cutoff_date:
                  ctx.organization.administrative_cutoff_date,
                cash_float_target: ctx.organization.cash_float_target,
              }
            : null,
          user: { email: ctx.email, role: ctx.role },
          permissions: ctx.permissions,
          calendarTodayBogota: currentBiweeklyInBogota(),
          note:
            "Para 'esta quincena' usa calendarTodayBogota. No inventes periodos de otros años.",
        });

      case "get_liquidity_and_obligations":
        return await toolLiquidity(ctx);

      case "list_pending_actions":
        return ok(await fetchPendingActions(ctx));

      case "list_employees":
        return await toolEmployees(ctx);

      case "get_payroll_context":
        return await toolPayrollContext(ctx);

      case "list_payroll_periods":
        return await toolListPayrollPeriods(ctx);

      case "simulate_open_sundays_cost":
        return await toolSimulateSundays(ctx, args);

      case "list_low_stock_products":
      case "list_products_to_buy":
        return await toolProductsToBuy(ctx, {
          ...args,
          filter:
            name === "list_low_stock_products"
              ? "bajo_minimo"
              : args.filter,
          export_csv:
            name === "list_low_stock_products" ? false : args.export_csv,
        });

      case "list_kitchen_recipes":
        return await toolRecipes(ctx);

      case "list_open_purchase_requests":
        return await toolPurchases(ctx);

      case "list_suppliers_summary":
        return await toolSuppliers(ctx);

      case "rank_suppliers_by_purchases":
        return await toolRankSuppliers(ctx, args);

      case "create_shift_novelty":
        return await toolCreateNovelty(ctx, args);

      default:
        return deny(`Tool desconocida: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error en tool";
    return deny(message);
  }
}

async function toolLiquidity(ctx: OrgContext) {
  if (
    !ctxCanAccess(ctx, "inicio") &&
    !ctxCanAccess(ctx, "tesoreria") &&
    !ctxCanAccess(ctx, "proveedores")
  ) {
    return deny("Sin permiso para ver liquidez/obligaciones");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const cutoff = org.administrative_cutoff_date;

  let liquidity = "0.00";
  const { data: activeAccounts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .eq("is_active", true);
  const activeIds = (activeAccounts ?? []).map((a) => a.id as string);
  if (activeIds.length > 0) {
    let snapQuery = supabase
      .from("bank_balance_snapshots")
      .select(
        "opening_balance, bank_account_id, cutoff_date, verification_status",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .in("bank_account_id", activeIds);
    if (cutoff) snapQuery = snapQuery.eq("cutoff_date", cutoff);
    const { data: snaps } = await snapQuery;
    let snapshots = (snaps ?? []) as BalanceSnapshotInput[];
    if (snapshots.length === 0) {
      const { data: allSnaps } = await supabase
        .from("bank_balance_snapshots")
        .select(
          "opening_balance, bank_account_id, cutoff_date, verification_status",
        )
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .in("bank_account_id", activeIds)
        .order("cutoff_date", { ascending: false });
      const latest = new Map<string, BalanceSnapshotInput>();
      for (const row of (allSnaps ?? []) as BalanceSnapshotInput[]) {
        if (!latest.has(row.bank_account_id)) {
          latest.set(row.bank_account_id, row);
        }
      }
      snapshots = [...latest.values()];
    }
    const { data: txRows } = await supabase
      .from("bank_transactions")
      .select(
        "bank_account_id, transaction_date, debit, credit, settlement_status",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .in("bank_account_id", activeIds);
    liquidity = sumAvailableBalances(activeIds, {
      snapshots,
      transactions: (txRows ?? []) as BankTransactionInput[],
      orgCutoff: cutoff,
    }).toFixed(2);
  }

  let cxp = money(0);
  const { data: apDocs } = await supabase
    .from("accounts_payable_documents")
    .select("original_amount, paid_amount, status")
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  for (const d of apDocs ?? []) {
    if (d.status === "ANULADA") continue;
    cxp = cxp.plus(apDocumentBalance(d.original_amount, d.paid_amount));
  }

  let loanDebt = money(0);
  const { data: loans } = await supabase
    .from("loans")
    .select("id, approved_principal, status")
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  const activeLoans = (loans ?? []).filter((l) => l.status !== "ANULADO");
  const loanIds = activeLoans.map((l) => l.id);
  if (loanIds.length > 0) {
    const [{ data: disbs }, { data: pays }] = await Promise.all([
      supabase
        .from("loan_disbursements")
        .select("loan_id, amount")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds),
      supabase
        .from("loan_payments")
        .select("loan_id, principal_amount, interest_amount")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds),
    ]);
    for (const loan of activeLoans) {
      const kpis = computeLoanKpis({
        approvedPrincipal: loan.approved_principal,
        disbursements: (disbs ?? [])
          .filter((d) => d.loan_id === loan.id)
          .map((d) => d.amount),
        principalPaid: (pays ?? [])
          .filter((p) => p.loan_id === loan.id)
          .map((p) => p.principal_amount),
        interestAccrued: 0,
        interestPaid: (pays ?? [])
          .filter((p) => p.loan_id === loan.id)
          .map((p) => p.interest_amount),
      });
      loanDebt = loanDebt.plus(kpis.saldoCapital);
    }
  }

  return ok({
    liquidity: formatCOP(liquidity),
    liquidityRaw: liquidity,
    cxpOpen: formatCOP(cxp),
    cxpOpenRaw: cxp.toFixed(2),
    activeLoansDebt: formatCOP(loanDebt),
    activeLoansDebtRaw: loanDebt.toFixed(2),
    cashFloatTarget: formatCOP(org.cash_float_target),
  });
}

async function toolEmployees(ctx: OrgContext) {
  if (!ctxCanAccess(ctx, "personal") && !ctxCanAccess(ctx, "personal.empleados")) {
    return deny("Sin permiso de personal");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const [{ data, error }, { data: scheduleRow }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, employment_type, basic_salary, is_active, arl_risk_level, receives_transport_aid, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule, position_title",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("payroll_schedules")
      .select(
        "ordinary_entry_time, ordinary_exit_time, break_minutes, works_sunday",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) return deny(error.message);

  const labor: unknown[] = [];
  const porTurno: unknown[] = [];
  const prestacion: unknown[] = [];
  const otros: unknown[] = [];

  for (const e of data ?? []) {
    const row = {
      id: e.id,
      full_name: e.full_name,
      position_title: e.position_title ?? null,
      employment_type: e.employment_type,
      basic_salary_fmt: formatCOP(e.basic_salary ?? 0),
      basic_salary_raw: e.basic_salary,
      arl_risk_level: e.arl_risk_level,
      schedule: {
        uses_custom_schedule: Boolean(e.uses_custom_schedule),
        entry: e.ordinary_entry_time,
        exit: e.ordinary_exit_time,
        break_minutes: e.break_minutes,
      },
    };
    const t = String(e.employment_type);
    if (t === "POR_TURNO") porTurno.push(row);
    else if (t === "PRESTACION_SERVICIOS") prestacion.push(row);
    else if (t === "OTRO") otros.push(row);
    else labor.push(row);
  }

  return ok({
    candelaScheduleHint: scheduleRow
      ? {
          entry: scheduleRow.ordinary_entry_time,
          exit: scheduleRow.ordinary_exit_time,
          break_minutes: scheduleRow.break_minutes,
          works_sunday_today: scheduleRow.works_sunday,
        }
      : null,
    counts: {
      labor: labor.length,
      porTurno: porTurno.length,
      prestacion: prestacion.length,
      otros: otros.length,
    },
    labor,
    porTurno,
    prestacion,
    otros,
    howToAskUser:
      "Pregunta: ¿todos los laborales, una selección (por id/nombre), e incluye POR_TURNO? ¿Horario del domingo = Candela u otro?",
  });
}

async function toolPayrollContext(ctx: OrgContext) {
  if (
    !ctxCanAccess(ctx, "personal") &&
    !ctxCanAccess(ctx, "personal.parametros") &&
    !ctxCanAccess(ctx, "personal.simulacion")
  ) {
    return deny("Sin permiso de personal/parámetros");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const { data: schedule } = await supabase
    .from("payroll_schedules")
    .select(
      "name, ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
    )
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: legal } = await supabase
    .from("payroll_legal_params")
    .select("*")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ok({
    schedule,
    legal: legal
      ? {
          smmlv: legal.smmlv,
          surcharge_sunday_holiday: legal.surcharge_sunday_holiday,
          surcharge_night_ordinary: legal.surcharge_night_ordinary,
          max_weekly_hours: legal.max_weekly_hours,
          night_start_time: legal.night_start_time,
          night_end_time: legal.night_end_time,
          transport_aid: legal.transport_aid,
        }
      : null,
    note:
      "works_sunday=false significa que el Horario Candela no programa domingos ordinarios.",
  });
}

async function toolListPayrollPeriods(ctx: OrgContext) {
  if (
    !ctxCanAccess(ctx, "personal") &&
    !ctxCanAccess(ctx, "personal.liquidacion")
  ) {
    return deny("Sin permiso de liquidación/personal");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select(
      "id, period_year, period_month, period_half, period_start, period_end, status, calculated_at, emitted_at",
    )
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("period_half", { ascending: false })
    .limit(24);
  if (error) return deny(error.message);

  const calendar = currentBiweeklyInBogota();
  const liquidated = (data ?? []).filter((p) =>
    ["CALCULADA", "EMITIDA", "CERRADA"].includes(String(p.status)),
  );

  return ok({
    calendarTodayBogota: calendar,
    periodsInDatabase: data ?? [],
    liquidatedOrCalculatedCount: liquidated.length,
    latestLiquidated: liquidated[0] ?? null,
    note:
      "Solo estos periodos existen en Candela. No digas que hay quincenas que no aparecen aquí.",
  });
}

async function resolveSimulationPeriod(
  ctx: OrgContext,
  args: ToolArgs,
): Promise<
  | {
      ok: true;
      year: number;
      month: number;
      half: 1 | 2;
      periodSource: string;
      matchedDbPeriod: unknown | null;
      notes: string[];
    }
  | { ok: false; error: string }
> {
  const source = String(args.period_source ?? "current");
  const notes: string[] = [];
  const org = await requireOrg(ctx);
  const supabase = await createClient();

  if (source === "custom") {
    const year = Number(args.year);
    const month = Number(args.month);
    const half = Number(args.half) === 2 ? 2 : 1;
    if (!year || year < 2020 || year > 2100 || month < 1 || month > 12) {
      return {
        ok: false,
        error:
          "period_source=custom requiere year/month/half válidos dados por el usuario",
      };
    }
    const { data: match } = await supabase
      .from("payroll_periods")
      .select(
        "id, period_year, period_month, period_half, status, period_start, period_end",
      )
      .eq("organization_id", org.id)
      .eq("period_year", year)
      .eq("period_month", month)
      .eq("period_half", half)
      .is("deleted_at", null)
      .maybeSingle();
    if (!match) {
      notes.push(
        `No hay periodo ${half}ª quincena ${String(month).padStart(2, "0")}/${year} en la base; la simulación es teórica (horario + salarios actuales).`,
      );
    }
    return {
      ok: true,
      year,
      month,
      half,
      periodSource: "custom",
      matchedDbPeriod: match,
      notes,
    };
  }

  if (source === "latest_liquidated") {
    const { data: rows, error } = await supabase
      .from("payroll_periods")
      .select(
        "id, period_year, period_month, period_half, status, period_start, period_end",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .in("status", ["CALCULADA", "EMITIDA", "CERRADA"])
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("period_half", { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: error.message };
    const latest = rows?.[0];
    if (!latest) {
      const cal = currentBiweeklyInBogota();
      notes.push(
        "No hay periodos liquidados/calculados en la base; se usó la quincena calendario de hoy (Bogotá).",
      );
      return {
        ok: true,
        year: cal.year,
        month: cal.month,
        half: cal.half,
        periodSource: "current_fallback",
        matchedDbPeriod: null,
        notes,
      };
    }
    notes.push(
      `Periodo tomado de la base: ${latest.period_half}ª quincena ${String(latest.period_month).padStart(2, "0")}/${latest.period_year} (estado ${latest.status}).`,
    );
    return {
      ok: true,
      year: latest.period_year,
      month: latest.period_month,
      half: latest.period_half === 2 ? 2 : 1,
      periodSource: "latest_liquidated",
      matchedDbPeriod: latest,
      notes,
    };
  }

  // current (default) — "esta quincena"
  const cal = currentBiweeklyInBogota();
  const { data: match } = await supabase
    .from("payroll_periods")
    .select(
      "id, period_year, period_month, period_half, status, period_start, period_end",
    )
    .eq("organization_id", org.id)
    .eq("period_year", cal.year)
    .eq("period_month", cal.month)
    .eq("period_half", cal.half)
    .is("deleted_at", null)
    .maybeSingle();
  notes.push(
    `Quincena calendario hoy Bogotá (${cal.today}): ${cal.half}ª de ${String(cal.month).padStart(2, "0")}/${cal.year}.`,
  );
  if (match) {
    notes.push(`Existe en DB con estado ${match.status}.`);
  } else {
    notes.push(
      "Esa quincena aún no tiene fila en payroll_periods; simulación teórica con empleados/salarios actuales.",
    );
  }
  return {
    ok: true,
    year: cal.year,
    month: cal.month,
    half: cal.half,
    periodSource: "current",
    matchedDbPeriod: match,
    notes,
  };
}

async function toolSimulateSundays(ctx: OrgContext, args: ToolArgs) {
  if (
    !ctxCanAccess(ctx, "personal") &&
    !ctxCanAccess(ctx, "personal.simulacion") &&
    !ctxCanAccess(ctx, "personal.liquidacion")
  ) {
    return deny("Sin permiso para simular nómina");
  }
  const org = await requireOrg(ctx);
  const resolved = await resolveSimulationPeriod(ctx, args);
  if (!resolved.ok) return deny(resolved.error);
  const { year, month, half } = resolved;

  const supabase = await createClient();
  const { data: scheduleRow, error: schErr } = await supabase
    .from("payroll_schedules")
    .select(
      "ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
    )
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (schErr) return deny(schErr.message);
  if (!scheduleRow) return deny("No hay Horario Candela configurado");

  const { data: legalRow, error: legErr } = await supabase
    .from("payroll_legal_params")
    .select("*")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legErr) return deny(legErr.message);
  if (!legalRow) return deny("No hay parámetros legales de nómina");

  const legal = mapLegalParamsRow(legalRow as Record<string, unknown>);
  const baseSchedule = mapScheduleRow(scheduleRow);
  const closedSunday: PayrollScheduleInput = {
    ...baseSchedule,
    works_sunday: false,
  };
  const openSunday: PayrollScheduleInput = {
    ...baseSchedule,
    works_sunday: true,
  };

  const staffScope = String(args.staff_scope ?? "all_active_labor");
  const selectedIds = String(args.employee_ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (staffScope === "selected" && selectedIds.length === 0) {
    return deny(
      "staff_scope=selected requiere employee_ids. Aclara con el usuario o usa all_active_labor.",
    );
  }

  const sundayEntry = String(args.sunday_entry ?? "").trim();
  const sundayExit = String(args.sunday_exit ?? "").trim();
  const breakArg = Number(args.sunday_break_minutes);
  const customSundayHours = Boolean(sundayEntry && sundayExit);

  let empQuery = supabase
    .from("employees")
    .select(
      "id, full_name, employment_type, basic_salary, arl_risk_level, receives_transport_aid, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule",
    )
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .eq("is_active", true);
  if (staffScope === "selected") {
    empQuery = empQuery.in("id", selectedIds);
  }
  const { data: employees, error: empErr } = await empQuery;
  if (empErr) return deny(empErr.message);
  if (staffScope === "selected" && (employees ?? []).length === 0) {
    return deny("No se encontraron empleados con esos IDs");
  }

  const laborTypes = new Set([
    "INDEFINIDO",
    "TERMINO_FIJO",
    "OBRA_LABOR",
    "APRENDIZAJE",
    "MEDIO_TIEMPO",
    "LABORAL",
    "TEMPORAL",
  ]);

  const perEmployee: unknown[] = [];
  let totalClosed = money(0);
  let totalOpen = money(0);
  let totalDelta = money(0);
  let sundaySurchargeDelta = money(0);
  let maxSundayDays = 0;
  let simulatedCount = 0;
  let skippedTurno = 0;
  let skippedPrestacion = 0;

  for (const e of employees ?? []) {
    const empType = String(e.employment_type) as EmploymentContractType;
    if (empType === "POR_TURNO") {
      skippedTurno += 1;
      perEmployee.push({
        employeeId: e.id,
        name: e.full_name,
        skipped: true,
        reason:
          "POR_TURNO: no entra en este cálculo; su domingo se paga por tarifa de turno/gasto, no por recargo Candela",
      });
      continue;
    }
    if (empType === "PRESTACION_SERVICIOS") {
      skippedPrestacion += 1;
      perEmployee.push({
        employeeId: e.id,
        name: e.full_name,
        skipped: true,
        reason: "PRESTACION_SERVICIOS: honorarios, sin recargo dominical de nómina",
      });
      continue;
    }
    if (!laborTypes.has(empType) && empType !== "OTRO") {
      // aún simular OTRO/otros laborales genéricos
    }

    const salary = Number(e.basic_salary ?? 0);
    if (!salary) {
      perEmployee.push({
        employeeId: e.id,
        name: e.full_name,
        skipped: true,
        reason: "Sin salario básico",
      });
      continue;
    }

    const baseEmpSchedule = mapEmployeeSchedule({
      ordinary_entry_time: e.ordinary_entry_time,
      ordinary_exit_time: e.ordinary_exit_time,
      break_minutes: e.break_minutes,
      uses_custom_schedule: Boolean(e.uses_custom_schedule),
      fallback: baseSchedule,
    });

    const schedule = customSundayHours
      ? {
          ordinary_entry_time: sundayEntry.slice(0, 5),
          ordinary_exit_time: sundayExit.slice(0, 5),
          break_minutes:
            Number.isFinite(breakArg) && breakArg >= 0
              ? breakArg
              : baseEmpSchedule.break_minutes,
          uses_custom_schedule: true,
        }
      : baseEmpSchedule;

    const closed = simulateBiweekly({
      year,
      month,
      half,
      basicSalary: salary,
      employmentType: empType,
      receivesTransportAid: e.receives_transport_aid as boolean | null,
      arlRiskLevel: (e.arl_risk_level as "I") ?? "I",
      schedule,
      candelaSchedule: closedSunday,
      legal,
      bonuses: [],
      includeGoalBonuses: false,
      novelties: [],
    });
    const open = simulateBiweekly({
      year,
      month,
      half,
      basicSalary: salary,
      employmentType: empType,
      receivesTransportAid: e.receives_transport_aid as boolean | null,
      arlRiskLevel: (e.arl_risk_level as "I") ?? "I",
      schedule,
      candelaSchedule: openSunday,
      legal,
      bonuses: [],
      includeGoalBonuses: false,
      novelties: [],
    });

    const deltaCost = money(open.employerCost).minus(closed.employerCost);
    const deltaSunday = money(open.earnings.sundaySurcharge).minus(
      closed.earnings.sundaySurcharge,
    );
    const sundayDays = open.hours.sundayDays;
    maxSundayDays = Math.max(maxSundayDays, sundayDays);
    const perSundayEmployer =
      sundayDays > 0 ? deltaCost.div(sundayDays) : money(0);
    const perSundaySurcharge =
      sundayDays > 0 ? deltaSunday.div(sundayDays) : money(0);

    totalClosed = totalClosed.plus(closed.employerCost);
    totalOpen = totalOpen.plus(open.employerCost);
    totalDelta = totalDelta.plus(deltaCost);
    sundaySurchargeDelta = sundaySurchargeDelta.plus(deltaSunday);
    simulatedCount += 1;

    perEmployee.push({
      employeeId: e.id,
      name: e.full_name,
      employmentType: empType,
      basicSalary: formatCOP(salary),
      ordinaryHourValue: formatCOP(open.ordinaryHourValue),
      sundayDaysInPeriod: sundayDays,
      sundayHoursInPeriod: money(open.hours.sundayDayHours)
        .plus(open.hours.sundayNightHours)
        .toDecimalPlaces(2)
        .toNumber(),
      oneSunday: {
        employerCostDelta: formatCOP(perSundayEmployer),
        sundaySurchargeDelta: formatCOP(perSundaySurcharge),
      },
      periodDelta: {
        employerCost: formatCOP(deltaCost),
        sundaySurcharge: formatCOP(deltaSunday),
      },
    });
  }

  const sundayDays = maxSundayDays;
  const oneSundayEmployer =
    sundayDays > 0 ? totalDelta.div(sundayDays) : money(0);
  const oneSundaySurcharge =
    sundayDays > 0 ? sundaySurchargeDelta.div(sundayDays) : money(0);

  const hasDbPeriod = Boolean(resolved.matchedDbPeriod);
  const confidence =
    hasDbPeriod &&
    resolved.periodSource === "latest_liquidated" &&
    skippedTurno === 0
      ? "media"
      : hasDbPeriod
        ? "media-baja"
        : "baja";

  return ok({
    period: { year, month, half },
    periodLabel: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
    periodSource: resolved.periodSource,
    matchedDbPeriod: resolved.matchedDbPeriod,
    resolutionNotes: resolved.notes,
    staffScope,
    selectedEmployeeIds: selectedIds,
    sundayHoursUsed: customSundayHours
      ? {
          entry: sundayEntry.slice(0, 5),
          exit: sundayExit.slice(0, 5),
          break_minutes:
            Number.isFinite(breakArg) && breakArg >= 0
              ? breakArg
              : "default_empleado_o_candela",
        }
      : {
          entry: "horario_empleado_o_candela",
          exit: "horario_empleado_o_candela",
          break_minutes: "default",
        },
    currentWorksSunday: baseSchedule.works_sunday,
    surchargeSundayHolidayPct: legal.surcharge_sunday_holiday,
    confidence,
    confidenceWhy: [
      hasDbPeriod
        ? "Hay periodo en DB, pero el delta sigue siendo teórico (sin planilla/novedades)."
        : "No hay liquidación de ese periodo: salarios/horario actuales, sin asistencia real.",
      `Motor Candela: básico quincenal fijo; al abrir domingo el incremento viene del recargo (${legal.surcharge_sunday_holiday}%) + nocturno si aplica + aportes/provisiones sobre ese mayor IBC.`,
      skippedTurno > 0
        ? `Quedaron fuera ${skippedTurno} POR_TURNO (suelen ser clave en un domingo de restaurante).`
        : "No hay POR_TURNO omitidos.",
      "No incluye: insumos, servicios, arriendo, propinas, ni ventas mínimas para cubrir el domingo.",
    ],
    howToRead: {
      leValeACandela:
        "SIEMPRE usa oneSunday.employerCostDelta / answerForOwner.headline como cifra principal.",
      soloRecargoTrabajadores:
        "oneSunday.sundaySurchargeDelta — NO es lo que le cuesta al negocio.",
      formula:
        "oneSunday = (costo_empleador con domingo abierto − cerrado) / domingos del periodo.",
    },
    answerForOwner: {
      // No usar la palabra "adicionales": para sueldo fijo, ESTE es el costo de abrir.
      headline: `Abrir el domingo${customSundayHours ? ` de ${sundayEntry.slice(0, 5)} a ${sundayExit.slice(0, 5)}` : ""} le cuesta a Candela unos ${formatCOP(oneSundayEmployer)} en nómina.`,
      costToOpenSunday: formatCOP(oneSundayEmployer),
      costToOpenSundayRaw: oneSundayEmployer.toFixed(2),
      ofWhichWorkerSurcharges: formatCOP(oneSundaySurcharge),
      ofWhichEmployerLoadsApprox: formatCOP(
        oneSundayEmployer.minus(oneSundaySurcharge),
      ),
      whyThisIsTheFullOpenCost:
        "Con empleados de sueldo mensual/quincenal, el básico se paga igual abras o no. Lo que cuesta ABRIR el domingo es este monto (recargo dominical/nocturno + cargas/provisiones sobre ese recargo). No es un 'extra' aparte de otro costo de abrir: es el costo de la decisión de abrir.",
      decisionHint: `Con ventas escasas: si el margen de contribución del domingo (ventas − comida/insumos de ese día) no supera ~${formatCOP(oneSundayEmployer)}, abrir genera pérdida solo por nómina. Argumento para no abrir.`,
      hoursLabel: customSundayHours
        ? `${sundayEntry.slice(0, 5)}–${sundayExit.slice(0, 5)}`
        : "horario empleado/Candela",
      doesNotInclude:
        "Turnos POR_TURNO, insumos, servicios, arriendo prorrateado, ni el sueldo básico (ese ya se paga cerrado o abierto).",
    },
    oneSunday: {
      sundayDaysInPeriod: sundayDays,
      employeesSimulated: simulatedCount,
      skippedPorTurno: skippedTurno,
      skippedPrestacion: skippedPrestacion,
      employerCostDelta: formatCOP(oneSundayEmployer),
      employerCostDeltaRaw: oneSundayEmployer.toFixed(2),
      sundaySurchargeDelta: formatCOP(oneSundaySurcharge),
      sundaySurchargeDeltaRaw: oneSundaySurcharge.toFixed(2),
      cargasYProvisionesApprox: formatCOP(
        oneSundayEmployer.minus(oneSundaySurcharge),
      ),
    },
    assumptions: [
      "Compara Horario Candela con domingo cerrado vs abierto.",
      "Sin novedades ni planilla de asistencia (escenario teórico).",
      "Excluye POR_TURNO y PRESTACION_SERVICIOS del total laboral.",
      "Costo de un domingo = delta quincenal / domingos del periodo (promedio; no un domingo calendario puntual).",
      ...resolved.notes,
    ],
    totals: {
      employerCostClosed: formatCOP(totalClosed),
      employerCostOpen: formatCOP(totalOpen),
      deltaEmployerCostBiweekly: formatCOP(totalDelta),
      deltaSundaySurchargeBiweekly: formatCOP(sundaySurchargeDelta),
    },
    perEmployee,
  });
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function toolProductsToBuy(ctx: OrgContext, args: ToolArgs) {
  if (!ctxCanAccess(ctx, "inventario") && !ctxCanAccess(ctx, "compras")) {
    return deny("Sin permiso de inventario/compras");
  }
  const org = await requireOrg(ctx);
  const filter = String(args.filter ?? "a_comprar");
  const exportCsv = Boolean(args.export_csv);
  const previewLimit = Math.min(Math.max(Number(args.limit) || 60, 1), 200);
  const supabase = await createClient();
  const [{ data, error }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, sku, current_stock, min_stock, unit, item_kind, unit_cost, category_id, tracks_inventory",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name")
      .limit(2000),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null),
  ]);
  if (error) return deny(error.message);

  const catMap = new Map(
    (categories ?? []).map((c) => [c.id as string, String(c.name ?? "")]),
  );

  type Row = {
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    item_kind: string | null;
    category: string;
    current_stock: number;
    min_stock: number;
    suggested_qty: number;
    unit_cost: number | null;
    reason: string;
  };

  const rows: Row[] = [];
  for (const p of data ?? []) {
    // Alineado a Compras → Sugeridos: materia prima con control de inventario
    if (p.tracks_inventory === false) continue;
    if (p.item_kind && p.item_kind !== "MATERIA_PRIMA") continue;

    const stock = Number(p.current_stock ?? 0);
    const min = Number(p.min_stock ?? 0);
    const suggested = suggestedPurchaseQty(stock, min);
    const sinStock = stock <= 0;
    const bajoMin = min > 0 && stock <= min;
    let include = false;
    let reason = "";
    if (filter === "sin_stock") {
      include = sinStock;
      reason = "Sin inventario";
    } else if (filter === "bajo_minimo") {
      include = bajoMin;
      reason = "Bajo o en mínimo";
    } else {
      // a_comprar: sin stock O bajo mínimo (incluye sugeridos)
      include = sinStock || bajoMin || suggested > 0;
      if (sinStock) reason = "Sin inventario";
      else if (bajoMin) reason = "Bajo o en mínimo";
      else reason = "Sugerido de compra";
    }
    if (!include) continue;

    rows.push({
      id: p.id as string,
      name: String(p.name ?? ""),
      sku: (p.sku as string | null) ?? null,
      unit: String(p.unit ?? "UND"),
      item_kind: (p.item_kind as string | null) ?? null,
      category: catMap.get(String(p.category_id ?? "")) ?? "",
      current_stock: stock,
      min_stock: min,
      suggested_qty: suggested > 0 ? suggested : sinStock ? 1 : 0,
      unit_cost: p.unit_cost != null ? Number(p.unit_cost) : null,
      reason,
    });
  }

  const preview = rows.slice(0, previewLimit);
  const payload: Record<string, unknown> = {
    filter,
    total: rows.length,
    previewCount: preview.length,
    products: preview,
    note:
      rows.length === 0
        ? filter === "sin_stock"
          ? "No hay productos activos con existencia ≤ 0."
          : filter === "bajo_minimo"
            ? "No hay productos con mínimo definido y stock ≤ mínimo. Prueba filter=sin_stock o a_comprar."
            : "No hay productos a reponer con los criterios actuales."
        : exportCsv
          ? "Archivo CSV listo para descargar (se abre en Excel). Dile al usuario que use el botón de descarga."
          : "Si pide Excel/archivo, vuelve a llamar con export_csv=true.",
  };

  if (exportCsv && rows.length > 0) {
    const header = [
      "SKU",
      "Producto",
      "Categoría",
      "Tipo",
      "Unidad",
      "Stock actual",
      "Stock mínimo",
      "Cantidad sugerida",
      "Costo unitario",
      "Motivo",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.sku ?? "",
          r.name,
          r.category,
          r.item_kind ?? "",
          r.unit,
          String(r.current_stock),
          String(r.min_stock),
          String(r.suggested_qty),
          r.unit_cost != null ? String(r.unit_cost) : "",
          r.reason,
        ]
          .map((v) => csvEscape(String(v)))
          .join(","),
      );
    }
    const csv = `\uFEFF${lines.join("\n")}`;
    const filename = `compras-${filter}-${todayInBogota()}.csv`;
    const attachment: AgentAttachment = {
      filename,
      mimeType: "text/csv;charset=utf-8",
      contentBase64: Buffer.from(csv, "utf8").toString("base64"),
    };
    payload[ATTACHMENT_MARKER] = attachment;
    payload.export = {
      filename,
      rowCount: rows.length,
      opensInExcel: true,
    };
  }

  return ok(payload);
}

export function extractAttachmentFromToolOutput(
  output: string,
): AgentAttachment | null {
  try {
    const parsed = JSON.parse(output) as {
      ok?: boolean;
      data?: Record<string, unknown>;
    };
    const att = parsed.data?.[ATTACHMENT_MARKER];
    if (
      att &&
      typeof att === "object" &&
      att !== null &&
      "filename" in att &&
      "contentBase64" in att &&
      "mimeType" in att
    ) {
      return att as AgentAttachment;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function toolRecipes(ctx: OrgContext) {
  if (!ctxCanAccess(ctx, "cocina") && !ctxCanAccess(ctx, "cocina.recetas")) {
    return deny("Sin permiso de cocina");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const { data: recipes, error } = await supabase
    .from("kitchen_recipes")
    .select("id, name, product_id, yield_qty, is_active")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("name");
  if (error) return deny(error.message);

  const ids = (recipes ?? []).map((r) => r.id);
  let lineCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: lines } = await supabase
      .from("kitchen_recipe_lines")
      .select("recipe_id")
      .eq("organization_id", org.id)
      .in("recipe_id", ids)
      .is("deleted_at", null);
    for (const l of lines ?? []) {
      const id = l.recipe_id as string;
      lineCounts[id] = (lineCounts[id] ?? 0) + 1;
    }
  }

  return ok(
    (recipes ?? []).map((r) => ({
      ...r,
      lineCount: lineCounts[r.id] ?? 0,
    })),
  );
}

async function toolPurchases(ctx: OrgContext) {
  if (!ctxCanAccess(ctx, "compras")) {
    return deny("Sin permiso de compras");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, status, is_urgent, created_at, notes")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return deny(error.message);
  const closed = new Set(["CERRADA", "CANCELADA", "RECHAZADA", "PAGADA"]);
  return ok(
    (data ?? []).filter((r) => !closed.has(String(r.status ?? ""))),
  );
}

async function toolSuppliers(ctx: OrgContext) {
  if (
    !ctxCanAccess(ctx, "proveedores") &&
    !ctxCanAccess(ctx, "compras")
  ) {
    return deny("Sin permiso de proveedores/compras");
  }
  const org = await requireOrg(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, is_purchase, is_expense, is_active")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name")
    .limit(100);
  if (error) return deny(error.message);
  return ok(data ?? []);
}

function resolveReportRange(args: ToolArgs): {
  start: string;
  end: string;
  label: string;
} {
  const today = todayInBogota();
  const end = today;
  const preset = String(args.period_preset ?? "last_12_months");
  const bogotaNow = toZonedTime(new Date(), APP_TIMEZONE);

  if (preset === "custom") {
    const start = String(args.start_date ?? "").trim();
    const endCustom = String(args.end_date ?? "").trim() || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(endCustom)) {
      throw new Error("custom requiere start_date y end_date yyyy-mm-dd");
    }
    return {
      start,
      end: endCustom,
      label: `${formatDateCO(start)} – ${formatDateCO(endCustom)}`,
    };
  }

  if (preset === "this_year") {
    const year = formatInTimeZone(bogotaNow, APP_TIMEZONE, "yyyy");
    return {
      start: `${year}-01-01`,
      end,
      label: `Año ${year} (hasta hoy)`,
    };
  }

  if (preset === "last_30_days" || preset === "last_90_days") {
    const days = preset === "last_30_days" ? 30 : 90;
    const start = formatInTimeZone(
      subDays(bogotaNow, days),
      APP_TIMEZONE,
      "yyyy-MM-dd",
    );
    return {
      start,
      end,
      label: `Últimos ${days} días (${formatDateCO(start)} – ${formatDateCO(end)})`,
    };
  }

  // last_12_months
  const start = formatInTimeZone(
    subMonths(bogotaNow, 12),
    APP_TIMEZONE,
    "yyyy-MM-dd",
  );
  return {
    start,
    end,
    label: `Últimos 12 meses (${formatDateCO(start)} – ${formatDateCO(end)})`,
  };
}

function normalizeSupplierName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function toolRankSuppliers(ctx: OrgContext, args: ToolArgs) {
  if (
    !ctxCanAccess(ctx, "proveedores") &&
    !ctxCanAccess(ctx, "compras") &&
    !ctxCanAccess(ctx, "inicio")
  ) {
    return deny("Sin permiso para consultar compras/proveedores");
  }
  const org = await requireOrg(ctx);
  let range: { start: string; end: string; label: string };
  try {
    range = resolveReportRange(args);
  } catch (e) {
    return deny(e instanceof Error ? e.message : "Rango inválido");
  }

  const metric =
    String(args.metric ?? "facturado") === "pagado" ? "pagado" : "facturado";
  const sourceScope =
    String(args.source_scope ?? "compras") === "all" ? "all" : "compras";
  const topN = Math.min(Math.max(Number(args.top_n) || 10, 1), 30);
  const reportLevel =
    String(args.report_level ?? "ejecutivo") === "proveedor_detalle"
      ? "proveedor_detalle"
      : "ejecutivo";
  const focusRaw = String(args.focus_supplier ?? "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("accounts_payable_documents")
    .select(
      "id, supplier_id, original_amount, paid_amount, issue_date, due_date, document_number, document_type, concept, status, source, created_at",
    )
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .neq("status", "ANULADA");

  if (sourceScope === "compras") {
    query = query.eq("source", "compras");
  }

  const { data: docs, error } = await query.limit(5000);
  if (error) return deny(error.message);

  type DocRow = {
    id: string;
    supplier_id: string;
    original_amount: number | string;
    paid_amount: number | string;
    issue_date: string | null;
    due_date: string | null;
    document_number: string | null;
    document_type: string | null;
    concept: string | null;
    status: string;
    source: string | null;
    created_at: string | null;
    docDate: string;
  };

  const inRange: DocRow[] = [];
  for (const d of docs ?? []) {
    const issue = (d.issue_date as string | null) || null;
    const created = d.created_at ? String(d.created_at).slice(0, 10) : null;
    const docDate = issue || created;
    if (!docDate || docDate < range.start || docDate > range.end) continue;
    inRange.push({
      id: String(d.id),
      supplier_id: String(d.supplier_id),
      original_amount: d.original_amount as number | string,
      paid_amount: d.paid_amount as number | string,
      issue_date: issue,
      due_date: (d.due_date as string | null) ?? null,
      document_number: (d.document_number as string | null) ?? null,
      document_type: (d.document_type as string | null) ?? null,
      concept: (d.concept as string | null) ?? null,
      status: String(d.status),
      source: (d.source as string | null) ?? null,
      created_at: (d.created_at as string | null) ?? null,
      docDate,
    });
  }

  const supplierIds = [...new Set(inRange.map((d) => d.supplier_id))];
  const nameMap = new Map<string, string>();
  const categoryFieldMap = new Map<string, string | null>();
  if (supplierIds.length > 0) {
    const { data: suppliers, error: sErr } = await supabase
      .from("suppliers")
      .select("id, name, category")
      .eq("organization_id", org.id)
      .in("id", supplierIds);
    if (sErr) return deny(sErr.message);
    for (const s of suppliers ?? []) {
      nameMap.set(String(s.id), String(s.name ?? "Sin nombre"));
      categoryFieldMap.set(
        String(s.id),
        (s.category as string | null) ?? null,
      );
    }
  }

  const sellsBySupplier = new Map<string, string[]>();
  const boughtCategoriesBySupplier = new Map<string, Map<string, number>>();
  if (supplierIds.length > 0) {
    const [{ data: links }, { data: cats }] = await Promise.all([
      supabase
        .from("supplier_product_categories")
        .select("supplier_id, category_id")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .in("supplier_id", supplierIds),
      supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("deleted_at", null),
    ]);
    const catName = new Map(
      (cats ?? []).map((c) => [String(c.id), String(c.name ?? "")]),
    );
    for (const link of links ?? []) {
      const sid = String(link.supplier_id);
      const name = catName.get(String(link.category_id));
      if (!name) continue;
      const list = sellsBySupplier.get(sid) ?? [];
      if (!list.includes(name)) list.push(name);
      sellsBySupplier.set(sid, list);
    }

    // Categorías realmente compradas en el periodo (para gerencia)
    const docIds = inRange.map((d) => d.id);
    if (docIds.length > 0) {
      const { data: items } = await supabase
        .from("purchase_request_items")
        .select(
          "invoice_ap_document_id, product_id, quantity_invoiced, quantity_received, approved_supplier_id, suggested_supplier_id",
        )
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .in("invoice_ap_document_id", docIds.slice(0, 1000));

      const productIds = [
        ...new Set(
          (items ?? [])
            .map((i) => i.product_id as string | null)
            .filter((id): id is string => !!id),
        ),
      ];
      const productMeta = new Map<
        string,
        { name: string; categoryId: string | null }
      >();
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, category_id")
          .eq("organization_id", org.id)
          .in("id", productIds);
        for (const p of prods ?? []) {
          productMeta.set(String(p.id), {
            name: String(p.name ?? ""),
            categoryId: p.category_id ? String(p.category_id) : null,
          });
        }
      }

      const docSupplier = new Map(inRange.map((d) => [d.id, d.supplier_id]));
      for (const item of items ?? []) {
        const apId = String(item.invoice_ap_document_id ?? "");
        const sid =
          docSupplier.get(apId) ||
          String(
            item.approved_supplier_id || item.suggested_supplier_id || "",
          );
        if (!sid || !item.product_id) continue;
        const meta = productMeta.get(String(item.product_id));
        if (!meta) continue;
        const catLabel =
          (meta.categoryId && catName.get(meta.categoryId)) || "Sin categoría";
        const amountProxy = Number(
          item.quantity_invoiced ?? item.quantity_received ?? 1,
        );
        const map =
          boughtCategoriesBySupplier.get(sid) ?? new Map<string, number>();
        map.set(
          catLabel,
          (map.get(catLabel) ?? 0) +
            (Number.isFinite(amountProxy) ? amountProxy : 1),
        );
        boughtCategoriesBySupplier.set(sid, map);
      }
    }
  }

  type Group = {
    key: string;
    displayName: string;
    supplierIds: string[];
    documentCount: number;
    totalFacturado: ReturnType<typeof money>;
    totalPagado: ReturnType<typeof money>;
    documents: DocRow[];
  };
  const groups = new Map<string, Group>();

  for (const d of inRange) {
    const rawName = nameMap.get(d.supplier_id) ?? "Proveedor";
    const key = normalizeSupplierName(rawName) || d.supplier_id;
    const g = groups.get(key) ?? {
      key,
      displayName: rawName,
      supplierIds: [],
      documentCount: 0,
      totalFacturado: money(0),
      totalPagado: money(0),
      documents: [],
    };
    if (!g.supplierIds.includes(d.supplier_id)) {
      g.supplierIds.push(d.supplier_id);
    }
    g.documentCount += 1;
    g.totalFacturado = g.totalFacturado.plus(d.original_amount ?? 0);
    g.totalPagado = g.totalPagado.plus(d.paid_amount ?? 0);
    g.documents.push(d);
    groups.set(key, g);
  }

  function categoriesForGroup(g: Group) {
    const maestro = new Set<string>();
    const compradas = new Map<string, number>();
    for (const sid of g.supplierIds) {
      for (const c of sellsBySupplier.get(sid) ?? []) maestro.add(c);
      const legacy = categoryFieldMap.get(sid);
      if (legacy) maestro.add(legacy);
      for (const [c, w] of boughtCategoriesBySupplier.get(sid) ?? []) {
        compradas.set(c, (compradas.get(c) ?? 0) + w);
      }
    }
    const typicallyBuys = [...compradas.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
    const catalog = [...maestro].filter(Boolean).sort();
    // Preferir lo comprado en el periodo; si no hay, el catálogo maestro
    const summaryCategories =
      typicallyBuys.length > 0 ? typicallyBuys : catalog;
    return {
      typicallyBuysInPeriod: typicallyBuys,
      catalogCategories: catalog,
      summaryCategories,
      summaryLabel:
        summaryCategories.length > 0
          ? summaryCategories.join(", ")
          : "Sin categoría registrada",
    };
  }

  const allSorted = [...groups.values()]
    .map((g) => ({
      ...g,
      sortValue:
        metric === "pagado"
          ? g.totalPagado.toNumber()
          : g.totalFacturado.toNumber(),
    }))
    .sort((a, b) => b.sortValue - a.sortValue);

  const rankedGroups = allSorted.slice(0, topN);

  const ranking = rankedGroups.map((g, i) => {
    const cats = categoriesForGroup(g);
    return {
      rank: i + 1,
      supplierName: g.displayName,
      supplierIds: g.supplierIds,
      mergedDuplicates: g.supplierIds.length > 1,
      documentCount: g.documentCount,
      totalFacturado: formatCOP(g.totalFacturado),
      totalPagado: formatCOP(g.totalPagado),
      totalFacturadoRaw: g.totalFacturado.toFixed(2),
      totalPagadoRaw: g.totalPagado.toFixed(2),
      /** Texto corto para gerencia: qué se le suele comprar */
      whatWeBuyFromThem: cats.summaryLabel,
      categoriesBoughtInPeriod: cats.typicallyBuysInPeriod,
      catalogCategories: cats.catalogCategories,
    };
  });

  const grandFacturado = [...groups.values()].reduce(
    (acc, a) => acc.plus(a.totalFacturado),
    money(0),
  );

  // Detalle fino solo si lo piden para UN proveedor
  let supplierDeepDive: unknown = null;
  if (reportLevel === "proveedor_detalle") {
    if (!focusRaw) {
      return deny(
        "report_level=proveedor_detalle requiere focus_supplier (nombre o id). Para ranking gerencial usa report_level=ejecutivo.",
      );
    }
    const focusNorm = normalizeSupplierName(focusRaw);
    const target =
      allSorted.find((g) => g.supplierIds.includes(focusRaw)) ||
      allSorted.find(
        (g) =>
          normalizeSupplierName(g.displayName).includes(focusNorm) ||
          focusNorm.includes(normalizeSupplierName(g.displayName)),
      );
    if (!target) {
      return ok({
        period: {
          preset: String(args.period_preset),
          start: range.start,
          end: range.end,
          label: range.label,
        },
        error: `No hay facturas de «${focusRaw}» en este periodo.`,
        rankingPreview: ranking.slice(0, 5),
      });
    }

    const cats = categoriesForGroup(target);
    const focusDocIds = target.documents.map((d) => d.id);
    const productLines: { name: string; qty: number }[] = [];
    if (focusDocIds.length > 0) {
      const { data: items } = await supabase
        .from("purchase_request_items")
        .select(
          "invoice_ap_document_id, product_id, quantity_invoiced, quantity_received",
        )
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .in("invoice_ap_document_id", focusDocIds);
      const pids = [
        ...new Set(
          (items ?? [])
            .map((i) => i.product_id as string | null)
            .filter((id): id is string => !!id),
        ),
      ];
      const names = new Map<string, string>();
      if (pids.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .eq("organization_id", org.id)
          .in("id", pids);
        for (const p of prods ?? []) {
          names.set(String(p.id), String(p.name ?? ""));
        }
      }
      const qtyMap = new Map<string, number>();
      for (const item of items ?? []) {
        if (!item.product_id) continue;
        const n = names.get(String(item.product_id));
        if (!n) continue;
        const q = Number(
          item.quantity_invoiced ?? item.quantity_received ?? 0,
        );
        qtyMap.set(n, (qtyMap.get(n) ?? 0) + (Number.isFinite(q) ? q : 0));
      }
      productLines.push(
        ...[...qtyMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, qty]) => ({ name, qty })),
      );
    }

    supplierDeepDive = {
      supplierName: target.displayName,
      documentCount: target.documentCount,
      totalFacturado: formatCOP(target.totalFacturado),
      totalPagado: formatCOP(target.totalPagado),
      whatWeBuyFromThem: cats.summaryLabel,
      categoriesBoughtInPeriod: cats.typicallyBuysInPeriod,
      catalogCategories: cats.catalogCategories,
      invoices: target.documents
        .slice()
        .sort((a, b) => b.docDate.localeCompare(a.docDate))
        .map((d) => ({
          dateFmt: formatDateCO(d.docDate),
          documentNumber: d.document_number,
          concept: d.concept,
          status: d.status,
          facturado: formatCOP(d.original_amount),
          pagado: formatCOP(d.paid_amount),
        })),
      productsBoughtInPeriod: productLines.slice(0, 40),
    };
  }

  return ok({
    period: {
      preset: String(args.period_preset ?? "last_12_months"),
      start: range.start,
      end: range.end,
      label: range.label,
      todayBogota: todayInBogota(),
    },
    metric,
    sourceScope,
    reportLevel,
    aggregation:
      "Suma de TODAS las facturas CxP del periodo por proveedor (nombres duplicados unidos).",
    importantNote:
      "Solo cuenta lo FACTURADO en CxP. Pedidos sin factura no entran.",
    ranking,
    supplierDeepDive,
    totals: {
      suppliersWithActivity: groups.size,
      documentsInRange: inRange.length,
      totalFacturado: formatCOP(grandFacturado),
    },
    howToPresent:
      reportLevel === "ejecutivo"
        ? "SOLO resumen gerencial: tabla puesto | proveedor | # facturas | total facturado | qué se le compra (categorías). NO listes facturas ni cada producto. Ofrece: «si quieres el detalle de un proveedor, dímelo»."
        : "Detalle del proveedor enfocado: totales, categorías, facturas y productos. No vuelvas a pegar el ranking completo salvo un mini-contexto.",
    emptyHint:
      ranking.length === 0
        ? "No hay facturas CxP en ese rango. Prueba source_scope=all o un periodo más amplio."
        : null,
  });
}

async function toolCreateNovelty(ctx: OrgContext, args: ToolArgs) {
  if (!args.user_confirmed) {
    return ok({
      status: "needs_confirmation",
      message:
        "Falta confirmación explícita del usuario. Resume la novedad y pide que confirme antes de llamar de nuevo con user_confirmed=true.",
      draft: {
        employee_id: args.employee_id,
        novelty_date: args.novelty_date,
        novelty_type: args.novelty_type,
        minutes: args.minutes,
        amount: args.amount,
        notes: args.notes,
      },
    });
  }
  if (!ctxCanAccess(ctx, "personal.novedades")) {
    return deny("Sin permiso para crear novedades");
  }

  const fd = new FormData();
  fd.set("employee_id", String(args.employee_id ?? ""));
  fd.set("novelty_date", String(args.novelty_date ?? ""));
  fd.set("novelty_type", String(args.novelty_type ?? ""));
  fd.set("minutes", String(args.minutes ?? ""));
  fd.set("amount", String(args.amount ?? ""));
  fd.set("notes", String(args.notes ?? ""));
  fd.set("start_time", "");
  fd.set("end_time", "");
  fd.set("support_note", "Creado vía Asistente Candela");

  const result = await createNoveltyAction(fd);
  return ok(result);
}
