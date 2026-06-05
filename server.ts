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

async function startServer() {
  const app = express();
  const PORT = 3000;

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
      const resultJson = JSON.parse(responseText.trim());
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

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
        }
      });

      res.json({ text: aiResponse.text || "Lo siento, no pude procesar su consulta en este momento." });

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
