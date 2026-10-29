import express from 'express';
import {
  getClinics,
  getDefaultPatients,
  searchPatients,
  getClinicResourceByClinicIen,
  getClinicAvailability,
  getPatientCellPhone,
  setPatientCellPhone,
  getClinicOpenSlots
} from '../services/lookupService.js';
import { getPatientAppointments } from '../services/patientAppointmentService.js';
import { getToken } from '../services/tokenService.js';

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

router.get('/patients/search', async (req, res, next) => {
  try {
    const { name } = req.query;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'name query parameter is required'
      });
    }

    const patients = await searchPatients(name.trim());
    res.json({ success: true, count: patients.length, patients });
  } catch (err) {
    next(err);
  }
});

router.get('/patients/:dfn/appointments', async (req, res, next) => {
  try {
    const { dfn } = req.params;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'start and end query parameters are required (YYYY-MM-DD)'
      });
    }

    const result = await getPatientAppointments({ dfn, startDate: start, endDate: end });
    res.json({
      success: true,
      dfn,
      start: result.start,
      end: result.end,
      count: result.appointments.length,
      appointments: result.appointments,
      raw: result.raw
    });
  } catch (err) {
    next(err);
  }
});

router.get('/clinics/:clinicIen/open-slots', async (req, res, next) => {
  try {
    const { clinicIen } = req.params;
    const { start, end } = req.query;
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (!/^\d+$/.test(clinicIen)) {
      return res.status(400).json({ success: false, error: 'clinicIen must be numeric' });
    }
    if (!isoDate.test(start || '') || !isoDate.test(end || '') || end < start) {
      return res.status(400).json({ success: false, error: 'start and end query parameters are required (YYYY-MM-DD, end >= start)' });
    }

    const result = await getClinicOpenSlots(clinicIen, start, end);
    res.json({ success: true, clinicIen, start, end, count: result.days.length, days: result.days, raw: result.raw });
  } catch (err) {
    next(err);
  }
});

router.get('/patients/:dfn/cell-phone', async (req, res, next) => {
  try {
    const { dfn } = req.params;
    if (!/^\d+$/.test(dfn)) {
      return res.status(400).json({ success: false, error: 'dfn must be numeric' });
    }
    const result = await getPatientCellPhone(dfn);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.put('/patients/:dfn/cell-phone', async (req, res, next) => {
  try {
    const { dfn } = req.params;
    if (!/^\d+$/.test(dfn)) {
      return res.status(400).json({ success: false, error: 'dfn must be numeric' });
    }

    // Store digits only; empty string deletes the field.
    const cellPhone = String(req.body?.cellPhone ?? '').replace(/\D/g, '');
    if (cellPhone && cellPhone.length !== 10) {
      return res.status(400).json({ success: false, error: 'cellPhone must be 10 digits (or empty to clear)' });
    }

    const result = await setPatientCellPhone(dfn, cellPhone);
    res.json({ success: true, ...result });
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
    res.json({ success: true, token, payload });
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

export default router;
