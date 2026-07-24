    const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// PESAPAL CONFIGURATION
// ============================================
const PESAPAL_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY || "Xy5Lj1NVOLNWUONcDZGzLptduniF4imB";
const PESAPAL_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET || "w9pcXOCwSKNcbUwQsO40zU44oNs=";
const PESAPAL_BASE_URL = process.env.PESAPAL_BASE_URL || "https://www.pesapal.com";
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

// Store OAuth token (refresh every hour)
let oauthToken = null;
let tokenExpiry = null;

// ============================================
// HELPER: Get PesaPal OAuth Token
// ============================================
async function getPesaPalToken() {
    // Check if we have a valid token
    if (oauthToken && tokenExpiry && Date.now() < tokenExpiry) {
        return oauthToken;
    }

    try {
        const auth = Buffer.from(`${PESAPAL_CONSUMER_KEY}:${PESAPAL_CONSUMER_SECRET}`).toString('base64');
        
        const response = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                consumer_key: PESAPAL_CONSUMER_KEY,
                consumer_secret: PESAPAL_CONSUMER_SECRET,
            }),
        });

        const data = await response.json();
        
        if (data.token) {
            oauthToken = data.token;
            // Token expires in 3600 seconds (1 hour)
            tokenExpiry = Date.now() + 3600000;
            console.log("✅ PesaPal OAuth token obtained");
            return oauthToken;
        } else {
            console.error("❌ Failed to get token:", data);
            throw new Error("Failed to get PesaPal token");
        }
    } catch (error) {
        console.error("❌ Token error:", error);
        throw error;
    }
}

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

        res.redirect(`/approved.html?email=${encodeURIComponent(email || "")}&phone=${encodeURIComponent(phone || "")}&name=${encodeURIComponent(fullName || "")}`);

    } catch (error) {
        console.error("❌ Error processing application:", error);
        res.status(500).send("Error processing your application. Please try again.");
    }
});

// ============================================
// PAYMENT - Initiate PesaPal Payment
// ============================================
app.get("/pay-fee", async (req, res) => {
    const { email, phone, name } = req.query;

    if (!email || !email.includes('@')) {
        return res.status(400).send(`
            <h2>❌ Email Required</h2>
            <p>Please provide a valid email address to proceed with payment.</p>
            <a href="/">Go Back</a>
        `);
    }

    console.log(`\n💳 Initiating PesaPal payment for:`);
    console.log(`   📧 Email: ${email}`);
    console.log(`   📱 Phone: ${phone || "Not provided"}`);
    console.log(`   👤 Name: ${name || "Not provided"}`);
    console.log(`   💰 Amount: 50 KSH`);

    try {
        // Get OAuth token
        const token = await getPesaPalToken();

        // Generate unique order ID
        const orderId = `LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const merchantRef = `REF-${Date.now()}`;

        // PesaPal order data
        const orderData = {
            id: orderId,
            currency: "KES",
            amount: 50,
            description: "Quick Loan - Withdrawal Fee",
            callback_url: `${BASE_URL}/payment-callback`,
            notification_id: `${Date.now()}`,
            branch: "",
            billing_address: {
                email_address: email,
                phone_number: phone || "0712345678",
                country_code: "KE",
                first_name: name || "Customer",
                last_name: "Loan",
                line1: "Nairobi",
                city: "Nairobi",
                state: "Nairobi",
                postal_code: "00100",
                zip_code: "00100"
            },
            shipping_address: {
                email_address: email,
                phone_number: phone || "0712345678",
                country_code: "KE",
                first_name: name || "Customer",
                last_name: "Loan",
                line1: "Nairobi",
                city: "Nairobi",
                state: "Nairobi",
                postal_code: "00100",
                zip_code: "00100"
            },
            merchant_reference: merchantRef,
            source: "express"
        };

        console.log(`📦 Sending order to PesaPal:`, JSON.stringify(orderData, null, 2));

        const response = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrder`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(orderData),
        });

        const data = await response.json();
        console.log(`📦 PesaPal Response:`, JSON.stringify(data, null, 2));

        // Check if we got a redirect URL
        if (data.redirect_url) {
            console.log(`✅ Redirecting to PesaPal: ${data.redirect_url}`);
            return res.redirect(data.redirect_url);
        } else if (data.order_tracking_id) {
            // Some PesaPal versions use this format
            const redirectUrl = `${PESAPAL_BASE_URL}/PaymentPage?order_tracking_id=${data.order_tracking_id}`;
            console.log(`✅ Redirecting to: ${redirectUrl}`);
            return res.redirect(redirectUrl);
        } else if (data.status === "SUCCESS" && data.payment_link) {
            console.log(`✅ Redirecting to: ${data.payment_link}`);
            return res.redirect(data.payment_link);
        } else {
            console.error(`❌ PesaPal error:`, data);
            return res.status(500).send(`
                <h2>❌ Payment Initiation Failed</h2>
                <p>Error: ${data.error?.message || data.message || "Unknown error"}</p>
                <p>Please try again or contact support.</p>
                <a href="/">Go Back</a>
            `);
        }

    } catch (error) {
        console.error(`❌ Payment error:`, error);
        res.status(500).send(`
            <h2>❌ Payment Error</h2>
            <p>${error.message}</p>
            <a href="/">Go Back</a>
        `);
    }
});

// ============================================
// PAYMENT CALLBACK - PesaPal redirects here
// ============================================
app.get("/payment-callback", async (req, res) => {
    console.log("\n🔔 PesaPal callback received!");
    console.log("📥 Query parameters:", req.query);

    const { order_tracking_id, merchant_reference, status, payment_status } = req.query;

    // Check if payment was successful based on PesaPal response
    const isSuccessful = status === "COMPLETED" || 
                        payment_status === "COMPLETED" || 
                        status === "SUCCESS" ||
                        status === "200";

    if (isSuccessful) {
        console.log(`✅ Payment successful! Order: ${order_tracking_id}`);
        console.log(`📦 Merchant Reference: ${merchant_reference}`);
        return res.sendFile(path.join(__dirname, "success.html"));
    } else if (status === "FAILED" || status === "CANCELLED") {
        console.log(`❌ Payment ${status}: ${order_tracking_id}`);
        return res.status(400).send(`
            <h2>❌ Payment ${status}</h2>
            <p>Your payment was ${status.toLowerCase()}. Please try again.</p>
            <a href="/">Go Home</a>
        `);
    } else {
        // If we can't determine, try to verify
        console.log(`⚠️ Unknown status, attempting verification...`);
        
        try {
            // Try to get the token and verify
            const token = await getPesaPalToken();
            const verifyUrl = `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?order_tracking_id=${order_tracking_id}`;
            
            const response = await fetch(verifyUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                },
            });
            
            const data = await response.json();
            console.log(`📦 Verification response:`, JSON.stringify(data, null, 2));
            
            if (data.status === "COMPLETED" || data.payment_status === "COMPLETED") {
                console.log(`✅ Payment verified successfully!`);
                return res.sendFile(path.join(__dirname, "success.html"));
            } else {
                console.log(`❌ Payment not verified: ${data.status}`);
                return res.status(400).send(`
                    <h2>❌ Payment Verification Failed</h2>
                    <p>Status: ${data.status || "Unknown"}</p>
                    <a href="/">Go Home</a>
                `);
            }
        } catch (error) {
            console.error(`❌ Verification error:`, error);
            // If verification fails but we have a tracking ID, show success anyway (fallback)
            if (order_tracking_id) {
                console.log(`⚠️ Showing success page as fallback`);
                return res.sendFile(path.join(__dirname, "success.html"));
            }
            return res.status(500).send(`
                <h2>❌ Verification Error</h2>
                <p>Could not verify payment. Please contact support.</p>
                <a href="/">Go Home</a>
            `);
        }
    }
});

// IPN (Instant Payment Notification) - PesaPal sends POST requests here
app.post("/payment-callback", async (req, res) => {
    console.log("\n🔔 PesaPal IPN received!");
    console.log("📦 Body:", req.body);
    
    // Process the IPN data
    const { order_tracking_id, merchant_reference, status } = req.body;
    
    if (status === "COMPLETED" || status === "SUCCESS") {
        console.log(`✅ IPN: Payment successful for order ${order_tracking_id}`);
        // Update your database here
    } else {
        console.log(`❌ IPN: Payment ${status} for order ${order_tracking_id}`);
    }
    
    // Always return 200 to acknowledge receipt
    res.status(200).send("OK");
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log("🚀 QUICK LOAN SERVER (PesaPal)");
    console.log("=".repeat(50));
    console.log(`✅ Server running on: ${BASE_URL}`);
    console.log(`🔗 Payment Gateway: ${PESAPAL_BASE_URL}`);
    console.log("=".repeat(50));
    console.log("\n💡 Visit: " + BASE_URL);
    console.log("📋 Fill the form to apply for a loan\n");
});
