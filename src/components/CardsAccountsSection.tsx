import React, { useState } from 'react';
import { 
  Plus, Trash2, CreditCard, Wallet, Landmark, Info, Check, 
  HelpCircle, Sparkles, Pencil, X, ArrowUpRight, ArrowDownRight, Eye 
} from 'lucide-react';
import { AppState, CreditCard as CardType, DebitCard as AccountType } from '../types';
import { computeMonthlyAccountBalances } from '../utils/financeUtils';

interface CardsAccountsSectionProps {
  state: AppState;
  onAddCreditCard: (card: Omit<CardType, 'id'>) => void;
  onDeleteCreditCard: (id: string) => void;
  onAddDebitCard: (acc: Omit<AccountType, 'id'>) => void;
  onDeleteDebitCard: (id: string) => void;
  onUpdateDebitCardBalance: (id: string, newBalance: number) => void;
  onUpdateDebitCardInitialBalance?: (id: string, month: string, newInitialBalance: number) => void;
}

export default function CardsAccountsSection({
  state,
  onAddCreditCard,
  onDeleteCreditCard,
  onAddDebitCard,
  onDeleteDebitCard,
  onUpdateDebitCardBalance,
  onUpdateDebitCardInitialBalance
}: CardsAccountsSectionProps) {
  const { creditCards, debitCards } = state;

  // Calculamos los saldos mensuales dinámicos de acuerdo con los movimientos
  const accountFlows = computeMonthlyAccountBalances(
    debitCards, 
    state.transactions, 
    state.creditCards, 
    state.installments, 
    state.selectedMonth,
    state.initialBalancesOverrides
  );

  // Modal breakdown state
  const [selectedAccountDetail, setSelectedAccountDetail] = useState<AccountType | null>(null);

  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const [yearStr, monthStr] = state.selectedMonth.split('-');
  const selectedMonthName = monthNamesEs[parseInt(monthStr, 10) - 1] || monthStr;

  // New Credit Card Form State
  const [ccName, setCcName] = useState('');
  const [ccLimit, setCcLimit] = useState('');
  const [ccClosingDay, setCcClosingDay] = useState('15');
  const [ccDueDay, setCcDueDay] = useState('5');

  // New Debit Account Form State
  const [debName, setDebName] = useState('');
  const [debBalance, setDebBalance] = useState('');

  // Editing Balance State
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingBalance, setEditingBalance] = useState('');

  const getAccountTransactionsForMonth = (accountId: string) => {
    return state.transactions.filter(t => {
      if (t.month !== state.selectedMonth) return false;
      
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

  const handleCreateCC = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccName.trim() || !ccLimit || parseFloat(ccLimit) <= 0) {
      alert('Por favor complete los campos de la tarjeta con valores correctos.');
      return;
    }

    onAddCreditCard({
      name: ccName.trim(),
      limit: parseFloat(ccLimit),
      closingDay: parseInt(ccClosingDay, 10),
      dueDay: parseInt(ccDueDay, 10)
    });

    setCcName('');
    setCcLimit('');
  };

  const handleCreateDeb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debName.trim() || !debBalance) {
      alert('Por favor complete los campos de la cuenta.');
      return;
    }

    onAddDebitCard({
      name: debName.trim(),
      balance: parseFloat(debBalance)
    });

    setDebName('');
    setDebBalance('');
  };

  const startEditingBalance = (card: AccountType) => {
    const flow = accountFlows[card.id] || { finalBalance: card.balance };
    setEditingCardId(card.id);
    setEditingBalance(String(flow.finalBalance));
  };

  const saveEditingBalance = (id: string) => {
    const parsed = parseFloat(editingBalance);
    if (!isNaN(parsed)) {
      onUpdateDebitCardBalance(id, parsed);
    }
    setEditingCardId(null);
  };

  return (
    <div className="space-y-8" id="cards-accounts-section">
      {/* Upper header explanatory quote */}
      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
        <Info className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-650 leading-relaxed font-medium">
          <p className="font-semibold text-slate-800">¿Por qué configurar tus tarjetas y cuentas?</p>
          <p className="mt-1">
            Esta información alimenta el motor de presupuestación de la aplicación. Al registrar la **Fecha de Cierre** (corte) y **Fecha de Pago** de tus tarjetas de crédito, la aplicación proyecta automáticamente qué compras a plazos y consumos del mes caerán en cada estado de cuenta y cuándo se pagarán de manera real.
          </p>
        </div>
      </div>

      {/* Credit Cards & Debit Accounts Forms and Lists split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Credit Cards section */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2 mb-4 pb-2 border-b border-slate-50">
              <CreditCard className="w-4 h-4 text-slate-600" />
              <span>Registrar Tarjeta de Crédito</span>
            </h2>

            <form onSubmit={handleCreateCC} className="space-y-4 text-xs font-medium text-slate-700">
              <div className="space-y-1.5">
                <label htmlFor="cc-form-name" className="text-slate-500">Nombre de la Tarjeta</label>
                <input 
                  id="cc-form-name"
                  type="text"
                  placeholder="Ej. BAC Visa Infinite / AMEX Elite"
                  value={ccName}
                  onChange={(e) => setCcName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cc-form-limit" className="text-slate-500">Límite de Crédito ($ USD)</label>
                <input 
                  id="cc-form-limit"
                  type="number"
                  placeholder="Ej. 5000"
                  value={ccLimit}
                  onChange={(e) => setCcLimit(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="cc-form-closing" className="text-slate-500 flex items-center gap-1">
                    Día de Corte/Cierre
                    <span className="text-[9px] text-slate-400 font-normal">(Ej. 15)</span>
                  </label>
                  <input 
                    id="cc-form-closing"
                    type="number"
                    min="1"
                    max="31"
                    value={ccClosingDay}
                    onChange={(e) => setCcClosingDay(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cc-form-due" className="text-slate-500 flex items-center gap-1">
                    Día Límite de Pago
                    <span className="text-[9px] text-slate-400 font-normal">(Ej. 5)</span>
                  </label>
                  <input 
                    id="cc-form-due"
                    type="number"
                    min="1"
                    max="31"
                    value={ccDueDay}
                    onChange={(e) => setCcDueDay(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all"
                id="cc-submit-btn"
              >
                Agregar Tarjeta
              </button>
            </form>
          </div>

          {/* Cards List */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <h3 className="text-xs font-semibold text-slate-800 pb-2 border-b border-slate-50 mb-3">Tarjetas Registradas</h3>
            
            {creditCards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No hay tarjetas de crédito registradas</p>
            ) : (
              <div className="space-y-3">
                {creditCards.map(card => (
                  <div key={card.id} className="p-3.5 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex justify-between items-center relative overflow-hidden group">
                    <div className="space-y-2 z-10">
                      <div>
                        <h4 className="text-xs font-bold leading-none tracking-wide text-slate-100">{card.name}</h4>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">Límite: ${card.limit.toLocaleString()}</span>
                      </div>
                      <div className="flex gap-4 text-[10px] text-slate-350">
                        <span>Corte: Día {card.closingDay}</span>
                        <span>Límite Pago: Día {card.dueDay}</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => onDeleteCreditCard(card.id)}
                      className="p-1 px-2.5 bg-white/10 hover:bg-rose-600 hover:text-white transition-colors duration-200 rounded text-rose-300 text-[10px] font-semibold border border-white/5 z-10"
                      title="Eliminar tarjeta"
                    >
                      Eliminar
                    </button>

                    {/* Faux hologram badge effect */}
                    <div className="absolute right-32 top-3 w-8 h-6 bg-amber-400/20 rounded-md blur-xs" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Debit accounts section */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2 mb-4 pb-2 border-b border-slate-50">
              <Wallet className="w-4 h-4 text-slate-600" />
              <span>Registrar Cuenta Bancaria / Débito / Efectivo</span>
            </h2>

            <form onSubmit={handleCreateDeb} className="space-y-4 text-xs font-medium text-slate-705">
              <div className="space-y-1.5">
                <label htmlFor="deb-form-name" className="text-slate-500">Nombre de la Cuenta o Fondo</label>
                <input 
                  id="deb-form-name"
                  type="text"
                  placeholder="Ej. BAC Cuenta Planilla / Ahorros / Caja de Efectivo"
                  value={debName}
                  onChange={(e) => setDebName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="deb-form-bal" className="text-slate-500 font-semibold">Saldo Disponible Inicial o Ajustado ($)</label>
                <input 
                  id="deb-form-bal"
                  type="number"
                  step="0.01"
                  placeholder="Ej. 1500"
                  value={debBalance}
                  onChange={(e) => setDebBalance(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                  required
                />
              </div>

              <button 
                type="submit" 
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all"
                id="deb-submit-btn"
              >
                Agregar Fondo Líquido
              </button>
            </form>
          </div>

          {/* Accounts List mapping */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-50 mb-3">
              <h3 className="text-xs font-semibold text-slate-800">Fondos y Cuentas de Débito</h3>
              <span className="text-[10px] text-slate-400 font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Info className="w-3 h-3" /> Clic para auditar flujo
              </span>
            </div>
            
            {debitCards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No hay cuentas de débito registradas</p>
            ) : (
              <div className="space-y-3">
                {debitCards.map(account => {
                  const flow = accountFlows[account.id] || { initialBalance: account.balance, finalBalance: account.balance, incomes: 0, expenses: 0 };
                  const netVariance = flow.incomes - flow.expenses;
                  return (
                    <div 
                      key={account.id} 
                      onClick={() => setSelectedAccountDetail(account)}
                      className="group p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-100 hover:border-slate-200 rounded-xl flex items-center justify-between transition-all cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 group-hover:bg-emerald-50 text-emerald-700 rounded-lg bg-emerald-50 transition-colors">
                          <Wallet className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-slate-700 group-hover:text-emerald-700 truncate transition-colors">{account.name}</h4>
                            <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                              <Eye className="w-2 h-2" /> Auditar
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal block">Cuenta de Débito / Disponible</span>
                          
                          {/* Rollover and flow details */}
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 mt-1 font-medium">
                            <span>Inicial: <strong className="text-slate-600">${flow.initialBalance.toLocaleString()}</strong></span>
                            <span>•</span>
                            <span>Movimiento: <strong className={netVariance >= 0 ? "text-emerald-600" : "text-rose-500"}>
                              {netVariance >= 0 ? '+' : ''}${netVariance.toLocaleString()}
                            </strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {editingCardId === account.id ? (
                          <div className="flex items-center gap-1.5 min-w-[140px]">
                            <input 
                              type="number" 
                              step="0.01"
                              value={editingBalance}
                              onChange={(e) => setEditingBalance(e.target.value)}
                              className="w-18 px-1.5 py-0.5 border border-slate-300 rounded font-bold text-center text-xs text-slate-800 animate-pulse"
                              required
                            />
                            <button 
                              type="button"
                              onClick={() => saveEditingBalance(account.id)}
                              className="p-1.5 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-700"
                            >
                              ✓
                            </button>
                            <button 
                              type="button"
                              onClick={() => setEditingCardId(null)}
                              className="p-1.5 bg-slate-200 text-slate-650 rounded text-[10px] font-semibold hover:bg-slate-300"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-emerald-600 block group-hover:scale-105 transition-transform" title="Saldo Final Proyectado para este período">${flow.finalBalance.toLocaleString()}</span>
                            <button 
                              onClick={() => startEditingBalance(account)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 flex items-center gap-0.5 justify-end font-normal ml-auto transition-colors"
                            >
                              <Pencil className="w-2.5 h-2.5" /> Ajustar saldo
                            </button>
                          </div>
                        )}

                        {editingCardId !== account.id && (
                          <button 
                            onClick={() => onDeleteDebitCard(account.id)}
                            className="p-1 px-2 text-rose-500 hover:bg-rose-50 rounded text-[10px] font-medium transition-colors"
                            title="Eliminar cuenta"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400 text-center font-medium mt-1">
                  *Haz clic en cualquier cuenta de débito para ver la lista auditada de ingresos y egresos de este mes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DETALLES DE FLUJO DE EFECTIVO MODAL */}
      {selectedAccountDetail && (() => {
        const flow = accountFlows[selectedAccountDetail.id] || { initialBalance: selectedAccountDetail.balance, finalBalance: selectedAccountDetail.balance, incomes: 0, expenses: 0 };
        const accountTxs = getAccountTransactionsForMonth(selectedAccountDetail.id);
        const netVariance = flow.incomes - flow.expenses;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedAccountDetail(null)}>
            <div 
              className="bg-white rounded-xl shadow-xl border border-slate-150 max-w-xl w-full p-6 text-xs flex flex-col max-h-[85vh] animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Auditar Cuentas: {selectedAccountDetail.name}</h3>
                    <p className="text-[10px] text-slate-500">Período de análisis: {selectedMonthName} {yearStr}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAccountDetail(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Math card */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Saldo Inicial ({selectedMonthName})</span>
                  <span className="text-sm font-bold text-slate-700">${flow.initialBalance.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Flujo Neto de Caja</span>
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
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 text-indigo-900 rounded-lg text-[10.5px] leading-relaxed mb-4">
                <p className="font-bold mb-1 flex items-center gap-1 text-indigo-950">
                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  Explicación Matemática de tu Cuenta
                </p>
                <p>
                  Este saldo se calcula tomando el <strong>Saldo Inicial</strong> del mes, sumando todos los <strong>Ingresos</strong> (+) percibidos directamente en esta cuenta, y restando únicamente los gastos pagados con <strong>Efectivo, Débito o Transferencia</strong> (-). En cumplimiento con tu instrucción, se omiten los cargos de tarjetas de crédito para que el flujo de efectivo líquido sea exacto y auditable en tiempo real.
                </p>
              </div>

              {/* Transactions details */}
              <h4 className="font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Movimientos que afectan liquidez ({accountTxs.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Solo flujo de efectivo efectivo/débito/transf</span>
              </h4>

              <div className="overflow-y-auto space-y-2 flex-1 pr-1 max-h-[250px] min-h-[100px]">
                {accountTxs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No hay transacciones registradas de tipo Ingreso, Débito o Transferencia en {selectedMonthName}.
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

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSelectedAccountDetail(null)}
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
