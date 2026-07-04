// ============================================================
// server.js — Main backend
// Handles: user auth, video-call signaling, whiteboard sync,
// screen-share signaling, file uploads
// ============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this-in-production';
const USERS_FILE = path.join(__dirname, 'users.json');

// ----------------------------------------------------------
// Middleware
// ----------------------------------------------------------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----------------------------------------------------------
// Simple JSON "database" for users
// (In a real product you'd swap this for MongoDB/Postgres.
//  Passwords are still properly hashed with bcrypt either way.)
// ----------------------------------------------------------
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ----------------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------------
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  const hashedPassword = await bcrypt.hash(password, 10); // encrypt password before storing
  users.push({ username, password: hashedPassword });
  saveUsers(users);
  res.json({ message: 'Signup successful' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid username or password' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Invalid username or password' });

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '4h' });
  res.cookie('token', token, { httpOnly: true, maxAge: 4 * 60 * 60 * 1000 });
  res.json({ message: 'Login successful', username });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// Middleware to protect routes
function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

// ----------------------------------------------------------
// FILE SHARING (upload endpoint)
// ----------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB cap

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, name: req.file.originalname });
});

// ----------------------------------------------------------
// SOCKET.IO — real-time signaling for video, whiteboard, chat, files
// ----------------------------------------------------------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // --- Room join/leave ---
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    // Tell existing members someone new joined (so they can start a WebRTC connection)
    socket.to(roomId).emit('user-joined', { socketId: socket.id, username });

    // Send the new user the list of people already in the room
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
      .filter(id => id !== socket.id);
    socket.emit('existing-users', clients);
  });

  // --- WebRTC signaling relay (offer / answer / ICE candidates) ---
  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });
  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // --- Whiteboard sync ---
  socket.on('whiteboard-draw', (data) => {
    socket.to(socket.data.roomId).emit('whiteboard-draw', data);
  });
  socket.on('whiteboard-clear', () => {
    socket.to(socket.data.roomId).emit('whiteboard-clear');
  });

  // --- Chat / file-share notifications ---
  socket.on('chat-message', (msg) => {
    io.to(socket.data.roomId).emit('chat-message', {
      username: socket.data.username,
      text: msg,
      time: new Date().toLocaleTimeString()
    });
  });
  socket.on('file-shared', (fileInfo) => {
    io.to(socket.data.roomId).emit('file-shared', {
      username: socket.data.username,
      ...fileInfo
    });
  });

  // --- Screen share notification (renegotiation handled via webrtc-offer again) ---
  socket.on('screen-share-started', () => {
    socket.to(socket.data.roomId).emit('screen-share-started', { socketId: socket.id });
  });
  socket.on('screen-share-stopped', () => {
    socket.to(socket.data.roomId).emit('screen-share-stopped', { socketId: socket.id });
  });

  // --- Disconnect cleanup ---
  socket.on('disconnect', () => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit('user-left', { socketId: socket.id });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
