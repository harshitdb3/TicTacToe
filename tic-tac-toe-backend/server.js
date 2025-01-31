import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import 'dotenv/config';
import { createClient } from 'redis';

const redisClient = createClient({
    username: 'default',
    password: 'Q4JDH414H9w1hBhSHJfPXPTkClgSFFKT',  // Use your actual credentials
    socket: {
        host: 'redis-16083.c330.asia-south1-1.gce.redns.redis-cloud.com',
        port: 16083
    }
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT;

// Utility functions
async function generateRoomCode() {
    let code;
    let exists;
    do {
        code = crypto.randomInt(10000, 99999).toString();
        exists = await redisClient.exists(`room:${code}`);
    } while (exists);
    return code;
}

function generateGuestName() {
    return `Guest${crypto.randomInt(1000, 9999)}`;
}

function checkWinner(board) {
    const size = board.length;
    for (let i = 0; i < size; i++) {
        if (board[i].every(cell => cell === "X") || board[i].every(cell => cell === "O")) return board[i][0];
        const col = board.map(row => row[i]);
        if (col.every(cell => cell === "X") || col.every(cell => cell === "O")) return col[0];
    }
    const diag1 = board.map((row, idx) => row[idx]);
    const diag2 = board.map((row, idx) => row[size - idx - 1]);
    if (diag1.every(cell => cell === "X") || diag1.every(cell => cell === "O")) return diag1[0];
    if (diag2.every(cell => cell === "X") || diag2.every(cell => cell === "O")) return diag2[0];
    return null;
}

function getWinningCells(board) {
    const size = board.length;
    const lines = [];
    for (let row = 0; row < size; row++) {
        lines.push(board[row].map((_, col) => [row, col]));
    }
    for (let col = 0; col < size; col++) {
        lines.push(board.map((_, row) => [row, col]));
    }
    lines.push(board.map((_, i) => [i, i]));
    lines.push(board.map((_, i) => [i, size - i - 1]));

    for (const line of lines) {
        const [r0, c0] = line[0];
        const symbol = board[r0][c0];
        if (symbol && line.every(([r, c]) => board[r][c] === symbol)) {
            return line;
        }
    }
    return [];
}

function isBoardFull(board) {
    return board.every(row => row.every(cell => cell));
}

// Socket and room logic
io.on("connection", (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on("createGame", async ({ playerName, boardSize }) => {
        try {
            const roomCode = await generateRoomCode();
            const finalName = playerName?.trim() || generateGuestName();
            const size = parseInt(boardSize, 10);

            const roomData = {
                players: [{ id: socket.id, name: finalName, symbol: "X" }],
                board: Array(size).fill().map(() => Array(size).fill(null)),
                currentPlayer: "X",
                boardSize: size,
                status: "waiting"
            };

            await redisClient.set(`room:${roomCode}`, JSON.stringify(roomData));
            await redisClient.expire(`room:${roomCode}`, 3600);

            socket.join(roomCode);
            socket.emit("gameCreated", {
                roomCode,
                playerName: finalName,
                boardSize: size
            });
            console.log(`Game created: ${roomCode}`);
        } catch (err) {
            console.error("Create game error:", err);
            socket.emit("errorMsg", "Failed to create game");
        }
    });

    socket.on("joinGame", async ({ roomCode, playerName }) => {
        try {
            const roomString = await redisClient.get(`room:${roomCode}`);
            if (!roomString) {
                return socket.emit("errorMsg", "Room not found!");
            }

            const room = JSON.parse(roomString);
            if (room.players.length >= 2) {
                return socket.emit("errorMsg", "Room is full!");
            }
            if (room.status !== "waiting") {
                return socket.emit("errorMsg", "Game already started!");
            }

            const finalName = playerName?.trim() || generateGuestName();
            room.players.push({
                id: socket.id,
                name: finalName,
                symbol: "O"
            });
            room.status = "playing";

            await redisClient.set(`room:${roomCode}`, JSON.stringify(room));
            await redisClient.expire(`room:${roomCode}`, 3600);

            socket.join(roomCode);
            io.to(roomCode).emit("gameStart", {
                players: room.players,
                board: room.board,
                boardSize: room.boardSize,
                currentPlayer: room.currentPlayer,
                status: room.status,
                roomCode
            });
            console.log(`Player joined room ${roomCode}`);
        } catch (err) {
            console.error("Join game error:", err);
            socket.emit("errorMsg", "Failed to join game");
        }
    });

    socket.on("makeMove", async ({ roomCode, row, col }) => {
        try {
            const roomString = await redisClient.get(`room:${roomCode}`);
            if (!roomString) {
                return socket.emit("invalidMove", "No active game in this room");
            }

            const room = JSON.parse(roomString);
            if (room.status !== "playing") {
                return socket.emit("invalidMove", "No active game in this room");
            }

            const currentPlayer = room.players.find(p => p.id === socket.id);
            if (!currentPlayer) {
                return socket.emit("invalidMove", "Invalid player");
            }

            if (currentPlayer.symbol !== room.currentPlayer) {
                return socket.emit("invalidMove", "It's not your turn");
            }

            if (row < 0 || row >= room.boardSize || col < 0 || col >= room.boardSize) {
                return socket.emit("invalidMove", "Invalid cell coordinates");
            }
            if (room.board[row][col] !== null) {
                return socket.emit("invalidMove", "Cell already occupied");
            }

            room.board[row][col] = currentPlayer.symbol;
            room.currentPlayer = room.currentPlayer === "X" ? "O" : "X";

            const winner = checkWinner(room.board);
            if (winner) {
                room.status = "finished";
                const winningCells = getWinningCells(room.board);
                io.to(roomCode).emit("gameOver", { winner, winningCells });
            } else if (isBoardFull(room.board)) {
                room.status = "finished";
                io.to(roomCode).emit("gameOver", { winner: "Draw" });
            }

            await redisClient.set(`room:${roomCode}`, JSON.stringify(room));

            io.to(roomCode).emit("updateGame", {
                board: room.board,
                currentPlayer: room.currentPlayer,
                status: room.status
            });
        } catch (err) {
            console.error('Error in makeMove:', err);
            socket.emit("errorMsg", "Failed to make move");
        }
    });

    socket.on("disconnect", async () => {
        try {
            const roomKeys = await redisClient.keys('room:*');
            for (const key of roomKeys) {
                const roomString = await redisClient.get(key);
                if (!roomString) continue;

                const room = JSON.parse(roomString);
                const playerIndex = room.players.findIndex(p => p.id === socket.id);

                if (playerIndex > -1) {
                    room.players.splice(playerIndex, 1);

                    if (room.players.length === 0) {
                        await redisClient.del(key);
                    } else {
                        if (room.status === "playing") {
                            io.to(key.split(':')[1]).emit("gameOver", {
                                winner: "Opponent Left"
                            });
                        }
                        await redisClient.set(key, JSON.stringify(room));
                        await redisClient.expire(key, 3600);
                    }
                    break;
                }
            }
        } catch (err) {
            console.error("Disconnect error:", err);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
