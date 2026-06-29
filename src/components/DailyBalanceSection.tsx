import React, { useState, useMemo } from 'react';
import { 
  Calendar, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, 
  Info, Sparkles, AlertTriangle, ChevronRight, X, Layers, Landmark, CreditCard, 
  ChevronDown, HelpCircle, AlertCircle, Sparkle, CheckCircle2
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase, CreditCard as CardType, DebitCard as AccountType } from '../types';
import { 
  computeMonthlyAccountBalances, 
  getProjectedInstallments, 
  computeCardStatementsForMonth 
} from '../utils/financeUtils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface DailyBalanceSectionProps {
  state: AppState;
}

interface DayMovement {
  id: string;
  type: 'income' | 'expense' | 'loan' | 'credit_card';
  description: string;
  amount: number;
  categoryName: string;
  categoryColor: string;
  paymentMethod?: string;
  accountName?: string;
}

interface DayData {
  day: number;
  dateStr: string;
  incomes: number;
  expenses: number;
  balanceBefore: number;
  balanceAfter: number;
  movements: DayMovement[];
}

export default function DailyBalanceSection({ state }: DailyBalanceSectionProps) {
  const { transactions, creditCards, debitCards, installments, categories, selectedMonth, initialBalancesOverrides, paidCardStatements } = state;

  // Selected Day state (defaults to null, click to view detail card/modal)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Simulation State for testing custom prospective purchase
  const [useSimulator, setUseSimulator] = useState(false);
  const [simDescription, setSimDescription] = useState('Gasto de prueba');
  const [simAmount, setSimAmount] = useState('350');
  const [simDay, setSimDay] = useState('15');
  const [simPaymentMethod, setSimPaymentMethod] = useState<'cash' | 'credit'>('cash');

  // Month-year label
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10);
  const monthNameEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ][monthIdx - 1];

  const daysInMonth = useMemo(() => {
    return new Date(year, monthIdx, 0).getDate();
  }, [year, monthIdx]);

  // Main Daily Rollforward Calculation
  const dailyTimeline = useMemo(() => {
    // 1. Get initial cash/debit balance for the selected month (the cumulative rollover from Jan 2026 up to day 1)
    const debitCardBalances = computeMonthlyAccountBalances(
      debitCards,
      transactions,
      creditCards,
      installments,
      selectedMonth,
      initialBalancesOverrides,
      paidCardStatements
    );
    const initialCashBalance = Object.values(debitCardBalances).reduce((sum, d) => sum + d.initialBalance, 0);

    // 2. Prepare empty buckets for all days in selectedMonth
    const dailyMoves: Record<number, DayMovement[]> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyMoves[d] = [];
    }

    // 3. Harvest Standard ordinary cashflows
    transactions.forEach(t => {
      if (t.month === selectedMonth) {
        // extract day
        const parts = t.date.split('-');
        if (parts.length === 3) {
          const dVal = parseInt(parts[2], 10);
          if (dVal >= 1 && dVal <= daysInMonth) {
            // Is it a cash outflow or inflow?
            if (t.type === 'income') {
              let categoryColor = '#10B981';
              let categoryName = 'Ingreso';
              const cat = categories.find(c => c.id === t.category);
              if (cat) {
                categoryColor = cat.color;
                categoryName = cat.name;
              }
              const accountName = debitCards.find(d => d.id === t.cardId)?.name || 'Cuenta General';

              dailyMoves[dVal].push({
                id: t.id,
                type: 'income',
                description: t.description,
                amount: t.amount,
                categoryColor,
                categoryName,
                paymentMethod: t.paymentMethod,
                accountName
              });
            } else if (t.type === 'expense' && (t.paymentMethod === 'cash' || t.paymentMethod === 'debit' || t.paymentMethod === 'transfer')) {
              // Avoid duplicate: skip loan installments since they are projected separately below
              if (t.installmentId) {
                const inst = installments.find(i => i.id === t.installmentId);
                if (inst && inst.type === 'loan') {
                  return;
                }
              }

              let categoryColor = '#F43F5E';
              let categoryName = 'Gasto';
              const cat = categories.find(c => c.id === t.category);
              if (cat) {
                categoryColor = cat.color;
                categoryName = cat.name;
              }
              const accountName = debitCards.find(d => d.id === t.cardId)?.name || 'Cuenta General';

              dailyMoves[dVal].push({
                id: t.id,
                type: 'expense',
                description: t.description,
                amount: t.amount,
                categoryColor,
                categoryName,
                paymentMethod: t.paymentMethod,
                accountName
              });
            }
          }
        }
      }
    });

    // 4. Harvest Loan Installments due inside this month
    const activeLoansList = installments.filter(inst => inst.type === 'loan');
    activeLoansList.forEach(inst => {
      const projected = getProjectedInstallments(inst);
      projected.forEach(proj => {
        if (proj.chargeMonth === selectedMonth) {
          const parts = proj.chargeDate.split('-');
          if (parts.length === 3) {
            const dVal = parseInt(parts[2], 10);
            if (dVal >= 1 && dVal <= daysInMonth) {
              dailyMoves[dVal].push({
                id: `loan-move-${inst.id}-${proj.installmentIndex}`,
                type: 'loan',
                description: `${inst.description} (Cuota ${proj.installmentIndex}/${inst.installments})`,
                amount: proj.monthlyAmount,
                categoryColor: '#F43F5E',
                categoryName: 'Cuotas / Préstamos',
                paymentMethod: 'debit',
                accountName: 'Cuenta de Débito Principal'
              });
            }
          }
        }
      });
    });

    // 5. Harvest Credit Card statements due in this Month (statement closed in previous month)
    let prevYr = year;
    let prevM = monthIdx - 1;
    if (prevM === 0) {
      prevM = 12;
      prevYr -= 1;
    }
    const prevMonthStr = `${prevYr}-${String(prevM).padStart(2, '0')}`;
    const prevStatements = computeCardStatementsForMonth(creditCards, transactions, installments, prevMonthStr, paidCardStatements);
    
    prevStatements.forEach(stmt => {
      if (stmt.billingBalance > 0) {
        const parts = stmt.paymentDueDateStr.split('-');
        let dVal = parts.length === 3 ? parseInt(parts[2], 10) : NaN;
        if (isNaN(dVal) || dVal < 1 || dVal > daysInMonth) {
          // fallback to card regular dueDay
          const card = creditCards.find(c => c.id === stmt.cardId);
          dVal = card ? card.dueDay : 5;
        }

        if (dVal >= 1 && dVal <= daysInMonth) {
          dailyMoves[dVal].push({
            id: `cc-stmt-move-${stmt.cardId}`,
            type: 'credit_card',
            description: `Pago de Tarjeta: Estado de cuenta ${stmt.cardName} (${prevMonthStr})`,
            amount: stmt.billingBalance,
            categoryColor: '#4F46E5', // CC blue
            categoryName: 'Pago Tarjeta Crédito',
            paymentMethod: 'transfer',
            accountName: 'Cuenta de Débito Principal'
          });
        }
      }
    });

    // 6. IF SIMULATOR IS ACTIVE, inject the proposed prospective charge
    const parsedSimAmt = parseFloat(simAmount) || 0;
    const parsedSimDay = parseInt(simDay, 10);
    if (useSimulator && parsedSimAmt > 0 && parsedSimDay >= 1 && parsedSimDay <= daysInMonth) {
      if (simPaymentMethod === 'cash') {
        // Cash payment directly depletes the selected simulated day
        dailyMoves[parsedSimDay].push({
          id: 'simulated-cash-charge',
          type: 'expense',
          description: `⚠️ [SIMULADO] ${simDescription}`,
          amount: parsedSimAmt,
          categoryColor: '#D97706', // Alert amber
          categoryName: 'Simulación Efectivo/Débito',
          paymentMethod: 'cash',
          accountName: 'Caja de Simulación'
        });
      } else {
        // Credit card simulation doesn't deplete cash this month! Explain it in recommendations.
        // We can optionally add it as an informational tag on that day's timeline.
        dailyMoves[parsedSimDay].push({
          id: 'simulated-credit-charge',
          type: 'credit_card',
          description: `✨ [SIMULADO-CRÉDITO] ${simDescription}`,
          amount: parsedSimAmt,
          categoryColor: '#6366F1', // Credit Indigo
          categoryName: 'Simulación Tarjeta (Diferido al prox. mes)',
          paymentMethod: 'credit',
          accountName: 'Línea de Crédito Simulada'
        });
      }
    }

    // 7. Loop to generate day by day rolling balances
    let runningBalance = initialCashBalance;
    const list: DayData[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      const moves = dailyMoves[d] || [];

      // Split incomes and expenses
      const dailyIncomes = moves.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
      
      // Expenses are daily movements that are cashflows (skip simulated credit which doesn't deplete cash)
      const dailyExpenses = moves
        .filter(m => m.type !== 'income' && !(m.id === 'simulated-credit-charge'))
        .reduce((sum, m) => sum + m.amount, 0);

      const balanceBefore = runningBalance;
      const balanceAfter = runningBalance + dailyIncomes - dailyExpenses;

      list.push({
        day: d,
        dateStr,
        incomes: dailyIncomes,
        expenses: dailyExpenses,
        balanceBefore,
        balanceAfter,
        movements: moves
      });

      // Roll balance forward
      runningBalance = balanceAfter;
    }

    return {
      timeline: list,
      initialCashBalance,
      finalCashBalance: runningBalance
    };
  }, [
    debitCards, transactions, creditCards, installments, categories, 
    selectedMonth, initialBalancesOverrides, useSimulator, simDescription, 
    simAmount, simDay, simPaymentMethod, daysInMonth
  ]);

  const { timeline, initialCashBalance, finalCashBalance } = dailyTimeline;

  // Compute metrics for the Month's Timeline
  const metrics = useMemo(() => {
    let minBal = Infinity;
    let minDay = 1;
    let maxBal = -Infinity;
    let maxDay = 1;
    let totalIncomesSum = 0;
    let totalExpensesSum = 0;
    let sumBalances = 0;

    timeline.forEach(item => {
      totalIncomesSum += item.incomes;
      totalExpensesSum += item.expenses;
      sumBalances += item.balanceAfter;

      if (item.balanceAfter < minBal) {
        minBal = item.balanceAfter;
        minDay = item.day;
      }
      if (item.balanceAfter > maxBal) {
        maxBal = item.balanceAfter;
        maxDay = item.day;
      }
    });

    return {
      minBalance: minBal === Infinity ? 0 : minBal,
      minDay,
      maxBalance: maxBal === -Infinity ? 0 : maxBal,
      maxDay,
      averageBalance: timeline.length > 0 ? sumBalances / timeline.length : 0,
      totalIncomesSum,
      totalExpensesSum
    };
  }, [timeline]);

  // Generate nice chart data
  const chartData = useMemo(() => {
    return timeline.map(item => ({
      name: `Día ${item.day}`,
      Saldo: Math.round(item.balanceAfter),
      Ingreso: Math.round(item.incomes),
      Egreso: Math.round(item.expenses)
    }));
  }, [timeline]);

  // Handle selected day modal detail content
  const selectedDayData = selectedDay ? timeline.find(item => item.day === selectedDay) : null;

  // Custom simulator recommendation text
  const simulatorRecommendation = useMemo(() => {
    if (!useSimulator) return null;
    const amt = parseFloat(simAmount) || 0;
    const dayN = parseInt(simDay, 10);
    if (amt <= 0 || isNaN(dayN) || dayN < 1 || dayN > daysInMonth) return null;

    // Check what happens around that day
    const dayStats = timeline.find(it => it.day === dayN);
    if (!dayStats) return null;

    if (simPaymentMethod === 'cash') {
      const balanceWithProposed = dayStats.balanceAfter; // already calculated because it is injected
      if (balanceWithProposed < 0) {
        return {
          status: 'CRITICAL',
          message: `🚨 ¡ALERTA DE LIQUIDEZ! Si pagas $${amt.toLocaleString()} con EFECTIVO o DÉBITO el día ${dayN}, tu saldo caerá a un saldo NEGATIVO de $${balanceWithProposed.toLocaleString()}. Te recomendamos fuertemente realizar esta transacción usando una compra a plazos con Crédito o diferirla.`,
          suggestion: 'Cambia el simulador a "Tarjeta de Crédito" para ver cómo protege tu saldo de caja inmediato.'
        };
      } else if (balanceWithProposed < 150) {
        return {
          status: 'WARNING',
          message: `⚠️ SALDO AJUSTADO. Tu saldo el día ${dayN} será de sólo $${balanceWithProposed.toLocaleString()} si pagas con efectivo. Es muy arriesgado porque estarías al límite ante cualquier imprevisto financiero.`,
          suggestion: 'Se sugiere pagar con Tarjeta de Crédito para prorrogar el desembolso real al siguiente mes.'
        };
      } else {
        return {
          status: 'OK',
          message: `✅ CAPACIDAD CORRECTA. Tu cuenta tiene suficiente liquidez en efectivo ($${balanceWithProposed.toLocaleString()}) para absorber esta compra el día ${dayN} sin poner en riesgo tu flujo de caja general.`,
          suggestion: 'Es seguro pagar con tu cuenta de ahorros o efectivo.'
        };
      }
    } else {
      // credit simulated
      const originalDay = timeline.find(it => it.day === dayN);
      // find balance without simulator as cash
      const currentCashBalanceOnThatDay = originalDay ? originalDay.balanceAfter : 0;
      
      return {
        status: 'INFO',
        message: `✨ PLANIFICACIÓN INTELIGENTE. Al pagar $${amt.toLocaleString()} con CRÉDITO, tu saldo de efectivo se mantiene intacto en $${currentCashBalanceOnThatDay.toLocaleString()} para el día ${dayN}. Esta compra se facturará en tu tarjeta y el pago se consolidará en el siguiente mes de corte (pago diferido).`,
        suggestion: 'Hacerlo así te permite ejecutar la transacción hoy sin quedarte ilíquido en cuentas de efectivo.'
      };
    }
  }, [useSimulator, simAmount, simDay, simPaymentMethod, timeline, daysInMonth]);

  return (
    <div className="space-y-6" id="daily-balance-module">
      {/* Intro Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Calendar className="w-5.3 h-5.3" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">
                Saldo Diario Proyectado y Planificador de Liquidez
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Este módulo proyecta el **saldo consolidado de tus cuentas día por día** para <strong className="text-slate-850 font-semibold">{monthNameEs} {year}</strong>. Integra de forma dinámica tus saldos iniciales, ingresos ordinarios, compras recurrentes, cuotas de préstamos vigentes y los vencimientos reales de tus Tarjetas de Crédito.
            </p>
          </div>
          <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap self-stretch md:self-auto justify-center">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span>Periodo: {monthNameEs}</span>
          </div>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Initial Balance */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400 block">Saldo Apertura</span>
            <span className="text-xl font-bold text-slate-900 block font-mono">${initialCashBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            <span className="text-[9.5px] text-slate-500 block">Efectivo consolidado el día 1</span>
          </div>
          <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Final Balance */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400 block">Saldo Cierre Proyectado</span>
            <span className={`text-xl font-bold block font-mono ${finalCashBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
              ${finalCashBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
            <span className="text-[9.5px] text-slate-500 block">Disponibilidad final de caja</span>
          </div>
          <div className={`p-2.5 rounded-lg ${finalCashBalance >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: Minimum Liquidity Day */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400 block">Punto de Menor Liquidez</span>
            <span className={`text-xl font-bold block font-mono ${metrics.minBalance >= 150 ? 'text-emerald-600' : metrics.minBalance >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
              Día {metrics.minDay} (${Math.round(metrics.minBalance).toLocaleString()})
            </span>
            <span className="text-[9.5px] text-slate-500 block">
              {metrics.minBalance < 0 ? '⚠️ Alerta de saldo negativo presente!' : 'Punto crítico de saldo en el mes'}
            </span>
          </div>
          <div className={`p-2.5 rounded-lg ${metrics.minBalance < 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-amber-50 text-amber-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 4: Average Balance */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400 block">Saldo Promedio Diario</span>
            <span className="text-xl font-bold text-slate-900 block font-mono">${Math.round(metrics.averageBalance).toLocaleString()}</span>
            <span className="text-[9.5px] text-slate-500 block">Reserva promedio mensual</span>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Sparkle className="w-5 h-5 text-indigo-500" />
          </div>
        </div>
      </div>

      {/* Interactive Daily Simulator - The ultimate answer to Day 15 credit/cash split decisions */}
      <div className="bg-gradient-to-tr from-slate-900 to-indigo-950 text-white rounded-xl p-5 border border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-indigo-900 mb-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Simulador de Decisiones Financieras en Efectivo vs Crédito</span>
            </h3>
            <p className="text-[10px] text-slate-300">Prueba cómo un desembolso en un día específico altera el balance líquido ordinario del mes.</p>
          </div>
          <button
            type="button"
            onClick={() => setUseSimulator(!useSimulator)}
            className={`px-3 py-1 rounded text-[11px] font-bold transition-all cursor-pointer border ${useSimulator ? 'bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white' : 'bg-slate-800 border-indigo-900/60 hover:bg-slate-700 text-slate-205 text-slate-200'}`}
          >
            {useSimulator ? '🟢 SIMULADOR ACTIVO' : '⚫ ACTIVAR SIMULADOR'}
          </button>
        </div>

        {useSimulator && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-indigo-900/45 text-slate-700">
              <div className="space-y-1">
                <label className="text-[10.5px] font-bold text-slate-300">Descripción de Compra</label>
                <input 
                  type="text"
                  value={simDescription}
                  onChange={(e) => setSimDescription(e.target.value)}
                  placeholder="Ej. Comprar Laptop"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-250 rounded text-slate-800 font-semibold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-300">Monto ($ USD)</label>
                  <input 
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    placeholder="Ej. 300"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-250 rounded text-slate-800 font-mono font-bold focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-300">Día de Compra</label>
                  <input 
                    type="number"
                    min="1"
                    max={daysInMonth}
                    value={simDay}
                    onChange={(e) => setSimDay(e.target.value)}
                    placeholder="15"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-250 rounded text-slate-800 font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] font-bold text-slate-300">Método de Pago Alternativo</label>
                <div className="grid grid-cols-2 gap-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setSimPaymentMethod('cash')}
                    className={`p-1.5 rounded font-extrabold text-[10px] tracking-wide text-center uppercase cursor-pointer border ${simPaymentMethod === 'cash' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-850 hover:bg-slate-750 text-slate-300 border-transparent'}`}
                  >
                    🏦 EFECTIVO / DÉBITO
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimPaymentMethod('credit')}
                    className={`p-1.5 rounded font-extrabold text-[10px] tracking-wide text-center uppercase cursor-pointer border ${simPaymentMethod === 'credit' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-850 hover:bg-slate-750 text-slate-300 border-transparent'}`}
                  >
                    💳 TARJETA DE CRÉDITO
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <div className="text-[10px] text-slate-300 font-medium bg-slate-900 border border-indigo-900/60 p-2.5 rounded-lg w-full">
                  Prueba cambiar el método o adelantar el día de compra para mitigar puntos críticos de iliquidez ordinaria de este mes.
                </div>
              </div>
            </div>

            {/* Simulated feedback banner */}
            {simulatorRecommendation && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs leading-relaxed ${
                  simulatorRecommendation.status === 'CRITICAL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 
                  simulatorRecommendation.status === 'WARNING' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 
                  simulatorRecommendation.status === 'OK' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                  'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                }`}
              >
                <div className="space-y-1 flex-1">
                  <p className="font-semibold">{simulatorRecommendation.message}</p>
                  <p className="text-[11px] text-zinc-300">{simulatorRecommendation.suggestion}</p>
                </div>
                <div className="shrink-0 flex items-center">
                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    simulatorRecommendation.status === 'CRITICAL' ? 'bg-rose-600 text-white animate-pulse' : 
                    simulatorRecommendation.status === 'WARNING' ? 'bg-amber-500 text-slate-905 text-slate-950' : 
                    simulatorRecommendation.status === 'OK' ? 'bg-emerald-600 text-white' :
                    'bg-indigo-600 text-indigo-100'
                  }`}>
                    {simulatorRecommendation.status}
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Chart Block */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <span>Curva de Liquidez acumulada en Efectivo de {monthNameEs}</span>
        </h3>
        <p className="text-[11px] text-slate-450 mb-4">La línea representa el saldo proyectado al final de cada día. Puedes identificar fácilmente bajones drásticos o picos de saldo según tus días de pago.</p>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradient-balance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#E2E8F0" />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} stroke="#E2E8F0" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', color: '#FFF', fontSize: '11px', border: 'none' }}
                labelStyle={{ fontWeight: 'bold', color: '#93C5FD' }}
              />
              <Area type="monotone" dataKey="Saldo" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#gradient-balance)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day by Day Listing */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Calendario Diario de Consumo</h3>
            <p className="text-[11px] text-slate-450 mt-0.5">Haz clic sobre cualquier día específico para ver su desglose interactivo de transacciones, cuotas de préstamos y vencimientos de tarjetas.</p>
          </div>
          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
            {daysInMonth} Días Calculados
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {timeline.map((item) => {
            const hasMovements = item.movements.length > 0;
            const isNegative = item.balanceAfter < 0;
            const isTight = item.balanceAfter > 0 && item.balanceAfter < 150;
            const isDaySelected = selectedDay === item.day;

            return (
              <div key={item.day} className={`transition-all duration-150`}>
                <div 
                  onClick={() => setSelectedDay(isDaySelected ? null : item.day)}
                  className={`p-3.5 px-4 flex items-center justify-between cursor-pointer group hover:bg-slate-50/70 transition-colors ${isDaySelected ? 'bg-indigo-50/30 font-medium' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center font-mono w-10">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold leading-none">DÍA</span>
                      <span className="text-base font-extrabold text-slate-800">{String(item.day).padStart(2, '0')}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 items-center">
                      {item.incomes > 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
                          <ArrowUpRight className="w-3 h-3" />
                          +${Math.round(item.incomes).toLocaleString()}
                        </span>
                      )}
                      {item.expenses > 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded text-[10px] font-bold">
                          <ArrowDownRight className="w-3 h-3" />
                          -${Math.round(item.expenses).toLocaleString()}
                        </span>
                      )}
                      
                      {/* Subscriptions or virtual items hints */}
                      {hasMovements && (
                        <span className="text-[10px] text-slate-450 hidden sm:inline-block font-normal">
                          ({item.movements.length} {item.movements.length === 1 ? 'movimiento' : 'movimientos'})
                        </span>
                      )}

                      {!hasMovements && (
                        <span className="text-[10px] text-slate-350 italic font-mono font-normal">Sin movimientos directos</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Running cumulative balance */}
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase leading-none">SALDO AL CIERRE</span>
                      <span className={`text-sm font-bold font-mono ${isNegative ? 'text-rose-600 font-extrabold' : isTight ? 'text-amber-600' : 'text-slate-800'}`}>
                        ${Math.round(item.balanceAfter).toLocaleString()}
                      </span>
                    </div>

                    {/* Status Dot */}
                    <div className="flex items-center gap-1.5">
                      {isNegative ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" title="Saldo negativo - Requiere atención!" />
                      ) : isTight ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" title="Saldo ajustado - Liquidez baja" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Saldo saludable" />
                      )}

                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDaySelected ? 'rotate-180 text-slate-700' : 'group-hover:text-slate-650'}`} />
                    </div>
                  </div>
                </div>

                {/* Expanded active day details */}
                <AnimatePresence>
                  {isDaySelected && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden bg-slate-50 border-t border-slate-100"
                    >
                      <div className="p-4 px-6 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                          <span className="text-[10.5px] uppercase font-bold text-slate-500 tracking-wide">
                            Desglose Detallado del Día {item.day} de {monthNameEs}
                          </span>
                          <span className="text-[10px] text-slate-450 font-medium">
                            Saldo inicial del día: <strong className="font-mono text-slate-700">${Math.round(item.balanceBefore).toLocaleString()}</strong>
                          </span>
                        </div>

                        {hasMovements ? (
                          <div className="space-y-2">
                            {item.movements.map((mov, mIdx) => (
                              <div key={`${mov.id}-${mIdx}`} className="bg-white p-3 rounded-lg border border-slate-200/60 shadow-xxs flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  {/* Movement indicator icon */}
                                  <div className="shrink-0">
                                    {mov.type === 'income' ? (
                                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                      </div>
                                    ) : mov.type === 'credit_card' ? (
                                      <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                                        <CreditCard className="w-3.5 h-3.5" />
                                      </div>
                                    ) : mov.type === 'loan' ? (
                                      <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                                        <Layers className="w-3.5 h-3.5" />
                                      </div>
                                    ) : (
                                      <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                                        <ArrowDownRight className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                      <span>{mov.description}</span>
                                      {mov.paymentMethod === 'credit' && (
                                        <span className="text-[8px] bg-indigo-650/10 text-indigo-700 px-1 rounded uppercase font-bold">A crédito</span>
                                      )}
                                    </h5>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-450">
                                      <span 
                                        className="h-2 w-2 rounded-full inline-block"
                                        style={{ backgroundColor: mov.categoryColor }}
                                      />
                                      <span>Categoría: <strong>{mov.categoryName}</strong></span>
                                      <span>&bull;</span>
                                      <span>Vía: <strong>{mov.accountName || 'Efectivo'}</strong></span>
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className={`font-mono text-xs font-bold ${mov.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                                    {mov.type === 'income' ? '+' : '-'}${mov.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-white rounded-lg border border-slate-200/40 text-[11px] text-slate-400 italic">
                            No hay movimientos ni gastos programados para esta fecha.
                          </div>
                        )}

                        {/* Interactive suggestion builder for the selected day */}
                        <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100/65 mt-2.5">
                          <h4 className="text-[11.5px] font-bold text-indigo-950 flex items-center gap-1">
                            <Sparkle className="w-3.5 h-3.5 text-indigo-650" />
                            <span>Diagnóstico Adaptativo de Liquidez</span>
                          </h4>
                          
                          <div className="mt-1.5 text-xs text-indigo-900 leading-normal space-y-1.5">
                            {isNegative ? (
                              <p className="font-semibold text-rose-800">
                                🚨 Alerta de sobregiro el Día {item.day}. Si requieres ejecutar compras adicionales hoy, te sugerimos cargarlas a una Tarjeta de Crédito en lugar de usar efectivo, o cambiar la fecha de este devengo.
                              </p>
                            ) : isTight ? (
                              <p className="font-semibold text-amber-800">
                                ⚠️ Reserva de efectivo muy baja el Día {item.day} con sólo ${Math.round(item.balanceAfter)}. Para aliviar presión de caja, considera prorrogar compras ordinarias hacia fin de mes o pagar con tu Tarjeta.
                              </p>
                            ) : (
                              <p className="font-medium text-slate-700">
                                ✅ Tu saldo proyectado es saludable. Dispones de liquidez suficiente para cubrir imprevistos. No obstante, si planificas compras extraordinarias mayores a ${Math.round(item.balanceAfter - 100)}, te conviene prorratearlas o pagarlas con crédito para no estresar el flujo.
                              </p>
                            )}

                            {/* Link helper */}
                            <div className="pt-2 flex justify-end gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSimulator(true);
                                  setSimDay(String(item.day));
                                  window.scrollTo({ top: 320, behavior: 'smooth' });
                                }}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-700 rounded text-[9.5px] font-bold transition-all shadow-xxs cursor-pointer"
                              >
                                🧪 Probar compra simulada el Día {item.day}
                              </button>
                            </div>
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
