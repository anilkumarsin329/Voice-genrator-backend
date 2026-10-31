const mongoose = require('mongoose');

// READ-ONLY mapping of the platform's existing `admins` collection. This module never writes to it
// and never creates indexes / collections on it.
const adminSchema = new mongoose.Schema(
  {
    email: String,
    password: { type: String, select: false },
    role: String, // 'admin' | 'super_admin'
    isActive: Boolean,
    loginApproved: Boolean,
  },
  { collection: 'admins', autoIndex: false, autoCreate: false, strict: true }
);

module.exports = mongoose.model('Admin', adminSchema);
