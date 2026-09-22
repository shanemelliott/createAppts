import { createAppointmentFlow } from '../services/appointmentService.js';

async function createAppointment(req, res, next) {
  try {
    const result = await createAppointmentFlow(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export {
  createAppointment
};
