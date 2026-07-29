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

const app = express();
const port = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Montar Rutas Modulares
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/quote', quotesRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', advisorsRouter); // /client/advisors, /public/advisors, /advisor/clients, /advisor/create-client
app.use('/api/admin', adminRouter); // /admin/clients, /admin/advisors, /admin/users, /admin/logs, /admin/data

// Ruta de diagnóstico inicial
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor API de JKA Seguros en funcionamiento.' });
});

// Levantar Servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend modularizado escuchando en http://localhost:${port}`);
});
