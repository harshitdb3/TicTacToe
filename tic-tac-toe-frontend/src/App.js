import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { CopyToClipboard } from "react-copy-to-clipboard";
import "./App.css";

const socket = io("https://tictac-227035147749.us-central1.run.app", {
  transports: ['websocket', 'polling']
});

function App() {
  const [screen, setScreen] = useState("lobby");
  const [playerName, setPlayerName] = useState("");
  const [boardSize, setBoardSize] = useState(3);
  const [gameState, setGameState] = useState({
    roomCode: "",
    boardSize: 3,
    players: [],
    board: [],
    currentPlayer: null,
    status: "lobby",
    winner: null,
    winningCells: []
  });
  const [notification, setNotification] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket.on("gameCreated", (data) => {
      setGameState(prev => ({
        ...prev,
        roomCode: data.roomCode,
        boardSize: data.boardSize,
        status: "waiting"
      }));
      setScreen("waiting");
      setIsCreating(false);
      showNotification("Room created successfully!");
    });

    socket.on("gameStart", (game) => {
      setGameState(prev => ({
        ...prev,
        ...game,
        status: "playing"
      }));
      setScreen("game");
      setIsJoining(false);
    });

    socket.on("updateGame", (game) => {
      setGameState(prev => ({
        ...prev,
        board: game.board,
        currentPlayer: game.currentPlayer,
        status: game.status
      }));
    });

    socket.on("gameOver", ({ winner, winningCells }) => {
      setGameState(prev => ({
        ...prev,
        status: "finished",
        winner,
        winningCells: winningCells || []
      }));
    });

    socket.on("errorMsg", (msg) => {
      showNotification(msg);
      setIsCreating(false);
      setIsJoining(false);
    });

    socket.on("invalidMove", (msg) => showNotification(msg));
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    return () => {
      socket.off("gameCreated");
      socket.off("gameStart");
      socket.off("updateGame");
      socket.off("gameOver");
      socket.off("errorMsg");
      socket.off("invalidMove");
    };
  }, []);

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 3000);
  };

  const handleRoomCodeInput = (e) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^0-9]/g, '')
      .substring(0, 5);
    setGameState(prev => ({ ...prev, roomCode: value }));
  };

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      showNotification("Please enter your name");
      return;
    }
    setIsCreating(true);
    setGameState(prev => ({
      ...prev,
      roomCode: "",
      status: "waiting"
    }));
    socket.emit("createGame", { playerName, boardSize });
  };

  const handleJoinGame = () => {
    if (!playerName.trim()) {
      showNotification("Please enter your name");
      return;
    }
    if (!gameState.roomCode.trim()) {
      showNotification("Please enter a room code");
      return;
    }
    setIsJoining(true);
    socket.emit("joinGame", {
      roomCode: gameState.roomCode.toUpperCase(),
      playerName
    });
  };

  const makeMove = (row, col) => {
    if (gameState.status === "finished") return;
    socket.emit("makeMove", {
      roomCode: gameState.roomCode,
      row,
      col
    });
  };

  return (
    <div className="app">
      {notification && <div className="notification">{notification}</div>}

      {screen === "lobby" && (
        <div className="lobby">
          <h1>Tic Tac Toe</h1>
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />

          <div className="options">
            <div className="create-game">
              <h2>Create Game</h2>
              <select
                value={boardSize}
                onChange={(e) => setBoardSize(Number(e.target.value))}
              >
                {[3, 4, 5].map(size => (
                  <option key={size} value={size}>{size}x{size}</option>
                ))}
              </select>
              <button
                onClick={handleCreateGame}
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>

            <div className="join-game">
              <h2>Join Game</h2>
              <input
                type="text"
                placeholder="Room Code (5 digits)"
                value={gameState.roomCode}
                onChange={handleRoomCodeInput}
              />
              <button
                onClick={handleJoinGame}
                disabled={isJoining}
              >
                {isJoining ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "waiting" && (
        <div className="waiting-room">
          <h2>Room Code: {gameState.roomCode}</h2>
          <CopyToClipboard
            text={gameState.roomCode}
            onCopy={() => showNotification("Copied to clipboard!")}
          >
            <button>Copy Code</button>
          </CopyToClipboard>
          <p>Waiting for opponent to join...</p>
        </div>
      )}

      {screen === "game" && (
        <div className="game-container">
          <div className="players">
            {gameState.players.map(player => (
              <div
                key={player.id}
                className={`player ${player.symbol === gameState.currentPlayer ? "active" : ""}`}
              >
                <div className="symbol">{player.symbol}</div>
                <div className="name">{player.name}</div>
              </div>
            ))}
          </div>

          <div
            className="board"
            style={{ "--size": gameState.boardSize }}
          >
            {gameState.board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  className={`cell ${cell || ""} ${gameState.winningCells?.some(
                    ([r, c]) => r === rowIndex && c === colIndex
                  ) ? "winning" : ""
                    }`}
                  onClick={() => makeMove(rowIndex, colIndex)}
                  disabled={!!cell || gameState.status === "finished"}
                >
                  {cell || ""}
                </button>
              ))
            )}
          </div>

          {gameState.status === "finished" && (
            <div className="game-over">
              {gameState.winner === "Draw" ? (
                <h2>It's a Draw! 🎲</h2>
              ) : gameState.winner === "Opponent Left" ? (
                <h2>Opponent Disconnected 🚪</h2>
              ) : (
                <h2>🎉 {gameState.winner} Wins! 🎉</h2>
              )}
            </div>
          )}
        </div>
      )}

      {!isConnected && (
        <div className="connection-status">
          🔌 Connecting to server...
        </div>
      )}
    </div>
  );
}

export default App;
