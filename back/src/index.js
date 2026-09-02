import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initDb } from './db/db.js';

// Importar Enrutadores Modulares
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import quotesRouter from './routes/quotes.js';
import policiesRouter from './routes/policies.js';
import paymentsRouter from './routes/payments.js';
import advisorsRouter from './routes/advisors.js';
import adminRouter from './routes/admin.js';
import elearningRouter from './routes/elearning.js';
import clientProfilesRouter from './routes/clientProfiles.js';
import { procesarRecordatoriosPolizas } from './services/reminderService.js';
import { iniciarCronComisiones } from './services/commissionService.js';

const app = express();
const port = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/docs', express.static('public/docs'));

// Middleware para asegurar la conexión a DB en Serverless
let isDbInitialized = false;
app.use(async (req, res, next) => {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('Error inicializando DB:', err);
      return res.status(500).json({ error: 'Database connection failed' });
    }
  }
  next();
});

// Montar Rutas Modulares
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/quote', quotesRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', advisorsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/elearning', elearningRouter);
app.use('/api/client-profiles', clientProfilesRouter);

// Endpoints para Vercel Cron Jobs (Reemplazo de los crons continuos)
app.get('/api/cron/reminders', async (req, res) => {
  try {
    await procesarRecordatoriosPolizas();
    res.json({ success: true, message: 'Recordatorios procesados.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cron/commissions', async (req, res) => {
  try {
    await iniciarCronComisiones();
    res.json({ success: true, message: 'Cron de comisiones ejecutado.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ruta de diagnóstico inicial
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor API de Protección y Seguros 360 en funcionamiento.' });
});

// Solo levantar app.listen() si se ejecuta localmente (no en Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  async function startServer() {
    await initDb();
    isDbInitialized = true;
    app.listen(port, () => {
      console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
    });
  }
  startServer();
}

// Exportar app para la función Serverless de Vercel
export default app;