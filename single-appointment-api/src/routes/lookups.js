const express = require('express');
const { getClinics, getDefaultPatients, getClinicResourceByClinicIen, getClinicAvailability } = require('../services/lookupService');
const { getToken } = require('../services/tokenService');

const router = express.Router();

router.get('/clinics', async (req, res, next) => {
  try {
    const clinics = await getClinics();
    res.json({ success: true, count: clinics.length, clinics });
  } catch (err) {
    next(err);
  }
});

router.get('/patients/default', async (req, res, next) => {
  try {
    const patients = await getDefaultPatients();
    res.json({ success: true, count: patients.length, patients });
  } catch (err) {
    next(err);
  }
});

router.get('/jwt-debug', async (req, res, next) => {
  try {
    const token = await getToken();
    console.log('[jwt-debug] raw token (first 80):', token && token.slice(0, 80));
    const parts = token.split('.');
    let payload = null;
    if (parts.length === 3) {
      // Fix base64 padding before decoding
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
        parts[1].length + (4 - parts[1].length % 4) % 4, '='
      );
      payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    }
    console.log('[jwt-debug] payload:', JSON.stringify(payload, null, 2));
    res.json({ success: true, payload });
  } catch (err) {
    console.error('[jwt-debug] error:', err.message);
    next(err);
  }
});

router.get('/clinics/:clinicIen/resource', async (req, res, next) => {
  try {
    const { clinicIen } = req.params;
    const resolved = await getClinicResourceByClinicIen(clinicIen);
    res.json({ success: true, ...resolved });
  } catch (err) {
    next(err);
  }
});

router.get('/clinics/:clinicIen/availability', async (req, res, next) => {
  try {
    const { clinicIen } = req.params;
    const { date } = req.query;
    
    if (!date) {
      res.status(400).json({ success: false, error: 'date query parameter required (YYYY-MM-DD)' });
      return;
    }

    const availability = await getClinicAvailability(clinicIen, date);
    res.json({ success: true, date, clinicIen, slots: availability });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
