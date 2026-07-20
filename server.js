const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true })); // For form data
app.use(express.json());

// Serve the main application form
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Handle the loan application submission
app.post("/submit-application", async (req, res) => {
    const { fullName, email, phone, idNumber, loanAmount, purpose, employment, notes } = req.body;

    // Log the full application details (replace with DB save later)
    console.log("🎯 New Loan Application:");
    console.log(`   Name: ${fullName}`);
    console.log(`   Email: ${email}`);
    console.log(`   Phone: ${phone}`);
    console.log(`   ID: ${idNumber}`);
    console.log(`   Amount: ${loanAmount} KES`);
    console.log(`   Purpose: ${purpose}`);
    console.log(`   Employment: ${employment}`);
    console.log(`   Notes: ${notes || "N/A"}`);
    console.log("-------------------------------------");

    // Validate critical fields for Paystack
    if (!email) {
        return res.status(400).send("Email is required.");
    }

    // 100 KSH processing fee in cents (smallest currency unit for KES)
    const amount = 10000;

    try {
        const response = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                amount,
                callback_url: `${BASE_URL}/payment-callback`,
                metadata: {
                    phone: phone || "Not provided",
                    fullName: fullName || "Not provided",
                    loanAmount: loanAmount || "Not provided",
                    purpose: purpose || "Not provided",
                    idNumber: idNumber || "Not provided",
                    employment: employment || "Not provided",
                },
            }),
        });

        const data = await response.json();

        if (data.status) {
            // Redirect user to Paystack checkout
            return res.redirect(data.data.authorization_url);
        } else {
            console.error("Paystack error:", data.message);
            return res.status(500).send(`Payment initialization failed: ${data.message}`);
        }
    } catch (error) {
        console.error("Server error:", error);
        return res.status(500).send("Server error. Please try again.");
    }
});

// Callback route – Paystack redirects here after payment
app.get("/payment-callback", async (req, res) => {
    const { reference, trxref } = req.query;
    const transactionRef = reference || trxref;

    if (!transactionRef) {
        return res.status(400).send("Transaction reference missing.");
    }

    try {
        const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${transactionRef}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        });

        const verifyData = await verifyResponse.json();

        if (verifyData.status && verifyData.data.status === "success") {
            console.log(`✅ Payment successful for reference: ${transactionRef}`);
            // Here you would update your database status to "PAID"
            return res.sendFile(path.join(__dirname, "success.html"));
        } else {
            console.error("Verification failed:", verifyData.message);
            return res.status(400).send(`Payment verification failed.`);
        }
    } catch (error) {
        console.error("Verification error:", error);
        return res.status(500).send("Server error during verification.");
    }
});

// Keep your old /status route if needed
app.post("/status", (req, res) => {
    res.sendFile(path.join(__dirname, "status.html"));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Base URL: ${BASE_URL}`);
});
