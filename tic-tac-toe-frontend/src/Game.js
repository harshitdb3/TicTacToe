import React, { useState, useEffect } from 'react';

const Game = ({ socket, roomId, boardSize }) => {
    const [board, setBoard] = useState(Array(boardSize).fill().map(() => Array(boardSize).fill(null)));
    const [winner, setWinner] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState('X');

    useEffect(() => {
        socket.on('updateBoard', ({ board: updatedBoard }) => {
            setBoard(updatedBoard);
        });

        socket.on('gameOver', ({ winner }) => {
            setWinner(winner);
        });

        socket.on('playerJoined', ({ symbol }) => {
            setCurrentPlayer(symbol === 'X' ? 'X' : 'O');
        });

        return () => {
            socket.off('updateBoard');
            socket.off('gameOver');
            socket.off('playerJoined');
        };
    }, [socket]);

    // Frontend (Game.js) - Ensure proper move handling
    const handleCellClick = (row, col) => {
        if (!gameState.board[row][col] &&     // Cell must be empty
            gameState.status === 'playing' && // Game must be active
            gameState.currentPlayer === yourSymbol // Correct turn
        ) {
            socket.emit('makeMove', { roomCode, row, col });
        }
    };


    return (
        <div className="game-container">
            <h2>Playing in Room: {roomId}</h2>
            <div className="board">
                {board.map((row, rowIndex) => (
                    <div key={rowIndex} className="board-row">
                        {row.map((cell, colIndex) => (
                            <button
                                key={colIndex}
                                className="cell"
                                onClick={() => handleCellClick(rowIndex, colIndex)}
                                disabled={!!cell || !!winner}
                            >
                                {cell}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            {winner && (
                <div className="game-status">
                    {winner === 'Draw' ? 'Game Draw!' : `Winner: ${winner}`}
                </div>
            )}
        </div>
    );
};

export default Game;
