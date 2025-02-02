import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { CopyToClipboard } from "react-copy-to-clipboard";
import "./App.css";

const env = "https://tictac-227035147749.us-central1.run.app";
const socket = io(env, {
  transports: ["websocket", "polling"],
  autoConnect: false,
});


function App() {
  // Mode: "" = not selected; "online" or "offline"
  const [mode, setMode] = useState("");
  // screen: for online: "lobby", "waiting", "game"
  // for offline: "lobby" (setup) and "game"
  const [screen, setScreen] = useState("lobby");

  // Online state
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
    winningCells: [],
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Offline-specific state (players’ names)
  const [offlinePlayer1, setOfflinePlayer1] = useState("");
  const [offlinePlayer2, setOfflinePlayer2] = useState("");

  // Local board shared for both modes (online uses it as cache)
  const [localBoard, setLocalBoard] = useState([]);
  const [mySymbol, setMySymbol] = useState(null);
  const [notification, setNotification] = useState("");

  // Online Socket Events (only if mode is online)
  useEffect(() => {
    if (mode !== "online") return;
    socket.connect();
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    socket.on("gameCreated", (data) => {
      setMySymbol("X");
      setGameState((prev) => ({
        ...prev,
        roomCode: data.roomCode,
        boardSize: data.boardSize,
        status: "waiting",
      }));
      setLocalBoard(
        Array(data.boardSize)
          .fill(null)
          .map(() => Array(data.boardSize).fill(null))
      );
      setScreen("waiting");
      setIsCreating(false);
      showNotification("Room created successfully!");
    });


    socket.on("gameStart", (game) => {
      if (!mySymbol) {
        setMySymbol("O");
      }
      setGameState((prev) => ({ ...prev, ...game, status: "playing" }));
      setLocalBoard(game.board);
      setScreen("game");
      setIsJoining(false);
    });

    socket.on("updateGame", (game) => {
      setGameState((prev) => ({
        ...prev,
        board: game.board,
        currentPlayer: game.currentPlayer,
        status: game.status,
      }));
      setLocalBoard(game.board);
    });

    socket.on("gameOver", ({ winner, winningCells }) => {
      setGameState((prev) => ({
        ...prev,
        status: "finished",
        winner,
        winningCells: winningCells || [],
      }));
    });

    socket.on("errorMsg", (msg) => {
      showNotification(msg);
      setIsCreating(false);
      setIsJoining(false);
    });

    socket.on("invalidMove", (msg) => showNotification(msg));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("gameCreated");
      socket.off("gameStart");
      socket.off("updateGame");
      socket.off("gameOver");
      socket.off("errorMsg");
      socket.off("invalidMove");
      socket.disconnect(); // Clean up connection

    };

  }, [mode, mySymbol]);

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 3000);
  };

  const handleBoardSizeChange = (e) => {
    let val = parseInt(e.target.value, 10);
    if (Number.isNaN(val)) val = 3;
    val = Math.max(1, Math.min(val, 10));
    setBoardSize(val);
  };

  const handleRoomCodeInput = (e) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^0-9]/g, "")
      .substring(0, 5);
    setGameState((prev) => ({ ...prev, roomCode: value }));
  };

  // Online mode handlers
  const handleCreateGame = () => {
    if (!playerName.trim()) {
      showNotification("Please enter your name");
      return;
    }
    setIsCreating(true);
    setGameState((prev) => ({ ...prev, roomCode: "", status: "waiting" }));
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
      playerName,
    });
  };

  // Offline mode setup: initializes local game state using provided player names and board size.
  const handleStartOfflineGame = () => {
    if (!offlinePlayer1.trim() || !offlinePlayer2.trim()) {
      showNotification("Please enter names for both players");
      return;
    }
    const size = boardSize;
    const emptyBoard = Array(size)
      .fill(null)
      .map(() => Array(size).fill(null));
    setLocalBoard(emptyBoard);
    setGameState({
      roomCode: "",
      boardSize: size,
      players: [
        { id: 1, name: offlinePlayer1, symbol: "X" },
        { id: 2, name: offlinePlayer2, symbol: "O" },
      ],
      board: emptyBoard,
      currentPlayer: "X",
      status: "playing",
      winner: null,
      winningCells: [],
    });
    setScreen("game");
  };

  // For offline mode, update board locally and check win/draw conditions.
  const makeOfflineMove = (row, col) => {
    if (gameState.status === "finished") {
      showNotification("Game is finished!");
      return;
    }
    if (localBoard[row][col]) {
      showNotification("Cell is already occupied!");
      return;
    }
    const currentSymbol = gameState.currentPlayer;
    const updatedBoard = localBoard.map((r) => [...r]);
    updatedBoard[row][col] = currentSymbol;
    setLocalBoard(updatedBoard);

    if (checkWinner(updatedBoard, currentSymbol)) {
      setGameState((prev) => ({ ...prev, status: "finished", winner: currentSymbol }));
      showNotification(`${currentSymbol} wins!`);
      return;
    } else if (checkDraw(updatedBoard)) {
      setGameState((prev) => ({ ...prev, status: "finished", winner: "Draw" }));
      showNotification("It's a draw!");
      return;
    }
    setGameState((prev) => ({
      ...prev,
      currentPlayer: prev.currentPlayer === "X" ? "O" : "X",
      board: updatedBoard,
    }));
  };

  const checkWinner = (board, symbol) => {
    const size = board.length;
    // Check rows
    for (let i = 0; i < size; i++) {
      if (board[i].every((cell) => cell === symbol)) return true;
    }
    // Check columns
    for (let j = 0; j < size; j++) {
      let win = true;
      for (let i = 0; i < size; i++) {
        if (board[i][j] !== symbol) {
          win = false;
          break;
        }
      }
      if (win) return true;
    }
    // Check main diagonal
    let win = true;
    for (let i = 0; i < size; i++) {
      if (board[i][i] !== symbol) {
        win = false;
        break;
      }
    }
    if (win) return true;
    // Check anti-diagonal
    win = true;
    for (let i = 0; i < size; i++) {
      if (board[i][size - 1 - i] !== symbol) {
        win = false;
        break;
      }
    }
    return win;
  };

  const checkDraw = (board) => board.every(row => row.every(cell => cell));

  // Universal move function based on mode
  const makeMove = (row, col) => {
    if (gameState.status === "finished") {
      showNotification("Game is finished!");
      return;
    }
    if (mode === "online") {
      if (mySymbol !== gameState.currentPlayer) {
        showNotification("It's not your turn!");
        return;
      }
      if (localBoard[row][col]) {
        showNotification("Cell is already occupied!");
        return;
      }
      const updatedBoard = localBoard.map((r) => [...r]);
      updatedBoard[row][col] = mySymbol;
      setLocalBoard(updatedBoard);
      socket.emit("makeMove", {
        roomCode: gameState.roomCode,
        row,
        col,
      });
    } else {
      // Offline mode
      makeOfflineMove(row, col);
    }
  };

  return (
    <div className="app">
      {notification && <div className="notification">{notification}</div>}

      {/* Mode selection screen */}
      {mode === "" && (
        <div className="mode-selector lobby">
          <h1>Tic Tac Toe</h1>
          <button onClick={() => setMode("online")} className="mode-button">
            Online
          </button>
          <button onClick={() => setMode("offline")} className="mode-button">
            Offline
          </button>
        </div>
      )}

      {/* Online Mode Screens */}
      {mode === "online" && screen === "lobby" && (
        <div className="lobby">
          <h1>Tic Tac Toe - Online</h1>
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <div className="options">
            <div className="create-game">
              <h2>Create Game</h2>
              <input
                type="number"
                placeholder="Board Size (1–10)"
                min={1}
                max={10}
                value={boardSize}
                onChange={handleBoardSizeChange}
              />
              <button onClick={handleCreateGame} disabled={isCreating}>
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
              <button onClick={handleJoinGame} disabled={isJoining}>
                {isJoining ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
          {mode === "online" && !isConnected && (
            <div className="connection-status">Connecting to server...</div>
          )}
        </div>

      )}

      {mode === "online" && screen === "waiting" && (
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

      {/* Offline Mode Screens */}
      {mode === "offline" && screen === "lobby" && (
        <div className="offline-setup lobby">
          <h1>Tic Tac Toe - Offline</h1>
          <input
            type="text"
            placeholder="Player 1 Name"
            value={offlinePlayer1}
            onChange={(e) => setOfflinePlayer1(e.target.value)}
          />
          <input
            type="text"
            placeholder="Player 2 Name"
            value={offlinePlayer2}
            onChange={(e) => setOfflinePlayer2(e.target.value)}
          />
          <input
            type="number"
            placeholder="Board Size (1–10)"
            min={1}
            max={10}
            value={boardSize}
            onChange={handleBoardSizeChange}
          />
          <button onClick={handleStartOfflineGame}>Start Game</button>
        </div>
      )}

      {(mode === "online" && screen === "game") ||
        (mode === "offline" && screen === "game") ? (
        <div className="game-container">
          <div className="players">
            {gameState.players.map((player) => (
              <div
                key={player.id}
                className={`player ${player.symbol === gameState.currentPlayer ? "active" : ""
                  }`}
              >
                <div className="symbol">{player.symbol}</div>
                <div className="name">{player.name}</div>
              </div>
            ))}
          </div>
          <div className="board" style={{ "--size": gameState.boardSize }}>
            {localBoard.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  className={`cell ${cell || ""} ${gameState.winningCells?.some(
                    ([r, c]) => r === rowIndex && c === colIndex
                  )
                    ? "winning"
                    : ""
                    }`}
                  onClick={() => makeMove(rowIndex, colIndex)}
                >
                  {cell || ""}
                </button>
              ))
            )}
          </div>
          {gameState.status === "finished" && (
            <div className="game-over">
              {gameState.winner === "Draw" ? (
                <h2>It's a Draw!</h2>
              ) : mode === "online" && gameState.winner === "Opponent Left" ? (
                <h2>Opponent Disconnected</h2>
              ) : (
                <h2>{gameState.winner} Wins!</h2>
              )}
            </div>
          )}
        </div>
      ) : null}

    </div>
  );
}

export default App;
