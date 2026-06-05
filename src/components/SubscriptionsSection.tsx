import React, { useState } from 'react';
import { 
  Sparkles, Plus, Trash2, Calendar, FileText, DollarSign, CreditCard, 
  Wallet, Tag, Check, CheckSquare, Square, RefreshCw, Info, HelpCircle
} from 'lucide-react';
import { AppState, Subscription, PaymentMethod, Category } from '../types';

interface SubscriptionsSectionProps {
  state: AppState;
  onAddSubscription: (sub: Omit<Subscription, 'id'>) => void;
  onDeleteSubscription: (id: string) => void;
  onToggleSubscriptionMonth: (id: string, monthStr: string) => void;
}

export default function SubscriptionsSection({
  state,
  onAddSubscription,
  onDeleteSubscription,
  onToggleSubscriptionMonth
}: SubscriptionsSectionProps) {
  const { subscriptions = [], creditCards, debitCards, categories, selectedMonth } = state;

  // Selected year based on the current selectedMonth YYYY-MM
  const [selectedYearStr, selectedMonthNumStr] = selectedMonth.split('-');
  const currentYear = parseInt(selectedYearStr, 10);

  // Form states
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit');
  const [cardId, setCardId] = useState('');
  
  // Track selected months for the new subscription form (defaulting to all 12 months for the current year)
  const defaultMonthsOfCurrentYear = Array.from({ length: 12 }, (_, i) => {
    const mNum = String(i + 1).padStart(2, '0');
    return `${selectedYearStr}-${mNum}`;
  });
  const [formActiveMonths, setFormActiveMonths] = useState<string[]>(defaultMonthsOfCurrentYear);

  // Sync form active months whenever the viewed year of selectedMonth changes
  React.useEffect(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const mNum = String(i + 1).padStart(2, '0');
      return `${selectedYearStr}-${mNum}`;
    });
    setFormActiveMonths(months);
  }, [selectedYearStr]);

  // Initialize category to "Suscripciones/Planes" card if available, or first expense category
  React.useEffect(() => {
    const subCat = categories.find(c => c.id === 'cat-subscriptions' || c.name.toLowerCase().includes('suscrip'));
    const expenseCats = categories.filter(c => c.type === 'expense');
    if (subCat) {
      setCategory(subCat.id);
    } else if (expenseCats.length > 0) {
      setCategory(expenseCats[0].id);
    }
  }, [categories]);

  // Select default subaccount when payment method changes
  React.useEffect(() => {
    const getOptions = () => {
      if (paymentMethod === 'credit') return creditCards;
      if (paymentMethod === 'debit' || paymentMethod === 'transfer') return debitCards;
      return [];
    };
    const options = getOptions();
    if (options.length > 0) {
      setCardId(options[0].id);
    } else {
      setCardId('');
    }
  }, [paymentMethod, creditCards, debitCards]);

  const handleFormMonthToggle = (monthStr: string) => {
    setFormActiveMonths(prev => 
      prev.includes(monthStr)
        ? prev.filter(m => m !== monthStr)
        : [...prev, monthStr]
    );
  };

  const handleSelectAllFormMonths = () => {
    setFormActiveMonths(defaultMonthsOfCurrentYear);
  };

  const handleClearAllFormMonths = () => {
    setFormActiveMonths([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor ingrese un nombre para la suscripción o plan.');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Por favor ingrese un monto mensual válido.');
      return;
    }

    const dayNum = parseInt(dayOfMonth, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      alert('Por favor ingrese un día de cobro válido (1 al 31).');
      return;
    }

    if (formActiveMonths.length === 0) {
      alert('Por favor seleccione al menos un mes de vigencia para este plan.');
      return;
    }

    onAddSubscription({
      name: name.trim(),
      amount: amt,
      category,
      paymentMethod,
      cardId: (paymentMethod === 'credit' || paymentMethod === 'debit' || paymentMethod === 'transfer') ? cardId : undefined,
      dayOfMonth: dayNum,
      activeMonths: formActiveMonths
    });

    // Reset simple parts of form
    setName('');
    setAmount('');
  };

  // Human payment method labels
  const paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia Bancaria',
    debit: 'Débito (Cuenta)',
    credit: 'Tarjeta de Crédito'
  };

  // Short month names
  const spanishMonthsShort = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  return (
    <div className="space-y-6" id="subscriptions-section">
       {/* Upper header */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5.5 h-5.5 text-indigo-500" />
              Suscripciones y Gastos Fijos (Planes Fijos Recurrentes)
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Aquí puedes definir servicios fijos mensuales y gastos fijos recurrentes (como el **Alquiler del apartamento**, Netflix, Internet, Gimnasio o Colegio). Los planes especificados se proyectarán y cargarán <strong>automáticamente</strong> en tus gastos y presupuesto de cada mes, ayudándote con la planificación mes a mes.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg flex items-center gap-2 text-xs text-indigo-950 font-medium whitespace-nowrap">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Viendo para el Año: {selectedYearStr}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Creation Form Column */}
        <div className="xl:col-span-1">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2 mb-4 pb-2 border-b border-slate-55">
              <Plus className="w-4 h-4 text-slate-650" />
              <span>Nuevo Gasto Fijo / Suscripción</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium text-slate-700">
              
              {/* Name */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-slate-500">
                   <FileText className="w-3.5 h-3.5" /> Nombre del Servicio / Gasto Fijo
                </label>
                <input 
                  type="text"
                  placeholder="Ej. Alquiler de Apartamento, Netflix, Internet, Gimnasio"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-800 font-normal"
                  required
                />
              </div>

              {/* Amount and Day of Month */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <DollarSign className="w-3.5 h-3.5" /> Pago Mensual ($)
                  </label>
                  <input 
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

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" /> Día del Mes de Cobro
                  </label>
                  <input 
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Día (ej. 25)"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-800"
                    required
                  />
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <Tag className="w-3.5 h-3.5" /> Categoría Presupuestaria
                </label>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none text-slate-800 font-normal"
                  required
                >
                  {categories.filter(c => c.type === 'expense').map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <Wallet className="w-3.5 h-3.5" /> Método de Pago Predeterminado
                </label>
                <select 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none text-slate-800 font-normal"
                  required
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia Bancaria</option>
                  <option value="debit">Tarjeta de Débito (Cuenta)</option>
                  <option value="credit">Tarjeta de Crédito</option>
                </select>
              </div>

              {/* Dependent Credit/Debit accounts */}
              {((paymentMethod === 'credit' && creditCards.length > 0) || 
                ((paymentMethod === 'debit' || paymentMethod === 'transfer') && debitCards.length > 0)) && (
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <label className="text-slate-500 flex items-center gap-1 font-semibold">
                    <CreditCard className="w-3.5 h-3.5" /> Vincular Cobro a:
                  </label>
                  <select
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded BG-white text-slate-800 font-normal"
                    required
                  >
                    {paymentMethod === 'credit' ? (
                      creditCards.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name} (TDC)</option>
                      ))
                    ) : (
                      debitCards.map(db => (
                        <option key={db.id} value={db.id}>{db.name} (${db.balance})</option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Months vigency selector (Active Months checkbox sheet) */}
              <div className="space-y-2 bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-slate-650 font-bold block flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                    Meses de Vigencia ({selectedYearStr})
                  </label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={handleSelectAllFormMonths}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      Todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button 
                      type="button" 
                      onClick={handleClearAllFormMonths}
                      className="text-[10px] text-slate-500 hover:underline"
                    >
                      Ninguno
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 text-center font-semibold text-[10px]">
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthIdxStr = String(i + 1).padStart(2, '0');
                    const monthKey = `${selectedYearStr}-${monthIdxStr}`;
                    const isActive = formActiveMonths.includes(monthKey);
                    return (
                      <button
                        key={monthKey}
                        type="button"
                        onClick={() => handleFormMonthToggle(monthKey)}
                        className={`py-1.5 rounded transition-colors block ${isActive ? 'bg-indigo-600 text-white font-bold' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-500'}`}
                        id={`form-month-btn-${monthKey}`}
                      >
                        {spanishMonthsShort[i]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-400 leading-normal mt-1">El gasto se registrará de forma automática solo en los meses que dejes marcados aquí arriba.</p>
              </div>

              <button 
                type="submit"
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 text-xs"
                id="subscription-submit-btn"
              >
                <Check className="w-4 h-4 text-emerald-400" /> Guardar Plan Recurrente
              </button>
            </form>
          </div>
        </div>

        {/* List of currently configured subscriptions */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <div className="pb-3 border-b border-slate-100 mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-850 tracking-tight">Tus Planes y Suscripciones Registradas</h2>
                <p className="text-[11px] text-slate-400 font-medium">Gestión de cobros recurrentes y toggle rápido por mes</p>
              </div>
              <div className="text-[10px] text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded border border-slate-100 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Haz clic en un mes para activarlo/desactivarlo</span>
              </div>
            </div>

            {subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-450 text-xs text-center border border-dashed border-slate-150 rounded-xl">
                <RefreshCw className="w-9 h-9 text-slate-350 animate-spin-slow mb-2" />
                <p className="font-semibold text-slate-500 font-sans">No has definido ninguna suscripción recurrente</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-sm">Define servicios con fecha fija mensual en el card izquierdo para que se proyecten automáticamente mes a mes.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => {
                  const catObj = categories.find(c => c.id === sub.category);
                  const categoryName = catObj ? catObj.name : 'Varios';
                  const categoryColor = catObj ? catObj.color : '#6B7280';

                  // Determine linked card or account label
                  let linkName = '💵 Efectivo';
                  if (sub.paymentMethod === 'credit') {
                    const cCard = creditCards.find(c => c.id === sub.cardId);
                    linkName = cCard ? `💳 ${cCard.name}` : '💳 Tarjeta de Crédito';
                  } else if (sub.paymentMethod === 'debit' || sub.paymentMethod === 'transfer') {
                    const dCard = debitCards.find(d => d.id === sub.cardId);
                    linkName = dCard ? `🏦 ${dCard.name}` : '🏦 Débito';
                  }

                  return (
                    <div 
                      key={sub.id} 
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors flex flex-col justify-between gap-4 group"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Summary details */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-800">{sub.name}</span>
                            <span 
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                              style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
                            >
                              {categoryName}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-[10px] text-slate-500 font-semibold font-sans">
                            <span className="flex items-center gap-0.5 text-indigo-650">
                              <DollarSign className="w-3 h-3" />
                              <strong className="text-normal font-bold">${sub.amount.toFixed(2)}</strong> / mes
                            </span>
                            <span>&bull;</span>
                            <span>Día de cobro: <strong>{sub.dayOfMonth}</strong></span>
                            <span>&bull;</span>
                            <span>Pago: {linkName}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div>
                          <button
                            onClick={() => {
                              if (window.confirm(`¿Está seguro de querer borrar la suscripción recurrente "${sub.name}"? Los cobros proyectados de meses vigentes se mantendrán a menos que borres sus transacciones en el Presupuesto.`)) {
                                onDeleteSubscription(sub.id);
                              }
                            }}
                            className="p-1.5 px-2.5 text-rose-600 hover:bg-rose-50 rounded bg-white border border-slate-150 text-[10px] font-semibold flex items-center gap-1 transition-all"
                            title="Eliminar suscripción permanente"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Borrar Plan
                          </button>
                        </div>
                      </div>

                      {/* Interactive Month matrix toggle pills specifically for selected year */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Meses de funcionamiento durante {selectedYearStr} (Haz clic para habilitar/silenciar):
                        </span>

                        <div className="flex flex-wrap gap-1">
                          {Array.from({ length: 12 }, (_, i) => {
                            const monthIdxStr = String(i + 1).padStart(2, '0');
                            const mStr = `${selectedYearStr}-${monthIdxStr}`;
                            const isCurrentlyActive = sub.activeMonths.includes(mStr);
                            const isViewingMonth = mStr === selectedMonth;

                            return (
                              <button
                                key={mStr}
                                onClick={() => onToggleSubscriptionMonth(sub.id, mStr)}
                                className={`text-[10px] font-semibold px-2 py-1 rounded transition-all ${isCurrentlyActive ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-bold shadow-xs' : 'bg-slate-100 text-slate-400 border border-transparent'}`}
                                title={`${isCurrentlyActive ? 'Activo' : 'Inactivo'} en ${spanishMonthsShort[i]} ${selectedYearStr}`}
                                id={`pill-${sub.id}-${mStr}`}
                              >
                                <span className="flex items-center gap-1">
                                  {isCurrentlyActive ? <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" /> : null}
                                  {spanishMonthsShort[i]}
                                  {isViewingMonth && <span className="text-[8px] bg-slate-200 text-slate-700 font-bold px-0.5 rounded leading-none">ver</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
