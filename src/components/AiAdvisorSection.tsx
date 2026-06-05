import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, ShieldCheck, AlertCircle, CheckCircle2, TrendingUp, 
  HelpCircle, MessageSquare, Send, RefreshCw, Loader2, ArrowRightLeft,
  DollarSign, Percent, PiggyBank, ArrowRight, Lightbulb
} from 'lucide-react';
import { AppState, Transaction } from '../types';

interface AiAdvisorSectionProps {
  state: AppState;
}

interface DiagnosticItem {
  titulo: string;
  tipo: 'positivo' | 'advertencia' | 'neutral';
  descripcion: string;
}

interface AnalysisResult {
  resumenDeSalud: string;
  diagnosticos: DiagnosticItem[];
  sugerencias: string[];
  metricasClave: {
    ahorroRecomendadoPorcentaje: number;
    ratioDeudaVisual: string;
    consejoInversion: string;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export default function AiAdvisorSection({ state }: AiAdvisorSectionProps) {
  const { transactions, creditCards, debitCards, installments, selectedMonth } = state;

  // Active sub-navigation
  const [subTab, setSubTab] = useState<'diagnostico' | 'chat'>('diagnostico');

  // Diagnosis States
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');

  // Chat States
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const cached = localStorage.getItem(`mz_chat_history_${selectedMonth}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      } catch (e) {
        // Fallback to empty
      }
    }
    return [
      {
        id: 'welcome-msg',
        role: 'model',
        text: `¡Hola! Soy tu **Coach de Finanzas Personales MZ**. Analizo tus ingresos, deudas, compras programadas y estados de cuenta para darte la mejor asesoría.\n\n¿En qué puedo ayudarte hoy o qué aspecto de tu planificación del mes de **${selectedMonth}** te gustaría optimizar?`,
        timestamp: new Date()
      }
    ];
  });
  const [inputMessage, setInputMessage] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Cached analysis loader
  useEffect(() => {
    const cached = localStorage.getItem(`mz_analysis_${selectedMonth}`);
    if (cached) {
      try {
        setAnalysis(JSON.parse(cached));
        setAnalysisError(null);
      } catch (e) {
        setAnalysis(null);
      }
    } else {
      setAnalysis(null);
    }
  }, [selectedMonth]);

  // Sync chat messages to localStorage
  useEffect(() => {
    localStorage.setItem(`mz_chat_history_${selectedMonth}`, JSON.stringify(messages));
    // Scroll to bottom of chat
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedMonth]);

  // Compute selected month Spanish name
  const getSelectedMonthName = () => {
    const [year, month] = selectedMonth.split('-');
    const spanishNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${spanishNames[parseInt(month, 10) - 1]} ${year}`;
  };

  // Helper mock typing simulation steps for better user UX
  const performAnalysis = async () => {
    setLoadingAnalysis(true);
    setAnalysisError(null);

    const steps = [
      "Extrayendo flujo de caja mensual...",
      "Auditando saldos de cuentas de débito y tarjetas...",
      "Identificando compras programadas y créditos activos...",
      "Consultando con el Asesor de Inteligencia Artificial Gemini...",
      "Estructurando diagnóstico y métricas ejecutivas..."
    ];

    try {
      // Rotate steps
      let currentStep = 0;
      setLoadingStep(steps[0]);
      const stepInterval = setInterval(() => {
        if (currentStep < steps.length - 1) {
          currentStep++;
          setLoadingStep(steps[currentStep]);
        }
      }, 1200);

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialState: state })
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Ocurrió un error al contactar al servidor de inteligencia artificial.");
      }

      const result: AnalysisResult = await response.json();
      setAnalysis(result);
      localStorage.setItem(`mz_analysis_${selectedMonth}`, JSON.stringify(result));

    } catch (err: any) {
      console.error(err);
      setAnalysisError(
        err.message || 
        "No se pudo completar el análisis financiero. " +
        "Asegúrese de que el servidor esté activo y que cuente con una Gemini API Key configurada."
      );
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || sendingMessage) return;

    if (!customText) {
      setInputMessage('');
    }

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setSendingMessage(true);

    try {
      // Extract quick month summaries for Chat Context
      const currentMonthTransactions = transactions.filter(t => t.month === selectedMonth);
      const incTotal = currentMonthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expTotal = currentMonthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

      const financialContext = {
        selectedMonth,
        totalIncome: incTotal,
        totalExpense: expTotal,
        netBalance: +(incTotal - expTotal).toFixed(2),
        debitAccounts: debitCards.map(d => ({ name: d.name, balance: d.balance })),
        creditLimits: creditCards.map(c => ({ name: c.name, limit: c.limit })),
        installments: installments.map(i => ({ desc: i.description, amount: i.totalAmount, pay: i.monthlyPayment }))
      };

      // Call API
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          chatHistory: messages.slice(-8).map(m => ({ role: m.role, text: m.text })), // send last 8 messages of history
          financialContext
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo obtener respuesta del Coach IA.");
      }

      const data = await response.json();

      const coachMsg: ChatMessage = {
        id: `coach-${Date.now()}`,
        role: 'model',
        text: data.text,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, coachMsg]);

    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: `⚠️ **Error del Sistema**: No logré conectar con el servidor de IA.\n\n_Detalle: ${err.message || 'Error de conexión'}_.\n\n¿Deseas intentar enviar el mensaje nuevamente?`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleResetChat = () => {
    if (window.confirm("¿Está seguro de querer limpiar el historial de conversación para este mes?")) {
      setMessages([
        {
          id: 'welcome-msg',
          role: 'model',
          text: `¡Hola! He reiniciado la conversación. Soy tu **Coach de Finanzas Personales MZ**.\n\n¿En qué puedo ayudarte hoy sobre la planificación del mes de **${selectedMonth}**?`,
          timestamp: new Date()
        }
      ]);
    }
  };

  // Predefined prompt helper buttons
  const cannedQuestions = [
    "¿Cómo puedo recortar mis gastos este mes?",
    "¿Mi nivel de deudas o plazos es seguro?",
    "¿Qué estrategias de ahorro puedo adoptar?",
    "¿Cuáles son mis mayores categorías de salida?"
  ];

  return (
    <div className="space-y-6" id="ai-advisor-container">
      
      {/* Intro Banner Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 md:p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 my-1">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded text-[10px] uppercase font-bold tracking-widest bg-blue-500/20 text-blue-400 border border-blue-400/30 font-mono">
              IA Activa
            </span>
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono">
              Generación de Insights
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            Consultor Financiero y Coach IA
          </h2>
          <p className="text-xs md:text-sm text-slate-300 font-medium">
            Respaldado por el modelo insignia <code className="bg-slate-800 text-indigo-300 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-700">gemini-3.5-flash</code> para otorgar balances y auditorías precisas.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Periodo de Análisis</span>
            <span className="text-xs font-semibold text-slate-100">{getSelectedMonthName()}</span>
          </div>
          <div className="p-3 bg-gradient-to-tr from-indigo-500 to-blue-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Internal Navigation Subtabs */}
      <div className="flex border-b border-slate-200 gap-2 select-none">
        <button
          onClick={() => setSubTab('diagnostico')}
          className={`px-4 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
            subTab === 'diagnostico' 
              ? 'border-slate-900 text-slate-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200'
          }`}
          id="btn-subtab-diagnostico"
        >
          <ShieldCheck className="w-4 h-4" /> Diagnóstico de Salud
        </button>
        <button
          onClick={() => setSubTab('chat')}
          className={`px-4 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
            subTab === 'chat' 
              ? 'border-slate-900 text-slate-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200'
          }`}
          id="btn-subtab-chat"
        >
          <MessageSquare className="w-4 h-4" /> Chat Interactivos
        </button>
      </div>

      {subTab === 'diagnostico' ? (
        <div className="space-y-6" id="advisor-diagnostic-tab">
          
          {/* Diagnostic Action Launcher */}
          {!analysis && !loadingAnalysis && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-5 shadow-xs">
              <div className="mx-auto w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">¿Listo para un chequeo financiero completo?</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Compilaremos tus transacciones del mes de <strong>{getSelectedMonthName()}</strong>, balances de cuentas de débito, límites de tarjetas de crédito y cuotas pendientes para que la Inteligencia Artificial analice tus patrones financieros.
                </p>
              </div>
              <div>
                <button
                  onClick={performAnalysis}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2 mx-auto"
                  id="btn-run-analysis"
                >
                  <Sparkles className="w-4 h-4" /> Generar Diagnóstico con IA
                </button>
              </div>
              <div className="text-[10px] text-slate-400 max-w-sm mx-auto">
                *Tus datos financieros residen localmente en el navegador y el servidor utiliza un proxy para el análisis del periodo.
              </div>
            </div>
          )}

          {/* Loading status panel */}
          {loadingAnalysis && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto text-center space-y-4 shadow-sm animate-pulse">
              <div className="mx-auto w-12 h-12 text-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Planificando auditoría...</h4>
                <p className="text-xs text-indigo-600 font-mono font-bold animate-pulse">{loadingStep}</p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-slate-900 h-1.5 rounded-full animate-[shimmer_1.5s_infinite]" style={{ width: '80%' }}></div>
              </div>
              <p className="text-[10px] text-slate-400">Por favor, espera unos segundos mientras Gemini AI procesa el diagnóstico del mes.</p>
            </div>
          )}

          {/* Error notice */}
          {analysisError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 max-w-xl mx-auto flex gap-3 shadow-xs">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <div className="space-y-2 text-xs">
                <h4 className="font-bold">Error en la Generación</h4>
                <p className="leading-relaxed text-rose-700">{analysisError}</p>
                <p className="text-[10px] text-rose-500 font-medium">Recomendación: Si estás desplegando externamente o de manera local, confirma que tu archivo `.env` o el entorno de ejecución tenga declarada la variable de entorno `GEMINI_API_KEY` con un token válido.</p>
                <button
                  onClick={performAnalysis}
                  className="mt-1 px-3 py-1.5 text-[10px] font-bold tracking-wider bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Reintentar ahora
                </button>
              </div>
            </div>
          )}

          {/* Diagnosis results present */}
          {analysis && !loadingAnalysis && !analysisError && (
            <div className="space-y-6" id="analysis-ready-board">
              
              {/* Header with reload helper */}
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-semibold text-slate-500">
                  Análisis computado para <strong className="text-slate-800">{getSelectedMonthName()}</strong>
                </div>
                <button
                  onClick={performAnalysis}
                  className="p-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-950 text-[10px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Volver a computar el análisis con nuevos datos del periodo"
                  id="btn-reanalyze"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Recalcular con IA
                </button>
              </div>

              {/* Grid 1: Executive Summary & Metric Bento */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Health Summary Executive */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-xs lg:col-span-2 space-y-4">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Resumen Ejecutivo y Diagnóstico</h3>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">
                    {analysis.resumenDeSalud}
                  </p>
                </div>

                {/* Key Metrics Bento */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-xs space-y-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Métricas Sugeridas</h3>
                  
                  <div className="space-y-4">
                    {/* Ahorro recomendado */}
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                        <PiggyBank className="w-4 h-4" />
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-400 block font-semibold leading-none mb-1">Ratio Ahorro Ideal</span>
                        <span className="text-base font-extrabold text-slate-900 block leading-none">
                          {analysis.metricasClave?.ahorroRecomendadoPorcentaje || 15}%
                          <span className="text-[10px] font-normal text-slate-450 ml-1">sobre ingresos</span>
                        </span>
                      </div>
                    </div>

                    {/* Ratio deuda */}
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <Percent className="w-4 h-4" />
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-400 block font-semibold leading-none mb-1">Nivel de Endeudamiento</span>
                        <span className={`text-base font-extrabold block leading-none ${
                          analysis.metricasClave?.ratioDeudaVisual?.toLowerCase().includes('crit') || 
                          analysis.metricasClave?.ratioDeudaVisual?.toLowerCase().includes('alert') 
                            ? 'text-rose-600' : 'text-indigo-600'
                        }`}>
                          {analysis.metricasClave?.ratioDeudaVisual || 'Cuidado'}
                        </span>
                      </div>
                    </div>

                    {/* Consejo inversión */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Sugerencia Patrimonial</span>
                      <p className="text-xs text-slate-600 italic font-medium leading-relaxed">
                        "{analysis.metricasClave?.consejoInversion || 'Separa un fondo de reserva antes de gastar.'}"
                      </p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Grid 2: Critical ledger observations */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-105 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Alertas y Bitácoras Obtenidas</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold font-mono">
                    {analysis.diagnosticos?.length || 0} Observaciones
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(analysis.diagnosticos || []).map((diag, index) => {
                    const isAlert = diag.tipo === 'advertencia';
                    const isPositive = diag.tipo === 'positivo';
                    
                    return (
                      <div 
                        key={index} 
                        className={`p-4 rounded-xl border flex gap-3 text-xs ${
                          isPositive 
                            ? 'bg-emerald-50/50 border-emerald-100' 
                            : isAlert 
                              ? 'bg-amber-50/50 border-amber-200' 
                              : 'bg-slate-50/80 border-slate-150'
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {isPositive ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : isAlert ? (
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                          ) : (
                            <HelpCircle className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                            {diag.titulo}
                            <span className={`text-[8px] px-1.5 py-0.2 rounded font-extrabold uppercase font-mono ${
                              isPositive ? 'bg-emerald-100 text-emerald-800' : isAlert ? 'bg-amber-100 text-amber-850' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {diag.tipo}
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-600 leading-relaxed font-normal">{diag.descripcion}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid 3: suggestions list */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 md:p-6 shadow-md border border-slate-800 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">3 Consejos clave del Asesor para tu mes</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs font-medium">
                  {(analysis.sugerencias || []).slice(0, 3).map((sug, idx) => (
                    <div key={idx} className="p-4 bg-slate-850 border border-slate-800 rounded-xl space-y-2 relative overflow-hidden flex flex-col justify-between">
                      <span className="text-xs font-extrabold font-mono text-indigo-400 block">CONSEJO #0{idx + 1}</span>
                      <p className="text-slate-200 leading-relaxed pr-2 font-normal">
                        {sug}
                      </p>
                      <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-indigo-500/5 flex items-center justify-center font-bold text-[18px] text-slate-700 select-none">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col h-[520px]" id="advisor-chat-tab">
          
          {/* Chat header area */}
          <div className="bg-slate-900 text-white p-3.5 px-4 flex items-center justify-between border-b border-slate-800 select-none shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <div>
                <span className="font-bold block leading-none">Coach de Finanzas MZ</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Contexto de cuentas activo</span>
              </div>
            </div>
            
            <button
              onClick={handleResetChat}
              className="p-1 px-2.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white transition-colors"
              title="Reiniciar conversación"
            >
              Reiniciar Chat
            </button>
          </div>

          {/* Message log area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              
              return (
                <div 
                  key={msg.id} 
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'} text-xs font-normal max-w-full`}
                >
                  <div className={`p-3 max-w-[85%] rounded-2xl shadow-2xs leading-relaxed ${
                    isUser 
                      ? 'bg-slate-900 text-white rounded-br-none' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none whitespace-pre-line'
                  }`}>
                    {/* Render helper for simple format bullets & bolding */}
                    {isUser ? (
                      msg.text
                    ) : (
                      <span dangerouslySetInnerHTML={{ 
                        __html: msg.text
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/_(.*?)_/g, '<em>$1</em>')
                          .replace(/^- (.*)$/gm, '&bull; $1<br/>')
                      }} />
                    )}
                    
                    <span className={`block text-[10px] mt-1 text-right leading-none ${isUser ? 'text-slate-400' : 'text-slate-410'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {sendingMessage && (
              <div className="flex justify-start text-xs max-w-full">
                <div className="p-3 bg-white border border-slate-200 rounded-2xl rounded-bl-none text-slate-500 flex items-center gap-1.5 shadow-2xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Se está generando una respuesta personalizada...</span>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Instant Quick Queries Buttons bar */}
          <div className="p-2 bg-slate-100/65 border-t border-slate-150 flex gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
            {cannedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                disabled={sendingMessage}
                className="p-1 px-3 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-full text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-all disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input field actions */}
          <div className="p-3 bg-white border-t border-slate-200 flex gap-2 shrink-0">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              placeholder="Pregunte acerca de su ratio de ahorro, deudas, o cómo optimizar..."
              disabled={sendingMessage}
              className="flex-1 p-2 text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl"
              id="chat-input-field"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || sendingMessage}
              className="p-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white cursor-pointer transition-colors disabled:opacity-40"
              id="chat-send-btn"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      )}

      {/* Security Disclaimer */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-500 text-[11px] leading-relaxed select-none">
        <h4 className="font-bold text-slate-705 flex items-center gap-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Consultoría Financiera Segura
        </h4>
        <p className="mt-1 font-medium">
          Los consejos y análisis brindados representan simulaciones construidas por Inteligencia Artificial de lenguaje natural y no deben tomarse como asesoramiento de un contador certificado. Su información se procesa de forma segura a través del servidor del applet.
        </p>
      </div>

    </div>
  );
}
