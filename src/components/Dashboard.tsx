import React from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, PiggyBank, CreditCard, Wallet, 
  AlertCircle, ChevronRight, Briefcase, Sparkles, Home, Calendar, Info
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase } from '../types';
import { getProjectedInstallments, computeCardStatementsForMonth, computeMonthlyAccountBalances } from '../utils/financeUtils';

interface DashboardProps {
  state: AppState;
  onNavigate: (section: string) => void;
}

export default function Dashboard({ state, onNavigate }: DashboardProps) {
  const { transactions, creditCards, debitCards, installments, categories, selectedMonth } = state;

  const [viewType, setViewType] = React.useState<'monthly' | 'cumulative'>('monthly');

  const [year, month] = selectedMonth.split('-');
  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthLabel = `${monthNamesEs[parseInt(month, 10) - 1]} ${year}`;

  const selectedYearStr = year;
  const selectedMonthNum = parseInt(month, 10);
  
  // Calculate cumulative months from January up to selectedMonth for current year
  const cumulativeMonths: string[] = [];
  for (let mNum = 1; mNum <= selectedMonthNum; mNum++) {
    cumulativeMonths.push(`${selectedYearStr}-${String(mNum).padStart(2, '0')}`);
  }

  const activePeriodMonths = viewType === 'monthly' ? [selectedMonth] : cumulativeMonths;

  // 1. INCOMES for active period
  const monthlyIncomes = transactions
    .filter(t => activePeriodMonths.includes(t.month) && t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // 2. CASH OUTFLOWS (Direct Expenses paid with cash, debit, transfer in active period)
  const directExpenses = transactions
    .filter(t => {
      if (!activePeriodMonths.includes(t.month) || t.type !== 'expense' || t.paymentMethod === 'credit') {
        return false;
      }
      // Evitar doble conteo: si la transacción proviene de una cuota de préstamo, se calcula por separado en loanPayments
      if (t.installmentId) {
        const inst = installments.find(i => i.id === t.installmentId);
        if (inst && inst.type === 'loan') {
          return false;
        }
      }
      return true;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  // 3. LOANS paid strictly in active period
  const activeLoansList = installments.filter(inst => inst.type === 'loan');
  const loanPayments = activeLoansList
    .flatMap(inst => getProjectedInstallments(inst))
    .filter(proj => activePeriodMonths.includes(proj.chargeMonth))
    .reduce((sum, p) => sum + p.monthlyAmount, 0);

  // 4. CREDIT CARD PAYMENTS due in selection cycle month(s)
  let totalCardPaymentsDue = 0;
  const cardsDueBalances = creditCards.map(card => {
    let dueAmount = 0;
    let dueDatesList: string[] = [];

    activePeriodMonths.forEach(mStr => {
      const [mY, mMonth] = mStr.split('-');
      let prevYr = parseInt(mY, 10);
      let prevM = parseInt(mMonth, 10) - 1;
      if (prevM === 0) {
        prevM = 12;
        prevYr -= 1;
      }
      const prevMStr = `${prevYr}-${String(prevM).padStart(2, '0')}`;
      
      const prevStatement = computeCardStatementsForMonth(creditCards, transactions, installments, prevMStr)
        .find(s => s.cardId === card.id);
      
      if (prevStatement) {
        dueAmount += prevStatement.billingBalance;
        if (prevStatement.paymentDueDateStr) {
          dueDatesList.push(prevStatement.paymentDueDateStr);
        }
      }
    });

    totalCardPaymentsDue += dueAmount;

    return {
      cardName: card.name,
      dueAmount: Number(dueAmount.toFixed(2)),
      closingDate: '',
      dueDate: dueDatesList.length > 0 ? (viewType === 'monthly' ? dueDatesList[0] : `${dueDatesList.length} pagos`) : 'Sin pago'
    };
  });

  const totalOutflows = directExpenses + loanPayments + totalCardPaymentsDue;
  const netSavings = monthlyIncomes - totalOutflows;
  const savingsRate = monthlyIncomes > 0 ? (netSavings / monthlyIncomes) * 100 : 0;

  // New accurate calculations for "Gasto Mensual Proyectado" (Total Consumption)
  const totalProjectedExpenses = transactions
    .filter(t => activePeriodMonths.includes(t.month) && t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const projectedSavings = monthlyIncomes - totalProjectedExpenses;
  const projectedSavingsRate = monthlyIncomes > 0 ? (projectedSavings / monthlyIncomes) * 100 : 0;

  // Classification for breakdown lists
  const activeExpenses = transactions.filter(t => activePeriodMonths.includes(t.month) && t.type === 'expense');

  // Group 1: Vivienda / Alquiler
  const housingTxs = activeExpenses.filter(t => 
    t.category === 'cat-housing' || 
    t.description.toLowerCase().includes('alquiler') || 
    t.description.toLowerCase().includes('rent') ||
    t.description.toLowerCase().includes('flat')
  );
  const housingExpenses = housingTxs.reduce((sum, t) => sum + t.amount, 0);

  // Group 2: Suscripciones y servicios fijos (Netflix, gym etc.)
  const subTxs = activeExpenses.filter(t => 
    (t.category === 'cat-subscriptions' || !!t.subscriptionId || (t.isFixed && t.category !== 'cat-housing')) &&
    !(t.category === 'cat-housing' || t.description.toLowerCase().includes('alquiler') || t.description.toLowerCase().includes('rent') || t.description.toLowerCase().includes('flat')) &&
    !t.installmentId
  );
  const subscriptionExpenses = subTxs.reduce((sum, t) => sum + t.amount, 0);

  // Group 3: Préstamos y cuotas a plazos
  const installmentTxs = activeExpenses.filter(t => t.category === 'cat-installments' || !!t.installmentId);
  const installmentsExpenses = installmentTxs.reduce((sum, t) => sum + t.amount, 0);

  // Group 4: Variables y otros consumos ordinarios
  const otherTxs = activeExpenses.filter(t => 
    !housingTxs.includes(t) && 
    !subTxs.includes(t) && 
    !installmentTxs.includes(t)
  );
  const otherExpenses = otherTxs.reduce((sum, t) => sum + t.amount, 0);

  // Account flows for the selectedMonth balance rollover logic
  const accountFlows = computeMonthlyAccountBalances(debitCards, transactions, creditCards, installments, selectedMonth);

  // Pie chart expenses split by Category
  const categorySplitMap: { [key: string]: { name: string; value: number; color: string } } = {};

  // Direct expenses categorization
  transactions
    .filter(t => activePeriodMonths.includes(t.month) && t.type === 'expense' && t.paymentMethod !== 'credit')
    .forEach(t => {
      const catObj = categories.find(c => c.id === t.category);
      const catName = catObj ? catObj.name : 'Otros';
      const catColor = catObj ? catObj.color : '#6B7280';
      if (!categorySplitMap[t.category]) {
        categorySplitMap[t.category] = { name: catName, value: 0, color: catColor };
      }
      categorySplitMap[t.category].value += t.amount;
    });

  // Adding Loans of this period to category breakdown
  if (loanPayments > 0) {
    const loanCatId = 'cat-housing';
    const catObj = categories.find(c => c.id === loanCatId);
    const catName = 'Préstamos / Préstamos Auto';
    const catColor = catObj ? catObj.color : '#3B82F6';
    if (!categorySplitMap[loanCatId]) {
      categorySplitMap[loanCatId] = { name: catName, value: 0, color: catColor };
    }
    categorySplitMap[loanCatId].value += loanPayments;
  }

  // Adding Credit card payments
  if (totalCardPaymentsDue > 0) {
    const tdcCatId = 'cat-credit-card-payment';
    const catName = 'Pago Tarjetas de Crédito (TDC)';
    const catColor = '#6366F1';
    if (!categorySplitMap[tdcCatId]) {
      categorySplitMap[tdcCatId] = { name: catName, value: 0, color: catColor };
    }
    categorySplitMap[tdcCatId].value += totalCardPaymentsDue;
  }

  const pieData = Object.values(categorySplitMap).filter(item => item.value > 0);

  // 12-Month Cashflow Graph Preparation
  const cashflowTrendData = [];
  const currentMonthNum = parseInt(month, 10);
  const currentYearNum = parseInt(year, 10);

  for (let j = -5; j <= 1; j++) {
    let trendMonthNum = currentMonthNum + j;
    let trendYearNum = currentYearNum;

    if (trendMonthNum <= 0) {
      trendMonthNum += 12;
      trendYearNum -= 1;
    } else if (trendMonthNum > 12) {
      trendMonthNum -= 12;
      trendYearNum += 1;
    }

    const tMonthStr = `${trendYearNum}-${String(trendMonthNum).padStart(2, '0')}`;
    
    const incVal = transactions
      .filter(t => t.month === tMonthStr && t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const dirExp = transactions
      .filter(t => t.month === tMonthStr && t.type === 'expense' && t.paymentMethod !== 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const loanP = installments
      .filter(inst => inst.type === 'loan')
      .flatMap(inst => getProjectedInstallments(inst))
      .filter(p => p.chargeMonth === tMonthStr)
      .reduce((sum, p) => sum + p.monthlyAmount, 0);

    let tcBillingMonthNum = trendMonthNum - 1;
    let tcBillingYearNum = trendYearNum;
    if (tcBillingMonthNum === 0) {
      tcBillingMonthNum = 12;
      tcBillingYearNum -= 1;
    }
    const tcBillingMonthStr = `${tcBillingYearNum}-${String(tcBillingMonthNum).padStart(2, '0')}`;
    
    let ccPay = 0;
    creditCards.forEach(card => {
      const statement = computeCardStatementsForMonth(creditCards, transactions, installments, tcBillingMonthStr)
        .find(s => s.cardId === card.id);
      if (statement) {
        ccPay += statement.billingBalance;
      }
    });

    const totExpVal = dirExp + loanP + ccPay;
    const mNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    cashflowTrendData.push({
      name: `${mNamesShort[trendMonthNum - 1]} ${trendYearNum}`,
      Ingresos: incVal,
      Egresos: totExpVal,
      Neto: incVal - totExpVal
    });
  }

  const totalCreditLimit = creditCards.reduce((sum, c) => sum + c.limit, 0);
  
  // Outstanding billing balances closing in active period
  let pendingClosingCharges = 0;
  activePeriodMonths.forEach(mStr => {
    const tdcStatements = computeCardStatementsForMonth(creditCards, transactions, installments, mStr);
    tdcStatements.forEach(st => {
      pendingClosingCharges += st.billingBalance;
    });
  });

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">financial planner MZ</h1>
          <p className="text-sm text-slate-500">
            Panel Ejecutivo de Control - Período: <strong className="text-slate-700">{monthLabel}</strong>
            {viewType === 'cumulative' && <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">VISTA ACUMULADA ANUAL</span>}
          </p>
        </div>

        {/* View Selection Toggle */}
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200/60 flex items-center gap-1 self-start sm:self-auto shadow-2xs">
          <button
            onClick={() => setViewType('monthly')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              viewType === 'monthly'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Vista Mensual
          </button>
          <button
            onClick={() => setViewType('cumulative')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              viewType === 'cumulative'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Acumulado Anual
          </button>
        </div>

        <div className="mt-3 sm:mt-0 flex gap-2">
          <button 
            onClick={() => onNavigate('presupuesto')}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
            id="dash-quick-nav-budget"
          >
            <Wallet className="w-3.5 h-3.5" />
            Presupuesto
          </button>
          <button 
            onClick={() => onNavigate('calendario')}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
            id="dash-quick-nav-cal"
          >
            <Wallet className="w-3.5 h-3.5" />
            Ver Calendario de Pagos
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Incomes */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-incomes">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Ingresos Planificados</span>
            <div className="text-2xl font-bold text-emerald-600">${monthlyIncomes.toLocaleString()}</div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Sueldos y otros ingresos fijos
            </p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Gasto Mensual Proyectado */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-projected-expenses">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Gasto Proyectado (Total)</span>
            <div className="text-2xl font-bold text-indigo-600">${totalProjectedExpenses.toLocaleString()}</div>
            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1" title="Suma compromisos incurridos o fijos de este mes">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              Compromisos, fijos y variables
            </p>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-650 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Cash Outflows (Real Expenses Paid) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-expenses">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Egresos Reales (Flujo)</span>
            <div className="text-2xl font-bold text-rose-600">${totalOutflows.toLocaleString()}</div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              Directos + Cuota Préstamo + TDC
            </p>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Savings */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-savings">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Ahorro Proyectado</span>
            <div className={`text-2xl font-bold ${projectedSavings >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
              ${projectedSavings.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <PiggyBank className="w-3 h-3 text-blue-500" />
              Tasa de ahorro: <span className="font-bold text-blue-600">{projectedSavingsRate.toFixed(1)}%</span>
            </div>
          </div>
          <div className={`p-2.5 rounded-lg ${projectedSavings >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            <PiggyBank className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Estructura y Consumo del Gasto Proyectado */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs" id="dash-projected-structure">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>Estructura y Consumo del Gasto Proyectado ({monthLabel})</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">Visualización detallada de tus compromisos fijos (Alquiler, suscripciones) y variables en el mes.</p>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/50 text-[10px] text-slate-500 gap-2 font-semibold">
            <span>Fijos/Servicios: <strong className="text-indigo-600">${(subscriptionExpenses + housingExpenses).toLocaleString()}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Cuotas/Préstamos: <strong className="text-rose-600">${installmentsExpenses.toLocaleString()}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Grupo 1: Alquiler / Vivienda */}
          <div className="bg-slate-50/60 p-4 border border-slate-100/60 rounded-xl hover:bg-slate-100/20 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                  <Home className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">1. Vivienda y Alquiler</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">Tus costos de vivienda habitual, alquiler mensual y residenciales.</p>
              
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {housingTxs.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic block">Sin gastos este mes</span>
                ) : (
                  housingTxs.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-650 truncate max-w-[110px]" title={t.description}>{t.description}</span>
                      <span className="font-bold text-slate-800">${t.amount.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="mt-4 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="text-slate-450 font-bold">Total Vivienda:</span>
              <span className="font-bold text-blue-600">${housingExpenses.toLocaleString()}</span>
            </div>
          </div>

          {/* Grupo 2: Suscripciones y planes recurrentes */}
          <div className="bg-slate-50/60 p-4 border border-slate-100/60 rounded-xl hover:bg-slate-100/20 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">2. Suscripciones y Fijos</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">Servicios fijos, membresías y planes recurrentes mensuales.</p>
              
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {subTxs.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic block">Sin planes en vigencia</span>
                ) : (
                  subTxs.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-650 truncate max-w-[110px]" title={t.description}>{t.description}</span>
                      <span className="font-bold text-slate-800">${t.amount.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="mt-4 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="text-slate-450 font-bold">Total Fijos:</span>
              <span className="font-bold text-indigo-600">${subscriptionExpenses.toLocaleString()}</span>
            </div>
          </div>

          {/* Grupo 3: Préstamos y plazos / cuotas */}
          <div className="bg-slate-50/60 p-4 border border-slate-100/60 rounded-xl hover:bg-slate-100/20 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1.5 bg-rose-50 text-rose-600 rounded">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">3. Préstamos y Cuotas</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">Compromisos de préstamos personales, hipotecas y plazos de TDC.</p>
              
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {installmentTxs.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic block">Sin cuotas planificadas</span>
                ) : (
                  installmentTxs.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-650 truncate max-w-[110px]" title={t.description}>{t.description}</span>
                      <span className="font-bold text-slate-800">${t.amount.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="mt-4 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="text-slate-450 font-bold">Total Cuotas:</span>
              <span className="font-bold text-rose-600">${installmentsExpenses.toLocaleString()}</span>
            </div>
          </div>

          {/* Grupo 4: Consumo Variable */}
          <div className="bg-slate-50/60 p-4 border border-slate-100/60 rounded-xl hover:bg-slate-100/20 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1.5 bg-slate-100 text-slate-600 rounded">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-650 uppercase tracking-wider block">4. Gastos Variables</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">Alimentación, transporte, ocio, cuidado personal y consumos casuales.</p>
              
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {otherTxs.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic block">Sin gastos registrados</span>
                ) : (
                  otherTxs.slice(0, 5).map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-650 truncate max-w-[110px]" title={t.description}>{t.description}</span>
                      <span className="font-bold text-slate-800">${t.amount.toLocaleString()}</span>
                    </div>
                  ))
                )}
                {otherTxs.length > 5 && (
                  <div className="text-[9px] text-slate-400 italic text-right">+ {otherTxs.length - 5} gastos variables</div>
                )}
              </div>
            </div>
            
            <div className="mt-4 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="text-slate-450 font-bold">Total Variable:</span>
              <span className="font-bold text-slate-650">${otherExpenses.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 tracking-tight flex items-center gap-2">
            <span>Flujos de Efectivo: Historial y Proyección</span>
            <span className="text-xs font-normal text-slate-400">(6 Meses)</span>
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cashflowTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} stroke="#94A3B8" />
                <YAxis fontSize={11} tickLine={false} stroke="#94A3B8" axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#1E293B', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#38BDF8' }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                <Bar dataKey="Egresos" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses pie chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-4 tracking-tight">Distribución de Gastos</h2>
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 text-slate-300" />
                <span className="text-xs">No hay gastos en este mes</span>
              </div>
            ) : (
              <div className="h-52 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`$${value}`, 'Gasto']}
                      contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-semibold text-slate-800">${totalOutflows.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Gasto Real</span>
                </div>
              </div>
            )}
          </div>

          <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 mt-2">
            {pieData.map((item, index) => {
              const pct = totalOutflows > 0 ? (item.value / totalOutflows) * 100 : 0;
              return (
                <div key={index} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span 
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.color }} 
                    />
                    <span className="truncate text-slate-600 font-medium">{item.name}</span>
                  </div>
                  <div className="text-slate-500 font-semibold flex-shrink-0">
                    ${item.value.toLocaleString()} <span className="font-normal text-slate-400 text-[10px]">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Credit cards & accounts state check row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Credit Cards statements paying this month info */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 tracking-tight flex items-center justify-between">
              <span>Pagos de Tarjeta Requeridos</span>
              <button 
                onClick={() => onNavigate('estado-cuenta')} 
                className="text-xs font-normal text-slate-500 hover:text-slate-800 flex items-center gap-0.5 whitespace-nowrap"
                id="dash-link-tdc"
              >
                Cortes de Cuenta <ChevronRight className="w-3 h-3" />
              </button>
            </h2>
            <p className="text-xs text-slate-400 mb-4 py-1.5 px-3 bg-blue-50/50 rounded-lg text-blue-800">
              Corresponden a los consumos cargados del ciclo de facturación anterior.
            </p>
            
            <div className="space-y-3">
              {cardsDueBalances.map((card, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100/50 transition-colors">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700">{card.cardName}</h3>
                    <div className="text-[10px] text-slate-400">
                      Vencía el: <strong className="text-slate-500">{card.dueDate || 'N/D'}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-700">${card.dueAmount.toLocaleString()}</div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${card.dueAmount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {card.dueAmount > 0 ? 'Por Pagar' : 'Sin cargos'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Deuda total programada a pagar este mes:</span>
            <span className="font-semibold text-slate-800">${totalCardPaymentsDue.toLocaleString()}</span>
          </div>
        </div>

        {/* Bank accounts/Debit cards balances info with dynamic rollover */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col justify-between" id="dash-rollover-accounts">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 tracking-tight flex items-center justify-between">
              <span>Saldos y Proyección de Cuentas</span>
              <button 
                onClick={() => onNavigate('cuentas')} 
                className="text-xs font-normal text-slate-500 hover:text-slate-800 flex items-center gap-0.5 whitespace-nowrap"
                id="dash-link-accounts"
              >
                Configurar Cuentas <ChevronRight className="w-3 h-3" />
              </button>
            </h2>
            <p className="text-xs text-slate-400 mb-4 py-1.5 px-3 bg-emerald-50/50 rounded-lg text-emerald-800">
              Muestra el Saldo Inicial, variaciones en el mes y el Saldo Final proyectado.
            </p>

            <div className="space-y-3">
              {debitCards.map((bank, i) => {
                const flow = accountFlows[bank.id] || { initialBalance: bank.balance, finalBalance: bank.balance, incomes: 0, expenses: 0 };
                const netVariance = flow.incomes - flow.expenses;
                return (
                  <div key={i} className="p-3 bg-slate-50 border border-slate-100/60 rounded-xl hover:bg-slate-150/20 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-emerald-100/30 rounded-md text-emerald-600">
                          <Wallet className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">{bank.name}</h4>
                          <span className="text-[9px] text-slate-400 font-medium">Débito / Disponible</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block uppercase font-mono">Saldo Final</span>
                        <span className="text-sm font-bold text-emerald-600">${flow.finalBalance.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    {/* Rollover connection representation */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                      <div>
                        <span className="text-[9px] text-slate-400 block tracking-tight">Saldo Inicial:</span>
                        <span className="font-semibold text-slate-700">${flow.initialBalance.toLocaleString()}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block tracking-tight">Movimiento Neto:</span>
                        <span className={`font-semibold ${netVariance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {netVariance >= 0 ? '+' : ''}${netVariance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Disponibilidad Inicial Total ({monthNamesEs[parseInt(month, 10) - 1]}):</span>
              <span className="font-semibold text-slate-600">
                ${debitCards.reduce((sum, d) => sum + (accountFlows[d.id]?.initialBalance ?? d.balance), 0).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="font-semibold text-slate-700">Disponibilidad Final Proyectada:</span>
              <span className="font-bold text-emerald-600">
                ${debitCards.reduce((sum, d) => sum + (accountFlows[d.id]?.finalBalance ?? d.balance), 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
