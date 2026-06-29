export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number; // Day of the month (e.g., 15)
  dueDay: number;     // Day of the month (e.g., 5 of next month)
  overrides?: Record<string, { closingDay: number; dueDay: number }>; // Local monthly overrides (YYYY-MM)
}

export interface DebitCard {
  id: string;
  name: string;
  balance: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'debit' | 'credit';

export interface Category {
  id: string;
  name: string;
  color: string;
  type: 'income' | 'expense';
  icon?: string;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string; // ID of the category or name
  paymentMethod: PaymentMethod;
  cardId?: string; // Links to credit or debit card ID
  date: string;    // YYYY-MM-DD
  month: string;   // YYYY-MM (budget month classification)
  isFixed: boolean;
  subscriptionId?: string; // Links back to subscription template
  installmentId?: string;  // Links back to installment/loan purchase template
  installmentIndex?: number; // e.g., 3 (Cuota 3/12)
  notes?: string; // Comentario opcional / Conciliación
}

export interface InstallmentPurchase {
  id: string;
  description: string;
  type: 'credit_card' | 'loan';
  cardId?: string;       // For credit card purchases
  totalAmount: number;
  installments: number;   // Total number of installments (months)
  purchaseDate: string;   // YYYY-MM-DD
  firstChargeDate: string;// YYYY-MM-DD (when the first installment appears)
  loanDueDay?: number;    // Specific monthly day of payment for loans
  monthlyPayment: number; // Payment amount per month
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  category: string; // ID of category
  paymentMethod: PaymentMethod;
  cardId?: string; // Links to card or account ID
  dayOfMonth: number; // 1-31
  activeMonths: string[]; // List of YYYY-MM month strings
  initializedYears?: string[]; // Track which years have had their defaults generated
}

export interface CardPaymentRecord {
  isPaid: boolean;
  paidAmount?: number;
  interestMode?: 'pct' | 'amount';
  interestRatePct?: number;
  projectedInterest?: number;
}

export interface AppState {
  transactions: Transaction[];
  creditCards: CreditCard[];
  debitCards: DebitCard[];
  installments: InstallmentPurchase[];
  categories: Category[];
  selectedMonth: string; // YYYY-MM
  subscriptions?: Subscription[]; // Lists user subscription planes templates
  deletedGeneratedIds?: string[]; // Track permanently deleted automatic transactions
  initialBalancesOverrides?: Record<string, Record<string, number>>; // cardId -> YYYY-MM -> initialBalance
  paidCardStatements?: Record<string, CardPaymentRecord>; // `${cardId}_${billingMonth}` -> status
}

