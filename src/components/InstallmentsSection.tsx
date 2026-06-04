import React, { useState } from 'react';
import { 
  Plus, Trash2, Calendar, FileText, DollarSign, CreditCard, 
  Clock, Landmark, Info, Layers, ChevronRight, CheckCircle 
} from 'lucide-react';
import { AppState, InstallmentPurchase, CreditCard as CardType } from '../types';
import { getProjectedInstallments, getCardCycle } from '../utils/financeUtils';

interface InstallmentsSectionProps {
  state: AppState;
  onAddInstallment: (item: Omit<InstallmentPurchase, 'id'>) => void;
  onDeleteInstallment: (id: string) => void;
}

export default function InstallmentsSection({ 
  state, 
  onAddInstallment, 
  onDeleteInstallment 
}: InstallmentsSectionProps) {
  const { installments, creditCards, selectedMonth } = state;

  // Local Form State
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'credit_card' | 'loan'>('credit_card');
  const [cardId, setCardId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('12');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [firstChargeDate, setFirstChargeDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [loanDueDay, setLoanDueDay] = useState('10');
  const [customMonthly, setCustomMonthly] = useState('');

  // Default credit card select
  React.useEffect(() => {
    if (creditCards.length > 0 && !cardId) {
      setCardId(creditCards[0].id);
    }
  }, [creditCards, cardId]);

  // Pre-calculate standard monthly payment
  const suggestedMonthly = React.useMemo(() => {
    const amt = parseFloat(totalAmount) || 0;
    const count = parseInt(installmentsCount, 10) || 1;
    if (amt <= 0 || count <= 0) return 0;
    return parseFloat((amt / count).toFixed(2));
  }, [totalAmount, installmentsCount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !totalAmount || parseFloat(totalAmount) <= 0) {
      alert('Por favor complete la descripción y el monto total de manera válida.');
      return;
    }

    const amt = parseFloat(totalAmount);
    const instCount = parseInt(installmentsCount, 10);
    const monthlyPayment = customMonthly ? parseFloat(customMonthly) : suggestedMonthly;

    onAddInstallment({
      description: description.trim(),
      type,
      cardId: type === 'credit_card' ? cardId : undefined,
      totalAmount: amt,
      installments: instCount,
      purchaseDate,
      firstChargeDate,
      loanDueDay: type === 'loan' ? parseInt(loanDueDay, 10) : undefined,
      monthlyPayment
    });

    // Reset Form Fields
    setDescription('');
    setTotalAmount('');
    setCustomMonthly('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="installments-section">
      {/* Creation form */}
      <div className="xl:col-span-1">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2 mb-4 pb-2 border-b border-slate-50">
            <Layers className="w-4 h-4 text-slate-600" />
            <span>Registrar Compra a Plazo / Préstamo</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium text-slate-705">
            {/* Type */}
            <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between items-center">
              <span>Tipo de Financiamiento</span>
              <div className="flex p-0.5 bg-slate-200/50 rounded-md">
                <button 
                  type="button"
                  onClick={() => setType('credit_card')}
                  className={`px-3 py-1 font-semibold rounded ${type === 'credit_card' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-755'}`}
                >
                  Tarjeta / Plazo
                </button>
                <button 
                  type="button"
                  onClick={() => setType('loan')}
                  className={`px-3 py-1 font-semibold rounded ${type === 'loan' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-755'}`}
                >
                  Préstamo Fijo
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="inst-desc" className="flex items-center gap-1.5 text-slate-500">
                <FileText className="w-3.5 h-3.5" /> Nombre del financiamiento
              </label>
              <input 
                id="inst-desc"
                type="text"
                placeholder="Ej. Auto / iPhone / Reloj Garmin"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-normal"
                required
              />
            </div>

            {/* Total balance cost */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="inst-total-amt" className="flex items-center gap-1.5 text-slate-500">
                  <DollarSign className="w-3.5 h-3.5" /> Monto Total ($)
                </label>
                <input 
                  id="inst-total-amt"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inst-count" className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5" /> Plazo (Cuotas)
                </label>
                <input 
                  id="inst-count"
                  type="number"
                  min="1"
                  placeholder="Meses"
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>
            </div>

            {/* If Credit card, select target card */}
            {type === 'credit_card' && (
              <div className="space-y-1.5">
                <label htmlFor="inst-card-id" className="flex items-center gap-1.5 text-slate-500">
                  <CreditCard className="w-3.5 h-3.5" /> Tarjeta de Crédito Receptora
                </label>
                <select 
                  id="inst-card-id"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  {creditCards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {creditCards.length === 0 && (
                    <option value="">(No hay tarjetas registradas)</option>
                  )}
                </select>
              </div>
            )}

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="inst-purchase-date" className="flex items-center gap-1.5 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" /> Comprado el
                </label>
                <input 
                  id="inst-purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-2 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none text-slate-800"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inst-charge-date" className="flex items-center gap-1.5 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" /> Primer Retiro / Cargo
                </label>
                <input 
                  id="inst-charge-date"
                  type="date"
                  value={firstChargeDate}
                  onChange={(e) => setFirstChargeDate(e.target.value)}
                  className="w-full px-2 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none text-slate-800"
                  required
                />
              </div>
            </div>

            {/* If Loan, specify monthly payment day */}
            {type === 'loan' && (
              <div className="space-y-1.5">
                <label htmlFor="inst-loan-day" className="flex items-center gap-1.5 text-slate-500">
                  <Landmark className="w-3.5 h-3.5" /> Día límite de pago mensual del préstamo
                </label>
                <input 
                  id="inst-loan-day"
                  type="number"
                  min="1"
                  max="31"
                  value={loanDueDay}
                  onChange={(e) => setLoanDueDay(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-55 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>
            )}

            {/* Advanced custom mensual override */}
            <div className="space-y-1.5 bg-blue-50/50 p-3 rounded-lg border border-slate-100">
              <div className="flex justify-between items-center text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">Estimación de Cuota:</span>
                <span>${suggestedMonthly} / mes</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="Sobrescribir cuota (opcional)"
                  value={customMonthly}
                  onChange={(e) => setCustomMonthly(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-11 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-all"
              id="inst-save-btn"
            >
              Registrar Financiamiento
            </button>
          </form>
        </div>
      </div>

      {/* Structured grid showing active loans and items */}
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
          <div className="pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Financiamientos a Plazos y Préstamos Activos</h2>
            <p className="text-[11px] text-slate-400 font-medium">Cronograma de deudas, cuotas devengadas y saldos remanentes</p>
          </div>

          {installments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-450 text-xs text-center">
              <Info className="w-8 h-8 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-500 font-sans">No hay ningún plan de plazos o préstamo cargado</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-sm">Si compraste un electrodoméstico a cuotas con tarjeta de crédito o tienes una hipoteca o préstamo personal, regístralo aquí.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {installments.map((item) => {
                const projected = getProjectedInstallments(item);
                
                // Which index corresponds to the selectedMonth?
                const matchingProj = projected.find(p => p.chargeMonth === selectedMonth);
                const currentPaidNum = matchingProj ? matchingProj.installmentIndex : 0;
                
                // Calculate elapsed, remaining and total paid
                // Let's count how many scheduled charges fall <= current selection month
                const pastAndCurrent = projected.filter(p => p.chargeMonth <= selectedMonth);
                const elapsedCount = pastAndCurrent.length;
                const remainingCount = Math.max(0, item.installments - elapsedCount);
                
                const paidSoFar = elapsedCount * item.monthlyPayment;
                const outstandingBalance = Math.max(0, item.totalAmount - paidSoFar);

                // Find card description if credit card
                let cardInfoName = 'Préstamo';
                if (item.type === 'credit_card') {
                  const cardObj = creditCards.find(c => c.id === item.cardId);
                  cardInfoName = cardObj ? `TDC: ${cardObj.name}` : `Tarjeta de Crédito`;
                }

                return (
                  <div 
                    key={item.id} 
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.type === 'loan' ? (
                          <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                            <Landmark className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                            <CreditCard className="w-4 h-4" />
                          </span>
                        )}
                        <div>
                          <h3 className="text-xs font-semibold text-slate-850 flex items-center gap-1.5 truncate">
                            {item.description}
                          </h3>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {cardInfoName} &bull; Compra: {item.purchaseDate}
                          </div>
                        </div>
                      </div>

                      {/* Bar showing visual state of quota progress */}
                      <div className="pt-2">
                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono mb-1">
                          <span>Progreso del Pago ({elapsedCount} de {item.installments} cuotas)</span>
                          <span>{((elapsedCount / item.installments) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${item.type === 'loan' ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${(elapsedCount / item.installments) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      {/* Quota in selected month */}
                      <div className="text-right whitespace-nowrap min-w-28 bg-white p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold block">Cuota del Mes</span>
                        <span className="text-slate-800 font-bold block">${item.monthlyPayment.toLocaleString()}</span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          {matchingProj ? `Cuota #${matchingProj.installmentIndex}` : 'No cargada'}
                        </span>
                      </div>

                      {/* Remaining cost outstanding */}
                      <div className="text-right whitespace-nowrap min-w-28 bg-white p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold block">Deuda Pendiente</span>
                        <span className="text-slate-700 font-bold block">${outstandingBalance.toLocaleString()}</span>
                        <span className="text-[9px] text-slate-400 block font-mono">Total: ${item.totalAmount.toLocaleString()}</span>
                      </div>

                      {/* Delete */}
                      <button 
                        onClick={() => onDeleteInstallment(item.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded bg-slate-50 hover:border-rose-100 border border-transparent opacity-0 group-hover:opacity-100 transition-all text-[9px] font-semibold flex items-center gap-0.5"
                        title="Invertir/Eliminar financiamiento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
