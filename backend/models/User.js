const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  books: Object   // 🔥 your whole books state will go here
});

module.exports = mongoose.model("User", userSchema);