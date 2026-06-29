import { CreditCard, InstallmentPurchase, Transaction } from '../types';

export interface CardCycleInfo {
  statementClosingDate: string; // YYYY-MM-DD
  paymentDueDate: string;       // YYYY-MM-DD
  billingMonth: string;         // YYYY-MM (closing month)
  paymentMonth: string;         // YYYY-MM (payment month)
}

/**
 * Calculates statement closing date and payment due date for a credit card transaction.
 */
export function getCardCycle(dateStr: string, closingDay: number, dueDay: number): CardCycleInfo {
  // We use noon hours to prevent timezone offsets shifting the date
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  let closingYear = year;
  let closingMonth = month;

  if (day > closingDay) {
    closingMonth += 1;
    if (closingMonth > 11) {
      closingMonth = 0;
      closingYear += 1;
    }
  }

  // Calculate actual closing date
  const closingDate = new Date(closingYear, closingMonth, closingDay, 12, 0, 0);

  // Due date is usually in the month following the closing date
  let dueYear = closingYear;
  let dueMonth = closingMonth + 1;
  if (dueMonth > 11) {
    dueMonth = 0;
    dueYear += 1;
  }

  const dueDate = new Date(dueYear, dueMonth, dueDay, 12, 0, 0);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  return {
    statementClosingDate: formatDate(closingDate),
    paymentDueDate: formatDate(dueDate),
    billingMonth: `${closingYear}-${String(closingMonth + 1).padStart(2, '0')}`,
    paymentMonth: `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}`,
  };
}

/**
 * Calculates statement closing with potential overrides for a specific card and transaction date.
 */
export function getCardCycleForCard(card: CreditCard, dateStr: string): CardCycleInfo {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-indexed
  const day = parseInt(parts[2], 10);

  // Determine current transaction month override
  const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;
  const overrideCurrent = card.overrides?.[currentMonthStr];
  const estClosingDay = overrideCurrent?.closingDay ?? card.closingDay;

  let finalClosingDay = card.closingDay;
  let finalDueDay = card.dueDay;

  if (day > estClosingDay) {
    // Flows into following month's cycle
    let targetMonth = month + 1;
    let targetYear = year;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    const nextMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const overrideNext = card.overrides?.[nextMonthStr];
    finalClosingDay = overrideNext?.closingDay ?? card.closingDay;
    finalDueDay = overrideNext?.dueDay ?? card.dueDay;
  } else {
    // Remains in current month's cycle
    finalClosingDay = estClosingDay;
    finalDueDay = overrideCurrent?.dueDay ?? card.dueDay;
  }

  return getCardCycle(dateStr, finalClosingDay, finalDueDay);
}

export interface ProjectedInstallment {
  installmentId: string;
  installmentIndex: number; // 1-based index (e.g. 1 of 12)
  totalAmountCharged: number;
  monthlyAmount: number;
  chargeDate: string; // YYYY-MM-DD
  chargeMonth: string; // YYYY-MM
  description: string;
  type: 'credit_card' | 'loan';
  cardId?: string;
  loanDueDay?: number;
}

/**
 * Generates all projected installments for a purchase.
 */
export function getProjectedInstallments(purchase: InstallmentPurchase): ProjectedInstallment[] {
  const list: ProjectedInstallment[] = [];
  const parts = (purchase.purchaseDate || purchase.firstChargeDate).split('-');
  if (parts.length !== 3) return [];

  const startYear = parseInt(parts[0], 10);
  const startMonth = parseInt(parts[1], 10) - 1; // 0-indexed
  const startDay = parseInt(parts[2], 10);

  for (let i = 0; i < purchase.installments; i++) {
    let currMonth = startMonth + i;
    let currYear = startYear;

    if (currMonth > 11) {
      currYear += Math.floor(currMonth / 12);
      currMonth = currMonth % 12;
    }

    // Handle day overflow (e.g., month has only 30 days but startDay is 31)
    const maxDays = new Date(currYear, currMonth + 1, 0).getDate();
    const actualDay = Math.min(startDay, maxDays);

    const chargeDateObj = new Date(currYear, currMonth, actualDay, 12, 0, 0);
    const y = chargeDateObj.getFullYear();
    const m = String(chargeDateObj.getMonth() + 1).padStart(2, '0');
    const dStr = String(chargeDateObj.getDate()).padStart(2, '0');

    const chargeDate = `${y}-${m}-${dStr}`;
    const chargeMonth = `${y}-${m}`;

    list.push({
      installmentId: purchase.id,
      installmentIndex: i + 1,
      totalAmountCharged: purchase.totalAmount,
      monthlyAmount: purchase.monthlyPayment,
      chargeDate,
      chargeMonth,
      description: purchase.description,
      type: purchase.type,
      cardId: purchase.cardId,
      loanDueDay: purchase.loanDueDay,
    });
  }

  return list;
}

export interface CardBillingPeriod {
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  startDateEs: string;  // Spanish verbal format
  endDateEs: string;    // Spanish verbal format
}

/**
 * Calculates the exact start and end dates of a billing cycle.
 */
export function getBillingPeriodDates(billingMonth: string, closingDay: number): CardBillingPeriod {
  const parts = billingMonth.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed

  // End date is closingDay of this billing month
  const endDate = new Date(year, month, closingDay, 12, 0, 0);
  
  // Previous closing date is closingDay of the previous month
  const prevClosingDate = new Date(year, month - 1, closingDay, 12, 0, 0);
  // Start date is 1 day after the previous closing date
  const startDate = new Date(prevClosingDate);
  startDate.setDate(startDate.getDate() + 1);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  const formatDateEs = (d: Date) => {
    const monthNamesEs = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${d.getDate()} de ${monthNamesEs[d.getMonth()]} de ${d.getFullYear()}`;
  };

  return {
    startDateStr: formatDate(startDate),
    endDateStr: formatDate(endDate),
    startDateEs: formatDateEs(startDate),
    endDateEs: formatDateEs(endDate)
  };
}

/**
 * Calculates credit card statements (statements closing and due payments)
 * based on transactions and projected installment charges.
 */
export interface CardStatementSummary {
  cardId: string;
  cardName: string;
  limit: number;
  closingDateStr: string;   // closing date in target month YYYY-MM-DD
  paymentDueDateStr: string; // payment due date in following month YYYY-MM-DD
  closingMonth: string;      // YYYY-MM for state grouping
  paymentMonth: string;      // YYYY-MM when payment is paid
  billingBalance: number;    // balance closing in this month statement
  detailedCharges: {
    id: string;
    description: string;
    amount: number;
    date: string;
    isInstallment: boolean;
    installmentIndex?: string; // (e.g. "3/12")
  }[];
}

export function computeCardStatementsForMonth(
  cards: CreditCard[],
  transactions: Transaction[],
  installments: InstallmentPurchase[],
  targetBillingMonth: string, // YYYY-MM
  paidCardStatements?: Record<string, any>
): CardStatementSummary[] {
  const summaries: CardStatementSummary[] = [];

  const targetParts = targetBillingMonth.split('-');
  const targetYear = parseInt(targetParts[0], 10);
  const targetMonth = parseInt(targetParts[1], 10); // 1-indexed

  cards.forEach(card => {
    // Determine closing config of this card in targetMonth
    const override = card.overrides?.[targetBillingMonth];
    const closingDayVal = override?.closingDay ?? card.closingDay;
    const dueDayVal = override?.dueDay ?? card.dueDay;

    const closingDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(closingDayVal).padStart(2, '0')}`;
    
    // Find due date corresponding to this closing cycle
    const cycleInfo = getCardCycle(closingDateStr, closingDayVal, dueDayVal);

    const detailedCharges: CardStatementSummary['detailedCharges'] = [];
    let billingBalance = 0;

    // 1. Regular Credit Card transactions that fall into this closing cycle
    transactions.forEach(t => {
      if (t.paymentMethod === 'credit' && t.cardId === card.id && !t.installmentId) {
        // Enforce 2026 baseline constraint
        if (t.date >= '2026-01-01') {
          const tCycle = getCardCycleForCard(card, t.date);
          // If it closes in the targetBillingMonth
          if (tCycle.billingMonth === targetBillingMonth) {
            detailedCharges.push({
              id: t.id,
              description: t.description,
              amount: t.amount,
              date: t.date,
              isInstallment: false
            });
            billingBalance += t.amount;
          }
        }
      }
    });

    // 2. Installments on credit cards that fall into this closing cycle
    installments.forEach(purchase => {
      if (purchase.type === 'credit_card' && purchase.cardId === card.id) {
        const projected = getProjectedInstallments(purchase);
        projected.forEach(proj => {
          // Enforce 2026 baseline constraint
          if (proj.chargeDate >= '2026-01-01') {
            const tCycle = getCardCycleForCard(card, proj.chargeDate);
            if (tCycle.billingMonth === targetBillingMonth) {
              detailedCharges.push({
                id: `${purchase.id}-inst-${proj.installmentIndex}`,
                description: purchase.description,
                amount: proj.monthlyAmount,
                date: proj.chargeDate,
                isInstallment: true,
                installmentIndex: `${proj.installmentIndex}/${purchase.installments}`
              });
              billingBalance += proj.monthlyAmount;
            }
          }
        });
      }
    });

    // 3. Carryover unpaid balance + interest from previous cycle if partial payment recorded
    if (paidCardStatements) {
      let pYr = targetYear;
      let pM = targetMonth - 1;
      if (pM === 0) { pM = 12; pYr -= 1; }
      const prevMStr = `${pYr}-${String(pM).padStart(2, '0')}`;
      const prevRec = paidCardStatements[`${card.id}_${prevMStr}`];
      if (prevRec && !prevRec.isPaid && prevRec.paidAmount !== undefined) {
        const prevStmts = computeCardStatementsForMonth(cards, transactions, installments, prevMStr, paidCardStatements);
        const matchPrev = prevStmts.find(s => s.cardId === card.id);
        if (matchPrev) {
          const unpaidPrincipal = Math.max(0, matchPrev.billingBalance - prevRec.paidAmount);
          const interest = prevRec.projectedInterest || 0;
          if (unpaidPrincipal + interest > 0) {
            detailedCharges.push({
              id: `carryover-${card.id}-${prevMStr}`,
              description: `Saldo Pendiente ($${unpaidPrincipal.toFixed(2)}) + Interés proyectado ($${interest.toFixed(2)}) de Corte ${prevMStr}`,
              amount: unpaidPrincipal + interest,
              date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`,
              isInstallment: false
            });
            billingBalance += (unpaidPrincipal + interest);
          }
        }
      }
    }

    summaries.push({
      cardId: card.id,
      cardName: card.name,
      limit: card.limit,
      closingDateStr: cycleInfo.statementClosingDate,
      paymentDueDateStr: cycleInfo.paymentDueDate,
      closingMonth: targetBillingMonth,
      paymentMonth: cycleInfo.paymentMonth,
      billingBalance,
      detailedCharges: detailedCharges.sort((a,b) => a.date.localeCompare(b.date))
    });
  });

  return summaries;
}

export interface MonthlyAccountFlow {
  cardId: string;
  cardName: string;
  initialBalance: number;
  incomes: number;
  expenses: number;
  finalBalance: number;
}

/**
 * Calculates month-by-month starting and ending balances for bank accounts (debit cards)
 * by rolling forward cashflows starting from January 2025.
 */
export function computeMonthlyAccountBalances(
  debitCards: any[],
  transactions: Transaction[],
  creditCards: CreditCard[],
  installments: InstallmentPurchase[],
  targetMonth: string, // YYYY-MM
  initialBalancesOverrides?: Record<string, Record<string, number>>,
  paidCardStatements?: Record<string, any>
): Record<string, MonthlyAccountFlow> {
  const [targetYearStr, targetMonthStr] = targetMonth.split('-');
  const targetYear = parseInt(targetYearStr, 10);
  const targetMonthNum = parseInt(targetMonthStr, 10);

  // Initialize the balances of all cards to 0 at the start of original timeline (January 2026)
  const currentBalances: Record<string, number> = {};
  debitCards.forEach(d => {
    currentBalances[d.id] = 0;
  });

  const flows: Record<string, MonthlyAccountFlow> = {};

  // Dynamically set starting point to avoid infinite loops, but default starting point is 2206-01, here we always start from month 1 to ensure proper rollover.
  const startYear = Math.min(2026, targetYear);
  const startMonth = 1;

  let currentYear = startYear;
  let currentMonth = startMonth;

  while (true) {
    const activeMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // Apply overriding starting balances for this month if specified
    debitCards.forEach(d => {
      if (initialBalancesOverrides?.[d.id]?.[activeMonthStr] !== undefined) {
        currentBalances[d.id] = initialBalancesOverrides[d.id][activeMonthStr];
      }
    });

    const monthIncomes: Record<string, number> = {};
    const monthExpenses: Record<string, number> = {};

    debitCards.forEach(d => {
      monthIncomes[d.id] = 0;
      monthExpenses[d.id] = 0;
    });

    // Sum transactions for this month
    transactions.forEach(t => {
      if (t.month === activeMonthStr) {
        let cid = t.cardId;
        if (!cid) {
          if (t.paymentMethod === 'cash') {
            const cashAcc = debitCards.find(d => d.id === 'deb-cash-pocket' || d.name.toLowerCase().includes('efectivo') || d.name.toLowerCase().includes('cash'));
            if (cashAcc) {
              cid = cashAcc.id;
            } else if (debitCards.length > 0) {
              cid = debitCards[0].id;
            }
          } else {
            const checkingAcc = debitCards.find(d => d.id !== 'deb-cash-pocket' && !d.name.toLowerCase().includes('efectivo'));
            if (checkingAcc) {
              cid = checkingAcc.id;
            } else if (debitCards.length > 0) {
              cid = debitCards[0].id;
            }
          }
        }

        // Asegurar que para todas las transacciones de tipo Ingreso, se asocie con una tarjeta de débito/cuenta física real
        if (t.type === 'income') {
          const isDebit = debitCards.some(d => d.id === cid);
          if (!isDebit) {
            if (t.paymentMethod === 'cash') {
              const cashAcc = debitCards.find(d => d.id === 'deb-cash-pocket' || d.name.toLowerCase().includes('efectivo') || d.name.toLowerCase().includes('cash'));
              cid = cashAcc ? cashAcc.id : (debitCards[0]?.id || cid);
            } else {
              const checkingAcc = debitCards.find(d => d.id !== 'deb-cash-pocket' && !d.name.toLowerCase().includes('efectivo')) || debitCards[0];
              cid = checkingAcc ? checkingAcc.id : (debitCards[0]?.id || cid);
            }
          }
        }

        if (cid) {
          if (t.type === 'income') {
            monthIncomes[cid] = (monthIncomes[cid] || 0) + t.amount;
          } else if (t.type === 'expense' && (t.paymentMethod === 'debit' || t.paymentMethod === 'transfer' || t.paymentMethod === 'cash')) {
            // Evitar doble conteo: si la transacción proviene de una cuota de préstamo, se calcula por separado de manera automática abajo
            if (t.installmentId) {
              const inst = installments.find(i => i.id === t.installmentId);
              if (inst && inst.type === 'loan') {
                return;
              }
            }
            monthExpenses[cid] = (monthExpenses[cid] || 0) + t.amount;
          }
        }
      }
    });

    // Apply automated loans and credit card payments to the checking account to reflect real cash outflows
    const checkingAcc = debitCards.find(d => d.id === 'deb-bac-checking') || debitCards.find(d => d.id !== 'deb-cash-pocket') || debitCards[0];
    if (checkingAcc) {
      // 1. Loans paid in this active period
      const activeLoansList = installments.filter(inst => inst.type === 'loan');
      const loanPayments = activeLoansList
        .flatMap(inst => getProjectedInstallments(inst))
        .filter(proj => proj.chargeMonth === activeMonthStr)
        .reduce((sum, p) => sum + p.monthlyAmount, 0);

      // 2. Credit Card payments due in this active period (statement closed in the previous month)
      const [mY, mMonth] = activeMonthStr.split('-');
      let prevYr = parseInt(mY, 10);
      let prevM = parseInt(mMonth, 10) - 1;
      if (prevM === 0) {
        prevM = 12;
        prevYr -= 1;
      }
      const prevMStr = `${prevYr}-${String(prevM).padStart(2, '0')}`;
      const prevStatements = computeCardStatementsForMonth(creditCards, transactions, installments, prevMStr, paidCardStatements);
      const ccCardPaymentsDue = prevStatements.reduce((sum, s) => {
        const keyStat = paidCardStatements?.[`${s.cardId}_${prevMStr}`];
        if (keyStat?.isPaid) {
          return sum + s.billingBalance;
        } else if (keyStat?.paidAmount !== undefined) {
          return sum + keyStat.paidAmount;
        }
        return sum + s.billingBalance;
      }, 0);

      // Add to expenses of the primary checking account
      monthExpenses[checkingAcc.id] = (monthExpenses[checkingAcc.id] || 0) + loanPayments + ccCardPaymentsDue;
    }

    debitCards.forEach(d => {
      const initBal = currentBalances[d.id] || 0;
      const inc = monthIncomes[d.id] || 0;
      const exp = monthExpenses[d.id] || 0;
      const finBal = initBal + inc - exp;

      if (activeMonthStr === targetMonth) {
        flows[d.id] = {
          cardId: d.id,
          cardName: d.name,
          initialBalance: Number(initBal.toFixed(2)),
          incomes: Number(inc.toFixed(2)),
          expenses: Number(exp.toFixed(2)),
          finalBalance: Number(finBal.toFixed(2))
        };
      }

      // Roll forward balance
      currentBalances[d.id] = finBal;
    });

    if (currentYear === targetYear && currentMonth === targetMonthNum) {
      break;
    }

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return flows;
}

