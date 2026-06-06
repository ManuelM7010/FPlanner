import { CreditCard, DebitCard, Category, Transaction, InstallmentPurchase } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-housing', name: 'Vivienda', color: '#3B82F6', type: 'expense', icon: 'Home' },
  { id: 'cat-food', name: 'Alimentación', color: '#10B981', type: 'expense', icon: 'Utensils' },
  { id: 'cat-leisure', name: 'Ocio y Entretenimiento', color: '#F59E0B', type: 'expense', icon: 'Sparkles' },
  { id: 'cat-transport', name: 'Transporte', color: '#EF4444', type: 'expense', icon: 'Car' },
  { id: 'cat-health', name: 'Salud', color: '#8B5CF6', type: 'expense', icon: 'HeartPulse' },
  { id: 'cat-education', name: 'Educación', color: '#EC4899', type: 'expense', icon: 'BookOpen' },
  { id: 'cat-beauty', name: 'Cuidado Personal / Salón', color: '#EC4899', type: 'expense', icon: 'Flower' },
  { id: 'cat-salary', name: 'Salario / Ingresos Fijos', color: '#10B981', type: 'income', icon: 'Briefcase' },
  { id: 'cat-freelance', name: 'Trabajo Freelance', color: '#6366F1', type: 'income', icon: 'TrendingUp' },
  { id: 'cat-other', name: 'Otros Gastos', color: '#6B7280', type: 'expense', icon: 'Coins' }
];

export const INITIAL_CREDIT_CARDS: CreditCard[] = [
  {
    id: 'cc-visa-bac',
    name: 'BAC Visa Infinite',
    limit: 5000,
    closingDay: 12,
    dueDay: 6
  },
  {
    id: 'cc-amex',
    name: 'AMEX Elite Card',
    limit: 3000,
    closingDay: 28,
    dueDay: 18
  }
];

export const INITIAL_DEBIT_CARDS: DebitCard[] = [
  {
    id: 'deb-bac-checking',
    name: 'Cuenta Corriente BAC',
    balance: 0
  },
  {
    id: 'deb-cash-pocket',
    name: 'Efectivo',
    balance: 0
  }
];

// Seed dates around 2026-06 (June 2026) to match the system local time environment cleanly
export const INITIAL_TRANSACTIONS: Transaction[] = [
  // Incomes - June 2026
  {
    id: 'tx-salary-1',
    description: 'Salario Quincena 1 Maletín MZ',
    amount: 1800,
    type: 'income',
    category: 'cat-salary',
    paymentMethod: 'transfer',
    cardId: 'deb-bac-checking',
    date: '2026-06-15',
    month: '2026-06',
    isFixed: true
  },
  {
    id: 'tx-salary-2',
    description: 'Salario Quincena 2 Maletín MZ',
    amount: 1800,
    type: 'income',
    category: 'cat-salary',
    paymentMethod: 'transfer',
    cardId: 'deb-bac-checking',
    date: '2026-06-30',
    month: '2026-06',
    isFixed: true
  },
  // Incomes - July 2026 (for future rolling projection check)
  {
    id: 'tx-salary-july-1',
    description: 'Salario Quincena 1 Maletín MZ',
    amount: 1800,
    type: 'income',
    category: 'cat-salary',
    paymentMethod: 'transfer',
    cardId: 'deb-bac-checking',
    date: '2026-07-15',
    month: '2026-07',
    isFixed: true
  },
  // Fixed Expenses
  {
    id: 'tx-rent',
    description: 'Alquiler del Apartamento',
    amount: 900,
    type: 'expense',
    category: 'cat-housing',
    paymentMethod: 'transfer',
    cardId: 'deb-bac-checking',
    date: '2026-06-05',
    month: '2026-06',
    isFixed: true
  },
  {
    id: 'tx-salon-novia',
    description: 'Salón de belleza Novia (Cupo mensual)',
    amount: 80,
    type: 'expense',
    category: 'cat-beauty',
    paymentMethod: 'credit',
    cardId: 'cc-visa-bac',
    date: '2026-06-12', // Falls in cycle closing June 15, paid July 5
    month: '2026-06',
    isFixed: true
  },
  {
    id: 'tx-transport-daily',
    description: 'Gasolina semanal / Transporte diario',
    amount: 120,
    type: 'expense',
    category: 'cat-transport',
    paymentMethod: 'credit',
    cardId: 'cc-visa-bac',
    date: '2026-06-03', // Falls in cycle closing June 15, paid July 5
    month: '2026-06',
    isFixed: false
  },
  {
    id: 'tx-supermarket',
    description: 'Supermercado Mensual',
    amount: 350,
    type: 'expense',
    category: 'cat-food',
    paymentMethod: 'debit',
    cardId: 'deb-bac-checking',
    date: '2026-06-06',
    month: '2026-06',
    isFixed: false
  },
  {
    id: 'tx-netflix',
    description: 'Suscripción Netflix & Spotify',
    amount: 25,
    type: 'expense',
    category: 'cat-leisure',
    paymentMethod: 'credit',
    cardId: 'cc-amex',
    date: '2026-06-25', // Falls in cycle closing June 28, paid July 18
    month: '2026-06',
    isFixed: true
  },
  {
    id: 'tx-cash-lunch',
    description: 'Almuerzos diarios en la oficina (Efectivo)',
    amount: 150,
    type: 'expense',
    category: 'cat-food',
    paymentMethod: 'cash',
    cardId: 'deb-cash-pocket',
    date: '2026-06-10',
    month: '2026-06',
    isFixed: true
  }
];

export const INITIAL_INSTALLMENTS: InstallmentPurchase[] = [
  {
    id: 'inst-reloj',
    description: 'Reloj Garmin Forerunner (Plazos 12m)',
    type: 'credit_card',
    cardId: 'cc-visa-bac',
    totalAmount: 600,
    installments: 12,
    purchaseDate: '2026-04-10',
    firstChargeDate: '2026-04-20', // First charge falls in cycle closing May 15
    monthlyPayment: 50
  },
  {
    id: 'inst-iphone',
    description: 'iPhone 15 Pro Max (Plazos 24m)',
    type: 'credit_card',
    cardId: 'cc-amex',
    totalAmount: 1200,
    installments: 24,
    purchaseDate: '2026-05-02',
    firstChargeDate: '2026-05-10',
    monthlyPayment: 50
  },
  {
    id: 'loan-auto',
    description: 'Préstamo Auto BAC',
    type: 'loan',
    totalAmount: 18000,
    installments: 60,
    purchaseDate: '2025-01-05',
    firstChargeDate: '2025-02-10',
    loanDueDay: 10,  // Pays strictly on the 10th of each month
    monthlyPayment: 300
  }
];
