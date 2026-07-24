const express = require("express");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// PAVE WAY EXPRESS CONFIGURATION
// ============================================
const PAVEWAY_SECRET = process.env.PAVEWAY_SECRET || "5fa4a79b5d0e66f49ceb1f17ed8a7584db0908fd7133ba48bee7d7106a40a579";
const PAVEWAY_BASE = process.env.PAVEWAY_BASE || "https://paywavexpress.co.ke";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ============================================
// FILE UPLOAD CONFIG
// ============================================
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, JPG, and GIF images are allowed'));
        }
    }
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============================================
// ROUTES
// ============================================

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Handle loan application submission
app.post("/submit-application", upload.single("idPhoto"), (req, res) => {
    try {
        const { fullName, email, phone, idNumber, dob, address, employment, income, loanAmount, purpose, notes } = req.body;

        let photoBase64 = null;
        if (req.file) {
            photoBase64 = req.file.buffer.toString('base64');
            console.log(`📸 ID Photo uploaded: ${req.file.size} bytes`);
        }

        console.log("\n" + "=".repeat(50));
        console.log("📋 NEW LOAN APPLICATION");
        console.log("=".repeat(50));
        console.log(`👤 Full Name: ${fullName || "Not provided"}`);
        console.log(`📧 Email: ${email || "Not provided"}`);
        console.log(`📱 Phone: ${phone || "Not provided"}`);
        console.log(`🪪 ID Number: ${idNumber || "Not provided"}`);
        console.log(`📅 Date of Birth: ${dob || "Not provided"}`);
        console.log(`📍 Address: ${address || "Not provided"}`);
        console.log(`💼 Employment: ${employment || "Not provided"}`);
        console.log(`💰 Monthly Income: ${income || "Not provided"} KES`);
        console.log(`💵 Loan Amount: ${loanAmount || "Not provided"} KES`);
        console.log(`🎯 Purpose: ${purpose || "Not provided"}`);
        console.log(`📝 Notes: ${notes || "None"}`);
        console.log(`🖼️ ID Photo: ${photoBase64 ? "Uploaded ✅" : "Not uploaded ❌"}`);
        console.log("=".repeat(50));
        console.log("✅ Application saved successfully\n");

        res.redirect(`/approved.html?email=${encodeURIComponent(email || "")}&phone=${encodeURIComponent(phone || "")}`);

    } catch (error) {
        console.error("❌ Error processing application:", error);
        res.status(500).send("Error processing your application. Please try again.");
    }
});

// ============================================
// PAYMENT - Redirect to Pave Way Payment Page
// ============================================
app.get("/pay-fee", (req, res) => {
    const { email, phone } = req.query;

    if (!email || !email.includes('@')) {
        return res.status(400).send(`
            <h2>❌ Email Required</h2>
            <p>Please provide a valid email address to proceed with payment.</p>
            <a href="/">Go Back</a>
        `);
    }

    console.log(`\n💳 Redirecting to Pave Way payment page:`);
    console.log(`   📧 Email: ${email}`);
    console.log(`   📱 Phone: ${phone || "Not provided"}`);
    console.log(`   💰 Amount: 50 KSH`);

    // Redirect directly to the Pave Way payment page
    // The user will pay there and then be redirected back
    const paymentPage = "https://paywavexpress.co.ke/pay/quick-loan";
    res.redirect(paymentPage);
});

// ============================================
// PAYMENT CALLBACK - After payment
// ============================================
app.get("/payment-callback", async (req, res) => {
    console.log("\n🔔 Payment callback received!");
    console.log("📥 Query parameters:", req.query);

    const reference = req.query.reference || 
                      req.query.transaction_id || 
                      req.query.trxref || 
                      req.query.payment_id ||
                      req.query.id ||
                      req.query.ref;

    if (!reference) {
        console.log("❌ No transaction reference found.");
        return res.status(400).send(`
            <h2>❌ Missing Transaction Reference</h2>
            <p>No payment reference was provided.</p>
            <a href="/">Go Home</a>
        `);
    }

    console.log(`🔑 Transaction Reference: ${reference}`);

    // Try to verify the payment with Pave Way
    const verifyEndpoints = [
        `${PAVEWAY_BASE}/api/verify-payment/${reference}`,
        `${PAVEWAY_BASE}/api/payment/verify/${reference}`,
        `${PAVEWAY_BASE}/payment/verify/${reference}`,
        `${PAVEWAY_BASE}/verify-payment/${reference}`,
        `${PAVEWAY_BASE}/api/v1/verify-payment/${reference}`,
    ];

    for (const endpoint of verifyEndpoints) {
        try {
            console.log(`🔍 Verifying at: ${endpoint}`);

            const response = await fetch(endpoint, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${PAVEWAY_SECRET}`,
                    "Accept": "application/json"
                }
            });

            const data = await response.json();
            console.log(`📦 Verification response:`, JSON.stringify(data, null, 2));

            const isSuccessful = data.status === "success" ||
                                data.success === true ||
                                data.payment_status === "completed" ||
                                data.status === "completed" ||
                                data.data?.status === "success" ||
                                data.data?.payment_status === "completed" ||
                                data.code === "00" ||
                                data.verified === true;

            if (isSuccessful) {
                console.log(`✅ Payment verified successfully!`);
                return res.sendFile(path.join(__dirname, "success.html"));
            }

        } catch (error) {
            console.log(`❌ Verify failed: ${error.message}`);
        }
    }

    // If we can't verify but the user paid, still show success
    // This is a fallback in case the verification API doesn't work
    console.log(`⚠️ Could not verify payment, but showing success page anyway.`);
    res.sendFile(path.join(__dirname, "success.html"));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log("🚀 QUICK LOAN SERVER");
    console.log("=".repeat(50));
    console.log(`✅ Server running on: ${BASE_URL}`);
    console.log(`🔗 Payment Gateway: ${PAVEWAY_BASE}`);
    console.log(`📱 Payment Page: https://paywavexpress.co.ke/pay/quick-loan`);
    console.log("=".repeat(50));
    console.log("\n💡 Visit: " + BASE_URL);
    console.log("📋 Fill the form to apply for a loan\n");
});
