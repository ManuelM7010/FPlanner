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
  const parts = purchase.firstChargeDate.split('-');
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
  targetBillingMonth: string // YYYY-MM
): CardStatementSummary[] {
  const summaries: CardStatementSummary[] = [];

  const targetParts = targetBillingMonth.split('-');
  const targetYear = parseInt(targetParts[0], 10);
  const targetMonth = parseInt(targetParts[1], 10); // 1-indexed

  cards.forEach(card => {
    // Determine closing date of this card in targetMonth
    const closingDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(card.closingDay).padStart(2, '0')}`;
    
    // Find due date corresponding to this closing cycle
    const cycleInfo = getCardCycle(closingDateStr, card.closingDay, card.dueDay);

    const detailedCharges: CardStatementSummary['detailedCharges'] = [];
    let billingBalance = 0;

    // 1. Regular Credit Card transactions that fall into this closing cycle
    transactions.forEach(t => {
      if (t.paymentMethod === 'credit' && t.cardId === card.id) {
        const tCycle = getCardCycle(t.date, card.closingDay, card.dueDay);
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
    });

    // 2. Installments on credit cards that fall into this closing cycle
    installments.forEach(purchase => {
      if (purchase.type === 'credit_card' && purchase.cardId === card.id) {
        const projected = getProjectedInstallments(purchase);
        projected.forEach(proj => {
          const tCycle = getCardCycle(proj.chargeDate, card.closingDay, card.dueDay);
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
        });
      }
    });

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
