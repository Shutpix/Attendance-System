// quick script to seed an admin and a sample user
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');

const run = async () => {
  await connectDB(process.env.MONGO_URI);
  await User.deleteMany({});
  const admin = new User({
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: await bcrypt.hash('password123', 10),
    isAdmin: true
  });
  const user = new User({
    name: 'Alice Employee',
    email: 'alice@example.com',
    passwordHash: await bcrypt.hash('password123', 10),
    isAdmin: false
  });
  await admin.save();
  await user.save();
  console.log('Seeded users: admin and alice');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
