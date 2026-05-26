const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const appointmentsRouter = require('./src/routes/appointments');
const lookupsRouter = require('./src/routes/lookups');

const app = express();
const PORT = Number(process.env.PORT || 4010);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'single-appointment-api' });
});

app.use('/api/appointments', appointmentsRouter);
app.use('/api/lookups', lookupsRouter);

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
