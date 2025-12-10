const Attendance = require('../models/Attendance');
const User = require('../models/User');
const dayjs = require('dayjs'); // we'll require this below - add to package.json if desired
// but to avoid extra dependency we will implement simple functions using Date objects.

function toYMD(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseHMToMinutes(hm) {
  // hm in "HH:MM"
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

// compute punctuality: uses BUSINESS_START (HH:MM) and GRACE_MINUTES from env
function computePunctuality(punchInISO) {
  if (!punchInISO) return 'unknown';
  const BUSINESS_START = process.env.BUSINESS_START || '09:00';
  const GRACE_MINUTES = parseInt(process.env.GRACE_MINUTES || '10', 10);

  const inDate = new Date(punchInISO);
  const hh = String(inDate.getHours()).padStart(2, '0');
  const mm = String(inDate.getMinutes()).padStart(2, '0');
  const punchHM = `${hh}:${mm}`;

  const punchMinutes = parseHMToMinutes(punchHM);
  const startMinutes = parseHMToMinutes(BUSINESS_START);

  if (punchMinutes < startMinutes) return 'early';
  if (punchMinutes <= startMinutes + GRACE_MINUTES) return 'on-time';
  return 'late';
}

exports.punchIn = async (req, res) => {
  const user = req.user;
  const now = new Date();
  const date = toYMD(now);
  try {
    // upsert attendance for the day: only allow one punch in if not present
    let att = await Attendance.findOne({ employee: user._id, date });
    if (att && att.punchIn) return res.status(400).json({ message: 'Already punched in' });

    if (!att) {
      att = new Attendance({ employee: user._id, date });
    }
    att.punchIn = now.toISOString();
    att.punctuality = computePunctuality(att.punchIn);
    await att.save();
    await att.populate('employee', 'name email').execPopulate();
    res.json(att);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to punch in' });
  }
};

exports.punchOut = async (req, res) => {
  const user = req.user;
  const now = new Date();
  const date = toYMD(now);
  try {
    const att = await Attendance.findOne({ employee: user._id, date });
    if (!att || !att.punchIn) return res.status(400).json({ message: 'No punch in record for today' });
    if (att.punchOut) return res.status(400).json({ message: 'Already punched out' });

    att.punchOut = now.toISOString();
    // compute totalWorkedHours: difference between punchIn and punchOut in hours
    const inTime = new Date(att.punchIn);
    const diffMs = new Date(att.punchOut) - inTime;
    att.totalWorkedHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // two decimals
    await att.save();
    await att.populate('employee', 'name email').execPopulate();
    res.json(att);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to punch out' });
  }
};

/**
 * List attendances with filters:
 *  - date (YYYY-MM-DD) OR dateFrom/dateTo
 *  - search (employee name)
 *  - punctuality (early/on-time/late)
 * Pagination: page, limit
 */
exports.list = async (req, res) => {
  const { date, dateFrom, dateTo, search, punctuality, page = 1, limit = 50 } = req.query;
  const q = {};
  if (date) q.date = date;
  if (dateFrom || dateTo) {
    q.date = {};
    if (dateFrom) q.date.$gte = dateFrom;
    if (dateTo) q.date.$lte = dateTo;
  }
  if (punctuality) q.punctuality = punctuality;

  // build aggregate to allow employee name search
  let aggregate = [
    { $match: q },
    {
      $lookup: {
        from: 'users',
        localField: 'employee',
        foreignField: '_id',
        as: 'employeeObj'
      }
    },
    { $unwind: '$employeeObj' }
  ];
  if (search) {
    aggregate.push({ $match: { 'employeeObj.name': { $regex: search, $options: 'i' } } });
  }
  aggregate.push({ $sort: { date: -1, createdAt: -1 } });
  const skip = (Number(page) - 1) * Number(limit);
  aggregate.push({ $skip: skip }, { $limit: Number(limit) });

  const results = await Attendance.aggregate(aggregate);
  // map to nicer shape
  const mapped = results.map(r => ({
    id: r._id,
    employee: { id: r.employeeObj._id, name: r.employeeObj.name, email: r.employeeObj.email },
    date: r.date,
    punchIn: r.punchIn,
    punchOut: r.punchOut,
    totalWorkedHours: r.totalWorkedHours,
    punctuality: r.punctuality
  }));
  res.json({ data: mapped });
};

exports.analytics = async (req, res) => {
  // returns: totalEmployees, presentToday, onTimeCount, lateCount, attendanceRate
  const today = toYMD(new Date());
  const totalEmployees = await User.countDocuments();
  const presentTodayAgg = await Attendance.aggregate([
    { $match: { date: today } },
    {
      $group: {
        _id: '$punctuality',
        count: { $sum: 1 }
      }
    }
  ]);
  const counts = { early: 0, 'on-time': 0, late: 0, unknown: 0 };
  let presentToday = 0;
  for (const row of presentTodayAgg) {
    counts[row._id] = row.count;
    presentToday += row.count;
  }
  const onTimeCount = counts['on-time'] || 0;
  const lateCount = counts['late'] || 0;
  const attendanceRate = totalEmployees === 0 ? 0 : Math.round((presentToday / totalEmployees) * 10000) / 100;
  res.json({ totalEmployees, presentToday, onTimeCount, lateCount, attendanceRate });
};
