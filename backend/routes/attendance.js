const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  punchIn,
  punchOut,
  list,
  analytics
} = require('../controllers/attendanceController');

router.post('/punch-in', auth, punchIn);
router.post('/punch-out', auth, punchOut);
router.get('/list', auth, list);        // admin or user - frontend may restrict UI
router.get('/analytics', auth, analytics);

module.exports = router;
