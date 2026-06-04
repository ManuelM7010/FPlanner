import React, { useState } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, Info, CheckCircle, 
  DollarSign, Landmark, CreditCard, ShoppingBag, Eye 
} from 'lucide-react';
import { AppState, Transaction, InstallmentPurchase } from '../types';
import { getProjectedInstallments, computeCardStatementsForMonth, getCardCycle } from '../utils/financeUtils';

interface CalendarSectionProps {
  state: AppState;
}

interface CalendarEvent {
  id: string;
  type: 'income' | 'fixed_expense' | 'variable_expense' | 'tdc_closing' | 'tdc_due' | 'loan_due';
  title: string;
  amount: number;
  dateStr: string; // YYYY-MM-DD
  payload?: any;
}

export default function CalendarSection({ state }: CalendarSectionProps) {
  const { transactions, creditCards, installments, selectedMonth } = state;
  const [selectedDayNum, setSelectedDayNum] = useState<number | null>(null);

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed

  const monthNamesEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Number of days in active month
  const numDays = new Date(year, month, 0).getDate();
  // Start day of week (0 = Sunday ... 6 = Saturday)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  // Pre-generate calendar events compiled for this month
  const calendarEvents: CalendarEvent[] = [];

  // 1. Regular transactions matching selectedMonth
  transactions.forEach(t => {
    if (t.month === selectedMonth) {
      calendarEvents.push({
        id: `reg-tx-${t.id}`,
        type: t.type === 'income' ? 'income' : t.isFixed ? 'fixed_expense' : 'variable_expense',
        title: t.description,
        amount: t.amount,
        dateStr: t.date,
        payload: t
      });
    }
  });

  // 2. Active Loans whose monthly payment falls in this selectedMonth
  installments.forEach(inst => {
    if (inst.type === 'loan') {
      const projected = getProjectedInstallments(inst);
      projected.forEach(proj => {
        if (proj.chargeMonth === selectedMonth) {
          calendarEvents.push({
            id: `loan-inst-${inst.id}-${proj.installmentIndex}`,
            type: 'loan_due',
            title: `Préstamo: ${inst.description} (Cuota ${proj.installmentIndex}/${inst.installments})`,
            amount: inst.monthlyPayment,
            dateStr: proj.chargeDate
          });
        }
      });
    }
  });

  // 3. Credit Card cut/closing cycles (cortes) taking place IN selectedMonth
  const statementsThisMonth = computeCardStatementsForMonth(creditCards, transactions, installments, selectedMonth);
  statementsThisMonth.forEach(st => {
    calendarEvents.push({
      id: `cc-cut-${st.cardId}-${selectedMonth}`,
      type: 'tdc_closing',
      title: `Corte de Tarjeta: ${st.cardName}`,
      amount: st.billingBalance,
      dateStr: st.closingDateStr,
      payload: st
    });
  });

  // 4. Credit Card payment limits (vencimientos) falling IN selectedMonth
  // A payment limit in selectedMonth comes from the cycle closing in the previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const statementsPrevMonth = computeCardStatementsForMonth(creditCards, transactions, installments, prevMonthStr);
  
  statementsPrevMonth.forEach(st => {
    calendarEvents.push({
      id: `cc-due-${st.cardId}-${selectedMonth}`,
      type: 'tdc_due',
      title: `Vencimiento/Pago Tarjeta: ${st.cardName}`,
      amount: st.billingBalance,
      dateStr: st.paymentDueDateStr, // this falls in selectedMonth
      payload: st
    });
  });

  // Group events by day number (1 to numDays)
  const eventsByDay: Record<number, CalendarEvent[]> = {};
  for (let d = 1; d <= numDays; d++) {
    eventsByDay[d] = [];
  }

  calendarEvents.forEach(evt => {
    const parts = evt.dateStr.split('-');
    if (parts.length === 3) {
      const evtYear = parseInt(parts[0], 10);
      const evtMonth = parseInt(parts[1], 10);
      const evtDay = parseInt(parts[2], 10);

      // Check if it belongs strictly inside the current calendar visual grid month
      if (evtYear === year && evtMonth === month && evtDay >= 1 && evtDay <= numDays) {
        eventsByDay[evtDay].push(evt);
      }
    }
  });

  // Setup grid view
  const blankBoxes = Array(firstDayOfWeek).fill(null);
  const dayIndices = Array.from({ length: numDays }, (_, i) => i + 1);
  const calendarCells = [...blankBoxes, ...dayIndices];

  // Set default selected day if not set or exceeds days count
  const activeDay = selectedDayNum !== null && selectedDayNum <= numDays ? selectedDayNum : null;
  const activeDayEvents = activeDay !== null ? eventsByDay[activeDay] : [];

  const getStyleForType = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'income':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100';
      case 'fixed_expense':
        return 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100';
      case 'variable_expense':
        return 'bg-amber-50 text-amber-800 border-amber-100 hover:bg-amber-100';
      case 'tdc_closing':
        return 'bg-slate-900 text-slate-100 border-slate-950 hover:bg-slate-850';
      case 'tdc_due':
        return 'bg-rose-50 text-rose-800 border-rose-100 hover:bg-rose-100';
      case 'loan_due':
        return 'bg-blue-50 text-blue-800 border-blue-100 hover:bg-blue-100';
      default:
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    }
  };

  const getBadgeIcon = (type: CalendarEvent['type']) => {
    switch(type) {
      case 'income': return <DollarSign className="w-3 h-3 text-emerald-600" />;
      case 'fixed_expense': return <CheckCircle className="w-3 h-3 text-slate-500" />;
      case 'variable_expense': return <ShoppingBag className="w-3 h-3 text-amber-600" />;
      case 'tdc_closing': return <CreditCard className="w-3 h-3 text-slate-400" />;
      case 'tdc_due': return <CreditCard className="w-3 h-3 text-rose-600" />;
      case 'loan_due': return <Landmark className="w-3 h-3 text-blue-600" />;
    }
  };

  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="space-y-6" id="calendar-section">
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-2 text-xs text-slate-650 font-medium">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <p>
          Este calendario consolida de forma inteligente tus compromisos financieros. Puedes ver los días específicos de pago para tu salario, cobros mensuales fijos, fechas de corte de tarjetas y los vencimientos de pago para liquidación. Haz clic sobre cualquier día para ver el cronograma completo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid Box */}
        <div className="lg:col-span-3 bg-white p-5 rounded-xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-600" />
              <span>Calendario Financiero - {monthNamesEs[month - 1]} {year}</span>
            </h3>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-2">
            {weekdays.map((day, idx) => (
              <div key={idx} className="py-1">{day}</div>
            ))}
          </div>

          {/* Calendar boxes */}
          <div className="grid grid-cols-7 gap-1.5 min-h-[400px]">
            {calendarCells.map((cell, idx) => {
              if (cell === null) {
                return (
                  <div key={`blank-${idx}`} className="bg-slate-50/40 rounded-lg min-h-[70px] border border-transparent" />
                );
              }

              const isSelected = activeDay === cell;
              const cellEvents = eventsByDay[cell] || [];

              return (
                <div 
                  key={`day-${cell}`}
                  onClick={() => setSelectedDayNum(cell)}
                  className={`bg-slate-50/50 hover:bg-slate-100/30 rounded-lg p-2 min-h-[70px] border transition-all cursor-pointer flex flex-col justify-between ${isSelected ? 'border-slate-800 bg-white ring-1 ring-slate-800/20' : 'border-slate-100/80 hover:border-slate-200'}`}
                >
                  {/* Day header */}
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[11px] font-bold ${isSelected ? 'text-slate-900 bg-slate-100 p-1 px-1.5 rounded-full' : 'text-slate-550'}`}>
                      {cell}
                    </span>
                    {cellEvents.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-slate-800 blink" />
                    )}
                  </div>

                  {/* Micro list of events inside cell */}
                  <div className="space-y-1 overflow-hidden max-h-[45px] pr-0.5">
                    {cellEvents.map((evt, eIdx) => {
                      let bgDot = 'bg-slate-400';
                      if (evt.type === 'income') bgDot = 'bg-emerald-500';
                      else if (evt.type === 'tdc_due') bgDot = 'bg-rose-500';
                      else if (evt.type === 'loan_due') bgDot = 'bg-blue-500';
                      else if (evt.type === 'tdc_closing') bgDot = 'bg-slate-950';
                      else if (evt.type === 'variable_expense') bgDot = 'bg-amber-500';

                      return (
                        <div 
                          key={eIdx} 
                          title={`${evt.title}: $${evt.amount}`}
                          className="flex items-center gap-1 text-[9px] truncate text-slate-600 font-semibold"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${bgDot}`} />
                          <span className="truncate">{evt.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Sidebar of day items details */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest pb-3 border-b border-slate-100 mb-4">
              {activeDay === null 
                ? 'Detalle de Agenda' 
                : `${activeDay} de ${monthNamesEs[month - 1]} ${year}`
              }
            </h4>

            {activeDay === null ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs text-center">
                <Eye className="w-8 h-8 text-slate-300 mb-2" />
                <p>Selecciona un día en el calendario para auditar los cortes comprometidos, flujos o cuotas de pago.</p>
              </div>
            ) : activeDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs text-center">
                <CheckCircle className="w-8 h-8 text-emerald-100 mb-2" />
                <p className="font-semibold text-slate-500">Día sin compromisos</p>
                <p className="text-[10px] text-slate-400 mt-1">No hay alertas de cobro, cortes de estados de cuenta o desembolsos programados para hoy.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDayEvents.map((evt, eIdx) => (
                  <div 
                    key={eIdx} 
                    className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-colors ${getStyleForType(evt.type)}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 flex-shrink-0">{getBadgeIcon(evt.type)}</span>
                      <span className="font-bold leading-tight">{evt.title}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-black/5 font-mono text-[10px]">
                      <span className="opacity-70">Monto:</span>
                      <span className="font-bold">${evt.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeDay !== null && activeDayEvents.length > 0 && (
            <div className="mt-6 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex justify-between font-bold text-slate-755 items-center">
                <span>Flujo de hoy:</span>
                <span>
                  ${activeDayEvents.reduce((sum, e) => {
                    if (e.type === 'income') return sum + e.amount;
                    if (e.type === 'tdc_closing') return sum; // closing is a cut date metric, not a money flow today
                    return sum - e.amount;
                  }, 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
