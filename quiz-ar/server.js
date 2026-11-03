const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 200;
const MAX_QUESTIONS = 50;

app.use(express.static(path.join(__dirname, 'public')));

// كل غرفة مسابقة مخزنة في الذاكرة: pin -> room
const rooms = new Map();

function makePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(pin));
  return pin;
}

// تحقق من بيانات المسابقة القادمة من المعلم
function sanitizeQuiz(raw) {
  if (!raw || typeof raw.title !== 'string' || !Array.isArray(raw.questions)) return null;
  if (raw.questions.length === 0 || raw.questions.length > MAX_QUESTIONS) return null;

  const questions = [];
  for (const q of raw.questions) {
    if (!q || typeof q.text !== 'string' || !Array.isArray(q.options)) return null;
    const text = q.text.trim().slice(0, 300);
    const options = q.options.map(o => String(o).trim().slice(0, 150));
    const answer = Number(q.answer);
    if (!text) return null;
    if (options.length < 2 || options.length > 4) return null;
    if (options.some(o => !o)) return null;
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
    const time = Math.min(120, Math.max(5, Number(q.time) || 20));
    questions.push({ text, options, answer, time });
  }

  return {
    title: raw.title.trim().slice(0, 100) || 'مسابقة بدون عنوان',
    questions
  };
}

function hostRoom(socket) {
  const pin = socket.data.hostPin;
  const room = pin && rooms.get(pin);
  return room && room.hostId === socket.id ? room : null;
}

function playerRoom(socket) {
  const pin = socket.data.playerPin;
  return pin ? rooms.get(pin) || null : null;
}

function sortedPlayers(room) {
  return [...room.players.entries()].sort((a, b) => b[1].score - a[1].score);
}

function leaderboard(room, limit) {
  return sortedPlayers(room)
    .slice(0, limit)
    .map(([, p]) => ({ name: p.name, score: p.score }));
}

function rankOf(room, socketId) {
  return sortedPlayers(room).findIndex(([id]) => id === socketId) + 1;
}

function broadcastLobby(room) {
  const list = [...room.players.values()].map(p => p.name);
  io.to(room.hostId).emit('host:players', list);
}

function nextQuestion(room) {
  room.state = 'question';
  room.answers = new Map();
  room.startedAt = Date.now();
  const q = room.quiz.questions[room.index];

  // الإجابة الصحيحة لا تُرسل للطلاب قبل الكشف
  io.to(room.pin).emit('game:question', {
    index: room.index,
    total: room.quiz.questions.length,
    text: q.text,
    options: q.options,
    time: q.time
  });
  io.to(room.hostId).emit('host:answers', { count: 0, total: room.players.size });

  clearTimeout(room.timer);
  room.timer = setTimeout(() => reveal(room), q.time * 1000);
}

function reveal(room) {
  if (room.state !== 'question') return;
  clearTimeout(room.timer);
  room.state = 'reveal';

  const q = room.quiz.questions[room.index];
  const counts = q.options.map(() => 0);
  for (const a of room.answers.values()) counts[a.choice]++;

  io.to(room.pin).emit('game:reveal', {
    answer: q.answer,
    counts,
    leaderboard: leaderboard(room, 5)
  });

  for (const [id, p] of room.players) {
    const a = room.answers.get(id);
    io.to(id).emit('player:result', {
      answered: Boolean(a),
      correct: Boolean(a && a.correct),
      points: a ? a.points : 0,
      score: p.score,
      rank: rankOf(room, id)
    });
  }
}

function finish(room) {
  room.state = 'end';
  clearTimeout(room.timer);
  io.to(room.pin).emit('game:end', { title: room.quiz.title, leaderboard: leaderboard(room, 10) });
}

io.on('connection', socket => {
  // المعلم ينشئ غرفة
  socket.on('host:create', (raw, cb) => {
    const quiz = sanitizeQuiz(raw);
    if (!quiz) return cb && cb({ ok: false, error: 'بيانات المسابقة غير مكتملة أو غير صالحة' });

    // إغلاق أي غرفة سابقة لهذا المعلم
    const old = hostRoom(socket);
    if (old) {
      clearTimeout(old.timer);
      io.to(old.pin).emit('room:closed');
      rooms.delete(old.pin);
    }

    const pin = makePin();
    const room = {
      pin,
      quiz,
      hostId: socket.id,
      state: 'lobby',
      index: -1,
      players: new Map(),
      answers: new Map(),
      startedAt: 0,
      timer: null
    };
    rooms.set(pin, room);
    socket.join(pin);
    socket.data.hostPin = pin;

    cb && cb({ ok: true, pin });
    broadcastLobby(room);
  });

  // الطالب يدخل برمز PIN واسمه
  socket.on('player:join', (data, cb) => {
    const pin = String((data && data.pin) || '').trim();
    const name = String((data && data.name) || '').trim().slice(0, 20);
    const room = rooms.get(pin);

    if (!room) return cb && cb({ ok: false, error: 'رمز الدخول غير صحيح' });
    if (room.state !== 'lobby') return cb && cb({ ok: false, error: 'بدأت المسابقة بالفعل' });
    if (room.players.size >= MAX_PLAYERS) return cb && cb({ ok: false, error: 'الغرفة مكتملة' });
    if (!name) return cb && cb({ ok: false, error: 'اكتب اسمك أولاً' });

    room.players.set(socket.id, { name, score: 0 });
    socket.join(pin);
    socket.data.playerPin = pin;

    cb && cb({ ok: true, title: room.quiz.title });
    broadcastLobby(room);
  });

  // المعلم يبدأ المسابقة
  socket.on('host:start', () => {
    const room = hostRoom(socket);
    if (!room || room.state !== 'lobby' || room.players.size === 0) return;
    room.index = 0;
    nextQuestion(room);
  });

  // المعلم يكشف الإجابة مبكراً
  socket.on('host:reveal', () => {
    const room = hostRoom(socket);
    if (room) reveal(room);
  });

  // المعلم ينتقل للسؤال التالي أو ينهي المسابقة
  socket.on('host:next', () => {
    const room = hostRoom(socket);
    if (!room || room.state !== 'reveal') return;
    room.index++;
    if (room.index < room.quiz.questions.length) nextQuestion(room);
    else finish(room);
  });

  // الطالب يرسل إجابته
  socket.on('player:answer', data => {
    const room = playerRoom(socket);
    if (!room || room.state !== 'question') return;
    if (room.answers.has(socket.id)) return;

    const player = room.players.get(socket.id);
    const q = room.quiz.questions[room.index];
    const choice = Number(data && data.choice);
    if (!player || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return;

    const elapsed = (Date.now() - room.startedAt) / 1000;
    if (elapsed > q.time + 1) return; // بعد انتهاء الوقت

    const correct = choice === q.answer;
    // الإجابة الصحيحة السريعة تعطي حتى 1000 نقطة
    const points = correct ? Math.round(500 + 500 * Math.max(0, 1 - elapsed / q.time)) : 0;
    player.score += points;
    room.answers.set(socket.id, { choice, correct, points });

    socket.emit('player:answered');
    io.to(room.hostId).emit('host:answers', { count: room.answers.size, total: room.players.size });

    if (room.answers.size === room.players.size) reveal(room);
  });

  socket.on('disconnect', () => {
    const hostPinValue = socket.data.hostPin;
    const hosted = hostPinValue && rooms.get(hostPinValue);
    if (hosted && hosted.hostId === socket.id) {
      clearTimeout(hosted.timer);
      io.to(hosted.pin).emit('room:closed');
      rooms.delete(hosted.pin);
      return;
    }

    const room = playerRoom(socket);
    if (!room) return;
    room.players.delete(socket.id);
    room.answers.delete(socket.id);
    broadcastLobby(room);

    // إذا أجاب الباقون جميعاً بعد خروج هذا الطالب
    if (room.state === 'question' && room.players.size > 0 && room.answers.size >= room.players.size) {
      reveal(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`المنصة تعمل على http://localhost:${PORT}`);
});
