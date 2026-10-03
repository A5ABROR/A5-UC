const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================
   STATIC FILES
========================= */

app.use(express.static(__dirname));

/* =========================
   BASIC DATA
========================= */

const OWNER_USERNAME = "@A5_ABROR";

let admins = [];

let orders = [];

let topups = [];

let promoCodes = [];

let users = [];

let settings = {
  siteName: "A5 UC",
  owner: OWNER_USERNAME
};

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   SERVER STATUS
========================= */

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "A5 UC SERVER IS RUNNING 🚀",
    owner: OWNER_USERNAME,
    admins: admins.length,
    orders: orders.length,
    topups: topups.length,
    promoCodes: promoCodes.length
  });
});

/* =========================
   ADMIN STATUS
========================= */

app.get("/api/admin/status", (req, res) => {
  res.json({
    success: true,
    owner: OWNER_USERNAME,
    admins: admins,
    orders: orders.length,
    topups: topups.length,
    promoCodes: promoCodes.length,
    users: users.length
  });
});

/* =========================
   USERS
========================= */

app.post("/api/users", (req, res) => {

  const user = req.body;

  if (!user || !user.id) {
    return res.status(400).json({
      success: false,
      message: "User ID kerak."
    });
  }

  const exists = users.find(
    item => String(item.id) === String(user.id)
  );

  if (!exists) {
    users.push({
      id: user.id,
      username: user.username || "",
      name: user.name || "",
      balance: 0,
      createdAt: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    message: "User saqlandi."
  });

});

/* =========================
   ORDERS
========================= */

app.post("/api/orders", (req, res) => {

  const data = req.body;

  const order = {
    id: "ORD-" + Date.now(),
    userId: data.userId || "",
    product: data.product || "",
    quantity: Number(data.quantity || 1),
    amount: Number(data.amount || 0),
    status: "pending",
    assignedAdmin: null,
    createdAt: new Date().toISOString()
  };

  orders.push(order);

  res.json({
    success: true,
    order
  });

});

app.get("/api/orders", (req, res) => {

  res.json({
    success: true,
    orders
  });

});

/* =========================
   ORDER STATUS
========================= */

app.post("/api/orders/:id/status", (req, res) => {

  const order = orders.find(
    item => item.id === req.params.id
  );

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Buyurtma topilmadi."
    });
  }

  order.status =
    req.body.status || order.status;

  res.json({
    success: true,
    order
  });

});

/* =========================
   TOPUP
========================= */

app.post("/api/topups", (req, res) => {

  const data = req.body;

  const topup = {
    id: "TOP-" + Date.now(),
    userId: data.userId || "",
    amount: Number(data.amount || 0),
    receipt: data.receipt || null,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  topups.push(topup);

  res.json({
    success: true,
    message: "Balans to'ldirish arizasi qabul qilindi.",
    topup
  });

});

app.get("/api/topups", (req, res) => {

  res.json({
    success: true,
    topups
  });

});

/* =========================
   TOPUP STATUS
========================= */

app.post("/api/topups/:id/status", (req, res) => {

  const topup = topups.find(
    item => item.id === req.params.id
  );

  if (!topup) {
    return res.status(404).json({
      success: false,
      message: "Ariza topilmadi."
    });
  }

  topup.status =
    req.body.status || topup.status;

  res.json({
    success: true,
    topup
  });

});

/* =========================
   PROMO CODES
========================= */

app.post("/api/promo", (req, res) => {

  const code = String(
    req.body.code || ""
  ).trim();

  const uc = Number(
    req.body.uc || 60
  );

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "Promo kod kiriting."
    });
  }

  promoCodes.push({
    id: "PROMO-" + Date.now(),
    code: code,
    uc: uc,
    used: false,
    createdAt: new Date().toISOString()
  });

  res.json({
    success: true,
    message: "Promo kod qo'shildi."
  });

});

/* =========================
   GET PROMO CODES
========================= */

app.get("/api/promo", (req, res) => {

  res.json({
    success: true,

    /*
      Keyinchalik xavfsizlik uchun
      promo kodlarning o'zini oddiy
      admin API orqali ko'rsatmaymiz.
    */

    count: promoCodes.length
  });

});

/* =========================
   GIVE ONE PROMO CODE
========================= */

app.post("/api/promo/use", (req, res) => {

  const uc = Number(
    req.body.uc || 60
  );

  const promo = promoCodes.find(
    item =>
      Number(item.uc) === uc &&
      item.used === false
  );

  if (!promo) {

    return res.status(404).json({
      success: false,
      message: "Promocodlar tugadi. Iltimos kuting."
    });

  }

  promo.used = true;

  promo.usedAt =
    new Date().toISOString();

  res.json({
    success: true,
    code: promo.code,
    uc: promo.uc
  });

});

/* =========================
   ADMINS
========================= */

app.post("/api/admins", (req, res) => {

  const username =
    String(req.body.username || "").trim();

  if (!username) {
    return res.status(400).json({
      success: false,
      message: "Admin username kerak."
    });
  }

  if (!admins.includes(username)) {
    admins.push(username);
  }

  res.json({
    success: true,
    admins
  });

});

app.get("/api/admins", (req, res) => {

  res.json({
    success: true,
    admins
  });

});

/* =========================
   REMOVE ADMIN
========================= */

app.delete("/api/admins/:username", (req, res) => {

  const username =
    decodeURIComponent(req.params.username);

  admins =
    admins.filter(
      item => item !== username
    );

  res.json({
    success: true,
    admins
  });

});

/* =========================
   SETTINGS
========================= */

app.get("/api/settings", (req, res) => {

  res.json({
    success: true,
    settings
  });

});

app.post("/api/settings", (req, res) => {

  settings = {
    ...settings,
    ...req.body
  };

  res.json({
    success: true,
    settings
  });

});

/* =========================
   404
========================= */

app.use((req, res) => {

  res.status(404).json({
    success: false,
    message: "API manzili topilmadi."
  });

});

/* =========================
   START
========================= */

app.listen(PORT, () => {

  console.log("================================");
  console.log("A5 UC SERVER IS RUNNING 🚀");
  console.log("PORT:", PORT);
  console.log("OWNER:", OWNER_USERNAME);
  console.log("================================");

});
