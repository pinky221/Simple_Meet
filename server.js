require('dotenv').config(); // must be at the very top
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();

// // HTTPS credentials for local IP
// const options = {
//   key: fs.readFileSync('./certs/192.168.137.1-key.pem'),
//   cert: fs.readFileSync('./certs/192.168.137.1.pem')
// };

// // Create HTTPS server
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// Routes
app.get('/', (req, res) => res.redirect('/new'));
app.get('/new', (req, res) => res.redirect(`/${uuidv4()}`));
app.get('/:room', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// Email invite route
app.post('/invite', async (req, res) => {
  const { email, roomId } = req.body;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  const protocol = req.protocol;      // 'http' or 'https'
  const host = req.get('host');
    // Construct full URL
  const fullUrl = `${protocol}://${host}/${roomId}`;

  console.log('Invite link:', fullUrl);
  const mailOptions = {
    from: `"Simple Meet" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "You are invited",
    html: `<a href="${fullUrl}">Join Meeting</a>`
  };
  try { await transporter.sendMail(mailOptions); res.json({ success: true }); }
  catch (err) { console.error(err); res.status(500).json({ success: false, error: err.message }); }
});

// Socket.io
io.on('connection', socket => {
  socket.on('join-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', socket.id);

    socket.on('offer', data => socket.to(roomId).emit('offer', data));
    socket.on('answer', data => socket.to(roomId).emit('answer', data));
    socket.on('ice-candidate', data => socket.to(roomId).emit('ice-candidate', data));

    socket.on('disconnect', () => socket.to(roomId).emit('user-disconnected', socket.id));
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
