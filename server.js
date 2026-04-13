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

// ============ PAY BILLS ENDPOINT ============
app.post('/api/pay-bill', async (req, res) => {
    try {
        await connectDB();
        const { userId, category, amount, accountNumber } = req.body;
        
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Deduct amount
        await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $inc: { balance: -amount } }
        );
        
        // Record transaction
        const now = new Date();
        await transactionsCollection.insertOne({
            userId: userId,
            otherParty: category + " Bill",
            otherPartyEmail: accountNumber || "BILL-PAYMENT",
            amount: amount,
            message: `Paid ${category} bill`,
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString(),
            type: 'sent',
            category: 'Bill Payment'
        });
        
        const newBalance = user.balance - amount;
        res.json({ success: true, message: `Paid ₱${amount} for ${category} bill`, newBalance });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ============ UPDATE SETTINGS ============
app.put('/api/settings/:userId', async (req, res) => {
    try {
        await connectDB();
        const { pushNotifications, emailNotifications, darkMode, language } = req.body;
        
        const updateData = {};
        if (pushNotifications !== undefined) updateData['settings.pushNotifications'] = pushNotifications;
        if (emailNotifications !== undefined) updateData['settings.emailNotifications'] = emailNotifications;
        if (darkMode !== undefined) updateData['settings.darkMode'] = darkMode;
        if (language !== undefined) updateData['settings.language'] = language;
        
        await usersCollection.updateOne(
            { _id: new ObjectId(req.params.userId) },
            { $set: updateData },
            { upsert: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ GET SETTINGS ============
app.get('/api/settings/:userId', async (req, res) => {
    try {
        await connectDB();
        const user = await usersCollection.findOne(
            { _id: new ObjectId(req.params.userId) },
            { projection: { settings: 1 } }
        );
        
        const defaultSettings = {
            pushNotifications: true,
            emailNotifications: true,
            darkMode: false,
            language: 'English'
        };
        
        res.json(user?.settings || defaultSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CHANGE PASSWORD ============
app.post('/api/change-password/:userId', async (req, res) => {
    try {
        await connectDB();
        const { currentPassword, newPassword } = req.body;
        
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await usersCollection.updateOne(
            { _id: new ObjectId(req.params.userId) },
            { $set: { password: hashedPassword } }
        );
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CHANGE EMAIL ============
app.post('/api/change-email/:userId', async (req, res) => {
    try {
        await connectDB();
        const { newEmail, password } = req.body;
        
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password is incorrect' });
        }
        
        const emailExists = await usersCollection.findOne({ email: newEmail });
        if (emailExists) {
            return res.status(400).json({ error: 'Email already in use' });
        }
        
        await usersCollection.updateOne(
            { _id: new ObjectId(req.params.userId) },
            { $set: { email: newEmail } }
        );
        
        res.json({ success: true, message: 'Email changed successfully', newEmail });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ DELETE ACCOUNT ============
app.delete('/api/delete-account/:userId', async (req, res) => {
    try {
        await connectDB();
        const { password } = req.body;
        
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password is incorrect' });
        }
        
        await usersCollection.deleteOne({ _id: new ObjectId(req.params.userId) });
        await transactionsCollection.deleteMany({ userId: req.params.userId });
        
        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ EXISTING ENDPOINTS ============
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
            username, email, password: hashedPassword, balance: 5000, // Changed to 5000
            accountNumber: Math.floor(Math.random() * 9000000000) + 1000000000,
            createdAt: new Date(),
            profile: { fullName: username, nationality: 'Filipino', address: '', class: '', birthday: '', studentId: '' },
            settings: { pushNotifications: true, emailNotifications: true, darkMode: false, language: 'English' }
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
        { name: "Tech Conference", date: "April 20, 2026", location: "Convention Center", fee: 500, isFree: false },
        { name: "Food Expo", date: "April 25, 2026", location: "Trade Hall", fee: "Free", isFree: true },
        { name: "Art Exhibition", date: "May 1, 2026", location: "Art Museum", fee: 200, isFree: false },
        { name: "Sports Tournament", date: "May 5, 2026", location: "Stadium", fee: "Free", isFree: true }
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
        
        const now = new Date();
        await transactionsCollection.insertOne({
            userId: senderId,
            otherParty: recipient.username,
            otherPartyEmail: recipientEmail,
            amount: amount,
            message: message || '',
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString(),
            type: 'sent',
            category: 'Transfer'
        });
        
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
        const { fullName, address, class: className, birthday, studentId, nationality } = req.body;
        const updateData = {};
        if (fullName) updateData['profile.fullName'] = fullName;
        if (address) updateData['profile.address'] = address;
        if (className) updateData['profile.class'] = className;
        if (birthday) updateData['profile.birthday'] = birthday;
        if (studentId) updateData['profile.studentId'] = studentId;
        if (nationality) updateData['profile.nationality'] = nationality;
        if (fullName) updateData.username = fullName;
        
        await usersCollection.updateOne({ _id: new ObjectId(req.params.userId) }, { $set: updateData });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CHECK DAILY SPENDING ============
app.get('/api/daily-spending/:userId', async (req, res) => {
    try {
        await connectDB();
        const today = new Date().toISOString().split('T')[0];
        
        const todaysTransactions = await transactionsCollection.find({
            userId: req.params.userId,
            date: today,
            type: 'sent'
        }).toArray();
        
        const totalSpent = todaysTransactions.reduce((sum, t) => sum + t.amount, 0);
        
        res.json({ totalSpent, date: today, transactionCount: todaysTransactions.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ GET NOTIFICATIONS ============
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        await connectDB();
        const today = new Date().toISOString().split('T')[0];
        
        const todaysSpending = await transactionsCollection.find({
            userId: req.params.userId,
            date: today,
            type: 'sent'
        }).toArray();
        
        const totalSpent = todaysSpending.reduce((sum, t) => sum + t.amount, 0);
        
        let notifications = [];
        
        // Daily spending alerts
        if (totalSpent > 1000) {
            notifications.push({
                type: 'warning',
                title: '⚠️ High Spending Alert',
                message: `You've spent ₱${totalSpent.toLocaleString()} today!`,
                time: new Date().toLocaleTimeString()
            });
        }
        
        if (totalSpent > 2000) {
            notifications.push({
                type: 'critical',
                title: '🔴 Critical Spending Alert',
                message: `You've exceeded ₱2,000 in spending today!`,
                time: new Date().toLocaleTimeString()
            });
        }
        
        // Low balance alert
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
        if (user && user.balance < 500) {
            notifications.push({
                type: 'warning',
                title: '⚠️ Low Balance Alert',
                message: `Your balance is only ₱${user.balance.toLocaleString()}!`,
                time: new Date().toLocaleTimeString()
            });
        }
        
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PURCHASE EVENT TICKET ============
app.post('/api/buy-event-ticket', async (req, res) => {
    try {
        await connectDB();
        const { userId, eventId, eventName, fee } = req.body;
        
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (fee > 0 && user.balance < fee) {
            return res.status(400).json({ error: `Insufficient balance! You need ₱${fee} for this event.` });
        }
        
        // Deduct fee if not free
        let newBalance = user.balance;
        if (fee > 0) {
            await usersCollection.updateOne(
                { _id: new ObjectId(userId) },
                { $inc: { balance: -fee } }
            );
            newBalance = user.balance - fee;
        }
        
        // Record transaction
        const now = new Date();
        await transactionsCollection.insertOne({
            userId: userId,
            otherParty: eventName,
            otherPartyEmail: "EVENT-TICKET",
            amount: fee,
            message: `Purchased ticket for ${eventName}`,
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString(),
            type: 'sent',
            category: 'Events'
        });
        
        res.json({ 
            success: true, 
            message: fee > 0 ? `Successfully purchased ticket for ${eventName}! ₱${fee} deducted.` : `Successfully registered for free event: ${eventName}!`,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error(error);
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
            console.log('   New users start with ₱5,000 balance');
        });
    });
}
