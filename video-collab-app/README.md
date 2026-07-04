# Video Collab App

A browser-based video conferencing + collaboration tool built with WebRTC, Socket.io, and Express.

## Features

- **Multi-user video calling** — WebRTC mesh network (each participant connects directly to every other participant)
- **Screen sharing** — swap your camera feed for your screen mid-call
- **Whiteboard** — real-time collaborative drawing synced via Socket.io
- **Chat** — text messaging within a room
- **File sharing** — upload and share files with everyone in the room
- **User authentication** — signup/login with hashed passwords (bcrypt) and session tokens (JWT)
- **Encryption** — WebRTC media (video/audio) is encrypted end-to-end by default using DTLS-SRTP; passwords are hashed, never stored in plain text

## Tech Stack

| Layer | Technology |
|---|---|
| Real-time media | WebRTC (peer-to-peer video/audio/screen) |
| Real-time signaling & sync | Socket.io |
| Backend | Node.js + Express |
| Auth | bcrypt (password hashing) + JWT (sessions) |
| File storage | Multer (local disk uploads) |
| Frontend | HTML, CSS, vanilla JavaScript, Canvas API |

## How It Works (Architecture)

1. **Signaling**: WebRTC needs a way for two browsers to exchange connection info (offers/answers/ICE candidates) before they can talk directly. This app uses Socket.io as that signaling channel.
2. **Media**: Once signaling is done, video/audio flows *directly* between browsers (peer-to-peer) — the server never sees your video.
3. **Whiteboard/Chat**: These stay server-relayed through Socket.io rooms since they need to sync to everyone reliably.
4. **Auth**: Passwords are hashed with bcrypt before being stored. On login, a JWT is issued and stored in an httpOnly cookie.

## Setup & Run Locally

```bash
npm install
npm start
```

Then open **http://localhost:3000** in the browser. To test multi-user calling, open a second browser tab (or another device on the same Wi-Fi using your laptop's local IP) and join the same Room ID.

## Notes / Limitations (things to mention if asked in an interview)

- Uses a JSON file as a simple "database" for demo purposes — a production version would use MongoDB/PostgreSQL.
- Uses only a STUN server for NAT traversal; a production deployment behind strict corporate firewalls would also need a TURN server.
- For full production security you'd deploy behind HTTPS (required by browsers for camera/mic access on non-localhost domains anyway).

## Folder Structure

```
video-collab-app/
├── server.js           # Express + Socket.io backend
├── users.json           # simple user storage (auto-created)
├── uploads/              # uploaded files land here
└── public/
    ├── index.html        # login/signup page
    ├── room.html         # main call/whiteboard/chat UI
    ├── css/style.css
    └── js/
        ├── auth.js       # login/signup logic
        └── room.js       # WebRTC + whiteboard + chat + files
```
