const express = require('express')
//security
require('dotenv').config()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

//express app
const app = express()
const cors=require('cors')
const server=require('http').createServer(app)
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())
require('./db/connection')

// socket.io
const io=require('socket.io')(server,{  //socket io server
    cors:true
})

let users = []
io.on('connection', socket => {
    console.log('User Connected', socket.id)
    socket.on('addUser', userId => {
        console.log("userid is ", userId)
        const isUserExist = users.find(user => user.userId === userId);
        if (!isUserExist) {
            const user = { userId, socketId: socket.id };
            users.push(user);
            io.emit('getUsers', users);
        }
    })

    socket.on('sendMessage', async ({ senderId, receiverId, text, conversationId }) => {
        const receiver = users.find(user => user.userId === receiverId)
        const sender = users.find(user => user.userId === senderId)
        console.log("this is receiver ", receiver)
        console.log("this is sender ", sender)
        const user = await Users.findById(senderId);
        if (receiver) {
            console.log('send message request received')
            console.log('data :>> ', senderId, receiverId, text, conversationId)
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
                senderId,
                receiverId,
                text,
                conversationId,
                user: { id: user._id, fullName: user.fullName, email: user.email }
            })
        } else {
            io.to(sender.socketId).emit('getMessage', {
                senderId,
                text,
                conversationId,
                receiverId,
                user: { id: user._id, fullName: user.fullName, email: user.email }
            })
        }
    })

    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('getUsers', users);
    })
    io.emit('getUsers',socket.userID)
})

//models
const Users = require('./models/Users')
const Conversations = require('./models/Conversations')
const Messages = require('./models/Messages')
//routes
app.post('/signup', async (req, res, next) => {
    try {
        const { fullName, email, password } = req.body
        if (!fullName || !email || !password) {
            res.status(400).send('Fill all required fields.')
        }
        // if(password!=confirmPassword) {
        //     res.status(400).send('Passwords do not match.')
        // }
        else {
            const alreadyExists = await Users.findOne({ email })
            if (alreadyExists) {
                res.status(400).send('Email already in use.')
            }
            else {
                const newUser = new Users({ fullName, email })
                bcrypt.hash(password, 10, (error, encryptedPassword) => {
                    newUser.set('password', encryptedPassword)
                    newUser.save()
                })
                return res.status(200).send('Account created successfully')
            }
        }
    }
    catch (error) {
        console.log(error)
    }
})

app.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body
        if (!email || !password) {
            res.status(400).send('Fill all required fields.')
        }
        else {
            const user = await Users.findOne({ email })
            if (!user) {
                res.status(400).send('No such account exists.')
            }
            else {
                const validateUser = await bcrypt.compare(password, user.password)
                if (!validateUser) {
                    res.status(400).send('Incorrect password')
                } else {
                    const payload = { userID: user._id, userEmail: user.email }
                    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY
                    jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
                        await Users.updateOne({ _id: user._id }, {
                            $set: { token }
                        })
                        user.save()
                        return res.status(200).json({ user: { id: user._id, fullName: user.fullName, email: user.email }, token: token })
                    })
                }
            }
        }
    }
    catch (error) {
        console.log(error)
    }
})

app.post('/conversation', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body
        const existingRecord1 = await Conversation.findOne({
            members: { $all: [receiverId, senderId] }
        })
        const existingRecord2 = await Conversation.findOne({
            members: { $all: [senderId, receiverId] }
        })
        if (!existingRecord1 && !existingRecord2) {
            const newConversation = new Conversations({ members: [senderId, receiverId] })
            await newConversation.save()
            res.status(200).send('Chat started successfully.')
        }
    } catch (error) {
        console.log(error)
    }
})

app.get('/conversation/:userId', async (req, res, next) => {
    try {
        const userId = req.params.userId
        const conversation = await Conversations.find({ members: { $in: [userId] } })
        const conversationUserData = Promise.all(conversation.map(async (conversation) => {
            const receiverId = conversation.members.find((member) => member != userId)
            const receivers = await Users.findById(receiverId)
            return { user: { id: receivers._id, fullName: receivers.fullName, email: receivers.email }, conversationId: conversation._id }
        }))
        res.status(200).send(await conversationUserData)
    } catch (error) {
        console.log(error)
    }
})

app.post('/message', async (req, res, next) => {
    try {
        const { conversationId, senderId, text, receiverId } = req.body
        // console.log(conversationId, senderId, text, receiverId)
        if (!senderId || !text) {
            return res.status(400).send('Fill all fields')
        }
        if (conversationId === 'new' && receiverId) {
            const newConversation = new Conversations({ members: [senderId, receiverId] })
            await newConversation.save()
            const newMessage = new Messages({ conversationId: newConversation._id, senderId, text })
            await newMessage.save()
            return res.status(200).send('Message saved successfully')
        } else if (!conversationId && !receiverId) {
            return res.status(400).send('Fill all fields')
        }
        const newMessage = new Messages({ conversationId, senderId, text })
        await newMessage.save()
        res.status(200).send('Message saved successfully')
    } catch (error) {
        console.log(error)
    }
})

app.get('/message/:conversationId', async (req, res, next) => {
    try {
        const checkMesssages = async (conversationId) => {
            const messages = await Messages.find({ conversationId })
            const messageData = Promise.all(messages.map(async (messages) => {
                const user = await Users.findById(messages.senderId)
                return { user: { id: user._id, email: user.email, fullName: user.fullName }, text: messages.text }
            }))
            res.status(200).json(await messageData)
        }
        const conversationId = req.params.conversationId
        if (conversationId === 'new') {
            const checkConversation = await Conversations.find({ members: { $all: [req.query.senderId, req.query.receiverId] } })
            if (checkConversation.length > 0) {
                return res.status(200).json({ conversationId: checkConversation[0]._id })
            } else {
                return res.status(200).json([])
            }
        } else {
            checkMesssages(conversationId)
        }
    } catch (error) {
        console.log(error)
    }
})

app.get('/users/:userId', async (req, res) => {
    try {
        const users = await Users.find({ _id: { $ne: req.params.userId } })
        const userData = Promise.all(users.map(async (users) => {
            return { fullName: users.fullName, id: users._id, email: users.email }
        }))
        res.status(200).json(await userData)
    } catch (error) {
        console.log(error)
    }
})

const port = process.env.PORT || 4000
server.listen(port, () => {
    console.log(`http://localhost:${port}`)
})