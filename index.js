const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const admin = require("firebase-admin");
const ObjectId = require('mongodb').ObjectId;
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const fileUpload = require('express-fileupload')

app.use(cors());
app.use(express.json())
app.use(fileUpload());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mhdj2.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = await decodedUser.email;
        }
        catch {

        }
    }
    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctors_portal');
        const appointmentsCollection = database.collection('appointments');
        const userCollection = database.collection('users');
        const doctorCollection = database.collection('doctors');

        // Get API
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            if (req.decodedEmail === email) {
                const query = { email: email, date: date }
                const cursor = appointmentsCollection.find(query);
                const result = await cursor.toArray();
                res.json(result);
            }
            else {
                res.status(401).json({ message: 'unauthorized' })
            }
        })

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let isAdmin = false;
            if (user?.role === "admin") {
                isAdmin = true;
            }
            res.json({ admin: isAdmin })
        })

        app.get('/payments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await appointmentsCollection.findOne(query);
            res.json(result);
        })

        // Post API
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment);
            res.json(result);
        });

        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = { $set: { payment: payment } };
            const result = await appointmentsCollection.updateOne(filter, updateDoc);
            res.json(result)
        })

        app.get('/doctors', async (req, res) => {
            const doctors = await doctorCollection.find({}).toArray();
            res.json(doctors);
        })

        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const picData = pic.data;
            const encodedPic = picData.toString('base64')
            const imageBuffer = Buffer.from(encodedPic, 'base64')
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorCollection.insertOne(doctor)
            res.json(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.json(result);
        });

        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email }
            const options = { upsert: true };
            const updateDoc = { $set: user }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await userCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: "admin" } }
                    const result = await userCollection.updateOne(filter, updateDoc)
                    res.send(result);
                }
            }
            else {
                res.status(403).json({ message: "You do not have access to make admin" });
            }
        })

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.json({ clientSecret: paymentIntent.client_secret });
        })
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello doctors portal')
})

app.listen(port, () => {
    console.log(`listening at port ${port}`)
})