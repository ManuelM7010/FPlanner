export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number; // Day of the month (e.g., 15)
  dueDay: number;     // Day of the month (e.g., 5 of next month)
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

export interface AppState {
  transactions: Transaction[];
  creditCards: CreditCard[];
  debitCards: DebitCard[];
  installments: InstallmentPurchase[];
  categories: Category[];
  selectedMonth: string; // YYYY-MM
}
