import React, { useState } from 'react';
import { 
  Plus, Trash2, Calendar, FileText, DollarSign, Wallet, CreditCard, 
  Tag, Info, Check, Sparkles, FolderPlus, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';
import { AppState, Transaction, PaymentMethod, Category } from '../types';
import { computeMonthlyAccountBalances } from '../utils/financeUtils';

interface BudgetSectionProps {
  state: AppState;
  onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
  onDeleteTransaction: (id: string) => void;
  onAddCategory: (cat: Category) => void;
  onUpdateTransaction?: (id: string, updated: Partial<Transaction>) => void;
}

export default function BudgetSection({ 
  state, 
  onAddTransaction, 
  onDeleteTransaction, 
  onAddCategory,
  onUpdateTransaction
}: BudgetSectionProps) {
  const { transactions, creditCards, debitCards, categories, selectedMonth, installments } = state;

  // Computar saldos acumulados de cuentas de forma dinámica para el período seleccionado
  const accountFlows = computeMonthlyAccountBalances(debitCards, transactions, creditCards, installments, selectedMonth, state.initialBalancesOverrides);

  // Inline editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string>('');
  const [editingAmount, setEditingAmount] = useState<string>('');
  const [editingDescription, setEditingDescription] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethod>('cash');
  const [editingCardId, setEditingCardId] = useState<string>('');

  // Filter States
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('all');
  const [selectedFilterAsset, setSelectedFilterAsset] = useState<string>('all');

  // Local form states
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cardId, setCardId] = useState('');
  const [date, setDate] = useState(() => {
    // Default to the selected month's first day or current date matching selectedMonth
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (todayStr.startsWith(selectedMonth)) {
      return todayStr;
    }
    return `${selectedMonth}-01`;
  });
  const [isFixed, setIsFixed] = useState(false);

  // Custom Category form state
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3B82F6');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');

  // Filter transactions for the selected month
  const monthlyTransactions = transactions.filter(t => t.month === selectedMonth);
  const monthlyIncomes = monthlyTransactions.filter(t => t.type === 'income');
  const monthlyExpenses = monthlyTransactions.filter(t => t.type === 'expense');

  // Define today's date in local time YYYY-MM-DD and filter today's transactions
  const todayStr = (() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();
  const todayTransactions = monthlyTransactions.filter(t => t.date === todayStr);

  // Autoselect category based on first item of filtered list when type shifts
  React.useEffect(() => {
    const defaultOfCurrentType = categories.find(c => c.type === type);
    if (defaultOfCurrentType) {
      setCategory(defaultOfCurrentType.id);
    }
  }, [type, categories]);

  // Handle transaction submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || parseFloat(amount) <= 0) {
      alert('Por favor ingrese un nombre y un monto válido.');
      return;
    }

    // Determine the month of the transaction based on its date
    const dateParts = date.split('-');
    const txMonth = `${dateParts[0]}-${dateParts[1]}`;

    onAddTransaction({
      description: description.trim(),
      amount: parseFloat(amount),
      type,
      category,
      paymentMethod,
      cardId: (paymentMethod === 'credit' || paymentMethod === 'debit' || paymentMethod === 'transfer') ? cardId : undefined,
      date,
      month: txMonth, // Dynamic classification
      isFixed
    });

    // Reset fields
    setDescription('');
    setAmount('');
    setIsFixed(false);
  };

  // Handle custom category creation
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const id = `cat-custom-${Date.now()}`;
    onAddCategory({
      id,
      name: newCatName.trim(),
      color: newCatColor,
      type: newCatType
    });

    setNewCatName('');
    setShowNewCatModal(false);
    setCategory(id); // Select original
  };

  // Helper labels
  const paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia Bancaria',
    debit: 'Tarjeta de Débito',
    credit: 'Tarjeta de Crédito'
  };

  // Get active linked assets/cards list based on paymentMethod
  const getSubAccountOptions = () => {
    if (paymentMethod === 'credit') {
      return creditCards;
    } else if (paymentMethod === 'debit' || paymentMethod === 'transfer') {
      return debitCards;
    }
    return [];
  };

  // Select default subaccount when payment method changes
  React.useEffect(() => {
    const options = getSubAccountOptions();
    if (options.length > 0) {
      setCardId(options[0].id);
    } else {
      setCardId('');
    }
  }, [paymentMethod]);

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'today'>('all');

  const filteredList = monthlyTransactions.filter(t => {
    // 1. Filter by transaction type or date
    if (filterType !== 'all') {
      if (filterType === 'today') {
        if (t.date !== todayStr) return false;
      } else {
        if (t.type !== filterType) return false;
      }
    }

    // 2. Filter by Category
    if (selectedFilterCategory !== 'all' && t.category !== selectedFilterCategory) return false;

    // 3. Filter by Pago / Vínculo
    if (selectedFilterAsset !== 'all') {
      if (selectedFilterAsset === 'cash') {
        return t.paymentMethod === 'cash';
      }
      if (selectedFilterAsset === 'transfer_no_card') {
        return t.paymentMethod === 'transfer' && !t.cardId;
      }
      if (selectedFilterAsset.startsWith('debit-')) {
        const id = selectedFilterAsset.replace('debit-', '');
        return (t.paymentMethod === 'debit' || t.paymentMethod === 'transfer') && t.cardId === id;
      }
      if (selectedFilterAsset.startsWith('credit-')) {
        const id = selectedFilterAsset.replace('credit-', '');
        return t.paymentMethod === 'credit' && t.cardId === id;
      }
    }
    return true;
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="budget-section">
      {/* Creation form on Left/Top */}
      <div className="xl:col-span-1 space-y-6">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              <Plus className="w-4 h-4 text-slate-600" />
              <span>Registrar Movimiento</span>
            </h2>
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
              <button 
                type="button"
                onClick={() => setType('expense')}
                className={`px-3 py-1.5 rounded-md transition-all ${type === 'expense' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Gasto
              </button>
              <button 
                type="button"
                onClick={() => setType('income')}
                className={`px-3 py-1.5 rounded-md transition-all ${type === 'income' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Ingreso
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium text-slate-700">
            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="tx-desc" className="flex items-center gap-1.5 text-slate-500">
                <FileText className="w-3.5 h-3.5" /> Concepto / Descripción
              </label>
              <input 
                id="tx-desc"
                type="text"
                placeholder="Ej. Súper / Salario Quincenal / Peluquería"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal text-slate-800"
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label htmlFor="tx-amount" className="flex items-center gap-1.5 text-slate-500">
                <DollarSign className="w-3.5 h-3.5" /> Monto ($ USD)
              </label>
              <input 
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold text-slate-800"
                required
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label htmlFor="tx-date" className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-3.5 h-3.5" /> Fecha
              </label>
              <input 
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal text-slate-850"
                required
              />
            </div>

            {/* Category selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="tx-cat" className="flex items-center gap-1.5 text-slate-500">
                  <Tag className="w-3.5 h-3.5" /> Categoría
                </label>
                <button 
                  type="button" 
                  onClick={() => {
                    setNewCatType(type);
                    setShowNewCatModal(true);
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                >
                  <FolderPlus className="w-2.5 h-2.5" /> Nueva Categoría
                </button>
              </div>
              <select 
                id="tx-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-800 font-normal"
                required
              >
                {categories.filter(c => c.type === type).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label htmlFor="tx-method" className="flex items-center gap-1.5 text-slate-500">
                <Wallet className="w-3.5 h-3.5" /> Método de Pago
              </label>
              <select 
                id="tx-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-800 font-normal"
                required
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia Bancaria</option>
                <option value="debit">Tarjeta de Débito (Cuenta)</option>
                <option value="credit">Tarjeta de Crédito</option>
              </select>
            </div>

            {/* Interactive Dynamic Sub-Account connection (TDC/Debit) */}
            {getSubAccountOptions().length > 0 && (
              <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                <label htmlFor="tx-sub-acc" className="flex items-center gap-1.5 text-slate-500">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" /> 
                  Vincular a: {paymentMethod === 'credit' ? 'Tarjeta de Crédito' : 'Cuenta/Débito'}
                </label>
                <select 
                  id="tx-sub-acc"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-800 font-normal"
                  required
                >
                  {getSubAccountOptions().map(opt => {
                    const balanceText = paymentMethod === 'credit' 
                      ? `Límite: $${(opt as any).limit}` 
                      : `Saldo: $${(accountFlows[opt.id]?.finalBalance ?? (opt as any).balance).toLocaleString()}`;
                    return (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({balanceText})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Fixed Expenses check */}
            <div className="flex items-center gap-2 pt-1">
              <input 
                id="tx-fixed"
                type="checkbox"
                checked={isFixed}
                onChange={(e) => setIsFixed(e.target.checked)}
                className="w-4 h-4 text-slate-700 bg-slate-100 border-slate-300 rounded-md focus:ring-slate-400 text-xs"
              />
              <label htmlFor="tx-fixed" className="text-slate-600 select-none cursor-pointer flex items-center gap-1">
                ¿Es un flujo fijo o recurrente? 
                <span className="text-[10px] text-slate-400">(Ej. Alquiler, Salario, Colegio)</span>
              </label>
            </div>

            <button 
              type="submit"
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-all shadow-xs flex items-center justify-center gap-1"
              id="tx-submit-button"
            >
              <Check className="w-4 h-4" /> Guardar en {selectedMonth}
            </button>
          </form>
        </div>
      </div>

      {/* Transactions list on Right (Widescreen) */}
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 mb-4 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Presupuesto del Período ({selectedMonth})</h2>
              <p className="text-[11px] text-slate-400 font-medium">Lista de movimientos y flujos registrados</p>
            </div>

            {/* Type filters */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold self-start sm:self-auto">
              <button 
                onClick={() => setFilterType('all')} 
                className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'all' ? 'bg-white text-slate-800 shadow-xs shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Todos ({monthlyTransactions.length})
              </button>
              <button 
                onClick={() => setFilterType('income')} 
                className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'income' ? 'bg-white text-slate-800 shadow-xs shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Ingresos ({monthlyIncomes.length})
              </button>
              <button 
                onClick={() => setFilterType('expense')} 
                className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'expense' ? 'bg-white text-slate-800 shadow-xs shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Gastos ({monthlyExpenses.length})
              </button>
              <button 
                onClick={() => setFilterType('today')} 
                className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'today' ? 'bg-white text-slate-800 shadow-xs shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Hoy ({todayTransactions.length})
              </button>
            </div>
          </div>

          {/* Dynamic Category and Account Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-slate-50/60 p-3 rounded-lg border border-slate-100/70">
            {/* Category Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide font-extrabold text-slate-400 block">Filtrar por Categoría</label>
              <select
                value={selectedFilterCategory}
                onChange={(e) => setSelectedFilterCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal text-slate-755"
              >
                <option value="all">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'income' ? '🟢' : '🔴'} {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Asset / Vínculo Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide font-extrabold text-slate-400 block">Filtrar por Pago / Vínculo</label>
              <select
                value={selectedFilterAsset}
                onChange={(e) => setSelectedFilterAsset(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal text-slate-755"
              >
                <option value="all">Todos los pagos/vínculos</option>
                <option value="cash">💵 Solo Efectivo</option>
                <option value="transfer_no_card">🏦 Solo Transferencias (Gral.)</option>
                {debitCards.map(d => (
                  <option key={d.id} value={`debit-${d.id}`}>
                    🏦 Débito: {d.name}
                  </option>
                ))}
                {creditCards.map(c => (
                  <option key={c.id} value={`credit-${c.id}`}>
                    💳 Crédito: {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* List panel */}
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-450 text-xs text-center">
              <Info className="w-8 h-8 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-500">Ningún movimiento registrado para esta pestaña</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs">Usa el formulario para registrar un ingreso, retiro por efectivo, o cargo por tarjeta para {selectedMonth}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-normal" id="budget-table">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase text-[9px] font-semibold tracking-wider">
                    <th className="pb-2.5 font-semibold">Fecha</th>
                    <th className="pb-2.5 font-semibold">Concepto / Recurrente</th>
                    <th className="pb-2.5 font-semibold">Categoría</th>
                    <th className="pb-2.5 font-semibold">Pago / Vínculo</th>
                    <th className="pb-2.5 text-right font-semibold">Monto</th>
                    <th className="pb-2.5 text-center font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-750">
                  {filteredList.sort((a,b) => b.date.localeCompare(a.date)).map((tx) => {
                    const catObj = categories.find(c => c.id === tx.category);
                    const categoryName = catObj ? catObj.name : 'Otros';
                    const categoryColor = catObj ? catObj.color : '#6B7280';

                    // Get card/account label name
                    let cardLabel = '';
                    if (tx.paymentMethod === 'credit') {
                      const cObj = creditCards.find(c => c.id === tx.cardId);
                      cardLabel = cObj ? `💳 ${cObj.name}` : '💳 Tarjeta';
                    } else if (tx.paymentMethod === 'debit' || tx.paymentMethod === 'transfer') {
                      const dObj = debitCards.find(d => d.id === tx.cardId);
                      cardLabel = dObj ? `🏦 ${dObj.name}` : '🏦 Débito';
                    } else {
                      cardLabel = '💵 Efectivo';
                    }

                    const isPastOrToday = tx.date <= todayStr;

                    return (
                      <tr 
                        key={tx.id} 
                        className={`transition-colors group border-b border-slate-100/30 ${
                          isPastOrToday 
                            ? 'bg-emerald-50/20 hover:bg-emerald-50/35' 
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {editingId === tx.id ? (
                            <input 
                              type="date"
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                              className="px-2 py-1 border border-slate-350 rounded text-xs text-slate-800 bg-white font-mono w-[125px]"
                              required
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 group/row">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight inline-block whitespace-nowrap ${
                                isPastOrToday 
                                  ? 'bg-emerald-100/70 text-emerald-800 border border-emerald-200/40' 
                                  : 'bg-slate-100 text-slate-500 border border-slate-200/40'
                              }`}>
                                {tx.date}
                              </span>
                              <button 
                                onClick={() => {
                                  setEditingId(tx.id);
                                  setEditingDate(tx.date);
                                  setEditingAmount(String(tx.amount));
                                  setEditingDescription(tx.description);
                                  setEditingCategory(tx.category);
                                  setEditingPaymentMethod(tx.paymentMethod);
                                  setEditingCardId(tx.cardId || '');
                                }}
                                className="text-slate-400 hover:text-slate-750 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                title="Editar registro"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-2">
                          {editingId === tx.id ? (
                            <div className="flex flex-col gap-1 w-full max-w-[200px]">
                              <input 
                                type="text"
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                className="px-2 py-1 border border-slate-350 rounded text-xs text-slate-800 bg-white font-medium"
                                required
                              />
                              {tx.isFixed && (
                                <span className="text-[9px] bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap self-start">
                                  Fijo
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="font-semibold text-slate-755 flex items-center gap-1.5">
                              {tx.description}
                              {tx.isFixed && (
                                <span className="text-[9px] bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-0.5">
                                  Fijo
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          {editingId === tx.id ? (
                            <select
                              value={editingCategory}
                              onChange={(e) => setEditingCategory(e.target.value)}
                              className="px-1.5 py-1 border border-slate-350 rounded text-xs text-slate-800 bg-white font-medium max-w-[150px] outline-hidden focus:border-indigo-500"
                            >
                              {categories.filter(c => c.type === tx.type).map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px]"
                              style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
                              {categoryName}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-slate-500 font-medium whitespace-nowrap">
                          {editingId === tx.id ? (
                            <div className="flex flex-col gap-1 max-w-[160px]">
                              <select
                                value={editingPaymentMethod}
                                onChange={(e) => {
                                  const newMethod = e.target.value as PaymentMethod;
                                  setEditingPaymentMethod(newMethod);
                                  if (newMethod === 'credit' && creditCards.length > 0) {
                                    setEditingCardId(creditCards[0].id);
                                  } else if ((newMethod === 'debit' || newMethod === 'transfer') && debitCards.length > 0) {
                                    setEditingCardId(debitCards[0].id);
                                  } else {
                                    setEditingCardId('');
                                  }
                                }}
                                className="px-1.5 py-1 border border-slate-350 rounded text-[11px] text-slate-850 bg-white font-medium outline-hidden focus:border-indigo-500"
                              >
                                <option value="cash">Efectivo</option>
                                <option value="transfer">Transferencia</option>
                                <option value="debit">T. Débito</option>
                                <option value="credit">T. Crédito</option>
                              </select>

                              {(editingPaymentMethod === 'credit' || editingPaymentMethod === 'debit' || editingPaymentMethod === 'transfer') && (
                                <select
                                  value={editingCardId}
                                  onChange={(e) => setEditingCardId(e.target.value)}
                                  className="px-1.5 py-0.5 border border-slate-350 rounded text-[10px] text-slate-600 bg-white font-medium outline-hidden focus:border-indigo-500"
                                >
                                  {editingPaymentMethod === 'credit' ? (
                                    creditCards.map(c => (
                                      <option key={c.id} value={c.id}>💳 {c.name}</option>
                                    ))
                                  ) : (
                                    <>
                                      {debitCards.map(d => (
                                        <option key={d.id} value={d.id}>🏦 {d.name}</option>
                                      ))}
                                      {editingPaymentMethod === 'transfer' && (
                                        <option value="">🏦 Gral. (Sin cuenta)</option>
                                      )}
                                    </>
                                  )}
                                </select>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className="text-[10px] block font-semibold">{paymentMethodLabels[tx.paymentMethod]}</span>
                              <span className="text-[9px] text-slate-400 font-normal">{cardLabel}</span>
                            </>
                          )}
                        </td>
                        <td className="py-3 text-right font-bold text-sm whitespace-nowrap">
                          {editingId === tx.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-slate-400 text-xs font-bold">{tx.type === 'income' ? '+' : '-'}</span>
                              <input 
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={editingAmount}
                                onChange={(e) => setEditingAmount(e.target.value)}
                                className="px-2 py-1 border border-slate-350 rounded text-xs text-slate-800 bg-white font-semibold text-right w-[80px]"
                                required
                              />
                            </div>
                          ) : (
                            <span className={tx.type === 'income' ? 'text-emerald-600 font-extrabold' : 'text-slate-755 font-bold'}>
                              {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          {editingId === tx.id ? (
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5">
                              <button 
                                onClick={() => {
                                  const parsedVal = parseFloat(editingAmount);
                                  if (editingDate && !isNaN(parsedVal) && parsedVal > 0 && onUpdateTransaction) {
                                    onUpdateTransaction(tx.id, { 
                                      date: editingDate,
                                      amount: parsedVal,
                                      description: editingDescription,
                                      category: editingCategory,
                                      paymentMethod: editingPaymentMethod,
                                      cardId: (editingPaymentMethod === 'credit' || editingPaymentMethod === 'debit' || editingPaymentMethod === 'transfer') ? (editingCardId || undefined) : undefined
                                    });
                                  }
                                  setEditingId(null);
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold uppercase transition-all flex items-center gap-0.5 justify-center"
                                title="Guardar cambios"
                              >
                                <Check className="w-3.5 h-3.5" /> Ok
                              </button>
                              <button 
                                onClick={() => {
                                  setEditingId(null);
                                }}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-bold uppercase transition-all"
                                title="Cancelar cambios"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button 
                                onClick={() => {
                                  setEditingId(tx.id);
                                  setEditingDate(tx.date);
                                  setEditingAmount(String(tx.amount));
                                  setEditingDescription(tx.description);
                                  setEditingCategory(tx.category);
                                  setEditingPaymentMethod(tx.paymentMethod);
                                  setEditingCardId(tx.cardId || '');
                                }}
                                className="p-1 px-2 text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-md opacity-0 group-hover:opacity-100 transition-all font-semibold text-[10px] uppercase flex items-center gap-0.5 cursor-pointer"
                                title="Editar este movimiento"
                              >
                                Editar
                              </button>
                              <button 
                                onClick={() => onDeleteTransaction(tx.id)}
                                className="p-1 px-2 text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-md opacity-0 group-hover:opacity-100 transition-all font-semibold text-[10px] uppercase flex items-center gap-0.5 cursor-pointer"
                                title="Eliminar movimiento"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Borrar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Floating Modal for Custom Category Creation */}
      {showNewCatModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 max-w-sm w-full p-5 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" /> Crear Categoría Personalizada
              </h3>
              <button 
                onClick={() => setShowNewCatModal(false)}
                className="p-1 text-slate-400 hover:bg-slate-50 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div className="space-y-1.2">
                <label className="text-slate-500 font-medium">Nombre de la Categoría</label>
                <input 
                  type="text" 
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ej. Salón de Belleza / Mascotas"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.2">
                  <label className="text-slate-500 font-medium">Tipo</label>
                  <select 
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as 'income' | 'expense')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                  </select>
                </div>

                <div className="space-y-1.2">
                  <label className="text-slate-500 font-medium">Color Distintivo</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0"
                    />
                    <span className="font-mono text-[10px] text-slate-400">{newCatColor}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowNewCatModal(false)} 
                  className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-3 py-1.5 bg-slate-800 text-white hover:bg-slate-700 rounded-lg font-semibold"
                >
                  Crear e Inyectar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
