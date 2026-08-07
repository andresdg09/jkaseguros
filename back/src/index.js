import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Importar Enrutadores Modulares
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import quotesRouter from './routes/quotes.js';
import policiesRouter from './routes/policies.js';
import paymentsRouter from './routes/payments.js';
import advisorsRouter from './routes/advisors.js';
import adminRouter from './routes/admin.js';
import elearningRouter from './routes/elearning.js';
import { procesarRecordatoriosPolizas } from './services/reminderService.js';

const app = express();
const port = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/docs', express.static('public/docs'));

// Montar Rutas Modulares
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/quote', quotesRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', advisorsRouter); // /client/advisors, /public/advisors, /advisor/clients, /advisor/create-client
app.use('/api/admin', adminRouter); // /admin/clients, /admin/advisors, /admin/users, /admin/logs, /admin/data
app.use('/api/elearning', elearningRouter);

// Ruta de diagnóstico inicial
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor API de JKA Seguros en funcionamiento.' });
});

// Levantar Servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend modularizado escuchando en http://localhost:${port}`);
  
  // Ejecutar cron de recordatorios al arrancar y luego cada hora
  procesarRecordatoriosPolizas();
  setInterval(procesarRecordatoriosPolizas, 3600000); // 1 hora
});
