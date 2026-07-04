// ============================================================
// room.js — Core client logic:
//   1. WebRTC multi-user video (mesh network)
//   2. Screen sharing (track replacement)
//   3. Whiteboard sync (Canvas + Socket.io)
//   4. Chat
//   5. File sharing
// ============================================================

const username = sessionStorage.getItem('username');
const roomId = sessionStorage.getItem('roomId');

if (!username || !roomId) {
  window.location.href = 'index.html';
}

document.getElementById('roomLabel').textContent = `Room: ${roomId}`;

const socket = io();

// STUN servers help peers discover their public IP (needed to connect across networks).
// For real-world use behind strict firewalls you'd add a TURN server too.
const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let localStream = null;
let screenStream = null;
const peerConnections = {}; // socketId -> RTCPeerConnection

// ------------------------------------------------------------
// 1. GET LOCAL CAMERA/MIC AND JOIN ROOM
// ------------------------------------------------------------
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addVideoTile('local', localStream, `${username} (You)`, true);
  } catch (err) {
    alert('Camera/mic access is required for video calling.');
    console.error(err);
  }

  socket.emit('join-room', { roomId, username });
}

// ------------------------------------------------------------
// 2. HANDLE PEOPLE ALREADY IN THE ROOM / NEW JOINERS
// ------------------------------------------------------------
socket.on('existing-users', (socketIds) => {
  socketIds.forEach((id) => createPeerConnection(id, true));
});

socket.on('user-joined', ({ socketId }) => {
  createPeerConnection(socketId, false);
});

socket.on('user-left', ({ socketId }) => {
  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }
  removeVideoTile(socketId);
});

// ------------------------------------------------------------
// 3. WEBRTC PEER CONNECTION SETUP (mesh: one connection per peer)
// ------------------------------------------------------------
function createPeerConnection(peerId, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections[peerId] = pc;

  // Send our local tracks (camera/mic) to this peer
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // When we receive the remote peer's media, show it
  pc.ontrack = (event) => {
    addVideoTile(peerId, event.streams[0], `Peer ${peerId.slice(0, 5)}`, false);
  };

  // Send discovered network candidates to the other peer via the signaling server
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', { to: peerId, candidate: event.candidate });
    }
  };

  if (isInitiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => socket.emit('webrtc-offer', { to: peerId, offer: pc.localDescription }));
  }

  return pc;
}

socket.on('webrtc-offer', async ({ from, offer }) => {
  const pc = peerConnections[from] || createPeerConnection(from, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc-answer', { to: from, answer });
});

socket.on('webrtc-answer', async ({ from, answer }) => {
  const pc = peerConnections[from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections[from];
  if (pc) {
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (err) { console.error('Error adding ICE candidate', err); }
  }
});

// ------------------------------------------------------------
// 4. VIDEO GRID HELPERS
// ------------------------------------------------------------
function addVideoTile(id, stream, label, isLocal) {
  let tile = document.getElementById('tile-' + id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = 'tile-' + id;
    tile.innerHTML = `<video autoplay playsinline ${isLocal ? 'muted' : ''}></video><div class="label">${label}</div>`;
    document.getElementById('videoGrid').appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}
function removeVideoTile(id) {
  const tile = document.getElementById('tile-' + id);
  if (tile) tile.remove();
}

// ------------------------------------------------------------
// 5. MIC / CAMERA TOGGLES
// ------------------------------------------------------------
document.getElementById('toggleMic').onclick = (e) => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  e.target.textContent = track.enabled ? '🎤 Mute' : '🎤 Unmute';
};
document.getElementById('toggleCam').onclick = (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  e.target.textContent = track.enabled ? '📷 Camera Off' : '📷 Camera On';
};

// ------------------------------------------------------------
// 6. SCREEN SHARING
//    Replaces the outgoing video track on every peer connection.
// ------------------------------------------------------------
let isSharingScreen = false;
document.getElementById('shareScreenBtn').onclick = async () => {
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Swap the video track on every active peer connection
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Show our own screen locally too
      document.querySelector('#tile-local video').srcObject = screenStream;

      isSharingScreen = true;
      document.getElementById('shareScreenBtn').textContent = '🛑 Stop Sharing';
      socket.emit('screen-share-started');

      // If the user stops sharing via the browser's native UI button
      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.error('Screen share cancelled or failed', err);
    }
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  const camTrack = localStream.getVideoTracks()[0];
  Object.values(peerConnections).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(camTrack);
  });
  document.querySelector('#tile-local video').srcObject = localStream;
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  isSharingScreen = false;
  document.getElementById('shareScreenBtn').textContent = '🖥️ Share Screen';
  socket.emit('screen-share-stopped');
}

// ------------------------------------------------------------
// 7. LEAVE CALL
// ------------------------------------------------------------
document.getElementById('leaveBtn').onclick = () => {
  Object.values(peerConnections).forEach(pc => pc.close());
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  socket.disconnect();
  window.location.href = 'index.html';
};

// ------------------------------------------------------------
// 8. SIDE PANEL TABS
// ------------------------------------------------------------
document.querySelectorAll('.side-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.side-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  };
});

// ------------------------------------------------------------
// 9. WHITEBOARD (Canvas + Socket.io sync)
// ------------------------------------------------------------
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let lastX = 0, lastY = 0;

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDraw(e) {
  drawing = true;
  const pos = getPos(e);
  lastX = pos.x; lastY = pos.y;
}
function stopDraw() { drawing = false; }

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const pos = getPos(e);
  const color = document.getElementById('wbColor').value;
  const width = document.getElementById('wbWidth').value;

  drawLine(lastX, lastY, pos.x, pos.y, color, width);
  socket.emit('whiteboard-draw', { x0: lastX, y0: lastY, x1: pos.x, y1: pos.y, color, width });

  lastX = pos.x; lastY = pos.y;
}

function drawLine(x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('touchstart', startDraw);
canvas.addEventListener('touchend', stopDraw);
canvas.addEventListener('touchmove', draw);

socket.on('whiteboard-draw', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width);
});

document.getElementById('wbClear').onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('whiteboard-clear');
};
socket.on('whiteboard-clear', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ------------------------------------------------------------
// 10. CHAT
// ------------------------------------------------------------
const chatMessages = document.getElementById('chatMessages');

document.getElementById('chatSendBtn').onclick = sendChat;
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat-message', text);
  input.value = '';
}
socket.on('chat-message', ({ username: user, text, time }) => {
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<b>${user}</b> <span style="color:#777">${time}</span><br>${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ------------------------------------------------------------
// 11. FILE SHARING
// ------------------------------------------------------------
document.getElementById('fileUploadBtn').onclick = async () => {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length) return alert('Choose a file first');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Upload failed');

  socket.emit('file-shared', { url: data.url, name: data.name });
  fileInput.value = '';
};

socket.on('file-shared', ({ username: user, url, name }) => {
  const fileList = document.getElementById('fileList');
  const link = document.createElement('a');
  link.href = url;
  link.textContent = `${name} (shared by ${user})`;
  link.target = '_blank';
  fileList.prepend(link);
});

// ------------------------------------------------------------
init();
