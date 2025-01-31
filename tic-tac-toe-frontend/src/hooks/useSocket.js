import { useState, useCallback, useEffect } from 'react';
import io from 'socket.io-client';

export const useSocket = () => {
    const [socket, setSocket] = useState(null);
    const [connectionError, setConnectionError] = useState(null);

    const connect = useCallback(() => {
        if (socket?.connected) {
            console.log('Socket already connected');
            return socket;
        }

        console.log('Initializing new socket connection...');
        
        const newSocket = io("http://localhost:3000", {
            auth: {
                token: localStorage.getItem('playerToken')
            },
            autoConnect: false,
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });

        // Connection lifecycle events
        newSocket.on('connect', () => {
            console.log('Socket connected successfully');
            setConnectionError(null);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setConnectionError(`Connection failed: ${error.message}`);
        });

        newSocket.on('error', (error) => {
            console.error('Socket error:', error);
            setConnectionError(`Socket error: ${error.message}`);
        });

        // Heartbeat mechanism
        const heartbeat = setInterval(() => {
            if (newSocket.connected) {
                newSocket.emit('ping');
            }
        }, 30000);

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            clearInterval(heartbeat);
            if (reason === "io server disconnect") {
                console.log('Attempting to reconnect...');
                setTimeout(() => newSocket.connect(), 1000);
            }
        });

        console.log('Connecting socket...');
        newSocket.connect();
        setSocket(newSocket);
        return newSocket;
    }, [socket]);

    const disconnect = useCallback(() => {
        if (socket) {
            console.log('Disconnecting socket...');
            socket.disconnect();
            setSocket(null);
            setConnectionError(null);
        }
    }, [socket]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return { 
        socket, 
        connect, 
        disconnect, 
        connectionError,
        isConnected: socket?.connected || false 
    };
};