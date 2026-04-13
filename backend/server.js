require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/auth");

const app = express();

// ✅ CORS FIRST
app.use(cors({
  origin: "https://effortless-cascaron-42afe1.netlify.app"
}));

// ✅ BODY PARSER LIMIT (VERY IMPORTANT)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ✅ ROUTES AFTER
app.use("/api", authRoutes);

// ✅ DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));


// ✅ SERVER
app.listen(5000, () => console.log("Server running on port 5000"));