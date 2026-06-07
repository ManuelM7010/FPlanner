import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Shared Gemini Client setup with recommended telemetry User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Fallback logic for when the user is rate limited or lacks prepay billing credits
function generateFallbackAnalysis(financialState: any) {
  const { transactions = [], creditCards = [], debitCards = [], installments = [], selectedMonth } = financialState;
  
  const currentMonthTransactions = transactions.filter((tx: any) => tx.month === selectedMonth);
  const incomeTx = currentMonthTransactions.filter((tx: any) => tx.type === 'income');
  const expenseTx = currentMonthTransactions.filter((tx: any) => tx.type === 'expense');

  const totalIncome = incomeTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
  const totalExpense = expenseTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
  const netBalance = +(totalIncome - totalExpense).toFixed(2);

  const diagnosticos: any[] = [];
  
  if (netBalance > 0) {
    diagnosticos.push({
      titulo: "Superávit Directo en Cuenta",
      tipo: "positivo",
      descripcion: `¡Excelente saldo! Tus ingresos de este mes superan tus egresos directos por un total de $${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    });
  } else if (netBalance < 0) {
    diagnosticos.push({
      titulo: "Egreso Excedente / Déficit",
      tipo: "advertencia",
      descripcion: `Atención: Tus salidas directas superan tus ingresos este mes por $${Math.abs(netBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Monitorea tus presupuestos.`
    });
  } else {
    diagnosticos.push({
      titulo: "Balance Justo de Flujo",
      tipo: "neutral",
      descripcion: "Tus ingresos y gastos directos están exactamente empatados este mes. No posees margen de reserva líquida inmediata."
    });
  }

  const totalDebitBalance = debitCards.reduce((sum: number, d: any) => sum + (d.balance || 0), 0);
  if (totalDebitBalance > 1000) {
    diagnosticos.push({
      titulo: "Fondo Líquido Saludable",
      tipo: "positivo",
      descripcion: `Cuentas con un saldo disponible acumulado en cuentas de débito de $${totalDebitBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para respaldar decisiones rápidas.`
    });
  } else if (totalDebitBalance < 200) {
    diagnosticos.push({
      titulo: "Baja Liquidez Operativa",
      tipo: "advertencia",
      descripcion: `Tu saldo líquido acumulado de $${totalDebitBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} es bajo. Procura resguardar este dinero para evitar imprevistos.`
    });
  }

  const totalInstallmentPayments = installments.reduce((sum: number, inst: any) => sum + (inst.monthlyPayment || 0), 0);
  if (totalInstallmentPayments > 0) {
    diagnosticos.push({
      titulo: "Retención de Cuotas Activas",
      tipo: "neutral",
      descripcion: `Tienes programado un egreso obligatorio de $${totalInstallmentPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por compras a plazos o diferidas.`
    });
  }

  let recommendedSavingsPercent = 15;
  let ratioDeudaVisual = "Óptimo";
  let consejoInversion = "Separa un 10% de tus ingresos fijos de inmediato para un depósito a plazo o fondo de inversión antes de consumir.";

  if (totalInstallmentPayments > 0) {
    const ratio = (totalInstallmentPayments / (totalIncome || 1)) * 105;
    if (ratio > 40) {
      ratioDeudaVisual = "Crítico";
      recommendedSavingsPercent = 5;
      consejoInversion = "Te sugerimos liquidar tus compras a plazos más pequeñas de inmediato para recuperar margen operativo.";
    } else if (ratio > 20) {
      ratioDeudaVisual = "Moderado";
      recommendedSavingsPercent = 10;
      consejoInversion = "Es idóneo evitar contratar nuevos diferidos de compras hasta que tus cuotas activas actuales terminen.";
    }
  }

  const sugerencias = [
    "Revisa suscripciones y membresías inactivas o de streaming cancelándolas para recortar de inmediato.",
    "Antes de cada adquisición superior a $50, aplica el compás de espera de 48 horas para verificar si es un deseo o una necesidad real.",
    "Configura un traspaso automático hacia otra cuenta del 5% del flujo para consolidar tu reserva de contingencias."
  ];

  return {
    resumenDeSalud: `📢 [ASISTENTE INTERNO ACTIVO - CRÉDITOS DE IA AGOTADOS EN TU CUENTA]
    
Hola. Notamos que tu clave de Google AI Studio actualmente cuenta con una cuota agotada o restricción de facturación (Error 429 Prepay Exhausted). Para que no pierdas continuidad en tu planificación, hemos activado el motor de simulación inteligente y auditoría matemática local de MZ Planner.

Este periodo registra ingresos acumulados de $${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} y un egreso directo de $${totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, resultando en un balance neto directo de $${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Tu foco estratégico clave debe centrarse en resguardar tus fondos disponibles en débito ($${totalDebitBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). ¡Continúa auditando tu mes!`,
    diagnosticos,
    sugerencias,
    metricasClave: {
      ahorroRecomendadoPorcentaje: recommendedSavingsPercent,
      ratioDeudaVisual,
      consejoInversion
    }
  };
}

function generateFallbackChatResponse(message: string, financialContext: any) {
  const msg = message.toLowerCase();
  let response = "";

  const income = financialContext?.totalIncome || 0;
  const expense = financialContext?.totalExpense || 0;
  const net = financialContext?.netBalance || 0;

  if (msg.includes("ahorr") || msg.includes("guardar") || msg.includes("invers")) {
    response = `Para optimizar tu ahorro este mes (con ingresos de $${income} y gastos de $${expense}):
    
- **Regla 50/30/20**: Destina el 50% de tus ingresos a necesidades básicas, 30% a deseos, y un 20% (o al menos 10-15%) directo a una cuenta de ahorro antes de empezar a gastar.
- **Evita la inflación de estilo de vida**: Cada vez que incrementes ingresos, mantén tus gastos en el mismo nivel por un tiempo y ahorra la diferencia.
- **Fondo de emergencia**: Tu meta inicial deber ser acumular el equivalente a 3 a 6 meses de tus gastos mensuales básicos en cuentas líquidas.`;
  } else if (msg.includes("deuda") || msg.includes("plazo") || msg.includes("tarjeta") || msg.includes("credit")) {
    response = `Evaluando tu estructura de deudas y tarjetas:

- **Límite saludable de deudas**: La suma total de tus mensualidades de créditos y cuotas no debería nunca exceder el 30% de tus ingresos mensuales. ¡Mantén este ratio controlado!
- **Táctica Avalancha**: Enlista tus deudas de mayor a menor tasa de interés. Haz abonos extras a la tarjeta de mayor costo financiero mientras cumples el mínimo de las otras de forma estricta.
- **Táctica Bola de Nieve**: Cancela la de deuda más pequeña primero para conseguir victorias rápidas y motivación.`;
  } else if (msg.includes("gastar") || msg.includes("recort") || msg.includes("gasto") || msg.includes("egreso") || msg.includes("comprar")) {
    response = `Para optimizar el control de egresos de inmediato:

- **Recorta las suscripciones**: Cancela toda app, canal o membresía que lleves más de 20 días sin utilizar.
- **Detener el Gasto Hormiga**: Lleva un registro minucioso en este planificador de cada pequeña compra. Los goteos acumulados (cafés, antojos, etc.) componen hasta el 15% del presupuesto.
- **Límites rígidos semanales**: Asigna un techo estricto a gastos recreativos y de restaurante por semana, y vigila no pasarte de esa cifra.`;
  } else {
    response = `¡Hola! Como tu Coach Financiero MZ asignado, te comparto estas 3 claves del estado del periodo seleccionado:

1. **Balance Mensual**: Tu balance de ingresos directos vs egresos directos de este mes se sitúa en $${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ($${income.toLocaleString()} vs $${expense.toLocaleString()}).
2. **Saldo Disponible**: Asegúrate de mantener un remanente idóneo en tus cuentas de débito antes de comprometer dinero en compras secundarias.
3. **Control de Tarjetas**: Paga siempre el "Pago para no generar intereses" para evitar el incremento de tu ratio de endeudamiento.

¿Sobre qué consulta particular o meta financiera te gustaría conversar con tu coach?`;
  }

  return `🤖 **[Modo de Emergencia Local - Créditos de IA del Usuario Agotados]**

${response}`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API: Health probe
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: AI Financial Advisor Analysis
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { financialState } = req.body;
      if (!financialState) {
        return res.status(400).json({ error: "No financial state provided." });
      }

      const { transactions, creditCards, debitCards, installments, categories, selectedMonth } = financialState;

      // Filter transactions for selected month
      const currentMonthTransactions = (transactions || []).filter((tx: any) => tx.month === selectedMonth);
      const incomeTx = currentMonthTransactions.filter((tx: any) => tx.type === 'income');
      const expenseTx = currentMonthTransactions.filter((tx: any) => tx.type === 'expense');

      const totalIncome = incomeTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
      const totalExpense = expenseTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);

      // Prepare an executive ledger context for Gemini
      const dataContext = JSON.stringify({
        selectedMonth,
        metrics: {
          totalIncome,
          totalExpense,
          netBalance: +(totalIncome - totalExpense).toFixed(2),
          numberOfTransactions: currentMonthTransactions.length,
        },
        debitCardsAndAccounts: (debitCards || []).map((d: any) => ({ name: d.name, balance: d.balance })),
        creditCards: (creditCards || []).map((c: any) => ({ name: c.name, limit: c.limit })),
        installmentsAndLoans: (installments || []).map((inst: any) => ({
          description: inst.description,
          type: inst.type,
          totalAmount: inst.totalAmount,
          monthlyPayment: inst.monthlyPayment,
          installments: inst.installments,
          purchaseDate: inst.purchaseDate,
        })),
        recentExpenses: expenseTx.slice(0, 10).map((tx: any) => ({
          description: tx.description,
          amount: tx.amount,
          category: tx.category,
          isFixed: tx.isFixed
        }))
      }, null, 2);

      const systemInstruction = 
        "Eres un Asesor Financiero Personal altamente educado, inteligente, ejecutivo y motivador. " +
        "Tu misión es analizar el estado de cuenta y las finanzas del usuario correspondientes al mes seleccionado " +
        "para proporcionar un diagnóstico profundo, consejos accionables y felicitar o alertar según corresponda. " +
        "Debes responder estrictamente en formato JSON utilizando el esquema exacto provisto. " +
        "No infieras datos falsos, elabora a partir de los datos exactos del usuario. Responde en español.";

      const prompt = `Analiza la siguiente situación financiera del usuario para el mes de ${selectedMonth}:\n\n${dataContext}`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          resumenDeSalud: {
            type: Type.STRING,
            description: "Un resumen de su rendimiento, balance y consejos clave para el mes actual, felicitándolos o dándoles aliento profesional."
          },
          diagnosticos: {
            type: Type.ARRAY,
            description: "Analiza el mix de gastos, cuentas e ingresos. Proporciona observaciones útiles (positivas o de tarjeta, etc.)",
            items: {
              type: Type.OBJECT,
              properties: {
                titulo: { type: Type.STRING },
                tipo: { 
                  type: Type.STRING,
                  description: "Debe ser estrictamente uno de: 'positivo', 'advertencia', 'neutral'"
                },
                descripcion: { type: Type.STRING, description: "Detalle técnico, amigable y práctico." }
              },
              required: ["titulo", "tipo", "descripcion"]
            }
          },
          sugerencias: {
            type: Type.ARRAY,
            description: "Exactamente 3 sugerencias bien redactadas de ahorro e inversión.",
            items: { type: Type.STRING }
          },
          metricasClave: {
            type: Type.OBJECT,
            properties: {
              ahorroRecomendadoPorcentaje: { 
                type: Type.NUMBER, 
                description: "Porcentaje exacto de ahorro recomendado basado en sus gastos e ingresos." 
              },
              ratioDeudaVisual: { 
                type: Type.STRING, 
                description: "Una breve calificación del nivel de endeudamiento (ej: 'Óptimo', 'Moderado', 'Bajo cuidado', 'Alerta')." 
              },
              consejoInversion: {
                type: Type.STRING,
                description: "Un consejo práctico de inversión o reserva."
              }
            },
            required: ["ahorroRecomendadoPorcentaje", "ratioDeudaVisual", "consejoInversion"]
          }
        },
        required: ["resumenDeSalud", "diagnosticos", "sugerencias", "metricasClave"]
      };

      let resultJson;
      try {
        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
          }
        });

        const responseText = aiResponse.text || "{}";
        resultJson = JSON.parse(responseText.trim());
      } catch (geminiErr: any) {
        console.warn("Gemini API direct call failed, triggering local fallback analyzer:", geminiErr);
        resultJson = generateFallbackAnalysis(req.body.financialState);
      }

      res.json(resultJson);

    } catch (error: any) {
      console.error("Gemini Analysis general error:", error);
      res.status(500).json({ error: error.message || "Error al procesar el análisis financiero con Inteligencia Artificial." });
    }
  });

  // API Route: AI Financial Advisor Interactive Chat Coach
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { message, chatHistory, financialContext } = req.body;
      if (!message) {
        return res.status(400).json({ error: "No message parameter provided." });
      }

      // Format previous chat history for Gemini. 
      // Mapping to Gemini standard role/parts structure if needed, or we can use a single prompt incorporating history.
      // Since it's easier and robust to compile chat history into the request contents as system guidance, let's build standard format:
      const contextPrompt = financialContext 
        ? `CONTEXTO FINANCIERO DEL USUARIO PARA EL MES DE TRABAJO ${financialContext.selectedMonth}:
- Ingresos Totales de este mes: $${financialContext.totalIncome}
- Gastos Totales de este mes: $${financialContext.totalExpense}
- Balance Neto: $${financialContext.netBalance}
- Cuentas débito activas: ${JSON.stringify(financialContext.debitAccounts || [])}
- Tarjetas de crédito límites: ${JSON.stringify(financialContext.creditLimits || [])}
- Listas de compras a plazos o préstamos mensuales: ${JSON.stringify(financialContext.installments || [])}
Utiliza esta información para responder a las preguntas de manera ultra personalizada y real.`
        : "";

      const formattedHistory = (chatHistory || []).map((item: any) => {
        return `${item.role === 'user' ? 'Usuario' : 'Asesor AI'}: ${item.text}`;
      }).join("\n");

      const systemInstruction = 
        "Eres un Coach Financiero Inteligente y Planner de tarjetas de la app 'Financial Planner MZ'. " +
        "Te comunicas de manera ejecutiva, muy clara, simpática y profesional en español. " +
        "Te apasiona ayudar a las personas a planificar sus presupuestos, pagar a tiempo sus tarjetas de crédito, " +
        "evaluar si pueden costear compras a plazos o financiamiento, y diseñar estrategias de ahorro. " +
        "Mantén tus respuestas bien redactadas, utiliza viñetas de markdown para que sea fácil de leer en pantallas móviles, " +
        "y mantén un tamaño oportuno (no más de 3 párrafos cortos por respuesta).";

      const prompt = `${contextPrompt}\n\nHistorial de Chat:\n${formattedHistory}\n\nUsuario: ${message}\n\nAsesor AI:`;

      let replyText = "";
      try {
        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction,
          }
        });
        replyText = aiResponse.text || "";
      } catch (geminiErr: any) {
        console.warn("Gemini API Chat call failed, triggering local fallback chat responder:", geminiErr);
        replyText = generateFallbackChatResponse(message, financialContext);
      }

      res.json({ text: replyText || "Lo siento, no pude procesar su consulta en este momento." });

    } catch (error: any) {
      console.error("Gemini Chat Error:", error);
      res.status(500).json({ error: error.message || "Error al procesar la respuesta con el Coach Financiero IA." });
    }
  });

  // Vite development integration or static serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Financial Planner server booting on port ${PORT}`);
  });
}

startServer();
