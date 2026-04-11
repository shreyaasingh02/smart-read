const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");

// SIGNUP
router.post("/signup", async (req, res) => {
    console.log("Signup API called");
  const { email, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({
    email,
    password: hashed,
    books: {}
  });

  await user.save();

  res.json({ message: "User created" });
});

module.exports = router;

// LOGIN
router.post("/login", async (req, res) => {
    // AUTO LOGIN
if (req.body.userId) {
  const user = await User.findById(req.body.userId);
  return res.json({ userId: user._id, books: user.books });
}
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ msg: "User not found" });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.status(400).json({ msg: "Wrong password" });

  res.json({ userId: user._id, books: user.books });
});

router.post("/save-books", async (req, res) => {
  const { userId, books } = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { books: books } },   // ✅ USE $set
      { new: true }
    );

    console.log("Updated user:", updatedUser); // 👈 DEBUG

    res.json({ message: "Saved successfully" });
  } catch (err) {
    console.log("Error saving:", err);
    res.status(500).json({ error: "Failed to save" });
  }
});