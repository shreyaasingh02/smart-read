const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/auth");

const app = express();

// ✅ CORS FIRST
app.use(cors({
  origin: "http://localhost:5173"
}));

// ✅ BODY PARSER LIMIT (VERY IMPORTANT)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ✅ ROUTES AFTER
app.use("/api", authRoutes);

// ✅ DB
mongoose.connect("mongodb://127.0.0.1:27017/bookApp")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// ✅ SERVER
app.listen(5000, () => console.log("Server running on port 5000"));