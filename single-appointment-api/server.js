import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import https from 'https';
import axios from 'axios';
import appointmentsRouter from './src/routes/appointments.js';
import lookupsRouter from './src/routes/lookups.js';
import clinicListsRouter from './src/routes/clinicLists.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// SSL Certificate handling for VA government certificates
// Only disable for non-production environments (sqa, preprod)
// Set NODE_TLS_REJECT_UNAUTHORIZED=0 in .env for staging/preprod
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
});

// Set global axios default to handle SSL for all axios calls including @va modules
axios.defaults.httpsAgent = httpsAgent;

const app = express();
const PORT = Number(process.env.PORT || 4010);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'single-appointment-api' });
});

app.use('/api/appointments', appointmentsRouter);
app.use('/api/lookups', lookupsRouter);
app.use('/api/clinic-lists', clinicListsRouter);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Unexpected error';
  const body = { success: false, error: message };
  if (err.details) {
    body.details = err.details;
  }
  res.status(status).json(body);
});

app.listen(PORT, () => {
  console.log(`single-appointment-api listening on http://localhost:${PORT}`);
});
