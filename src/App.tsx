import React, { useState, useEffect, useRef } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, PiggyBank, CreditCard, Wallet, 
  Calendar, Layers, FileText, ChevronLeft, ChevronRight, Download, Upload, 
  Trash2, Plus, Sparkles, Check, HelpCircle, Shield, Menu, X, Landmark, RefreshCw,
  Cloud, CloudOff, Loader2, LogIn, LogOut
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase, CreditCard as CardType, DebitCard as AccountType, Category, Subscription } from './types';
import { 
  INITIAL_CATEGORIES, INITIAL_CREDIT_CARDS, INITIAL_DEBIT_CARDS, 
  INITIAL_TRANSACTIONS, INITIAL_INSTALLMENTS 
} from './data/initialData';

import { getProjectedInstallments, computeMonthlyAccountBalances } from './utils/financeUtils';

// Firebase core integration imports
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logoutUser, saveUserAppState, getUserAppState } from './firebase';

// Component imports
import Dashboard from './components/Dashboard';
import BudgetSection from './components/BudgetSection';
import InstallmentsSection from './components/InstallmentsSection';
import CardsAccountsSection from './components/CardsAccountsSection';
import CardStatementSection from './components/CardStatementSection';
import CalendarSection from './components/CalendarSection';
import AiAdvisorSection from './components/AiAdvisorSection';
import SubscriptionsSection from './components/SubscriptionsSection';

export default function App() {
  // Navigation active tab State
  const [activeTab, setActiveTab ] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Core Financial State loaded from localStorage or seeded default
  const [state, setState] = useState<AppState>(() => {
    const cached = localStorage.getItem('mz_planner_state');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Make sure selectedMonth is initialized if lost
        if (!parsed.selectedMonth) parsed.selectedMonth = '2026-06';
        if (!parsed.subscriptions) parsed.subscriptions = [];
        if (!parsed.deletedGeneratedIds) parsed.deletedGeneratedIds = [];
        
        // Ensure the default "Suscripciones/Planes" category exists to stay robust
        if (parsed.categories) {
          if (!parsed.categories.some((c: any) => c.id === 'cat-subscriptions')) {
            parsed.categories.push({
              id: 'cat-subscriptions',
              name: 'Suscripciones/Planes',
              color: '#6366F1',
              type: 'expense',
              icon: 'Sparkles'
            });
          }
          if (!parsed.categories.some((c: any) => c.id === 'cat-installments')) {
            parsed.categories.push({
              id: 'cat-installments',
              name: 'Cuotas / Préstamos',
              color: '#F43F5E',
              type: 'expense',
              icon: 'Layers'
            });
          }
        }
        return parsed;
      } catch (e) {
        console.error('Failed to restore caching', e);
      }
    }
    return {
      transactions: INITIAL_TRANSACTIONS,
      creditCards: INITIAL_CREDIT_CARDS,
      debitCards: INITIAL_DEBIT_CARDS,
      installments: INITIAL_INSTALLMENTS,
      categories: [
        ...INITIAL_CATEGORIES,
        {
          id: 'cat-subscriptions',
          name: 'Suscripciones/Planes',
          color: '#6366F1',
          type: 'expense',
          icon: 'Sparkles'
        },
        {
          id: 'cat-installments',
          name: 'Cuotas / Préstamos',
          color: '#F43F5E',
          type: 'expense',
          icon: 'Layers'
        }
      ],
      selectedMonth: '2026-06',
      subscriptions: [],
      deletedGeneratedIds: []
    };
  });

  // Firebase Auth & Cloud Synchronization State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showAuthHelpModal, setShowAuthHelpModal] = useState<boolean>(false);
  const [loginErrorDetail, setLoginErrorDetail] = useState<string | null>(null);
  const isInitialLoad = useRef<boolean>(true);

  // Authenticate with Google with cross-origin iframe handling
  const handleSignInGoogle = async () => {
    setSyncError(null);
    setLoginErrorDetail(null);
    const isInsideIframe = window.self !== window.top;
    
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign In Error in component:', err);
      let errorMsg = 'Error al iniciar sesión.';
      if (err?.code === 'auth/popup-blocked') {
        errorMsg = 'Tu navegador bloqueó la ventana emergente de Google. Por favor, permite ventanas emergentes.';
      } else if (err?.code === 'auth/cancelled-popup-request' || err?.message?.includes('cancelled')) {
        errorMsg = 'Inicio de sesión cancelado o interrumpido.';
      } else if (err?.code === 'auth/network-request-failed') {
        errorMsg = 'Error de red. Verifica tu conexión a internet.';
      } else if (isInsideIframe) {
        errorMsg = 'Los navegadores bloquean la autenticación dentro del entorno iframe de desarrollo.';
      }
      setLoginErrorDetail(err?.message || String(err));
      setSyncError(errorMsg);
      setShowAuthHelpModal(true);
    }
  };

  // Monitor Authentication and Load User State from Firestore
  useEffect(() => {
    isInitialLoad.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthLoading(true);
        setSyncError(null);
        try {
          const remoteState = await getUserAppState(currentUser.uid);
          if (remoteState) {
            // Cloud has data! Download and restore safely
            setState(prev => ({
              ...prev,
              ...remoteState,
              categories: remoteState.categories || prev.categories,
              transactions: remoteState.transactions || prev.transactions,
              creditCards: remoteState.creditCards || prev.creditCards,
              debitCards: remoteState.debitCards || prev.debitCards,
              installments: remoteState.installments || prev.installments,
              subscriptions: remoteState.subscriptions || prev.subscriptions,
              deletedGeneratedIds: remoteState.deletedGeneratedIds || prev.deletedGeneratedIds,
              initialBalancesOverrides: remoteState.initialBalancesOverrides || prev.initialBalancesOverrides
            }));
            setLastSyncedTime(new Date());
          } else {
            // No cloud data yet (new user profile). Upload local state so they don't lose anything!
            await saveUserAppState(currentUser.uid, state);
            setLastSyncedTime(new Date());
          }
        } catch (err: any) {
          console.error('Failed to restore from Firestore during login:', err);
          setSyncError('Error al recuperar datos desde la nube.');
        } finally {
          setAuthLoading(false);
          isInitialLoad.current = false;
        }
      } else {
        setAuthLoading(false);
        isInitialLoad.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  // Update browser cache on state change, and auto-sync to Cloud (debounced)
  useEffect(() => {
    localStorage.setItem('mz_planner_state', JSON.stringify(state));

    if (!user || authLoading || isInitialLoad.current) return;

    const timer = setTimeout(async () => {
      setSyncing(true);
      setSyncError(null);
      try {
        await saveUserAppState(user.uid, state);
        setLastSyncedTime(new Date());
      } catch (err: any) {
        console.error('Cloud auto-sync failed:', err);
        setSyncError('Sincronización de nube fallida.');
      } finally {
        setSyncing(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [state, user, authLoading]);

  // Synchronize Subscriptions and Installments -> Proactively auto-populate transactions across ALL configured months
  useEffect(() => {
    setState(prev => {
      const currentTxList = [...prev.transactions];
      let subsList = prev.subscriptions || [];
      const instsList = prev.installments || [];
      
      let changed = false;

      // Auto-initialize months of the current viewed year of selectedMonth if a subscription has not had defaults initialized for this year
      const targetYearStr = prev.selectedMonth.split('-')[0];
      let updatedSubsList = [...subsList];
      
      subsList.forEach((s, sIdx) => {
        const initializedYears = s.initializedYears || [];
        if (!initializedYears.includes(targetYearStr)) {
          const defaultMonths = Array.from({ length: 12 }, (_, i) => {
            const mNum = String(i + 1).padStart(2, '0');
            return `${targetYearStr}-${mNum}`;
          });
          updatedSubsList[sIdx] = {
            ...s,
            activeMonths: Array.from(new Set([...s.activeMonths, ...defaultMonths])),
            initializedYears: [...initializedYears, targetYearStr]
          };
          changed = true;
        }
      });
      
      if (changed) {
        subsList = updatedSubsList;
      }

      // 1. Remove transactions of subscriptions that no longer exist or are inactive in that month
      let updatedTxs = currentTxList.filter(t => {
        if (t.subscriptionId) {
          const sub = subsList.find(s => s.id === t.subscriptionId);
          if (!sub) {
            changed = true;
            return false; // delete since subscription template was deleted
          }
          const isMonthActive = sub.activeMonths.includes(t.month);
          if (!isMonthActive) {
            changed = true;
            return false; // delete since month is no longer active for this subscription
          }
        }
        return true;
      });

      // 2. Add or update missing transactions for all active months of subscriptions
      subsList.forEach(s => {
        s.activeMonths.forEach(mStr => {
          const stableId = `sub-tx-${s.id}-${mStr}`;
          const isDeletedPermanently = (prev.deletedGeneratedIds || []).includes(stableId);
          if (isDeletedPermanently) {
            return; // Skip recreation!
          }
          const alreadyExists = updatedTxs.some(t => t.subscriptionId === s.id && t.month === mStr);
          if (!alreadyExists) {
            const dayStr = String(s.dayOfMonth).padStart(2, '0');
            const targetDate = `${mStr}-${dayStr}`;
            
            updatedTxs.push({
              id: stableId, // Stable static ID based on subscription and month
              description: s.name,
              amount: s.amount,
              type: 'expense',
              category: s.category || 'cat-subscriptions',
              paymentMethod: s.paymentMethod,
              cardId: s.cardId,
              date: targetDate,
              month: mStr,
              isFixed: true,
              subscriptionId: s.id
            });
            changed = true;
          } else {
            // Update transaction fields if subscription changed (e.g. name, amount, category, paymentMethod, cardId)
            updatedTxs = updatedTxs.map(t => {
              if (t.subscriptionId === s.id && t.month === mStr) {
                const dayStr = String(s.dayOfMonth).padStart(2, '0');
                const targetDate = `${mStr}-${dayStr}`;
                if (
                  t.description !== s.name ||
                  t.amount !== s.amount ||
                  t.category !== s.category ||
                  t.paymentMethod !== s.paymentMethod ||
                  t.cardId !== s.cardId ||
                  t.date !== targetDate
                ) {
                  changed = true;
                  return {
                    ...t,
                    description: s.name,
                    amount: s.amount,
                    category: s.category || 'cat-subscriptions',
                    paymentMethod: s.paymentMethod,
                    cardId: s.cardId,
                    date: targetDate
                  };
                }
              }
              return t;
            });
          }
        });
      });

      // 3. Remove transactions of credit card installments or loans that no longer exist
      updatedTxs = updatedTxs.filter(t => {
        if (t.installmentId) {
          const inst = instsList.find(i => i.id === t.installmentId);
          if (!inst) {
            changed = true;
            return false; // deleted
          }
          // Check if this month is still projected in the active schedule
          const projected = getProjectedInstallments(inst);
          const hasProjectedMonth = projected.some(p => p.chargeMonth === t.month);
          if (!hasProjectedMonth) {
            changed = true;
            return false; // no longer part of active installments sequence
          }
        }
        return true;
      });

      // 4. Add or update transactions for projected installments
      instsList.forEach(inst => {
        const projected = getProjectedInstallments(inst);
        projected.forEach(proj => {
          const stableId = `inst-tx-${inst.id}-${proj.chargeMonth}`;
          const isDeletedPermanently = (prev.deletedGeneratedIds || []).includes(stableId);
          if (isDeletedPermanently) {
            return; // Skip recreation!
          }
          const alreadyExists = updatedTxs.some(t => t.installmentId === inst.id && t.month === proj.chargeMonth);
          if (!alreadyExists) {
            updatedTxs.push({
              id: stableId,
              description: `${inst.description} (${proj.installmentIndex}/${inst.installments})`,
              amount: inst.monthlyPayment,
              type: 'expense',
              category: 'cat-installments',
              paymentMethod: inst.type === 'credit_card' ? 'credit' : 'debit',
              cardId: inst.cardId,
              date: proj.chargeDate,
              month: proj.chargeMonth,
              isFixed: true,
              installmentId: inst.id,
              installmentIndex: proj.installmentIndex
            });
            changed = true;
          } else {
            // Update fields if changed
            updatedTxs = updatedTxs.map(t => {
              if (t.installmentId === inst.id && t.month === proj.chargeMonth) {
                const expectedDesc = `${inst.description} (${proj.installmentIndex}/${inst.installments})`;
                const expectedPaymentMethod = inst.type === 'credit_card' ? 'credit' : 'debit';
                if (
                  t.description !== expectedDesc ||
                  t.amount !== inst.monthlyPayment ||
                  t.paymentMethod !== expectedPaymentMethod ||
                  t.cardId !== inst.cardId ||
                  t.date !== proj.chargeDate
                ) {
                  changed = true;
                  return {
                    ...t,
                    description: expectedDesc,
                    amount: inst.monthlyPayment,
                    paymentMethod: expectedPaymentMethod,
                    cardId: inst.cardId,
                    date: proj.chargeDate
                  };
                }
              }
              return t;
            });
          }
        });
      });

      if (!changed) return prev;

      return {
        ...prev,
        subscriptions: subsList,
        transactions: updatedTxs
      };
    });
  }, [state.subscriptions, state.installments, state.selectedMonth]);

  // Dynamic available months based on selectedYear of state.selectedMonth
  const [currentYearStr, currentMonthStr] = state.selectedMonth.split('-');
  const currentYear = parseInt(currentYearStr, 10);

  const availableMonths = Array.from({ length: 12 }, (_, i) => {
    const monthNum = String(i + 1).padStart(2, '0');
    return `${currentYearStr}-${monthNum}`;
  });

  const monthNamesEs = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  // Quick switch month helpers with seamless crossover into neighboring years
  const handlePrevMonth = () => {
    const [y, m] = state.selectedMonth.split('-');
    let monthNum = parseInt(m, 10);
    let yearNum = parseInt(y, 10);
    
    monthNum -= 1;
    if (monthNum < 1) {
      monthNum = 12;
      yearNum -= 1;
    }
    
    const newMonth = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    setState(prev => ({ ...prev, selectedMonth: newMonth }));
  };

  const handleNextMonth = () => {
    const [y, m] = state.selectedMonth.split('-');
    let monthNum = parseInt(m, 10);
    let yearNum = parseInt(y, 10);
    
    monthNum += 1;
    if (monthNum > 12) {
      monthNum = 1;
      yearNum += 1;
    }
    
    const newMonth = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    setState(prev => ({ ...prev, selectedMonth: newMonth }));
  };

  // 1. Transactions Actions (Adding, Deleting) with dynamic rolling balance
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const id = `tx-${Date.now()}`;
    const txToAdd: Transaction = { id, ...newTx };

    setState(prev => {
      return {
        ...prev,
        transactions: [txToAdd, ...prev.transactions]
      };
    });
  };

  const handleDeleteTransaction = (id: string) => {
    setState(prev => {
      const match = prev.transactions.find(t => t.id === id);
      if (!match) return prev;

      let updatedSubs = prev.subscriptions || [];
      const newDeletedIds = [...(prev.deletedGeneratedIds || [])];

      if (match.subscriptionId) {
        // Deactivate this month from the matching subscription template
        updatedSubs = updatedSubs.map(s => {
          if (s.id === match.subscriptionId) {
            return {
              ...s,
              activeMonths: s.activeMonths.filter(m => m !== match.month)
            };
          }
          return s;
        });

        // Track stable ID to prevent resurrection
        const stableId = `sub-tx-${match.subscriptionId}-${match.month}`;
        if (!newDeletedIds.includes(stableId)) {
          newDeletedIds.push(stableId);
        }
      } else if (match.installmentId && match.month) {
        // Track stable ID to prevent resurrection of deleted installment charges
        const stableId = `inst-tx-${match.installmentId}-${match.month}`;
        if (!newDeletedIds.includes(stableId)) {
          newDeletedIds.push(stableId);
        }
      }

      return {
        ...prev,
        subscriptions: updatedSubs,
        deletedGeneratedIds: newDeletedIds,
        transactions: prev.transactions.filter(t => t.id !== id)
      };
    });
  };

  // 2. Installments and Loan actions
  const handleAddInstallment = (newItem: Omit<InstallmentPurchase, 'id'>) => {
    const id = `inst-${Date.now()}`;
    setState(prev => ({
      ...prev,
      installments: [...prev.installments, { id, ...newItem }]
    }));
  };

  const handleDeleteInstallment = (id: string) => {
    setState(prev => ({
      ...prev,
      installments: prev.installments.filter(item => item.id !== id)
    }));
  };

  // 2.5 Subscription Actions
  const handleAddSubscription = (newSub: Omit<Subscription, 'id'>) => {
    const id = `sub-${Date.now()}`;
    const targetYearStr = state.selectedMonth.split('-')[0];
    const subWithId: Subscription = { 
      id, 
      ...newSub,
      initializedYears: [targetYearStr]
    };
    setState(prev => {
      const generatedTxs: Transaction[] = subWithId.activeMonths.map(mStr => {
        const dayStr = String(subWithId.dayOfMonth).padStart(2, '0');
        const targetDate = `${mStr}-${dayStr}`;
        return {
          id: `sub-tx-${subWithId.id}-${mStr}`, // Stable static ID based on subscription and month
          description: subWithId.name,
          amount: subWithId.amount,
          type: 'expense',
          category: subWithId.category || 'cat-subscriptions',
          paymentMethod: subWithId.paymentMethod,
          cardId: subWithId.cardId,
          date: targetDate,
          month: mStr,
          isFixed: true,
          subscriptionId: subWithId.id
        };
      });

      return {
        ...prev,
        subscriptions: [...(prev.subscriptions || []), subWithId],
        transactions: [...generatedTxs, ...prev.transactions]
      };
    });
  };

  const handleDeleteSubscription = (id: string) => {
    setState(prev => {
      // Also remove any of its generated transactions in the transactions state to stay super clean
      const cleanedTransactions = prev.transactions.filter(t => t.subscriptionId !== id);
      return {
        ...prev,
        transactions: cleanedTransactions,
        subscriptions: (prev.subscriptions || []).filter(s => s.id !== id)
      };
    });
  };

  const handleToggleSubscriptionMonth = (id: string, monthStr: string) => {
    setState(prev => {
      const stableId = `sub-tx-${id}-${monthStr}`;
      const isCurrentlyActive = (prev.subscriptions || []).find(s => s.id === id)?.activeMonths.includes(monthStr);

      const newDeletedIds = isCurrentlyActive
        ? [...(prev.deletedGeneratedIds || []), stableId]
        : (prev.deletedGeneratedIds || []).filter(dId => dId !== stableId);

      const updatedSubs = (prev.subscriptions || []).map(s => {
        if (s.id === id) {
          const activeMonths = isCurrentlyActive
            ? s.activeMonths.filter(m => m !== monthStr)
            : [...s.activeMonths, monthStr];
          const yStr = monthStr.split('-')[0];
          const initializedYears = s.initializedYears || [];
          const updatedYears = initializedYears.includes(yStr)
            ? initializedYears
            : [...initializedYears, yStr];
          return { ...s, activeMonths, initializedYears: updatedYears };
        }
        return s;
      });

      // If deactivated, we automatically prune the generated transaction instance for this month from ledger
      // If activated, we append the generated transaction instance synchronously
      let updatedTransactions = [...prev.transactions];
      const sub = (prev.subscriptions || []).find(s => s.id === id);
      if (sub) {
        if (isCurrentlyActive) {
          // turning off, let's delete the transaction instance
          updatedTransactions = prev.transactions.filter(t => !(t.subscriptionId === id && t.month === monthStr));
        } else {
          // turning ON, let's add the transaction instance synchronously
          const dayStr = String(sub.dayOfMonth).padStart(2, '0');
          const targetDate = `${monthStr}-${dayStr}`;
          updatedTransactions.push({
            id: stableId,
            description: sub.name,
            amount: sub.amount,
            type: 'expense',
            category: sub.category || 'cat-subscriptions',
            paymentMethod: sub.paymentMethod,
            cardId: sub.cardId,
            date: targetDate,
            month: monthStr,
            isFixed: true,
            subscriptionId: sub.id
          });
        }
      }

      return {
        ...prev,
        subscriptions: updatedSubs,
        deletedGeneratedIds: newDeletedIds,
        transactions: updatedTransactions
      };
    });
  };

  const handleUpdateTransaction = (id: string, updated: Partial<Transaction>) => {
    setState(prev => {
      const match = prev.transactions.find(t => t.id === id);
      if (!match) return prev;

      // Handle custom adjustments (date index change, description changes, etc.)
      const updatedTx = { ...match, ...updated };

      // Make sure if date YYYY-MM-DD changed, its "month" is updated if crossed over
      if (updated.date) {
        const parts = updated.date.split('-');
        if (parts.length >= 2) {
          updatedTx.month = `${parts[0]}-${parts[1]}`;
        }
      }

      return {
        ...prev,
        transactions: prev.transactions.map(t => t.id === id ? updatedTx : t)
      };
    });
  };

  // 3. Card Configuration Actions
  const handleAddCreditCard = (newCard: Omit<CardType, 'id'>) => {
    const id = `cc-${Date.now()}`;
    setState(prev => ({
      ...prev,
      creditCards: [...prev.creditCards, { id, ...newCard }]
    }));
  };

  const handleDeleteCreditCard = (id: string) => {
    setState(prev => ({
      ...prev,
      creditCards: prev.creditCards.filter(c => c.id !== id)
    }));
  };

  // 4. Debit Accounts Actions
  const handleAddDebitCard = (newAcc: Omit<AccountType, 'id'>) => {
    const id = `deb-${Date.now()}`;
    setState(prev => ({
      ...prev,
      debitCards: [...prev.debitCards, { id, ...newAcc }]
    }));
  };

  const handleDeleteDebitCard = (id: string) => {
    setState(prev => ({
      ...prev,
      debitCards: prev.debitCards.filter(d => d.id !== id)
    }));
  };

  const handleUpdateDebitCardBalance = (id: string, newBalance: number) => {
    setState(prev => {
      const flows = computeMonthlyAccountBalances(prev.debitCards, prev.transactions, prev.creditCards, prev.installments, prev.selectedMonth, prev.initialBalancesOverrides);
      const flow = flows[id];
      let diff = 0;
      if (flow) {
        diff = newBalance - flow.finalBalance;
      } else {
        const found = prev.debitCards.find(d => d.id === id);
        if (found) {
          diff = newBalance - found.balance;
        }
      }

      if (diff === 0) return prev;

      const dateStr = new Date().toISOString().split('T')[0];
      const yearMonth = prev.selectedMonth;
      const dayStr = dateStr.startsWith(yearMonth) ? dateStr.split('-')[2] : '01';
      const adjustmentDate = `${yearMonth}-${dayStr}`;

      const adjustmentTx: Transaction = {
        id: `tx-adjust-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        description: 'Ajuste de Saldo',
        amount: Number(Math.abs(diff).toFixed(2)),
        type: diff > 0 ? 'income' : 'expense',
        category: 'cat-other',
        paymentMethod: id === 'deb-cash-pocket' ? 'cash' : 'transfer',
        cardId: id,
        date: adjustmentDate,
        month: yearMonth,
        isFixed: false
      };

      const updatedDebitCards = prev.debitCards.map(d => {
        if (d.id === id) {
          return { ...d, balance: Number((d.balance + diff).toFixed(2)) };
        }
        return d;
      });

      return {
        ...prev,
        debitCards: updatedDebitCards,
        transactions: [...prev.transactions, adjustmentTx]
      };
    });
  };

  const handleUpdateDebitCardInitialBalance = (id: string, month: string, newInitialBalance: number) => {
    setState(prev => {
      const overrides = { ...(prev.initialBalancesOverrides || {}) };
      if (!overrides[id]) {
        overrides[id] = {};
      }
      overrides[id] = {
        ...overrides[id],
        [month]: Number(newInitialBalance)
      };
      return {
        ...prev,
        initialBalancesOverrides: overrides
      };
    });
  };

  // 5. Category adder
  const handleAddCategory = (newCat: Category) => {
    setState(prev => ({
      ...prev,
      categories: [...prev.categories, newCat]
    }));
  };

  // 6. JSON Export and Backup helper
  const handleExportBackup = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(state, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `financial_planner_mz_backup_${state.selectedMonth}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 7. JSON Import and Restore helper
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.transactions && parsed.creditCards && parsed.debitCards) {
            setState(parsed);
            alert('¡Copia de seguridad restaurada con éxito!');
          } else {
            alert('El archivo JSON especificado no tiene el formato de Financial Planner MZ.');
          }
        } catch (err) {
          alert('Error al analizar archivo de copia de seguridad.');
        }
      };
    }
  };

  const handleResetToDefault = () => {
    const confirm = window.confirm('¿Está seguro de querer restaurar los datos de fábrica? Perderá los cambios no exportados.');
    if (confirm) {
      localStorage.removeItem('mz_planner_state');
      setState({
        transactions: INITIAL_TRANSACTIONS,
        creditCards: INITIAL_CREDIT_CARDS,
        debitCards: INITIAL_DEBIT_CARDS,
        installments: INITIAL_INSTALLMENTS,
        categories: INITIAL_CATEGORIES,
        selectedMonth: '2026-06'
      });
    }
  };

  // Current month label for visual summary
  const getSelectedMonthName = () => {
    const idx = availableMonths.indexOf(state.selectedMonth);
    const mNum = parseInt(state.selectedMonth.split('-')[1], 10);
    const yearNum = state.selectedMonth.split('-')[0];
    const spanishNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${spanishNames[mNum - 1]} ${yearNum}`;
  };

  // Render sub-sections dynamically
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard state={state} onNavigate={(sect) => { setActiveTab(sect); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />;
      case 'presupuesto':
        return (
          <BudgetSection 
            state={state} 
            onAddTransaction={handleAddTransaction} 
            onDeleteTransaction={handleDeleteTransaction}
            onAddCategory={handleAddCategory}
            onUpdateTransaction={handleUpdateTransaction}
          />
        );
      case 'suscripciones':
        return (
          <SubscriptionsSection 
            state={state}
            onAddSubscription={handleAddSubscription}
            onDeleteSubscription={handleDeleteSubscription}
            onToggleSubscriptionMonth={handleToggleSubscriptionMonth}
          />
        );
      case 'plazos':
        return (
          <InstallmentsSection 
            state={state} 
            onAddInstallment={handleAddInstallment} 
            onDeleteInstallment={handleDeleteInstallment}
          />
        );
      case 'cuentas':
        return (
          <CardsAccountsSection 
            state={state}
            onAddCreditCard={handleAddCreditCard}
            onDeleteCreditCard={handleDeleteCreditCard}
            onAddDebitCard={handleAddDebitCard}
            onDeleteDebitCard={handleDeleteDebitCard}
            onUpdateDebitCardBalance={handleUpdateDebitCardBalance}
            onUpdateDebitCardInitialBalance={handleUpdateDebitCardInitialBalance}
          />
        );
      case 'estado-cuenta':
        return <CardStatementSection state={state} />;
      case 'calendario':
        return <CalendarSection state={state} />;
      case 'asesor-ia':
        return <AiAdvisorSection state={state} />;
      default:
        return (
          <Dashboard 
            state={state} 
            onNavigate={setActiveTab} 
            onUpdateDebitCardInitialBalance={handleUpdateDebitCardInitialBalance}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="main-app-container">
      {/* Dynamic Upper Top Bar header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 shrink-0 select-none z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          
          {/* Logo Name */}
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-lg text-white">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-[15px] tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-350">
                Financial Planner MZ
              </span>
              <span className="hidden sm:inline-block text-[10px] text-indigo-400 font-mono tracking-widest pl-2 block leading-none">
                APP & PLANNED CONTROLLER
              </span>
            </div>
          </div>

          {/* Persistent backup/restore commands */}
          <div className="hidden md:flex items-center gap-2.5 text-xs">
            <button 
              onClick={handleExportBackup}
              className="p-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all font-medium flex items-center gap-1.5 border border-slate-700/50"
              title="Exportar archivo de copia de seguridad JSON"
              id="header-export-btn"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Copia
            </button>
            <label 
              htmlFor="backup-file-upload" 
              className="p-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all font-medium flex items-center gap-1.5 border border-slate-700/50 cursor-pointer"
              title="Importar y restaurar desde archivo JSON"
            >
              <Upload className="w-3.5 h-3.5" /> Importar Copia
              <input 
                id="backup-file-upload"
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
            <button 
              onClick={handleResetToDefault}
              className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
              title="Restaurar valores de muestra de fábrica"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex items-center gap-2 md:hidden">
            <button 
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="p-1.5 hover:bg-slate-800 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </header>

      {/* Synchronization & Auth Bar */}
      <div className="bg-slate-800 border-b border-slate-700 py-2.5 px-4 select-none text-xs text-white z-30 font-sans shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status info */}
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            {user ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-semibold text-slate-200">
                  Sincronizado como <strong className="text-white font-bold">{user.displayName || user.email}</strong>
                </span>
                {syncing ? (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-400" /> Sincronizando...
                  </span>
                ) : lastSyncedTime ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 shrink-0 font-mono">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" /> Último guardado: {lastSyncedTime.toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 shrink-0 font-mono">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" /> Guardado en la nube
                  </span>
                )}
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span className="font-medium text-slate-300 flex items-center gap-1.5 shrink-0">
                  <CloudOff className="w-3.5 h-3.5 text-amber-405 text-amber-400" /> Modo Local (No Sincronizado)
                </span>
                <span className="text-[10px] text-slate-400 hidden lg:inline">
                  &bull; ¡Inicia sesión con Google para proteger tus registros y compartirlos entre tu teléfono y PC!
                </span>
              </>
            )}
            {syncError && <span className="text-rose-450 text-[10px] font-bold shrink-0">⚠️ {syncError}</span>}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            {authLoading ? (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> Verificando...
              </span>
            ) : user ? (
              <button
                onClick={logoutUser}
                className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-650 text-slate-200 hover:text-white transition-all font-bold flex items-center gap-1 border border-slate-600 cursor-pointer text-[11px]"
              >
                <LogOut className="w-3 h-3" /> Cerrar Sesión
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAuthHelpModal(true)}
                  className="text-[10px] text-slate-400 hover:text-indigo-300 font-medium underline cursor-pointer pr-1"
                >
                  ¿Problemas para entrar?
                </button>
                <button
                  onClick={handleSignInGoogle}
                  className="px-3 py-1 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold flex items-center gap-1.5 shadow-sm hover:shadow transition-all border border-emerald-500/30 cursor-pointer text-[11px] uppercase tracking-wide"
                >
                  <LogIn className="w-3.5 h-3.5" /> Sincronizar con Google
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Month selections slider block - "Y en pestañas mes a mes." */}
      <div className="bg-slate-850 text-white py-1.5 px-4 border-b border-slate-800 font-medium text-xs select-none shadow-inner z-20 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Quick year selection dropdown */}
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-850 border border-slate-700/60 px-2.5 py-1 rounded-lg">
            <span className="text-[10px] text-slate-400 font-sans font-bold">AÑO:</span>
            <select
              value={currentYear}
              onChange={(e) => {
                const newYear = e.target.value;
                setState(prev => {
                  const [y, m] = prev.selectedMonth.split('-');
                  return { ...prev, selectedMonth: `${newYear}-${m}` };
                });
              }}
              className="bg-transparent border-none text-white font-extrabold text-xs focus:ring-0 cursor-pointer outline-none p-0 pr-1"
              id="year-select-dropdown"
            >
              <option value="2025" className="bg-slate-900 text-white">2025</option>
              <option value="2026" className="bg-slate-900 text-white">2026</option>
              <option value="2027" className="bg-slate-900 text-white">2027</option>
              <option value="2028" className="bg-slate-900 text-white">2028</option>
              <option value="2029" className="bg-slate-900 text-white">2029</option>
              <option value="2030" className="bg-slate-900 text-white">2030</option>
            </select>
          </div>

          <div className="flex-1 w-full flex items-center justify-between gap-3">
            <button 
              onClick={handlePrevMonth} 
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all duration-150 active:scale-95 shrink-0"
              id="month-prev-btn"
              title="Mes Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Large dynamic tab sheet of Months of the current year */}
            <div className="flex-1 overflow-x-auto scrollbar-hide flex justify-start md:justify-center items-center gap-1 py-1 px-1">
              {availableMonths.map((mVal) => {
                const active = state.selectedMonth === mVal;
                const [mYear, mMonth] = mVal.split('-');
                const isDefaultMonth = mVal === '2026-06';
                return (
                  <button
                    key={mVal}
                    onClick={() => setState(prev => ({ ...prev, selectedMonth: mVal }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider ${active ? 'bg-indigo-650 text-white shadow-md font-extrabold scale-[1.03]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'}`}
                  >
                    {monthNamesEs[parseInt(mMonth, 10) - 1]}
                    {isDefaultMonth && <span className="text-[8px] bg-indigo-500 text-white px-1 py-0.2 rounded-sm ml-1 text-normal lowercase tracking-normal">hoy</span>}
                  </button>
                );
              })}
            </div>

            <button 
              onClick={handleNextMonth} 
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all duration-150 active:scale-95 shrink-0"
              id="month-next-btn"
              title="Mes Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Main Body frame */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row p-4 md:p-6 gap-6 relative min-h-0">
        
        {/* Navigation Sidebar Drawer */}
        <aside className={`${mobileMenuOpen ? 'flex translate-x-0' : 'hidden md:flex'} flex-col gap-1.5 w-full md:w-60 bg-white md:bg-transparent p-4 md:p-0 rounded-xl border border-slate-100 md:border-0 fixed md:static inset-x-4 top-36 shadow-lg md:shadow-none z-30 transition-transform flex-shrink-0 select-none`}>
          <div className="p-3 bg-slate-900 text-white rounded-xl mb-4 text-xs font-medium flex items-center gap-3">
            <img src="/icon.svg" className="w-9 h-9 rounded-lg border border-slate-800 shrink-0" alt="MZ Planner Icon" referrerPolicy="no-referrer" />
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase text-indigo-400 tracking-wider font-bold block">Periodo de Trabajo</span>
              <span className="text-sm font-bold text-white block">{getSelectedMonthName()}</span>
            </div>
          </div>

          <span className="text-[9px] font-bold uppercase text-slate-400 tracking-widest px-2 block mt-1 pb-1 border-b border-slate-100 mb-1">Módulos MZ</span>

          <nav className="space-y-1 text-xs font-semibold">
            <button 
              onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'dashboard' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-dashboard"
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                DASHBOARD GRÁFICO
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('asesor-ia'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'asesor-ia' ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white font-bold shadow-xs' : 'text-indigo-650 bg-indigo-50/55 hover:bg-indigo-50 hover:text-indigo-950 border border-indigo-100/50'}`}
              id="nav-tab-ai-advisor"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                ASESOR / COACH IA
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60 text-indigo-500" />
            </button>

            <button 
              onClick={() => { setActiveTab('presupuesto'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'presupuesto' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-budget"
            >
              <span className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                PRESUPUESTO Mensual
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('suscripciones'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'suscripciones' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-subscriptions"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                SUSCRIPCIONES / PLANES
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('plazos'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'plazos' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-installments"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                COMPRAS a Plazos / Préstamos
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('cuentas'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'cuentas' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-cuentas"
            >
              <span className="flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                TARJETAS y Cuentas
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('estado-cuenta'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'estado-cuenta' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-statements"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                ESTADO de Cuenta TDC
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button 
              onClick={() => { setActiveTab('calendario'); setMobileMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${activeTab === 'calendario' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              id="nav-tab-calendar"
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                CALENDARIO de Pagos
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>
          </nav>

          <span className="text-[9px] font-bold uppercase text-slate-400 tracking-widest px-2 block mt-4 pb-1 border-b border-slate-100 mb-1">Mantenimiento</span>

          <div className="p-3 bg-slate-50 border border-slate-100 text-slate-500 rounded-lg text-[10px] font-semibold space-y-2 select-none md:hidden flex flex-col">
            <button 
              onClick={() => { handleExportBackup(); setMobileMenuOpen(false); }} 
              className="text-left py-1 hover:text-slate-800 flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Exportar Copia JSON
            </button>
            <label className="text-left py-1 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
              <Upload className="w-3 h-3" /> Importar Copia JSON
              <input 
                type="file"
                accept=".json"
                onChange={(e) => { handleImportBackup(e); setMobileMenuOpen(false); }}
                className="hidden"
              />
            </label>
            <button 
              onClick={() => { handleResetToDefault(); setMobileMenuOpen(false); }} 
              className="text-left py-1 text-slate-400 hover:text-rose-500 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reiniciar Fábrica
            </button>
          </div>

          <div className="p-3 bg-gradient-to-br from-slate-50 to-indigo-50/20 border border-slate-100 text-slate-500 rounded-lg text-[10px] leading-relaxed select-none hidden md:block">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              {user ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Respaldo de Nube Activo</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-blue-500" />
                  <span>Seguridad Local</span>
                </>
              )}
            </div>
            <p className="mt-1 font-medium leading-normal">
              {user 
                ? "Tus datos financieros están protegidos en la nube de Firebase, quedando asegurados ante cualquier reinicio del servidor o cambio de dispositivo."
                : "Tus datos se guardan temporalmente en tu navegador. Inicia sesión con tu cuenta de Google arriba para proteger tus registros en la nube."}
            </p>
          </div>
        </aside>

        {/* Content Board Section */}
        <main className="flex-1 min-w-0 bg-transparent">
          {renderTabContent()}
        </main>

      </div>

      {showAuthHelpModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative animate-in fade-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-400" />
                <h3 className="text-white font-bold text-sm tracking-tight">Soporte de Autenticación y Sincronización</h3>
              </div>
              <button 
                onClick={() => setShowAuthHelpModal(false)}
                className="text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-slate-300 text-xs select-text">
              <p className="font-semibold text-white text-[13px]">
                ¿Por qué no me deja iniciar sesión directamente aquí?
              </p>
              
              <p className="leading-relaxed text-slate-300">
                La vista previa de Google AI Studio se ejecuta dentro de un <strong className="text-indigo-300">cuadro aislado (iframe)</strong>. Por tu seguridad, los navegadores modernos como Google Chrome, Safari y Edge bloquean la comunicación de cookies de terceros y el almacenamiento dentro de estos cuadros. Esto impide que el popup de Google complete la conexión en esta pantallita.
              </p>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 shadow-inner">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Solución en 2 simples pasos:
                </h4>
                <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
                  <li>
                    Abre la aplicación en una pestaña propia haciendo clic en el botón de abajo (<strong className="text-white">Abrir en Nueva Pestaña 🚀</strong>) o usando el botón de abrir (↗️) en la esquina superior derecha de la vista previa de AI Studio.
                  </li>
                  <li>
                    En la nueva pestaña, haz clic en el botón <strong className="text-emerald-400">Sincronizar con Google</strong> e inicia sesión de forma segura.
                  </li>
                </ol>
              </div>

              <p className="leading-relaxed text-[11px] text-slate-400">
                Una vez iniciada tu sesión en la pestaña independiente, podrás usar la aplicación indistintamente desde tu celular como un acceso directo (short cut) o tu computadora, ¡y todos tus registros se mantendrán sincronizados en tiempo real y a salvo de reinicios de servidores!
              </p>

              {loginErrorDetail && (
                <div className="mt-3">
                  <details className="text-[10px] text-slate-500 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 select-all">
                    <summary className="cursor-pointer font-bold text-[10px] text-slate-400 outline-none select-none">Detalles técnicos del error (Debug)</summary>
                    <p className="mt-1.5 overflow-x-auto whitespace-pre-wrap">{loginErrorDetail}</p>
                  </details>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="bg-slate-950 px-6 py-4 border-t border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => setShowAuthHelpModal(false)}
                className="w-full sm:w-auto px-4 py-2 text-slate-400 hover:text-white font-semibold transition-all text-center cursor-pointer order-last sm:order-first text-[11px]"
              >
                Cerrar Ayuda
              </button>
              
              <button
                onClick={() => {
                  window.open(window.location.origin, '_blank');
                  setShowAuthHelpModal(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold rounded-xl transition-all shadow-md hover:shadow-indigo-500/20 hover:scale-[1.02] flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider cursor-pointer"
              >
                <span>Abrir en Nueva Pestaña 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Humble aesthetic page footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-500 text-center py-4 select-none mt-auto text-[11px] font-semibold shrink-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} Financial Planner MZ. Todos los derechos reservados.</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
            Diseño Ejecutivo &bull; Proyección Fiel de Tarjetas
          </span>
        </div>
      </footer>
    </div>
  );
}
