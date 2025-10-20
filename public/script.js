const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteContainer = document.getElementById('remoteVideos');
const peers = {};
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let localStream;
const roomId = window.location.pathname.substring(1);

// Get camera and mic
navigator.mediaDevices.getUserMedia({ video:true, audio:true })
  .then(stream => { localVideo.srcObject = stream; localStream = stream; socket.emit('join-room', roomId); });

// Mic / Video toggle
const micButton = document.getElementById('micButton');
let micEnabled=true;
micButton.addEventListener('click', () => {
  localStream.getAudioTracks().forEach(t=>t.enabled=!t.enabled);
  micEnabled=!micEnabled;
  micButton.textContent = micEnabled?'🎤':'🔇';
});

const videoButton = document.getElementById('videoButton');
let videoEnabled=true;
videoButton.addEventListener('click', ()=>{
  localStream.getVideoTracks().forEach(t=>t.enabled=!t.enabled);
  videoEnabled=!videoEnabled;
  videoButton.textContent = videoEnabled?'📹':'📷';
});

// Screen share
const shareScreenButton = document.getElementById('shareScreenButton');
let screenSharing=false, screenStream;
shareScreenButton.addEventListener('click', async ()=>{
  if(!screenSharing){
    try{
      screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});
      for(let id in peers){
        const sender=peers[id].getSenders().find(s=>s.track.kind==='video');
        sender.replaceTrack(screenStream.getVideoTracks()[0]);
      }
      localVideo.srcObject=screenStream;
      screenSharing=true;
      screenStream.getVideoTracks()[0].onended=stopScreenShare;
    }catch(e){console.error(e);}
  }else stopScreenShare();
});
function stopScreenShare(){
  screenSharing=false;
  localVideo.srcObject=localStream;
  for(let id in peers){
    const sender=peers[id].getSenders().find(s=>s.track.kind==='video');
    sender.replaceTrack(localStream.getVideoTracks()[0]);
  }
}

// Draggable local video
let isDragging=false,offsetX,offsetY;
localVideo.addEventListener('mousedown',e=>{ isDragging=true; offsetX=e.offsetX; offsetY=e.offsetY; });
document.addEventListener('mousemove',e=>{ if(isDragging){ localVideo.style.left=`${e.clientX-offsetX}px`; localVideo.style.top=`${e.clientY-offsetY}px`; } });
document.addEventListener('mouseup',()=>{ isDragging=false; });

// End Call
document.getElementById('endCallButton').addEventListener('click',()=>{
  localStream.getTracks().forEach(track=>track.stop());
  for(let id in peers){ peers[id].close(); const v=document.getElementById(id); if(v)v.remove();}
  window.location.href='/';
});

// Screen size select
const screenSizeSelect=document.getElementById('screenSize');
screenSizeSelect.addEventListener('change',()=>{
  const size=screenSizeSelect.value;
  remoteContainer.querySelectorAll('video').forEach(v=>{
    if(size==='medium') v.style.width='400px';
    if(size==='large') v.style.width='600px';
  });
});

// Invite via email
document.getElementById('inviteButton').addEventListener('click', async ()=>{
  const email=prompt("Enter email to invite:");
  if(!email) return;
  await fetch('/invite',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,roomId})
  });
  alert("Invitation sent!");
});

// Socket.io events
socket.on('user-connected',id=>{ createPeerConnection(id,true); updateGridColumns(); });
socket.on('offer',async({offer,from})=>{ createPeerConnection(from,false,offer); updateGridColumns(); });
socket.on('answer',async({answer,from})=>{ if(peers[from]) await peers[from].setRemoteDescription(answer); });
socket.on('ice-candidate',async({candidate,from})=>{ if(peers[from]) await peers[from].addIceCandidate(candidate).catch(console.error); });
socket.on('user-disconnected',id=>{ if(peers[id]) peers[id].close(); delete peers[id]; const v=document.getElementById(id); if(v)v.remove(); updateGridColumns(); });

// Peer connection
function createPeerConnection(id,isInitiator,remoteOffer=null){
  const pc=new RTCPeerConnection(config);
  peers[id]=pc;
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));

  const rv=document.createElement('video');
  rv.id=id; rv.autoplay=true; rv.playsInline=true;
  remoteContainer.appendChild(rv);

  pc.ontrack=e=>{ rv.srcObject=e.streams[0]; };
  pc.onicecandidate=e=>{ if(e.candidate) socket.emit('ice-candidate',{candidate:e.candidate,from:socket.id,to:id}); };

  if(isInitiator){
    pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>socket.emit('offer',{offer:pc.localDescription,from:socket.id,to:id}));
  }else if(remoteOffer){
    pc.setRemoteDescription(remoteOffer).then(()=>pc.createAnswer()).then(a=>pc.setLocalDescription(a)).then(()=>socket.emit('answer',{answer:pc.localDescription,from:socket.id,to:id}));
  }
}

// Dynamic grid columns
function updateGridColumns(){
  const count=remoteContainer.children.length;
  let cols=1;
  if(count===2) cols=2;
  else if(count<=4) cols=2;
  else if(count<=6) cols=3;
  else cols=4;
  remoteContainer.style.gridTemplateColumns=`repeat(${cols},1fr)`;
}