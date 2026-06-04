import React from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, PiggyBank, CreditCard, Wallet, 
  AlertCircle, ChevronRight, Briefcase, Sparkles 
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase } from '../types';
import { getProjectedInstallments, computeCardStatementsForMonth } from '../utils/financeUtils';

interface DashboardProps {
  state: AppState;
  onNavigate: (section: string) => void;
}

export default function Dashboard({ state, onNavigate }: DashboardProps) {
  const { transactions, creditCards, debitCards, installments, categories, selectedMonth } = state;

  const [year, month] = selectedMonth.split('-');
  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthLabel = `${monthNamesEs[parseInt(month, 10) - 1]} ${year}`;

  // 1. INCOMES for selectedMonth
  const monthlyIncomes = transactions
    .filter(t => t.month === selectedMonth && t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // 2. CASH OUTFLOWS (Direct Expenses paid with cash, debit, transfer in selectedMonth)
  const directExpenses = transactions
    .filter(t => t.month === selectedMonth && t.type === 'expense' && t.paymentMethod !== 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  // 3. LOANS paid strictly in this selectedMonth
  const activeLoansList = installments.filter(inst => inst.type === 'loan');
  const loanPayments = activeLoansList
    .flatMap(inst => getProjectedInstallments(inst))
    .filter(proj => proj.chargeMonth === selectedMonth)
    .reduce((sum, p) => sum + p.monthlyAmount, 0);

  // 4. CREDIT CARD PAYMENTS due in selectedMonth (which comes from the cycles closing in the previous month)
  // Let's compute previous month YYYY-MM
  let prevYear = parseInt(year, 10);
  let prevMonth = parseInt(month, 10) - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  
  // Calculate billing balance due for each credit card
  let totalCardPaymentsDue = 0;
  const cardsDueBalances = creditCards.map(card => {
    const prevStatement = computeCardStatementsForMonth(creditCards, transactions, installments, prevMonthStr)
      .find(s => s.cardId === card.id);
    const balance = prevStatement ? prevStatement.billingBalance : 0;
    totalCardPaymentsDue += balance;
    return {
      cardName: card.name,
      dueAmount: balance,
      closingDate: prevStatement ? prevStatement.closingDateStr : '',
      dueDate: prevStatement ? prevStatement.paymentDueDateStr : ''
    };
  });

  const totalOutflows = directExpenses + loanPayments + totalCardPaymentsDue;
  const netSavings = monthlyIncomes - totalOutflows;
  const savingsRate = monthlyIncomes > 0 ? (netSavings / monthlyIncomes) * 100 : 0;

  // Pie chart expenses split by Category (combined direct expenses + loans + credit card payments)
  // Let's categorize every expense that actually costs money in this month
  const categorySplitMap: { [key: string]: { name: string; value: number; color: string } } = {};

  // Direct expenses categorization
  transactions
    .filter(t => t.month === selectedMonth && t.type === 'expense' && t.paymentMethod !== 'credit')
    .forEach(t => {
      const catObj = categories.find(c => c.id === t.category);
      const catName = catObj ? catObj.name : 'Otros';
      const catColor = catObj ? catObj.color : '#6B7280';
      if (!categorySplitMap[t.category]) {
        categorySplitMap[t.category] = { name: catName, value: 0, color: catColor };
      }
      categorySplitMap[t.category].value += t.amount;
    });

  // Adding Loans of this month to Vivienda/Otros
  if (loanPayments > 0) {
    const loanCatId = 'cat-housing'; // or other
    const catObj = categories.find(c => c.id === loanCatId);
    const catName = 'Préstamos / Préstamos Auto';
    const catColor = catObj ? catObj.color : '#3B82F6';
    if (!categorySplitMap['cat-housing']) {
      categorySplitMap['cat-housing'] = { name: catName, value: 0, color: catColor };
    }
    categorySplitMap['cat-housing'].value += loanPayments;
  }

  // Adding Credit Card billings that we are actually paying this month (which consists of individual charges from last month's statement!)
  // For maximum fidelity, let's dissect the components of the card statement we are paying this month
  creditCards.forEach(card => {
    const prevStatement = computeCardStatementsForMonth(creditCards, transactions, installments, prevMonthStr)
      .find(s => s.cardId === card.id);
    if (prevStatement && prevStatement.billingBalance > 0) {
      prevStatement.detailedCharges.forEach(charge => {
        // Find category if regular transaction
        let chargeCatId = 'cat-other';
        let chargeCatName = 'Cargos Tarjeta de Crédito';
        let chargeCatColor = '#6B7280';
        
        // Find matching original transaction to extract category
        const origTx = transactions.find(t => t.id === charge.id);
        if (origTx) {
          chargeCatId = origTx.category;
          const catObj = categories.find(c => c.id === chargeCatId);
          chargeCatName = catObj ? catObj.name : 'Otros';
          chargeCatColor = catObj ? catObj.color : '#6B7280';
        } else if (charge.isInstallment) {
          // If installment, try to match the base installment purchase to classify or mark as "Ocio/Tecnología"
          const basePurchase = installments.find(inst => inst.id === charge.id.split('-inst-')[0]);
          if (basePurchase) {
            chargeCatId = 'cat-leisure';
            chargeCatName = 'Plazos (' + basePurchase.description + ')';
            chargeCatColor = '#F59E0B';
          }
        }

        if (!categorySplitMap[chargeCatId]) {
          categorySplitMap[chargeCatId] = { name: chargeCatName, value: 0, color: chargeCatColor };
        }
        categorySplitMap[chargeCatId].value += charge.amount;
      });
    }
  });

  const pieData = Object.values(categorySplitMap).filter(item => item.value > 0);

  // 12-Month Cashflow Graph Preparation (simulating/retrieving values across months to plot beautiful trend chart)
  // Let's generate a list of the last 6 months to display
  const cashflowTrendData = [];
  const currentMonthNum = parseInt(month, 10);
  const currentYearNum = parseInt(year, 10);

  for (let j = -5; j <= 1; j++) { // from 5 months ago to next month projection
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
    
    // Incomes for this trend month
    const incVal = transactions
      .filter(t => t.month === tMonthStr && t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    // Direct Expenses
    const dirExp = transactions
      .filter(t => t.month === tMonthStr && t.type === 'expense' && t.paymentMethod !== 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Loan Payments
    const loanP = installments
      .filter(inst => inst.type === 'loan')
      .flatMap(inst => getProjectedInstallments(inst))
      .filter(p => p.chargeMonth === tMonthStr)
      .reduce((sum, p) => sum + p.monthlyAmount, 0);

    // Credit Card payments paid in this trend month (closing in previous cycle month)
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

  // Active status items
  const totalCreditLimit = creditCards.reduce((sum, c) => sum + c.limit, 0);
  
  // Outstanding current billing balances closing in THIS selectedMonth (unpaid yet, closes this month)
  let pendingClosingCharges = 0;
  const tdcStatementsThisMonth = computeCardStatementsForMonth(creditCards, transactions, installments, selectedMonth);
  tdcStatementsThisMonth.forEach(st => {
    pendingClosingCharges += st.billingBalance;
  });

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">financial planner MZ</h1>
          <p className="text-sm text-slate-500">Panel Ejecutivo de Control - Período: <strong className="text-slate-700">{monthLabel}</strong></p>
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
            <span className="text-xs font-medium uppercase text-slate-400 tracking-wider">Ingresos Totales</span>
            <div className="text-2xl font-semibold text-emerald-600">${monthlyIncomes.toLocaleString()}</div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Sueldos y otros fijos
            </p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Cash Outflows (Real Expenses Paid) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-expenses">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase text-slate-400 tracking-wider">Egresos Reales</span>
            <div className="text-2xl font-semibold text-rose-600">${totalOutflows.toLocaleString()}</div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              Directos, préstamos y TDC
            </p>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Savings */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-savings">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase text-slate-400 tracking-wider">Flujo de Dinero / Ahorro</span>
            <div className={`text-2xl font-semibold ${netSavings >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
              ${netSavings.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <PiggyBank className="w-3 h-3 text-blue-500" />
              Tasa de ahorro: <span className="font-semibold">{savingsRate.toFixed(1)}%</span>
            </div>
          </div>
          <div className={`p-2.5 rounded-lg ${netSavings >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            <PiggyBank className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Pending Card billing closed this month */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="kpi-card-closing">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase text-slate-400 tracking-wider">Cierre TDC del Mes</span>
            <div className="text-2xl font-semibold text-slate-700">${pendingClosingCharges.toLocaleString()}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-slate-400" />
              Deuda de corte a pagar en prox. mes
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg">
            <CreditCard className="w-5 h-5" />
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
              Corresponden a los consumos cerrados al corte de {monthNamesEs[prevMonth - 1]}.
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

        {/* Bank accounts/Debit cards balances info */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 tracking-tight flex items-center justify-between">
              <span>Saldos y Disponibilidad</span>
              <button 
                onClick={() => onNavigate('cuentas')} 
                className="text-xs font-normal text-slate-500 hover:text-slate-800 flex items-center gap-0.5 whitespace-nowrap"
                id="dash-link-accounts"
              >
                Configurar Cuentas <ChevronRight className="w-3 h-3" />
              </button>
            </h2>
            <p className="text-xs text-slate-400 mb-4 py-1.5 px-3 bg-emerald-50/50 rounded-lg text-emerald-800">
              Tus fondos líquidos disponibles y cuentas registradas.
            </p>

            <div className="space-y-3">
              {debitCards.map((bank, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100/50 rounded-md text-emerald-600">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700">{bank.name}</h4>
                      <span className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">Débito / Fondos</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600">${bank.balance.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Disponibilidad líquida total:</span>
            <span className="font-semibold text-emerald-600">
              ${debitCards.reduce((sum, d) => sum + d.balance, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
