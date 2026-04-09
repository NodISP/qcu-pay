const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://candelariozachary_db_user:8IbZH6WL8F7921gr@cluster0.4g7t1me.mongodb.net/?retryWrites=true&w=majority";

let db;
let usersCollection;
let transactionsCollection;

// Connect to MongoDB
async function connectDB() {
    if (db) return db;
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db('qcupay');
        usersCollection = db.collection('users');
        transactionsCollection = db.collection('transactions');
        await usersCollection.createIndex({ email: 1 });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB error:', error.message);
    }
}

// API Routes
app.post('/api/login', async (req, res) => {
    try {
        await connectDB();
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });
        
        delete user.password;
        res.json({ success: true, user: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        await connectDB();
        const { username, email, password } = req.body;
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            username, email, password: hashedPassword, balance: 25000,
            accountNumber: Math.floor(Math.random() * 9000000000) + 1000000000,
            createdAt: new Date(),
            profile: { fullName: username, nationality: 'Filipino', address: '', class: '', birthday: '', studentId: '' }
        };
        const result = await usersCollection.insertOne(newUser);
        res.json({ success: true, userId: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/balance/:userId', async (req, res) => {
    try {
        await connectDB();
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
        res.json({ balance: user.balance, username: user.username });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transactions/:userId', async (req, res) => {
    try {
        await connectDB();
        const transactions = await transactionsCollection.find({ userId: req.params.userId }).sort({ date: -1 }).toArray();
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        await connectDB();
        const users = await usersCollection.find({}, { projection: { username: 1, email: 1, accountNumber: 1 } }).toArray();
        const formattedUsers = users.map(u => ({ name: u.username, email: u.email, number: `****-****-${String(u.accountNumber).slice(-4)}` }));
        res.json(formattedUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/events', async (req, res) => {
    res.json([
        { name: "Music Festival", date: "April 15, 2026", location: "Central Park", fee: "Free", isFree: true },
        { name: "Tech Conference", date: "April 20, 2026", location: "Convention Center", fee: "₱500", isFree: false }
    ]);
});

app.post('/api/transfer', async (req, res) => {
    try {
        await connectDB();
        const { senderId, recipientEmail, amount, message } = req.body;
        const sender = await usersCollection.findOne({ _id: new ObjectId(senderId) });
        const recipient = await usersCollection.findOne({ email: recipientEmail });
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
        if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
        
        await usersCollection.updateOne({ _id: new ObjectId(senderId) }, { $inc: { balance: -amount } });
        await usersCollection.updateOne({ email: recipientEmail }, { $inc: { balance: amount } });
        
        res.json({ success: true, message: 'Transfer successful!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/profile/:userId', async (req, res) => {
    try {
        await connectDB();
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) }, { projection: { password: 0 } });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/profile/:userId', async (req, res) => {
    try {
        await connectDB();
        const { fullName, address } = req.body;
        await usersCollection.updateOne({ _id: new ObjectId(req.params.userId) }, { $set: { 'profile.fullName': fullName, 'profile.address': address, username: fullName } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// For Vercel serverless
module.exports = app;

// For local development
if (require.main === module) {
    connectDB().then(() => {
        app.listen(5000, () => {
            console.log('🚀 Server running on http://localhost:5000');
        });
    });
}
