import React from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, PiggyBank, CreditCard, Wallet, 
  AlertCircle, ChevronRight, Briefcase, Sparkles, Home, Calendar, Info, X, Eye,
  Coins, Pencil, Check, CheckCircle2, Percent, Edit2
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase, CreditCard as CardType } from '../types';
import { getProjectedInstallments, computeCardStatementsForMonth, computeMonthlyAccountBalances } from '../utils/financeUtils';

interface DashboardProps {
  state: AppState;
  onNavigate: (section: string) => void;
  onUpdateDebitCardInitialBalance?: (id: string, month: string, newInitialBalance: number) => void;
  onUpdateCreditCard?: (id: string, updated: Partial<CardType>) => void;
  onUpdatePaidCardStatement?: (key: string, record: any) => void;
}

export default function Dashboard({ state, onNavigate, onUpdateDebitCardInitialBalance, onUpdateCreditCard, onUpdatePaidCardStatement }: DashboardProps) {
  const { transactions, creditCards, debitCards, installments, categories, selectedMonth, paidCardStatements } = state;

  const [viewType, setViewType] = React.useState<'monthly' | 'cumulative'>('monthly');
  const [selectedKpi, setSelectedKpi] = React.useState<'incomes' | 'projected_expenses' | 'outflows' | 'savings' | null>(null);
  const [selectedCardDetail, setSelectedCardDetail] = React.useState<{ cardId: string; billingMonth: string; cardName: string } | null>(null);
  const [customClosingDay, setCustomClosingDay] = React.useState<string>('');
  const [customDueDay, setCustomDueDay] = React.useState<string>('');

  React.useEffect(() => {
    if (selectedCardDetail) {
      const card = creditCards.find(c => c.id === selectedCardDetail.cardId);
      if (card) {
        const override = card.overrides?.[selectedCardDetail.billingMonth];
        setCustomClosingDay(String(override?.closingDay ?? card.closingDay));
        setCustomDueDay(String(override?.dueDay ?? card.dueDay));
      }
    } else {
      setCustomClosingDay('');
      setCustomDueDay('');
    }
  }, [selectedCardDetail, creditCards]);

  const [selectedAuditAccount, setSelectedAuditAccount] = React.useState<any | null>(null);

  const [editingInitialCardId, setEditingInitialCardId] = React.useState<string | null>(null);
  const [editingInitialValue, setEditingInitialValue] = React.useState<string>('');

  const startEditing = (cardId: string, currentVal: number) => {
    setEditingInitialCardId(cardId);
    setEditingInitialValue(String(currentVal));
  };

  const saveEditing = (cardId: string) => {
    const val = parseFloat(editingInitialValue);
    if (!isNaN(val) && onUpdateDebitCardInitialBalance) {
      onUpdateDebitCardInitialBalance(cardId, selectedMonth, val);
    }
    setEditingInitialCardId(null);
  };

  const [year, month] = selectedMonth.split('-');
  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthLabel = `${monthNamesEs[parseInt(month, 10) - 1]} ${year}`;

  const getAccountTransactionsForMonth = (accountId: string) => {
    return transactions.filter(t => {
      if (t.month !== selectedMonth) return false;
      
      let cid = t.cardId;
      if (!cid) {
        if (t.paymentMethod === 'cash') {
          const cashAcc = debitCards.find(d => d.id === 'deb-cash-pocket' || d.name.toLowerCase().includes('efectivo') || d.name.toLowerCase().includes('cash'));
          if (cashAcc) cid = cashAcc.id;
        } else if (t.paymentMethod === 'debit' || t.paymentMethod === 'transfer') {
          const checkingAcc = debitCards.find(d => d.id !== 'deb-cash-pocket' && !d.name.toLowerCase().includes('efectivo'));
          if (checkingAcc) {
            cid = checkingAcc.id;
          } else if (debitCards.length > 0) {
            cid = debitCards[0].id;
          }
        }
      }
      
      if (cid !== accountId) return false;
      
      if (t.type === 'income') return true;
      return t.paymentMethod === 'debit' || t.paymentMethod === 'transfer' || t.paymentMethod === 'cash';
    });
  };

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
      
      const prevStatement = computeCardStatementsForMonth(creditCards, transactions, installments, prevMStr, paidCardStatements)
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
      cardId: card.id,
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

  const projectedSavings = monthlyIncomes - totalOutflows;
  const projectedSavingsRate = monthlyIncomes > 0 ? (projectedSavings / monthlyIncomes) * 100 : 0; // We keep rate aligned with the corrected formula

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
  const accountFlows = computeMonthlyAccountBalances(debitCards, transactions, creditCards, installments, selectedMonth, state.initialBalancesOverrides, paidCardStatements);

  const firstMonthOfPeriod = activePeriodMonths[0];
  const lastMonthOfPeriod = activePeriodMonths[activePeriodMonths.length - 1];

  const initialAccountFlows = computeMonthlyAccountBalances(debitCards, transactions, creditCards, installments, firstMonthOfPeriod, state.initialBalancesOverrides, paidCardStatements);
  const finalAccountFlows = computeMonthlyAccountBalances(debitCards, transactions, creditCards, installments, lastMonthOfPeriod, state.initialBalancesOverrides, paidCardStatements);

  const totalInitialCashBalance = debitCards.reduce((sum, d) => {
    const flow = initialAccountFlows[d.id];
    return sum + (flow ? flow.initialBalance : d.balance);
  }, 0);

  // En cumplimiento con tu instrucción, el efectivo final proyectado es la suma estricta y sin excepciones de:
  // Saldo Inicial + Ingresos Planificados - Egresos Reales de este período.
  const totalFinalCashBalance = totalInitialCashBalance + monthlyIncomes - totalOutflows;

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
      const statement = computeCardStatementsForMonth(creditCards, transactions, installments, tcBillingMonthStr, paidCardStatements)
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
    const tdcStatements = computeCardStatementsForMonth(creditCards, transactions, installments, mStr, paidCardStatements);
    tdcStatements.forEach(st => {
      pendingClosingCharges += st.billingBalance;
    });
  });

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Financial Planner MZ</h1>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* KPI: Saldo Efectivo Inicial */}
        <div 
          className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between hover:shadow-md hover:scale-[1.01] transition-all duration-200 group" 
          id="kpi-initial-cash"
          title="Saldo total en efectivo/débito al inicio de este mes"
        >
          <div className="space-y-1.5 min-w-0 w-full">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider group-hover:text-slate-500 transition-colors truncate">Efectivo Inicial</span>
            </div>
            <div className="text-2xl font-bold text-slate-600">${totalInitialCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            
            {/* Breakdown of what's being summed */}
            <div className="border-t border-slate-100 pt-1.5 mt-1 space-y-1.5 text-[10px] text-slate-400">
              {debitCards.map(d => {
                const flow = accountFlows[d.id];
                const bal = flow ? flow.initialBalance : d.balance;
                const isEditing = editingInitialCardId === d.id;
                return (
                  <div key={d.id} className="flex justify-between items-center gap-1 min-h-[18px]">
                    <span className="truncate text-slate-500 font-medium" title={d.name}>{d.name}:</span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 font-mono text-[9px]">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editingInitialValue}
                          onChange={(e) => setEditingInitialValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditing(d.id);
                            if (e.key === 'Escape') setEditingInitialCardId(null);
                          }}
                          className="w-16 px-1 py-0 px-0.5 text-[9px] font-mono border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-700 h-4"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEditing(d.id);
                          }}
                          className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Guardar"
                        >
                          <Check className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingInitialCardId(null);
                          }}
                          className="p-0.5 text-rose-500 hover:bg-rose-50 rounded"
                          title="Cancelar"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group/row">
                        <span className="font-semibold text-slate-600">${bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(d.id, bal);
                          }}
                          className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-60 hover:opacity-100 transition-opacity ml-0.5"
                          title="Editar Saldo Inicial"
                        >
                          <Pencil className="w-2.5 h-2.5 shrink-0" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 text-slate-500 rounded-lg group-hover:bg-slate-600 group-hover:text-white transition-colors duration-200 shrink-0 ml-3">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Incomes */}
        <div 
          onClick={() => setSelectedKpi('incomes')}
          className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between cursor-pointer hover:shadow-md hover:scale-[1.01] hover:border-emerald-200 transition-all duration-200 group" 
          id="kpi-incomes"
          title="Ver desglose de Ingresos Planificados"
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider group-hover:text-slate-500 transition-colors truncate">Ingresos Planificados</span>
              <span className="text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Ver</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">${monthlyIncomes.toLocaleString()}</div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Sueldos y otros ingresos fijos
            </p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-200 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Gasto Mensual Proyectado */}
        <div 
          onClick={() => setSelectedKpi('projected_expenses')}
          className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between cursor-pointer hover:shadow-md hover:scale-[1.01] hover:border-indigo-200 transition-all duration-200 group" 
          id="kpi-projected-expenses"
          title="Ver desglose del Gasto Proyectado"
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider group-hover:text-slate-500 transition-colors truncate">Gasto Proyectado (Total)</span>
              <span className="text-[9px] text-indigo-500 font-bold bg-indigo-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Ver</span>
            </div>
            <div className="text-2xl font-bold text-indigo-600">${totalProjectedExpenses.toLocaleString()}</div>
            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 truncate" title="Suma compromisos incurridos o fijos de este mes">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              Compromisos, fijos y variables
            </p>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-650 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Cash Outflows (Real Expenses Paid) */}
        <div 
          onClick={() => setSelectedKpi('outflows')}
          className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between cursor-pointer hover:shadow-md hover:scale-[1.01] hover:border-rose-200 transition-all duration-200 group" 
          id="kpi-expenses"
          title="Ver desglose de Egresos Reales"
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider group-hover:text-slate-500 transition-colors truncate">Egresos Reales (Flujo)</span>
              <span className="text-[9px] text-rose-500 font-bold bg-rose-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Ver</span>
            </div>
            <div className="text-2xl font-bold text-rose-600">${totalOutflows.toLocaleString()}</div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              Directos + Cuota Préstamo + TDC
            </p>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg group-hover:bg-rose-600 group-hover:text-white transition-colors duration-200 shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Savings */}
        <div 
          onClick={() => setSelectedKpi('savings')}
          className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between cursor-pointer hover:shadow-md hover:scale-[1.01] hover:border-blue-200 transition-all duration-200 group" 
          id="kpi-savings"
          title="Ver desglose de Ahorro Neto Proyectado"
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider group-hover:text-slate-500 transition-colors truncate">Ahorro Proyectado</span>
              <span className="text-[9px] text-blue-500 font-bold bg-blue-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Ver</span>
            </div>
            <div className={`text-2xl font-bold ${projectedSavings >= 0 ? 'text-blue-600' : 'text-amber-600 font-extrabold'}`}>
              {projectedSavings >= 0 ? `$${projectedSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `-$${Math.abs(projectedSavings).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
            </div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <PiggyBank className="w-3 h-3 text-blue-500" />
              Tasa: <span className="font-bold text-blue-600">{projectedSavingsRate.toFixed(1)}%</span>
            </p>
          </div>
          <div className={`p-2.5 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200 shrink-0 ${projectedSavings >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            <PiggyBank className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Saldo Efectivo Final */}
        <div 
          className="bg-white p-5 rounded-xl border border-emerald-50 shadow-xs flex items-start justify-between hover:shadow-md hover:scale-[1.01] hover:border-emerald-200 transition-all duration-200 group" 
          id="kpi-final-cash"
          title="Saldo total en efectivo/débito proyectado al final de este mes"
        >
          <div className="space-y-1.5 min-w-0 w-full">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase text-emerald-600 tracking-wider group-hover:text-emerald-700 transition-colors truncate">Efectivo Final</span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">${totalFinalCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            
            {/* Math audit formula */}
            <div className="border-t border-emerald-100 pt-1.5 mt-1 space-y-1 text-[10px] text-slate-400">
              <div className="flex justify-between gap-2">
                <span>Efectivo Inicial:</span>
                <span className="font-semibold text-slate-600">${totalInitialCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>(+) Ingresos Planif.:</span>
                <span className="font-semibold text-emerald-600">+${monthlyIncomes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>(-) Egresos Reales:</span>
                <span className="font-semibold text-rose-650">-${totalOutflows.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-200 shrink-0 ml-3">
            <Coins className="w-5 h-5" />
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

      {/* SECCIÓN ANALÍTICA DE SALUD FINANCIERA (KPIS & METAS) */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Diagnóstico Analítico de Salud Financiera - MZ Planner</span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Control de apalancamiento, eficiencia de liquidez y desvío de presupuesto para {monthLabel}</p>
          </div>
          <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
            CALCULADO EN TIEMPO REAL
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Eficiencia y Ahorro */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wide">Eficiencia de Ahorro</span>
                {(() => {
                  if (projectedSavingsRate >= 20) return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">Excelente (≥20%)</span>;
                  if (projectedSavingsRate >= 10) return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">Saludable (10-20%)</span>;
                  if (projectedSavingsRate > 0) return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">Ajustado (&lt;10%)</span>;
                  return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">Déficit (&lt;0%)</span>;
                })()}
              </div>

              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono tracking-tight text-slate-100">{projectedSavingsRate.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-400">acumulado</span>
              </div>
              
              <div className="mt-3 space-y-1.5 text-[11px] text-slate-350">
                <div className="w-full bg-slate-850 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      projectedSavingsRate >= 20 ? 'bg-emerald-500' : 
                      projectedSavingsRate >= 10 ? 'bg-blue-500' : 
                      projectedSavingsRate > 0 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, projectedSavingsRate))}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-450 leading-relaxed pt-1.5">
                  Destinas <span className="text-indigo-400 font-semibold">${projectedSavings.toLocaleString()}</span> de tus ingresos al fondo de ahorro neto. {projectedSavingsRate < 10 && 'Considera disminuir gastos ordinarios flexibles este mes para aumentar tu ratio financiero.'}
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: spend & leverage values */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wide">Ritmo de Gasto Diario</span>
                <span className="text-indigo-400 bg-indigo-500/10 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Coins className="w-3 h-3" /> Promedio
                </span>
              </div>
              
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono tracking-tight text-slate-100">
                  ${(() => {
                    const days = (() => {
                      const [yNum, mNum] = selectedMonth.split('-');
                      return new Date(parseInt(yNum, 10), parseInt(mNum, 10), 0).getDate();
                    })();
                    return (totalOutflows / days).toFixed(2);
                  })()}
                </span>
                <span className="text-[10px] text-slate-400">/ día</span>
              </div>

              {/* CC leverage block */}
              {(() => {
                const totalLimit = creditCards.reduce((sum, c) => sum + c.limit, 0);
                const summaries = computeCardStatementsForMonth(creditCards, transactions, installments, selectedMonth, paidCardStatements);
                const totalDue = summaries.reduce((sum, s) => sum + s.billingBalance, 0);
                const leveragePct = totalLimit > 0 ? (totalDue / totalLimit) * 100 : 0;

                return (
                  <div className="mt-4 pt-3.5 border-t border-slate-850 space-y-1.5">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Uso Global de Tarjetas (Deuda / Límite)</span>
                      <span className={`font-mono font-bold ${leveragePct > 50 ? 'text-rose-400' : leveragePct > 30 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {leveragePct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-850 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${leveragePct > 50 ? 'bg-rose-500' : leveragePct > 30 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(100, leveragePct)}%` }}
                      />
                    </div>
                    <span className="text-[9.5px] text-slate-500 block leading-tight">
                      {totalLimit > 0 
                        ? `Límite Total: $${totalLimit.toLocaleString()} (Deuda actual corte: $${totalDue.toLocaleString()}).` 
                        : 'No tienes límites de crédito registrados en base de tarjetas.'}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Card 3: 50/30/20 budget framework audit */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wide block">Auditoría Presupuesto: Ley 50 / 30 / 20</span>
              
              {(() => {
                const essentialAmt = housingExpenses + installmentsExpenses;
                const variablesAmt = otherExpenses + subscriptionExpenses;
                const savingsAmt = projectedSavings > 0 ? projectedSavings : 0;
                
                const totalFramework = essentialAmt + variablesAmt + savingsAmt;
                const actEssentialPct = totalFramework > 0 ? (essentialAmt / totalFramework) * 100 : 0;
                const actFlexPct = totalFramework > 0 ? (variablesAmt / totalFramework) * 100 : 0;
                const actSavPct = totalFramework > 0 ? (savingsAmt / totalFramework) * 100 : 0;

                return (
                  <div className="space-y-2.5 text-[10px] font-medium text-slate-350">
                    {/* Fixed / Essentials */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10.5px]">
                        <span className="text-slate-400">Esenciales (Fijos + Deudas) <strong className="text-slate-200">({actEssentialPct.toFixed(0)}%)</strong></span>
                        <span className="font-semibold text-slate-450">Meta: ≤50%</span>
                      </div>
                      <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, actEssentialPct)}%` }} />
                      </div>
                    </div>

                    {/* Flexible / Lifestyle */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10.5px]">
                        <span className="text-slate-400">Flexibles (Deseos/Hogar) <strong className="text-slate-200">({actFlexPct.toFixed(0)}%)</strong></span>
                        <span className="font-semibold text-slate-450">Meta: ≤30%</span>
                      </div>
                      <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, actFlexPct)}%` }} />
                      </div>
                    </div>

                    {/* Savings */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10.5px]">
                        <span className="text-slate-400">Ahorro Proyectado <strong className="text-slate-200">({actSavPct.toFixed(0)}%)</strong></span>
                        <span className="font-semibold text-slate-450">Meta: ≥20%</span>
                      </div>
                      <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, actSavPct)}%` }} />
                      </div>
                    </div>

                    <div className="text-[9px] pt-1 border-t border-slate-900 text-slate-450 leading-tight">
                      {actEssentialPct > 55 ? '⚠️ Tus obligaciones esenciales exigen más del 50%. Intenta contener cuotas.' : '✅ Buen balance en gastos esenciales fijos.'}
                    </div>
                  </div>
                );
              })()}
            </div>
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
              {cardsDueBalances.map((card, i) => {
                const billingMonthVal = (() => {
                  const [mY, mMonth] = selectedMonth.split('-');
                  let prevYr = parseInt(mY, 10);
                  let prevM = parseInt(mMonth, 10) - 1;
                  if (prevM === 0) {
                    prevM = 12;
                    prevYr -= 1;
                  }
                  return `${prevYr}-${String(prevM).padStart(2, '0')}`;
                })();

                return (
                  <div 
                    key={i} 
                    onClick={() => setSelectedCardDetail({
                      cardId: card.cardId,
                      billingMonth: billingMonthVal,
                      cardName: card.cardName
                    })}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100/80 hover:shadow-xs hover:scale-[1.01] border border-transparent hover:border-blue-100 transition-all duration-200 cursor-pointer group"
                    title={`Hacer clic para ver el desglose detallado de cargos de la tarjeta ${card.cardName}`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-semibold text-slate-705 group-hover:text-blue-600 transition-colors">{card.cardName}</h3>
                        <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Ver</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Vencía el: <strong className="text-slate-500">{card.dueDate || 'N/D'}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-700 font-mono">${card.dueAmount.toLocaleString()}</div>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${card.dueAmount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {card.dueAmount > 0 ? 'Por Pagar' : 'Sin cargos'}
                      </span>
                    </div>
                  </div>
                );
              })}
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
            <div className="text-xs text-slate-400 mb-4 py-1.5 px-3 bg-emerald-50/50 rounded-lg text-emerald-800 flex items-center justify-between">
              <span>Muestra el Saldo Inicial, variaciones y Saldo Final proyectado.</span>
              <span className="font-bold shrink-0 text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 animate-pulse">Clic para auditar</span>
            </div>

            <div className="space-y-3">
              {debitCards.map((bank, i) => {
                const flow = accountFlows[bank.id] || { initialBalance: bank.balance, finalBalance: bank.balance, incomes: 0, expenses: 0 };
                const netVariance = flow.incomes - flow.expenses;
                return (
                  <div 
                    key={bank.id || i} 
                    onClick={() => setSelectedAuditAccount(bank)}
                    className="group p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-100/60 hover:border-slate-200 rounded-xl transition-all cursor-pointer select-none"
                    title="Haga clic para auditar movimientos de esta cuenta"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-emerald-100/30 rounded-md text-emerald-600 transition-colors group-hover:bg-emerald-100">
                          <Wallet className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <h4 className="text-xs font-bold text-slate-700 truncate group-hover:text-emerald-700 max-w-[120px] transition-colors">{bank.name}</h4>
                            <span className="text-[7.5px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                              <Eye className="w-1.5 h-1.5" /> Ver
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-medium">Débito / Disponible</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block uppercase font-mono">Saldo Final</span>
                        <span className="text-sm font-extrabold text-emerald-600 group-hover:scale-105 transition-transform block">${flow.finalBalance.toLocaleString()}</span>
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

      {/* DETALLES DE KPI DIALOG MODAL */}
      {selectedKpi && (
        <div id="kpi-details-overlay" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div id="kpi-details-modal" className="bg-white rounded-xl shadow-xl border border-slate-150 max-w-2xl w-full p-6 text-xs flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
              <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                {selectedKpi === 'incomes' && (
                  <>
                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <span>Detalle de Ingresos Planificados ({monthLabel})</span>
                  </>
                )}
                {selectedKpi === 'projected_expenses' && (
                  <>
                    <div className="p-1.5 bg-indigo-50 text-indigo-650 rounded">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span>Detalle de Gasto Proyectado ({monthLabel})</span>
                  </>
                )}
                {selectedKpi === 'outflows' && (
                  <>
                    <div className="p-1.5 bg-rose-50 text-rose-600 rounded">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <span>Detalle de Egresos Reales de Efectivo / Cuentas ({monthLabel})</span>
                  </>
                )}
                {selectedKpi === 'savings' && (
                  <>
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                      <PiggyBank className="w-4 h-4" />
                    </div>
                    <span>Análisis de Ahorro Neto Proyectado ({monthLabel})</span>
                  </>
                )}
              </h3>
              <button 
                onClick={() => setSelectedKpi(null)}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-all text-sm font-semibold"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="overflow-y-auto flex-1 pr-1 py-1 space-y-4">
              {selectedKpi === 'incomes' && (() => {
                const list = transactions.filter(t => activePeriodMonths.includes(t.month) && t.type === 'income');
                if (list.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400 font-medium font-sans">
                      No hay ingresos planificados registrados para este período.
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                            <th className="py-2.5 px-3 font-sans">Fecha</th>
                            <th className="py-2.5 px-3 font-sans">Detalle / Concepto</th>
                            <th className="py-2.5 px-3 font-sans">Categoría</th>
                            <th className="py-2.5 px-3 font-sans">Destina A</th>
                            <th className="py-2.5 px-3 text-right font-sans">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {list.map(t => {
                            const catObj = categories.find(c => c.id === t.category);
                            const activeCard = debitCards.find(d => d.id === t.cardId) || creditCards.find(c => c.id === t.cardId);
                            return (
                              <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2 px-3 text-slate-450 font-mono text-[10px]">{t.date}</td>
                                <td className="py-2 px-3 font-semibold text-slate-800">{t.description}</td>
                                <td className="py-2 px-3 text-slate-600">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catObj?.color || '#D1D5DB' }}></span>
                                    {catObj?.name || 'Ingreso'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-500">
                                  {activeCard ? activeCard.name : 'Efectivo / Default'}
                                </td>
                                <td className="py-2 px-3 text-right text-emerald-600 font-bold font-mono text-xs">
                                  +${t.amount.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/40 flex justify-between items-center text-emerald-800">
                      <span className="font-semibold text-xs">Total Ingresos de este período:</span>
                      <strong className="text-base font-bold font-mono">${monthlyIncomes.toLocaleString()}</strong>
                    </div>
                  </div>
                );
              })()}

              {selectedKpi === 'projected_expenses' && (() => {
                const list = transactions.filter(t => activePeriodMonths.includes(t.month) && t.type === 'expense');
                if (list.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400 font-medium">
                      No hay gastos mensuales proyectados ni consumos registrados para este período.
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                            <th className="py-2.5 px-3 font-sans">Fecha</th>
                            <th className="py-2.5 px-3 font-sans">Detalle / Concepto</th>
                            <th className="py-2.5 px-3 font-sans">Categoría</th>
                            <th className="py-2.5 px-3 font-sans">Clase</th>
                            <th className="py-2.5 px-3 font-sans">Pago</th>
                            <th className="py-2.5 px-3 text-right font-sans">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {list.map(t => {
                            const catObj = categories.find(c => c.id === t.category);
                            
                            // Classify expense class
                            let expClass = 'Variable';
                            let classColor = 'bg-slate-100 text-slate-600 border-slate-205';
                            if (t.category === 'cat-housing' || t.description.toLowerCase().includes('alquiler') || t.description.toLowerCase().includes('rent')) {
                              expClass = 'Vivienda';
                              classColor = 'bg-blue-50 text-blue-700 border-blue-100';
                            } else if (t.category === 'cat-subscriptions' || t.subscriptionId || t.isFixed) {
                              expClass = 'Recurrente';
                              classColor = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                            } else if (t.category === 'cat-installments' || t.installmentId) {
                              expClass = 'Cuota';
                              classColor = 'bg-amber-50 text-amber-750 border-amber-100';
                            }

                            // Payment method name
                            const card = debitCards.find(d => d.id === t.cardId) || creditCards.find(c => c.id === t.cardId);
                            let pMethod = t.paymentMethod === 'credit' ? 'Crédito' : (t.paymentMethod === 'transfer' ? 'Transferencia' : (t.paymentMethod === 'debit' ? 'Débito' : 'Efectivo'));
                            if (card) {
                              pMethod = card.name;
                            }

                            return (
                              <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2 px-3 text-slate-450 font-mono text-[10px]">{t.date}</td>
                                <td className="py-2 px-3 font-semibold text-slate-800">{t.description}</td>
                                <td className="py-2 px-3 text-slate-650">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catObj?.color || '#D1D5DB' }}></span>
                                    {catObj?.name || 'Otro'}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[9px] border font-bold ${classColor}`}>
                                    {expClass}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-500 font-medium max-w-[100px] truncate" title={pMethod}>
                                  {pMethod}
                                </td>
                                <td className="py-2 px-3 text-right text-indigo-655 font-bold font-mono text-xs">
                                  ${t.amount.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/40 flex justify-between items-center text-indigo-800">
                      <span className="font-semibold text-xs">Total Consumos / Gastos del período:</span>
                      <strong className="text-base font-bold font-mono">${totalProjectedExpenses.toLocaleString()}</strong>
                    </div>
                  </div>
                );
              })()}

              {selectedKpi === 'outflows' && (() => {
                // 1. Direct expenses (Efectivo/Transferencia/Débito)
                const directList = transactions.filter(t => {
                  if (!activePeriodMonths.includes(t.month) || t.type !== 'expense' || t.paymentMethod === 'credit') {
                    return false;
                  }
                  if (t.installmentId) {
                    const inst = installments.find(i => i.id === t.installmentId);
                    if (inst && inst.type === 'loan') {
                      return false;
                    }
                  }
                  return true;
                });

                // 2. Loans
                const activeLoansList = installments.filter(inst => inst.type === 'loan');
                const loanPaymentsList = activeLoansList
                  .flatMap(inst => getProjectedInstallments(inst).map(proj => ({ ...proj, inst })))
                  .filter(proj => activePeriodMonths.includes(proj.chargeMonth));

                // 3. CC Payments Due
                const tdcPaymentsList: { cardName: string; billingMonth: string; closingDate: string; dueDate: string; amount: number }[] = [];
                activePeriodMonths.forEach(mStr => {
                  const [mY, mMonth] = mStr.split('-');
                  let prevYr = parseInt(mY, 10);
                  let prevM = parseInt(mMonth, 10) - 1;
                  if (prevM === 0) {
                    prevM = 12;
                    prevYr -= 1;
                  }
                  const prevMStr = `${prevYr}-${String(prevM).padStart(2, '0')}`;
                  
                  creditCards.forEach(card => {
                    const prevStatement = computeCardStatementsForMonth(creditCards, transactions, installments, prevMStr, paidCardStatements)
                      .find(s => s.cardId === card.id);
                    if (prevStatement && prevStatement.billingBalance > 0) {
                      tdcPaymentsList.push({
                        cardName: card.name,
                        billingMonth: prevMStr,
                        closingDate: prevStatement.closingDateStr,
                        dueDate: prevStatement.paymentDueDateStr,
                        amount: prevStatement.billingBalance
                      });
                    }
                  });
                });

                return (
                  <div className="space-y-6">
                    {/* Header explanatory tip */}
                    <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-[11px] text-slate-500 leading-normal flex items-start gap-1.5 font-medium">
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        Los <strong>Egresos Reales (Flujo)</strong> representan las salidas directas de dinero en efectivo, transferencias bancarias o débitos, incluyendo la liquidación de las deudas en préstamos y de los cortes pasados de tus **Tarjetas de Crédito (TDC)** que vencen este mes. Las compras del mes con TDC <strong>no se listan aquí</strong>, pues se pagarán en el siguiente ciclo.
                      </span>
                    </div>

                    {/* Section 1: Direct Expenses */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-slate-100/70 py-1.5 px-3 rounded font-bold text-slate-700 text-[11px]">
                        <span>1. GASTOS DIRECTOS / EFECTIVO / TRANSFERENCIA</span>
                        <span className="text-rose-600 font-mono">${directExpenses.toLocaleString()}</span>
                      </div>
                      
                      {directList.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic px-3 py-1">Sin egresos directos este mes</p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-100 rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 text-[9px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                                <th className="py-1.5 px-3 font-sans">Fecha</th>
                                <th className="py-1.5 px-3 font-sans">Detalle / Concepto</th>
                                <th className="py-1.5 px-3 font-sans">Categoría</th>
                                <th className="py-1.5 px-3 font-sans">Origen / Cuenta</th>
                                <th className="py-1.5 px-3 text-right font-sans">Monto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-600 text-[11px]">
                              {directList.map(t => {
                                const catObj = categories.find(c => c.id === t.category);
                                const card = debitCards.find(d => d.id === t.cardId) || creditCards.find(c => c.id === t.cardId);
                                const pMethod = card ? card.name : (t.paymentMethod === 'transfer' ? 'Transferencia' : (t.paymentMethod === 'debit' ? 'Débito' : 'Efectivo'));
                                return (
                                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-1.5 px-3 text-slate-450 font-mono text-[10px]">{t.date}</td>
                                    <td className="py-1.5 px-3 font-semibold text-slate-800">{t.description}</td>
                                    <td className="py-1.5 px-3 text-slate-500">{catObj?.name || 'Otros'}</td>
                                    <td className="py-1.5 px-3 text-slate-500">{pMethod}</td>
                                    <td className="py-1.5 px-3 text-right font-bold text-rose-500 font-mono">${t.amount.toLocaleString()}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Section 2: Loans */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-slate-100/70 py-1.5 px-3 rounded font-bold text-slate-700 text-[11px]">
                        <span>2. CUOTAS DE PRÉSTAMOS</span>
                        <span className="text-amber-600 font-mono">${loanPayments.toLocaleString()}</span>
                      </div>

                      {loanPaymentsList.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic px-3 py-1">Sin cuotas de préstamos en este periodo</p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-100 rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 text-[9px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                                <th className="py-1.5 px-3 font-sans">Préstamo</th>
                                <th className="py-1.5 px-3 font-sans">Cuota</th>
                                <th className="py-1.5 px-3 font-sans">Vence</th>
                                <th className="py-1.5 px-3 text-right font-sans">Monto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-600 text-[11px]">
                              {loanPaymentsList.map((proj, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-1.5 px-3 font-semibold text-slate-800">{proj.inst.description}</td>
                                  <td className="py-1.5 px-3 text-slate-500">Cuota {proj.installmentIndex} de {proj.inst.installments}</td>
                                  <td className="py-1.5 px-3 text-slate-455 font-mono text-[10px]">Día {proj.inst.loanDueDay || 'Hacia fin de mes'}</td>
                                  <td className="py-1.5 px-3 text-right font-bold text-amber-500 font-mono">${proj.monthlyAmount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Section 3: CC Payments Due */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-slate-100/70 py-1.5 px-3 rounded font-bold text-slate-700 text-[11px]">
                        <span>3. PAGO DEL CORTE MENSUAL DE TARJETAS DE CRÉDITO (TDC)</span>
                        <span className="text-slate-750 font-bold font-mono">${totalCardPaymentsDue.toLocaleString()}</span>
                      </div>

                      {tdcPaymentsList.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic px-3 py-1">Sin saldos pendientes de pago de TDC en este período</p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-100 rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 text-[9px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                                <th className="py-1.5 px-3 font-sans">Tarjeta</th>
                                <th className="py-1.5 px-3 font-sans">Mes del Estado / Corte</th>
                                <th className="py-1.5 px-3 font-sans">Fecha de Pago Límite</th>
                                <th className="py-1.5 px-3 text-right font-sans">Saldo a Pagar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-600 text-[11px]">
                              {tdcPaymentsList.map((tdc, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-1.5 px-3 font-semibold text-slate-800 flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 bg-slate-205 border border-slate-350 rounded-sm"></div>
                                    {tdc.cardName}
                                  </td>
                                  <td className="py-1.5 px-3 text-slate-500">Corte correspondiente a {tdc.billingMonth}</td>
                                  <td className="py-1.5 px-3 text-indigo-600 font-semibold text-[10px]">{tdc.dueDate}</td>
                                  <td className="py-1.5 px-3 text-right font-bold text-indigo-700 font-mono">${tdc.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-xl border border-rose-100/40 flex justify-between items-center text-rose-800">
                      <span className="font-semibold text-xs text-rose-700">Total Salidas de Efectivo Reales:</span>
                      <strong className="text-base font-bold font-mono">${totalOutflows.toLocaleString()}</strong>
                    </div>
                  </div>
                );
              })()}

              {selectedKpi === 'savings' && (
                <div className="space-y-6">
                  {/* Explanation of calculations and dual metrics */}
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <PiggyBank className="w-4 h-4 text-blue-500" />
                      Fórmulas y Conciliación de Ahorro
                    </h4>
                    <p className="text-slate-650 text-xs leading-relaxed">
                      El sistema calcula el ahorro desde dos perspectivas complementarias para darte un control total tanto de tus <strong>hábitos de consumo</strong> como de tu <strong>liquidez real en cuentas</strong>:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      {/* Perspective A: Cashflow basis */}
                      <div className="bg-white p-3.5 rounded-lg border border-slate-100 shadow-3xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Ahorro de Flujo Real (Caja)</span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${projectedSavings >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-700'}`}>
                            {projectedSavings >= 0 ? 'Excedente' : 'Déficit Flujo'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-450 leading-normal">
                          Mide el cambio real de tu efectivo este mes. Resta del ingreso todos los pagos realizados (incluye cuotas de préstamos y el corte anterior de tus tarjetas de crédito).
                        </p>
                        <div className="bg-slate-50 p-2 rounded text-xs font-mono font-bold text-slate-750 flex flex-col gap-1 border border-slate-100/50">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-normal text-slate-500">Ingresos (+)</span>
                            <span className="text-emerald-600">${monthlyIncomes.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-normal text-slate-500">Egresos Reales (-)</span>
                            <span className="text-rose-600">${totalOutflows.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                          <div className="border-t border-slate-200 mt-1 pt-1 flex justify-between items-center font-bold">
                            <span className="text-[10px] uppercase text-slate-600">Ahorro Real (=)</span>
                            <span className={projectedSavings >= 0 ? 'text-blue-600' : 'text-amber-600'}>
                              {projectedSavings >= 0 ? `$${projectedSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `-$${Math.abs(projectedSavings).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-450 text-right">
                          Tasa de ahorro real: <strong className={projectedSavings >= 0 ? 'text-blue-600 font-bold' : 'text-amber-600 font-bold'}>{projectedSavingsRate.toFixed(1)}%</strong>
                        </div>
                      </div>

                      {/* Perspective B: Accrual basis */}
                      {(() => {
                        const accrualSavings = monthlyIncomes - totalProjectedExpenses;
                        const accrualSavingsRate = monthlyIncomes > 0 ? (accrualSavings / monthlyIncomes) * 100 : 0;
                        return (
                          <div className="bg-white p-3.5 rounded-lg border border-slate-100 shadow-3xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Capacidad de Ahorro (Mes)</span>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${accrualSavings >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-700'}`}>
                                {accrualSavings >= 0 ? 'Positiva' : 'Negativa'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-455 leading-normal">
                              Mide el margen de ahorro generado solo por la actividad de este mes. Resta del ingreso los gastos que creaste en el mes actual (sea pagado en efectivo o tarjeta).
                            </p>
                            <div className="bg-slate-50 p-2 rounded text-xs font-mono font-bold text-slate-750 flex flex-col gap-1 border border-slate-100/50">
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="font-normal text-slate-500">Ingresos (+)</span>
                                <span className="text-emerald-700">${monthlyIncomes.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="font-normal text-slate-500">Gastos Registrados (-)</span>
                                <span className="text-indigo-600">${totalProjectedExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                              </div>
                              <div className="border-t border-slate-200 mt-1 pt-1 flex justify-between items-center font-bold">
                                <span className="text-[10px] uppercase text-slate-600">Margen del Mes (=)</span>
                                <span className={accrualSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                  {accrualSavings >= 0 ? `$${accrualSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `-$${Math.abs(accrualSavings).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                                </span>
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-455 text-right">
                              Capacidad de ahorro: <strong className={accrualSavings >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{accrualSavingsRate.toFixed(1)}%</strong>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Subtitle / Insight info */}
                  <div className="p-3 bg-blue-50/40 border border-blue-100/50 rounded-lg text-slate-600 leading-relaxed flex items-start gap-1.5 font-medium text-xs">
                    <PiggyBank className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800">Interpretación:</span> 
                      <span className="ml-1 text-slate-650">
                        {projectedSavings < 0 ? (
                          <>
                            Tu <strong>Ahorro Real de Flujo es negativo ({projectedSavingsRate.toFixed(1)}%)</strong> debido a que estás desembolsando más efectivo del que ingresas para amortizar deudas o pagos pendientes de tus tarjetas de crédito de meses previos. Sin embargo, si tu margen de consumo mensual de este mes es positivo, significa que tus hábitos de compras en el mes actual están controlados de forma saludable.
                          </>
                        ) : (
                          <>
                            ¡Excelente! Tienes un <strong>Ahorro de Flujo positivo de {projectedSavingsRate.toFixed(1)}%</strong> de tus ingresos. Esto significa que estás aumentando efectivamente tu liquidez neta en tus cuentas este mes después de pagar todos tus compromisos de efectivo y tarjetas.
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Categorized breakdown table */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distribución de Gastos en el mes</h4>
                    <div className="border border-slate-100 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 p-2.5 grid grid-cols-3 text-[10px] text-slate-400 font-bold border-b border-slate-100 uppercase tracking-wider">
                        <span>Categoría</span>
                        <span className="text-center">Porcentaje del Gasto</span>
                        <span className="text-right">Monto Total</span>
                      </div>

                      <div className="divide-y divide-slate-100 font-medium text-xs text-slate-700">
                        <div className="p-2.5 grid grid-cols-3 items-center hover:bg-slate-50/30 transition-colors">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                            Vivienda y Alquiler
                          </span>
                          <span className="text-center text-slate-500 font-mono font-bold">
                            {totalProjectedExpenses > 0 ? ((housingExpenses / totalProjectedExpenses) * 100).toFixed(1) : 0}%
                          </span>
                          <span className="text-right font-bold text-slate-800 font-mono">${housingExpenses.toLocaleString()}</span>
                        </div>

                        <div className="p-2.5 grid grid-cols-3 items-center hover:bg-slate-50/30 transition-colors">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                            Suscripciones y Servicios
                          </span>
                          <span className="text-center text-slate-500 font-mono font-bold">
                            {totalProjectedExpenses > 0 ? ((subscriptionExpenses / totalProjectedExpenses) * 100).toFixed(1) : 0}%
                          </span>
                          <span className="text-right font-bold text-slate-800 font-mono">${subscriptionExpenses.toLocaleString()}</span>
                        </div>

                        <div className="p-2.5 grid grid-cols-3 items-center hover:bg-slate-50/30 transition-colors">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            Préstamos y Amortizaciones
                          </span>
                          <span className="text-center text-slate-500 font-mono font-bold">
                            {totalProjectedExpenses > 0 ? ((installmentsExpenses / totalProjectedExpenses) * 100).toFixed(1) : 0}%
                          </span>
                          <span className="text-right font-bold text-slate-800 font-mono">${installmentsExpenses.toLocaleString()}</span>
                        </div>

                        <div className="p-2.5 grid grid-cols-3 items-center hover:bg-slate-50/30 transition-colors">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            Consumos y Variables
                          </span>
                          <span className="text-center text-slate-500 font-mono font-bold">
                            {totalProjectedExpenses > 0 ? ((otherExpenses / totalProjectedExpenses) * 100).toFixed(1) : 0}%
                          </span>
                          <span className="text-right font-bold text-slate-800 font-mono">${otherExpenses.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 mt-4 shrink-0 flex justify-end">
              <button
                onClick={() => setSelectedKpi(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETALLES DE CORTE DE TARJETA DIALOG MODAL */}
      {selectedCardDetail && (() => {
        const stmt = computeCardStatementsForMonth(creditCards, transactions, installments, selectedCardDetail.billingMonth, paidCardStatements)
          .find(s => s.cardId === selectedCardDetail.cardId);
        
        const detailedCharges = stmt ? stmt.detailedCharges : [];
        const billingBalance = stmt ? stmt.billingBalance : 0;
        
        const [bYear, bMonth] = selectedCardDetail.billingMonth.split('-');
        const billingMonthEs = monthNamesEs[parseInt(bMonth, 10) - 1];
        const displayBillingPeriod = `${billingMonthEs} ${bYear}`;

        return (
          <div id="card-statement-details-overlay" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div id="card-statement-details-modal" className="bg-white rounded-xl shadow-xl border border-slate-150 max-w-2xl w-full p-6 text-xs flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
                <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span>Detalle de Consumos en: {selectedCardDetail.cardName}</span>
                </h3>
                <button 
                  onClick={() => setSelectedCardDetail(null)}
                  className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-all text-sm font-semibold"
                  aria-label="Cerrar modal"
                >
                  ✕
                </button>
              </div>

              {/* Explanatory banner with editable dates */}
              <div className="mb-4 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 text-blue-900 shrink-0 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="font-semibold text-slate-800 block">Período de Facturación que se paga en {monthLabel}: </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Estado de cuenta de <strong className="text-slate-800 font-semibold">{displayBillingPeriod}</strong>
                    </span>
                  </div>
                  {stmt && (
                    <div className="bg-white/80 p-1.5 px-3 rounded-lg border border-blue-200 text-[11px] text-slate-700 select-none">
                      Corte real: <strong className="text-slate-950 font-semibold">{stmt.closingDateStr}</strong> | Límite: <strong className="text-indigo-700 font-bold">{stmt.paymentDueDateStr}</strong>
                    </div>
                  )}
                </div>

                {/* Date quick override form */}
                <div className="pt-2 border-t border-blue-100/60 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-705">
                  <span className="text-[10px] text-blue-800 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>¿El banco movió las fechas de este mes? Cambiarlas aquí:</span>
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="modal-over-c" className="text-[10px] text-slate-500 font-normal">Corte (Día):</label>
                    <input 
                      id="modal-over-c"
                      type="number"
                      min="1"
                      max="31"
                      value={customClosingDay}
                      onChange={(e) => setCustomClosingDay(e.target.value)}
                      className="w-12 px-1.5 py-1 bg-white border border-slate-200 rounded text-center text-slate-850 font-sans text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label htmlFor="modal-over-d" className="text-[10px] text-slate-500 font-normal">Pago (Día):</label>
                    <input 
                      id="modal-over-d"
                      type="number"
                      min="1"
                      max="31"
                      value={customDueDay}
                      onChange={(e) => setCustomDueDay(e.target.value)}
                      className="w-12 px-1.5 py-1 bg-white border border-slate-200 rounded text-center text-slate-850 font-sans text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cDay = parseInt(customClosingDay, 10);
                      const dDay = parseInt(customDueDay, 10);
                      if (isNaN(cDay) || isNaN(dDay) || cDay < 1 || cDay > 31 || dDay < 1 || dDay > 31) {
                        alert('Por favor ingresa un día de corte y pago válido entre 1 y 31.');
                        return;
                      }

                      const card = creditCards.find(c => c.id === selectedCardDetail.cardId);
                      if (card && onUpdateCreditCard) {
                        const nextOverrides = {
                          ...(card.overrides || {}),
                          [selectedCardDetail.billingMonth]: { closingDay: cDay, dueDay: dDay }
                        };
                        onUpdateCreditCard(card.id, { overrides: nextOverrides });
                        alert(`¡Fechas de pago actualizadas para el corte de ${displayBillingPeriod}! Alertas y calendarios sincronizados.`);
                      }
                    }}
                    className="p-1 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transiton-colors cursor-pointer text-[10px]"
                  >
                    Guardar Fechas del Mes
                  </button>
                </div>
              </div>

              {/* Scrollable table details */}
              <div className="overflow-y-auto flex-1 pr-1 py-1 space-y-4">
                {detailedCharges.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 font-medium font-sans">
                    No se registran cargos facturados para esta tarjeta en este ciclo. Las compras actuales se facturarán en el siguiente corte.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 font-bold">
                          <th className="py-2.5 px-3 font-sans">Fecha</th>
                          <th className="py-2.5 px-3 font-sans">Detalle del Cargo / Compra</th>
                          <th className="py-2.5 px-3 font-sans">Clase / Tipo</th>
                          <th className="py-2.5 px-3 text-right font-sans">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {detailedCharges.map((charge) => (
                          <tr key={charge.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2 px-3 text-slate-450 font-mono text-[10px]">{charge.date}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{charge.description}</td>
                            <td className="py-2 px-3">
                              {charge.isInstallment ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                  Cuota Mensual {charge.installmentIndex}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  Compra Corriente
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-800 font-bold font-mono text-xs">
                              ${charge.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Total Summary Row */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-500">
                  <span>Monto Total a Pagar / Liquidar de este Corte:</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-xs text-slate-400">Total:</span>
                  <strong className="text-lg font-extrabold text-slate-800 font-mono">${billingBalance.toLocaleString()}</strong>
                </div>
              </div>

              {/* Footer action buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 shrink-0 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setSelectedCardDetail(null);
                    onNavigate('estado-cuenta');
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors text-xs"
                >
                  Ver Todos los Cortes
                </button>
                <button
                  onClick={() => setSelectedCardDetail(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors text-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DETALLES DE AUDITORIA DE FONDOS LIQUIDOS */}
      {selectedAuditAccount && (() => {
        const flow = accountFlows[selectedAuditAccount.id] || { initialBalance: selectedAuditAccount.balance, finalBalance: selectedAuditAccount.balance, incomes: 0, expenses: 0 };
        const accountTxs = getAccountTransactionsForMonth(selectedAuditAccount.id);
        const netVariance = flow.incomes - flow.expenses;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedAuditAccount(null)}>
            <div 
              className="bg-white rounded-xl shadow-xl border border-slate-150 max-w-xl w-full p-6 text-xs flex flex-col max-h-[85vh] animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Auditoría Real-Time: {selectedAuditAccount.name}</h3>
                    <p className="text-[10px] text-slate-500">Período de análisis: {monthLabel}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAuditAccount(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Math card */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4 text-center shrink-0">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Saldo Inicial ({monthLabel})</span>
                  <span className="text-sm font-bold text-slate-700">${flow.initialBalance.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Movimiento Neto</span>
                  <span className={`text-sm font-bold ${netVariance >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {netVariance >= 0 ? "+" : ""}${netVariance.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Saldo Final Proyectado</span>
                  <span className="text-sm font-extrabold text-emerald-600">${flow.finalBalance.toLocaleString()}</span>
                </div>
              </div>

              {/* Explanatory notice */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 text-indigo-900 rounded-lg text-[10.5px] leading-relaxed mb-4 shrink-0">
                <p className="font-bold mb-1 flex items-center gap-1 text-indigo-950">
                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  ¿Cómo funciona este cálculo?
                </p>
                <p>
                  Este saldo se calcula tomando el <strong>Saldo Inicial</strong> del mes, sumando todos los <strong>Ingresos</strong> (+) de esta cuenta, y restando únicamente los gastos pagados con <strong>Efectivo, Débito o Transferencia</strong> (-). Se omiten consumos o pagos automáticos de tarjetas de crédito para que la caja real sea exacta y auditable con tus transacciones físicas.
                </p>
              </div>

              {/* Transactions details */}
              <h4 className="font-semibold text-slate-700 mb-2 flex items-center justify-between shrink-0">
                <span>Movimientos que afectan liquidez ({accountTxs.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Solo flujo de efectivo líquido</span>
              </h4>

              <div className="overflow-y-auto space-y-2 flex-1 pr-1 max-h-[220px] min-h-[100px]">
                {accountTxs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No hay transacciones registradas de tipo Ingreso, Débito o Transferencia en {monthLabel}.
                  </div>
                ) : (
                  accountTxs.map(t => {
                    const isIncome = t.type === 'income';
                    return (
                      <div key={t.id} className="p-2.5 bg-white border border-slate-100 hover:border-slate-200 rounded-lg flex items-center justify-between transition-colors">
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-700 truncate">{t.description}</div>
                          <div className="flex items-center gap-2 text-[9px] text-slate-400 mt-0.5 font-medium">
                            <span>{t.date}</span>
                            <span>•</span>
                            <span className="uppercase text-[8px] bg-slate-100 px-1 rounded text-slate-600 font-mono">
                              {t.paymentMethod === 'debit' ? 'Tarjeta Débito' : t.paymentMethod === 'transfer' ? 'Transferencia' : 'Efectivo'}
                            </span>
                          </div>
                        </div>
                        <div className={`font-bold shrink-0 text-right ${isIncome ? "text-emerald-600" : "text-slate-600"}`}>
                          {isIncome ? "+" : "-"}${t.amount.toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedAuditAccount(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
