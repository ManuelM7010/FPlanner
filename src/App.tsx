import React, { useState, useEffect } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, PiggyBank, CreditCard, Wallet, 
  Calendar, Layers, FileText, ChevronLeft, ChevronRight, Download, Upload, 
  Trash2, Plus, Sparkles, Check, HelpCircle, Shield, Menu, X, Landmark, RefreshCw
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase, CreditCard as CardType, DebitCard as AccountType, Category, Subscription } from './types';
import { 
  INITIAL_CATEGORIES, INITIAL_CREDIT_CARDS, INITIAL_DEBIT_CARDS, 
  INITIAL_TRANSACTIONS, INITIAL_INSTALLMENTS 
} from './data/initialData';

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
  const [activeTab, setActiveTab] = useState<string>('dashboard');
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
        
        // Ensure the default "Suscripciones/Planes" category exists to stay robust
        if (parsed.categories && !parsed.categories.some((c: any) => c.id === 'cat-subscriptions')) {
          parsed.categories.push({
            id: 'cat-subscriptions',
            name: 'Suscripciones/Planes',
            color: '#6366F1',
            type: 'expense',
            icon: 'Sparkles'
          });
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
        }
      ],
      selectedMonth: '2026-06',
      subscriptions: []
    };
  });

  // Keep state updated inside local cache
  useEffect(() => {
    localStorage.setItem('mz_planner_state', JSON.stringify(state));
  }, [state]);

  // Synchronize Subscriptions -> Auto-populate transactions for current selectedMonth
  useEffect(() => {
    const subs = state.subscriptions || [];
    if (subs.length === 0) return;

    const currentSubscriptions = subs.filter(s => 
      s.activeMonths.includes(state.selectedMonth)
    );

    const missingSubs = currentSubscriptions.filter(s => 
      !state.transactions.some(t => t.subscriptionId === s.id && t.month === state.selectedMonth)
    );

    if (missingSubs.length > 0) {
      setState(prev => {
        const currentTxList = [...prev.transactions];
        const newTxs: Transaction[] = [];

        missingSubs.forEach(s => {
          const alreadyExists = currentTxList.some(t => t.subscriptionId === s.id && t.month === prev.selectedMonth) || 
                                newTxs.some(t => t.subscriptionId === s.id && t.month === prev.selectedMonth);
          
          if (!alreadyExists) {
            const dayStr = String(s.dayOfMonth).padStart(2, '0');
            const targetDate = `${prev.selectedMonth}-${dayStr}`;
            
            newTxs.push({
              id: `sub-tx-${s.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              description: s.name,
              amount: s.amount,
              type: 'expense',
              category: s.category,
              paymentMethod: s.paymentMethod,
              cardId: s.cardId,
              date: targetDate,
              month: prev.selectedMonth,
              isFixed: true,
              subscriptionId: s.id
            });
          }
        });

        if (newTxs.length === 0) return prev;

        return {
          ...prev,
          transactions: [...prev.transactions, ...newTxs]
        };
      });
    }
  }, [state.selectedMonth, state.subscriptions, state.transactions]);

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

  // 1. Transactions Actions (Adding, Deleting) with Dual Balance deducer
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const id = `tx-${Date.now()}`;
    const txToAdd: Transaction = { id, ...newTx };

    setState(prev => {
      // Automatic balance impact calculation for Debit Card or Bank Transfers
      let updatedDebitCards = [...prev.debitCards];
      if (txToAdd.paymentMethod === 'debit' || txToAdd.paymentMethod === 'transfer') {
        updatedDebitCards = prev.debitCards.map(deb => {
          if (deb.id === txToAdd.cardId) {
            const delta = txToAdd.type === 'expense' ? -txToAdd.amount : txToAdd.amount;
            return { ...deb, balance: +(deb.balance + delta).toFixed(2) };
          }
          return deb;
        });
      }

      return {
        ...prev,
        transactions: [txToAdd, ...prev.transactions],
        debitCards: updatedDebitCards
      };
    });
  };

  const handleDeleteTransaction = (id: string) => {
    setState(prev => {
      const match = prev.transactions.find(t => t.id === id);
      if (!match) return prev;

      // Reverse balance deduction if deleting direct account expense
      let updatedDebitCards = [...prev.debitCards];
      if (match.paymentMethod === 'debit' || match.paymentMethod === 'transfer') {
        updatedDebitCards = prev.debitCards.map(deb => {
          if (deb.id === match.cardId) {
            const reverseDelta = match.type === 'expense' ? match.amount : -match.amount;
            return { ...deb, balance: +(deb.balance + reverseDelta).toFixed(2) };
          }
          return deb;
        });
      }

      return {
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id),
        debitCards: updatedDebitCards
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
    setState(prev => ({
      ...prev,
      subscriptions: [...(prev.subscriptions || []), { id, ...newSub }]
    }));
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
      const updatedSubs = (prev.subscriptions || []).map(s => {
        if (s.id === id) {
          const isCurrentlyActive = s.activeMonths.includes(monthStr);
          const activeMonths = isCurrentlyActive
            ? s.activeMonths.filter(m => m !== monthStr)
            : [...s.activeMonths, monthStr];
          return { ...s, activeMonths };
        }
        return s;
      });

      // If deactivated, we automatically prune the generated transaction instance for this month from ledger
      let updatedTransactions = [...prev.transactions];
      const sub = (prev.subscriptions || []).find(s => s.id === id);
      if (sub) {
        const isCurrentlyActive = sub.activeMonths.includes(monthStr);
        if (isCurrentlyActive) {
          // turning off, let's delete the transaction instance
          updatedTransactions = prev.transactions.filter(t => !(t.subscriptionId === id && t.month === monthStr));
        }
      }

      return {
        ...prev,
        subscriptions: updatedSubs,
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
    setState(prev => ({
      ...prev,
      debitCards: prev.debitCards.map(d => d.id === id ? { ...d, balance: newBalance } : d)
    }));
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
          />
        );
      case 'estado-cuenta':
        return <CardStatementSection state={state} />;
      case 'calendario':
        return <CalendarSection state={state} />;
      case 'asesor-ia':
        return <AiAdvisorSection state={state} />;
      default:
        return <Dashboard state={state} onNavigate={setActiveTab} />;
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
          <div className="p-3.5 bg-slate-900 text-white rounded-xl mb-4 text-xs font-medium space-y-1">
            <span className="text-[10px] uppercase text-slate-400 tracking-wider font-semibold block">Periodo de Trabajo</span>
            <span className="text-sm font-bold text-white block">{getSelectedMonthName()}</span>
            <span className="text-[9px] text-slate-400 font-mono block">Financial Planner MZ Engine</span>
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

          <div className="p-3 bg-slate-50 border border-slate-100 text-slate-500 rounded-lg text-[10px] leading-relaxed select-none hidden md:block">
            <div className="flex items-center gap-1 font-bold text-slate-700">
              <Shield className="w-3.5 h-3.5 text-blue-500" /> Seguridad Local
            </div>
            <p className="mt-1 font-medium">Sus datos se guardan estrictamente en su navegador. No se envía información financiera a servidores externos.</p>
          </div>
        </aside>

        {/* Content Board Section */}
        <main className="flex-1 min-w-0 bg-transparent">
          {renderTabContent()}
        </main>

      </div>

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
