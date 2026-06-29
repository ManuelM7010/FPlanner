import React, { useState } from 'react';
import { 
  CreditCard, Calendar, Info, InfoIcon, ShieldCheck, 
  ChevronRight, ArrowRight, Layers, DollarSign 
} from 'lucide-react';
import { AppState, CreditCard as CardType } from '../types';
import { computeCardStatementsForMonth, getBillingPeriodDates } from '../utils/financeUtils';

interface CardStatementSectionProps {
  state: AppState;
}

export default function CardStatementSection({ state }: CardStatementSectionProps) {
  const { creditCards, transactions, installments, selectedMonth, paidCardStatements } = state;
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  // Custom Date Range State
  const [rangeStartDate, setRangeStartDate] = useState(() => `${selectedMonth}-01`);
  const [rangeEndDate, setRangeEndDate] = useState(() => {
    const [y, m] = selectedMonth.split('-');
    const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
  });
  const [rangeCardFilter, setRangeCardFilter] = useState<string>('all');

  React.useEffect(() => {
    if (creditCards.length > 0 && !selectedCardId) {
      setSelectedCardId(creditCards[0].id);
    }
  }, [creditCards, selectedCardId]);

  const [year, month] = selectedMonth.split('-');
  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthName = monthNamesEs[parseInt(month, 10) - 1];

  // Compute all statements for the target period
  const statements = computeCardStatementsForMonth(creditCards, transactions, installments, selectedMonth, paidCardStatements);
  const activeStatement = statements.find(s => s.cardId === selectedCardId);
  const activeCardObj = creditCards.find(c => c.id === selectedCardId);

  // Calculate billing period dates
  const billingPeriod = activeCardObj 
    ? getBillingPeriodDates(selectedMonth, activeCardObj.closingDay)
    : null;

  // Helper payment month display (due date month)
  let paymentMonthName = '';
  if (activeStatement) {
    const dParts = activeStatement.paymentDueDateStr.split('-');
    if (dParts.length === 3) {
      paymentMonthName = monthNamesEs[parseInt(dParts[1], 10) - 1] + ' ' + dParts[0];
    }
  }

  const utilizationPct = activeStatement && activeStatement.limit > 0
    ? (activeStatement.billingBalance / activeStatement.limit) * 100
    : 0;

  // Filtered charges for custom date range
  const customRangeCharges = transactions.filter(t => {
    if (t.paymentMethod !== 'credit') return false;
    if (!t.date || t.date < rangeStartDate || t.date > rangeEndDate) return false;
    if (rangeCardFilter !== 'all' && t.cardId !== rangeCardFilter) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const customRangeTotal = customRangeCharges.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);

  return (
    <div className="space-y-6" id="card-statement-section">
      {/* Upper selector row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-100 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Estado de Cuenta Simulado por Corte de Tarjeta</h2>
          <p className="text-[11px] text-slate-400 font-medium">Revisión mensual de cargos agregados y periodos de liquidación</p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="stmt-card-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">Seleccionar Tarjeta:</label>
          <select 
            id="stmt-card-select"
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {creditCards.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {creditCards.length === 0 && (
              <option value="">(No hay tarjetas)</option>
            )}
          </select>
        </div>
      </div>

      {creditCards.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-100 text-center text-slate-400 text-xs">
          <CreditCard className="w-8 h-8 text-slate-350 mx-auto mb-2" />
          <p className="font-semibold text-slate-500">No hay ninguna tarjeta de crédito registrada en el sistema</p>
          <p className="text-[10px] text-slate-450 mt-1">Configura tus límites y fechas de corte en la pestaña de "Tarjetas y Cuentas" para habilitar esta simulación.</p>
        </div>
      ) : !activeStatement ? (
        <p className="text-xs text-slate-400 text-center py-8">Cargando estado...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Statement details box on Left */}
          <div className="bg-slate-900 text-white p-6 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-6 z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{activeStatement.cardName}</h3>
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider">Corte mensual: Día {activeCardObj?.closingDay}</span>
                </div>
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 bg-blue-500 text-white rounded">
                  MZ PLANNER
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider font-semibold">Saldo al Corte ({monthName})</span>
                <div className="text-3xl font-extrabold text-white mt-1">${activeStatement.billingBalance.toLocaleString()}</div>
                {billingPeriod && (
                  <p className="text-[10px] text-slate-350 mt-1">
                    Corresponde a consumos entre el <strong className="text-white">{billingPeriod.startDateEs}</strong> y el <strong className="text-white">{billingPeriod.endDateEs}</strong>.
                  </p>
                )}
              </div>

              {/* Progress bar of utilization limit */}
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Límite Utilizado: {utilizationPct.toFixed(1)}%</span>
                  <span>Límite Total: ${activeStatement.limit.toLocaleString()}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${utilizationPct > 85 ? 'bg-rose-500' : 'bg-blue-400'}`}
                    style={{ width: `${Math.min(100, utilizationPct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Timings summary */}
            <div className="mt-8 pt-4 border-t border-slate-800 space-y-3 z-10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Fecha de Corte:</span>
                <span className="font-semibold text-slate-200">{activeStatement.closingDateStr}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Fecha Límite de Pago:</span>
                <span className="font-semibold text-amber-300">{activeStatement.paymentDueDateStr}</span>
              </div>
              <div className="p-2.5 bg-slate-800/50 border border-slate-800 rounded-lg text-[10px] text-slate-300">
                Este saldo deberá pagarse a más tardar el <strong className="text-amber-300">{activeStatement.paymentDueDateStr}</strong> en {paymentMonthName?.split(' ')[0]}.
              </div>
            </div>

            {/* Absolute radial design pattern */}
            <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl" />
          </div>

          {/* Statement movements list on Right */}
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 mb-3 flex items-center gap-1">
              <Layers className="w-4 h-4 text-slate-500" />
              <span>Transacciones Compiladas en este Estado de Cuenta</span>
            </h3>

            {activeStatement.detailedCharges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-450 text-xs text-center">
                <ShieldCheck className="w-10 h-10 text-slate-300 mb-2" />
                <p className="font-semibold text-slate-500">¡Estado de cuenta impecable!</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  No se registraron cargos ni cuotas{billingPeriod ? ` entre el ${billingPeriod.startDateEs} y el ${billingPeriod.endDateEs}` : ' que cierren formalmente en este mes'}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-normal" id="statement-table">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase text-[9px] font-semibold tracking-wider">
                      <th className="pb-2">Fecha Cargo</th>
                      <th className="pb-2">Descripción</th>
                      <th className="pb-2 text-center">Clasificación</th>
                      <th className="pb-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {activeStatement.detailedCharges.map((charge, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 font-mono text-[11px] text-slate-400">{charge.date}</td>
                        <td className="py-2.5">
                          <span className="font-semibold text-slate-705">{charge.description}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          {charge.isInstallment ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 rounded">
                              Cuota de Compra ({charge.installmentIndex})
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 text-[9px] font-semibold bg-slate-100 text-slate-650 rounded">
                              Consumo Directo
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-extrabold text-slate-800 whitespace-nowrap">
                          ${charge.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 pt-3.5 border-t border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Total de Cargos compilados: <strong className="text-slate-700">{activeStatement.detailedCharges.length}</strong></span>
              </div>
              <div className="text-sm font-bold text-slate-850">
                Monto Consolidado: <span className="text-slate-900">${activeStatement.billingBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Date Range Inquiry Section */}
      <div className="mt-8 pt-6 border-t border-slate-200 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-xs" id="custom-range-inquiry">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" /> Consulta de Cargos entre Fechas
            </h3>
            <p className="text-[11px] text-slate-500">Filtra y calcula el total de consumos registrados en tus tarjetas en cualquier periodo personalizado</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-slate-250 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400">Desde</span>
              <input 
                type="date"
                value={rangeStartDate}
                onChange={(e) => setRangeStartDate(e.target.value)}
                className="text-xs text-slate-800 font-semibold bg-transparent focus:outline-none"
              />
            </div>
            <span className="text-slate-300 font-bold">→</span>
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-slate-250 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400">Hasta</span>
              <input 
                type="date"
                value={rangeEndDate}
                onChange={(e) => setRangeEndDate(e.target.value)}
                className="text-xs text-slate-800 font-semibold bg-transparent focus:outline-none"
              />
            </div>

            <select
              value={rangeCardFilter}
              onChange={(e) => setRangeCardFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-250 rounded-lg text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Todas las tarjetas</option>
              {creditCards.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 overflow-hidden mb-4">
          {customRangeCharges.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-medium">
              No se registraron cargos de tarjeta entre las fechas seleccionadas ({rangeStartDate} al {rangeEndDate})
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100/80 sticky top-0 text-slate-600 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 pl-4">Fecha</th>
                    <th className="py-2.5">Tarjeta</th>
                    <th className="py-2.5">Descripción</th>
                    <th className="py-2.5 text-right pr-4">Monto ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {customRangeCharges.map(tx => {
                    const cObj = creditCards.find(c => c.id === tx.cardId);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 pl-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">{tx.date}</td>
                        <td className="py-2.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                            {cObj ? cObj.name : 'Tarjeta'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="font-semibold text-slate-800">{tx.description}</div>
                          {tx.notes && <div className="text-[10px] text-slate-400 italic">💬 {tx.notes}</div>}
                        </td>
                        <td className="py-2.5 text-right pr-4 font-bold text-slate-900">
                          ${tx.amount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-50/80 border border-indigo-100 p-3.5 rounded-xl text-xs">
          <div className="text-indigo-800 font-medium">
            Registros encontrados en el set: <strong className="font-bold">{customRangeCharges.length}</strong> cargos
          </div>
          <div className="text-sm font-bold text-indigo-950 flex items-center gap-2">
            Total del Set de Gastos: <span className="text-indigo-600 font-extrabold text-base">${customRangeTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
