const express = require('express');
const { createAppointment } = require('../controllers/appointmentsController');

const router = express.Router();

router.post('/', createAppointment);

module.exports = router;
