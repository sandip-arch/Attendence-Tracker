const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Seed default admin on startup
    await seedAdmin();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@tracker.com';
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'AdminPassword123';
    
    const adminExists = await User.findOne({ email: adminEmail });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        name: 'System Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        isApproved: true
      });
      console.log(`Default admin account seeded successfully: ${adminEmail}`);
    }
  } catch (error) {
    console.error(`Failed to seed default admin: ${error.message}`);
  }
};

module.exports = connectDB;
