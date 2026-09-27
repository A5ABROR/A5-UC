const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// A5 UC OWNER
// ======================================================

const OWNER_ID = "8798874882";
const OWNER_USERNAME = "@A5_ABROR";

// ======================================================
// ENV
// ======================================================

const BOT_TOKEN = process.env.BOT_TOKEN || "";

// ======================================================
// EXPRESS
// ======================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ======================================================
// DATA FILE
// ======================================================

const DATA_FILE = path.join(__dirname, "a5-data.json");

const defaultData = {
    users: [],
    orders: [],
    topups: [],
    promoCodes: [],
    admins: [],
    banners: [],
    prices: {
        uc60: 11500,
        uc120: 23000,
        uc180: 34500,
        uc240: 46000,
        uc325: 57500,
        premium1: 45000,
        premium12: 290000,
        gift3: 160000,
        gift6: 220000,
        gift12: 350000
    },
    settings: {
        promoEnabled: true,
        maintenance: false,
        discountPercent: 0
    }
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(defaultData, null, 2)
            );
            return JSON.parse(JSON.stringify(defaultData));
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");

        if (!raw.trim()) {
            return JSON.parse(JSON.stringify(defaultData));
        }

        return {
            ...defaultData,
            ...JSON.parse(raw)
        };

    } catch (error) {
        console.error("DATA LOAD ERROR:", error);

        return JSON.parse(JSON.stringify(defaultData));
    }
}

let db = loadData();

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(db, null, 2)
        );

        return true;

    } catch (error) {
        console.error("DATA SAVE ERROR:", error);
        return false;
    }
}

// ======================================================
// HELPERS
// ======================================================

function id() {
    return crypto.randomUUID();
}

function now() {
    return new Date().toISOString();
}

function findUser(telegramId) {
    return db.users.find(
        u => String(u.telegramId) === String(telegramId)
    );
}

function createUser(telegramId, extra = {}) {

    let user = findUser(telegramId);

    if (!user) {

        user = {
            id: id(),
            telegramId: String(telegramId),
            username: extra.username || "",
            firstName: extra.firstName || "",
            lastName: extra.lastName || "",
            balance: 0,
            createdAt: now(),
            updatedAt: now()
        };

        db.users.push(user);
        saveData();
    }

    return user;
}

function isOwner(telegramId) {
    return String(telegramId) === OWNER_ID;
}

function isAdmin(telegramId) {

    if (isOwner(telegramId)) {
        return true;
    }

    return db.admins.some(
        admin =>
            String(admin.telegramId) === String(telegramId) &&
            admin.active !== false
    );
}

// ======================================================
// TELEGRAM WEB APP INIT DATA VERIFICATION
// ======================================================

function verifyTelegramInitData(initData) {

    if (!BOT_TOKEN) {
        return {
            ok: false,
            error: "BOT_TOKEN sozlanmagan"
        };
    }

    if (!initData) {
        return {
            ok: false,
            error: "Telegram initData topilmadi"
        };
    }

    try {

        const params = new URLSearchParams(initData);

        const hash = params.get("hash");

        if (!hash) {
            return {
                ok: false,
                error: "Hash topilmadi"
            };
        }

        params.delete("hash");

        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");

        const secretKey = crypto
            .createHmac("sha256", "WebAppData")
            .update(BOT_TOKEN)
            .digest();

        const calculatedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        const hashBuffer = Buffer.from(hash, "hex");
        const calculatedBuffer = Buffer.from(
            calculatedHash,
            "hex"
        );

        if (
            hashBuffer.length !== calculatedBuffer.length ||
            !crypto.timingSafeEqual(
                hashBuffer,
                calculatedBuffer
            )
        ) {
            return {
                ok: false,
                error: "Telegram imzosi noto‘g‘ri"
            };
        }

        const userString = params.get("user");

        if (!userString) {
            return {
                ok: false,
                error: "Telegram user topilmadi"
            };
        }

        const user = JSON.parse(userString);

        return {
            ok: true,
            user
        };

    } catch (error) {

        console.error("INIT DATA ERROR:", error);

        return {
            ok: false,
            error: "Telegram ma'lumotlarini tekshirishda xatolik"
        };
    }
}

// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function requireTelegram(req, res, next) {

    const initData =
        req.headers["x-telegram-init-data"];

    const result =
        verifyTelegramInitData(initData);

    if (!result.ok) {

        return res.status(401).json({
            ok: false,
            error: result.error
        });
    }

    req.telegramUser = result.user;

    next();
}

// ======================================================
// ADMIN MIDDLEWARE
// ======================================================

function requireAdmin(req, res, next) {

    const initData =
        req.headers["x-telegram-init-data"];

    const result =
        verifyTelegramInitData(initData);

    if (!result.ok) {

        return res.status(401).json({
            ok: false,
            error: result.error
        });
    }

    const telegramId =
        String(result.user.id);

    if (!isAdmin(telegramId)) {

        return res.status(403).json({
            ok: false,
            error: "Admin huquqi yo‘q"
        });
    }

    req.telegramUser = result.user;
    req.isOwner = isOwner(telegramId);

    next();
}

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", (req, res) => {

    res.json({
        ok: true,
        project: "A5 UC",
        owner: OWNER_USERNAME,
        ownerId: OWNER_ID,
        time: now()
    });
});

// ======================================================
// AUTH
// ======================================================

app.post("/api/auth", requireTelegram, (req, res) => {

    const tg = req.telegramUser;

    const user = createUser(
        tg.id,
        {
            username: tg.username
                ? "@" + tg.username
                : "",
            firstName: tg.first_name || "",
            lastName: tg.last_name || ""
        }
    );

    res.json({
        ok: true,

        user: {
            id: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            balance: user.balance
        },

        role: isOwner(tg.id)
            ? "owner"
            : isAdmin(tg.id)
                ? "admin"
                : "user"
    });
});

// ======================================================
// CURRENT USER
// ======================================================

app.get("/api/me", requireTelegram, (req, res) => {

    const tg = req.telegramUser;

    const user = createUser(tg.id, {
        username: tg.username
            ? "@" + tg.username
            : "",
        firstName: tg.first_name || "",
        lastName: tg.last_name || ""
    });

    res.json({
        ok: true,
        user
    });
});

// ======================================================
// PRODUCTS / PRICES
// ======================================================

app.get("/api/prices", (req, res) => {

    res.json({
        ok: true,
        prices: db.prices
    });
});

// ======================================================
// USER BALANCE
// ======================================================

app.get("/api/balance", requireTelegram, (req, res) => {

    const user = createUser(req.telegramUser.id);

    res.json({
        ok: true,
        balance: user.balance
    });
});

// ======================================================
// CREATE ORDER
// ======================================================

app.post("/api/orders", requireTelegram, (req, res) => {

    const tg = req.telegramUser;

    const {
        product,
        title,
        quantity,
        unitPrice,
        metadata
    } = req.body;

    if (!product) {
        return res.status(400).json({
            ok: false,
            error: "Mahsulot ko‘rsatilmagan"
        });
    }

    const qty =
        Math.max(
            1,
            Number(quantity || 1)
        );

    const price =
        Number(unitPrice || 0);

    if (!Number.isFinite(price) || price < 0) {

        return res.status(400).json({
            ok: false,
            error: "Narx noto‘g‘ri"
        });
    }

    const total =
        price * qty;

    const user =
        createUser(tg.id);

    if (user.balance < total) {

        return res.status(400).json({
            ok: false,
            error: "Balans yetarli emas",
            balance: user.balance,
            total
        });
    }

    // ==================================================
    // BALANCE LOCK
    // ==================================================

    user.balance -= total;
    user.updatedAt = now();

    const order = {

        id: id(),

        telegramId:
            String(tg.id),

        username:
            tg.username
                ? "@" + tg.username
                : "",

        product,

        title:
            title || product,

        quantity: qty,

        unitPrice: price,

        total,

        metadata:
            metadata || {},

        status:
            "pending",

        assignedAdmin:
            null,

        createdAt:
            now(),

        updatedAt:
            now()
    };

    db.orders.push(order);

    saveData();

    res.json({
        ok: true,
        order,
        balance: user.balance
    });
});

// ======================================================
// USER ORDERS
// ======================================================

app.get("/api/orders", requireTelegram, (req, res) => {

    const orders =
        db.orders.filter(
            order =>
                String(order.telegramId) ===
                String(req.telegramUser.id)
        );

    res.json({
        ok: true,
        orders
    });
});

// ======================================================
// HISTORY
// ======================================================

app.get("/api/history", requireTelegram, (req, res) => {

    const telegramId =
        String(req.telegramUser.id);

    const orders =
        db.orders
            .filter(
                x =>
                    String(x.telegramId) ===
                    telegramId
            )
            .map(x => ({
                type: "product",
                id: x.id,
                title: x.title,
                amount: -x.total,
                status: x.status,
                date: x.createdAt
            }));

    const topups =
        db.topups
            .filter(
                x =>
                    String(x.telegramId) ===
                    telegramId
            )
            .map(x => ({
                type: "money",
                id: x.id,
                title: "Hisob to‘ldirish",
                amount: x.amount,
                status: x.status,
                date: x.createdAt
            }));

    const history =
        [...orders, ...topups]
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            );

    res.json({
        ok: true,
        history
    });
});

// ======================================================
// TOP UP REQUEST
// ======================================================

app.post("/api/topups", requireTelegram, (req, res) => {

    const tg = req.telegramUser;

    const amount =
        Number(req.body.amount);

    const receipt =
        req.body.receipt || "";

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return res.status(400).json({
            ok: false,
            error: "Summa noto‘g‘ri"
        });
    }

    if (!receipt) {

        return res.status(400).json({
            ok: false,
            error: "Chek rasmi kerak"
        });
    }

    const topup = {

        id: id(),

        telegramId:
            String(tg.id),

        username:
            tg.username
                ? "@" + tg.username
                : "",

        amount,

        receipt,

        status:
            "pending",

        createdAt:
            now(),

        updatedAt:
            now()
    };

    db.topups.push(topup);

    saveData();

    res.json({
        ok: true,
        message:
            "So‘rovingiz ko‘rib chiqilmoqda",
        topup
    });
});

// ======================================================
// PROMO CODE
// ======================================================

app.post(
    "/api/promo/request",
    requireTelegram,
    (req, res) => {

        const {
            product,
            amount
        } = req.body;

        const available =
            db.promoCodes.find(
                code =>
                    code.active !== false &&
                    !code.used &&
                    code.product === product &&
                    Number(code.amount) ===
                    Number(amount)
            );

        if (!available) {

            return res.json({
                ok: false,
                available: false,
                message:
                    "Hozircha promo kodlar tugagan. Iltimos, kuting."
            });
        }

        // ==================================================
        // ONE TIME LOCK
        // ==================================================

        available.used = true;
        available.usedBy =
            String(req.telegramUser.id);

        available.usedAt =
            now();

        saveData();

        res.json({
            ok: true,
            available: true,
            promoCode: available.code
        });
    }
);

// ======================================================
// ADMIN SUMMARY
// ======================================================

app.get(
    "/api/admin/summary",
    requireAdmin,
    (req, res) => {

        const totalBalance =
            db.users.reduce(
                (sum, user) =>
                    sum + Number(user.balance || 0),
                0
            );

        const pendingOrders =
            db.orders.filter(
                x => x.status === "pending"
            ).length;

        const pendingTopups =
            db.topups.filter(
                x => x.status === "pending"
            ).length;

        const unusedPromo =
            db.promoCodes.filter(
                x =>
                    x.active !== false &&
                    !x.used
            ).length;

        res.json({
            ok: true,

            owner:
                req.isOwner,

            ownerId:
                OWNER_ID,

            ownerUsername:
                OWNER_USERNAME,

            users:
                db.users.length,

            orders:
                db.orders.length,

            pendingOrders,

            topups:
                db.topups.length,

            pendingTopups,

            balance:
                totalBalance,

            promoCodes:
                db.promoCodes.length,

            unusedPromo,

            admins:
                db.admins.length
        });
    }
);

// ======================================================
// ADMIN ORDERS
// ======================================================

app.get(
    "/api/admin/orders",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            orders: db.orders
        });
    }
);

// ======================================================
// ADMIN TOPUPS
// ======================================================

app.get(
    "/api/admin/topups",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            topups: db.topups
        });
    }
);

// ======================================================
// APPROVE TOPUP
// ======================================================

app.post(
    "/api/admin/topups/:id/approve",
    requireAdmin,
    (req, res) => {

        const topup =
            db.topups.find(
                x => x.id === req.params.id
            );

        if (!topup) {

            return res.status(404).json({
                ok: false,
                error: "Top-up topilmadi"
            });
        }

        if (topup.status !== "pending") {

            return res.status(400).json({
                ok: false,
                error: "Bu ariza allaqachon ko‘rib chiqilgan"
            });
        }

        const user =
            findUser(topup.telegramId);

        if (!user) {

            return res.status(404).json({
                ok: false,
                error: "Foydalanuvchi topilmadi"
            });
        }

        user.balance +=
            Number(topup.amount);

        user.updatedAt =
            now();

        topup.status =
            "approved";

        topup.approvedBy =
            String(req.telegramUser.id);

        topup.approvedAt =
            now();

        saveData();

        res.json({
            ok: true,
            message:
                "Balans muvaffaqiyatli to‘ldirildi",
            balance:
                user.balance
        });
    }
);

// ======================================================
// REJECT TOPUP
// ======================================================

app.post(
    "/api/admin/topups/:id/reject",
    requireAdmin,
    (req, res) => {

        const topup =
            db.topups.find(
                x => x.id === req.params.id
            );

        if (!topup) {

            return res.status(404).json({
                ok: false,
                error: "Top-up topilmadi"
            });
        }

        if (topup.status !== "pending") {

            return res.status(400).json({
                ok: false,
                error: "Bu ariza allaqachon ko‘rib chiqilgan"
            });
        }

        topup.status =
            "rejected";

        topup.rejectedBy =
            String(req.telegramUser.id);

        topup.rejectedAt =
            now();

        saveData();

        res.json({
            ok: true,
            message:
                "Top-up rad etildi"
        });
    }
);

// ======================================================
// ADMIN COMPLETE ORDER
// ======================================================

app.post(
    "/api/admin/orders/:id/complete",
    requireAdmin,
    (req, res) => {

        const order =
            db.orders.find(
                x => x.id === req.params.id
            );

        if (!order) {

            return res.status(404).json({
                ok: false,
                error: "Buyurtma topilmadi"
            });
        }

        if (
            order.status !== "pending" &&
            order.status !== "processing"
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "Buyurtmani bu holatda yakunlab bo‘lmaydi"
            });
        }

        order.status =
            "completed";

        order.completedBy =
            String(req.telegramUser.id);

        order.completedAt =
            now();

        order.updatedAt =
            now();

        saveData();

        res.json({
            ok: true,
            message:
                "Buyurtma yakunlandi",
            order
        });
    }
);

// ======================================================
// ADMIN REJECT ORDER
// ======================================================

app.post(
    "/api/admin/orders/:id/reject",
    requireAdmin,
    (req, res) => {

        const order =
            db.orders.find(
                x => x.id === req.params.id
            );

        if (!order) {

            return res.status(404).json({
                ok: false,
                error: "Buyurtma topilmadi"
            });
        }

        if (
            order.status !== "pending" &&
            order.status !== "processing"
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "Buyurtmani rad etib bo‘lmaydi"
            });
        }

        const user =
            findUser(order.telegramId);

        if (user) {

            user.balance +=
                Number(order.total);

            user.updatedAt =
                now();
        }

        order.status =
            "rejected";

        order.rejectedBy =
            String(req.telegramUser.id);

        order.rejectedAt =
            now();

        order.updatedAt =
            now();

        saveData();

        res.json({
            ok: true,
            message:
                "Buyurtma rad etildi va pul balansga qaytarildi",
            order
        });
    }
);

// ======================================================
// PROMO CODES - ADMIN
// ======================================================

app.get(
    "/api/admin/promo",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            promoCodes: db.promoCodes
        });
    }
);

// ======================================================
// ADD PROMO CODE
// ======================================================

app.post(
    "/api/admin/promo",
    requireAdmin,
    (req, res) => {

        const {
            code,
            product,
            amount
        } = req.body;

        if (!code) {

            return res.status(400).json({
                ok: false,
                error: "Promo kod kiriting"
            });
        }

        const exists =
            db.promoCodes.some(
                x =>
                    x.code.toUpperCase() ===
                    String(code).trim().toUpperCase()
            );

        if (exists) {

            return res.status(400).json({
                ok: false,
                error:
                    "Bu promo kod allaqachon mavjud"
            });
        }

        const promo = {

            id: id(),

            code:
                String(code)
                    .trim()
                    .toUpperCase(),

            product:
                product || "PUBG",

            amount:
                Number(amount || 0),

            used:
                false,

            active:
                true,

            createdAt:
                now(),

            createdBy:
                String(req.telegramUser.id)
        };

        db.promoCodes.push(promo);

        saveData();

        res.json({
            ok: true,
            promo
        });
    }
);

// ======================================================
// DELETE PROMO
// ======================================================

app.delete(
    "/api/admin/promo/:id",
    requireAdmin,
    (req, res) => {

        const index =
            db.promoCodes.findIndex(
                x => x.id === req.params.id
            );

        if (index === -1) {

            return res.status(404).json({
                ok: false,
                error: "Promo kod topilmadi"
            });
        }

        db.promoCodes.splice(
            index,
            1
        );

        saveData();

        res.json({
            ok: true,
            message:
                "Promo kod o‘chirildi"
        });
    }
);

// ======================================================
// PRICE MANAGEMENT
// ======================================================

app.get(
    "/api/admin/prices",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            prices: db.prices
        });
    }
);

app.put(
    "/api/admin/prices",
    requireAdmin,
    (req, res) => {

        if (!req.isOwner) {

            return res.status(403).json({
                ok: false,
                error:
                    "Narxlarni faqat owner o‘zgartira oladi"
            });
        }

        const incoming =
            req.body || {};

        for (const key of Object.keys(incoming)) {

            const value =
                Number(incoming[key]);

            if (
                Number.isFinite(value) &&
                value >= 0
            ) {
                db.prices[key] = value;
            }
        }

        saveData();

        res.json({
            ok: true,
            prices: db.prices
        });
    }
);

// ======================================================
// BANNERS
// ======================================================

app.get(
    "/api/banners",
    (req, res) => {

        res.json({
            ok: true,
            banners: db.banners
        });
    }
);

app.get(
    "/api/admin/banners",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            banners: db.banners
        });
    }
);

// ======================================================
// ADD BANNER
// ======================================================

app.post(
    "/api/admin/banners",
    requireAdmin,
    (req, res) => {

        const {
            image,
            title,
            link
        } = req.body;

        if (!image) {

            return res.status(400).json({
                ok: false,
                error:
                    "Banner rasmi kerak"
            });
        }

        const banner = {

            id: id(),

            image,

            title:
                title || "",

            link:
                link || "",

            active:
                true,

            createdAt:
                now()
        };

        db.banners.push(banner);

        saveData();

        res.json({
            ok: true,
            banner
        });
    }
);

// ======================================================
// DELETE BANNER
// ======================================================

app.delete(
    "/api/admin/banners/:id",
    requireAdmin,
    (req, res) => {

        const index =
            db.banners.findIndex(
                x => x.id === req.params.id
            );

        if (index === -1) {

            return res.status(404).json({
                ok: false,
                error:
                    "Banner topilmadi"
            });
        }

        db.banners.splice(
            index,
            1
        );

        saveData();

        res.json({
            ok: true,
            message:
                "Banner o‘chirildi"
        });
    }
);

// ======================================================
// USERS - ADMIN
// ======================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,
            users: db.users
        });
    }
);

// ======================================================
// ADMINS - OWNER ONLY
// ======================================================

app.get(
    "/api/admin/admins",
    requireAdmin,
    (req, res) => {

        res.json({
            ok: true,

            owner: {
                telegramId:
                    OWNER_ID,
                username:
                    OWNER_USERNAME
            },

            admins:
                db.admins
        });
    }
);

// ======================================================
// ADD ADMIN
// ======================================================

app.post(
    "/api/admin/admins",
    requireAdmin,
    (req, res) => {

        if (!req.isOwner) {

            return res.status(403).json({
                ok: false,
                error:
                    "Faqat owner admin qo‘sha oladi"
            });
        }

        const {
            telegramId,
            username
        } = req.body;

        if (!telegramId) {

            return res.status(400).json({
                ok: false,
                error:
                    "Telegram ID kerak"
            });
        }

        if (String(telegramId) === OWNER_ID) {

            return res.status(400).json({
                ok: false,
                error:
                    "Ownerni admin sifatida qo‘shish shart emas"
            });
        }

        const exists =
            db.admins.some(
                x =>
                    String(x.telegramId) ===
                    String(telegramId)
            );

        if (exists) {

            return res.status(400).json({
                ok: false,
                error:
                    "Bu foydalanuvchi allaqachon admin"
            });
        }

        const admin = {

            id: id(),

            telegramId:
                String(telegramId),

            username:
                username || "",

            active:
                true,

            createdAt:
                now(),

            createdBy:
                String(req.telegramUser.id)
        };

        db.admins.push(admin);

        saveData();

        res.json({
            ok: true,
            admin
        });
    }
);

// ======================================================
// REMOVE ADMIN
// ======================================================

app.delete(
    "/api/admin/admins/:telegramId",
    requireAdmin,
    (req, res) => {

        if (!req.isOwner) {

            return res.status(403).json({
                ok: false,
                error:
                    "Faqat owner admin o‘chira oladi"
            });
        }

        const telegramId =
            String(req.params.telegramId);

        const index =
            db.admins.findIndex(
                x =>
                    String(x.telegramId) ===
                    telegramId
            );

        if (index === -1) {

            return res.status(404).json({
                ok: false,
                error:
                    "Admin topilmadi"
            });
        }

        db.admins.splice(
            index,
            1
        );

        saveData();

        res.json({
            ok: true,
            message:
                "Admin o‘chirildi"
        });
    }
);

// ======================================================
// SETTINGS
// ======================================================

app.get(
    "/api/settings",
    (req, res) => {

        res.json({
            ok: true,
            settings: db.settings
        });
    }
);

app.put(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        if (!req.isOwner) {

            return res.status(403).json({
                ok: false,
                error:
                    "Faqat owner sozlamalarni o‘zgartira oladi"
            });
        }

        db.settings = {
            ...db.settings,
            ...req.body
        };

        saveData();

        res.json({
            ok: true,
            settings:
                db.settings
        });
    }
);

// ======================================================
// ASSIGN ORDER TO ADMIN
// ======================================================

app.post(
    "/api/admin/orders/:id/assign",
    requireAdmin,
    (req, res) => {

        const order =
            db.orders.find(
                x => x.id === req.params.id
            );

        if (!order) {

            return res.status(404).json({
                ok: false,
                error:
                    "Buyurtma topilmadi"
            });
        }

        const adminId =
            req.body.adminId ||
            String(req.telegramUser.id);

        if (!isAdmin(adminId)) {

            return res.status(400).json({
                ok: false,
                error:
                    "Admin mavjud emas"
            });
        }

        order.assignedAdmin =
            String(adminId);

        order.status =
            "processing";

        order.updatedAt =
            now();

        saveData();

        res.json({
            ok: true,
            order
        });
    }
);

// ======================================================
// RANDOM ONLINE ADMIN ASSIGNMENT
// ======================================================

app.post(
    "/api/admin/orders/:id/auto-assign",
    requireAdmin,
    (req, res) => {

        const order =
            db.orders.find(
                x => x.id === req.params.id
            );

        if (!order) {

            return res.status(404).json({
                ok: false,
                error:
                    "Buyurtma topilmadi"
            });
        }

        if (db.admins.length === 0) {

            return res.status(400).json({
                ok: false,
                error:
                    "Hozircha adminlar yo‘q"
            });
        }

        const activeAdmins =
            db.admins.filter(
                x => x.active !== false
            );

        if (activeAdmins.length === 0) {

            return res.status(400).json({
                ok: false,
                error:
                    "Faol admin topilmadi"
            });
        }

        const randomAdmin =
            activeAdmins[
                Math.floor(
                    Math.random() *
                    activeAdmins.length
                )
            ];

        order.assignedAdmin =
            String(randomAdmin.telegramId);

        order.status =
            "processing";

        order.updatedAt =
            now();

        saveData();

        res.json({
            ok: true,
            order,
            assignedAdmin:
                randomAdmin
        });
    }
);

// ======================================================
// STATIC FRONTEND
// ======================================================

app.use(
    express.static(__dirname)
);

// ======================================================
// INDEX
// ======================================================

app.get("*", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
});

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(
    (err, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            err
        );

        res.status(500).json({
            ok: false,
            error:
                "Serverda xatolik yuz berdi"
        });
    }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================="
        );

        console.log(
            "A5 UC SERVER IS RUNNING"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "OWNER:",
            OWNER_USERNAME
        );

        console.log(
            "OWNER ID:",
            OWNER_ID
        );

        console.log(
            "================================="
        );
    }
);
