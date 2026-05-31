const { createApp, ref, onMounted, onUnmounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        const BOARD_SIZE = 15;
        const CELL_SIZE = 36;
        const PADDING = 15;

        const roomIdInput = ref('');
        const currentRoom = ref('');
        const roomJoined = ref(false);
        const playerId = ref(0);
        const currentTurn = ref(1);
        const playerCount = ref(0);
        const gameOver = ref(false);
        const winner = ref(0);
        const history = ref([]);
        const lastMove = ref(null);

        const isReplaying = ref(false);
        const replayIndex = ref(0);
        const autoReplaying = ref(false);
        let autoReplayInterval = null;

        const isMovePending = ref(false);

        const undoRequestVisible = ref(false);
        const undoRequestFrom = ref(0);
        const undoWaiting = ref(false);

        let ws = null;
        const boardCanvas = ref(null);
        const replaySlider = ref(null);
        let board = [];

        const canUndo = computed(() => {
            return history.value.length > 0 && 
                   !gameOver.value && 
                   history.value[history.value.length - 1].color === playerId.value &&
                   !undoWaiting.value;
        });

        function initBoard() {
            board = [];
            for (let i = 0; i < BOARD_SIZE; i++) {
                board[i] = [];
                for (let j = 0; j < BOARD_SIZE; j++) {
                    board[i][j] = 0;
                }
            }
        }

        function drawBoard() {
            const canvas = boardCanvas.value;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#DEB887';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;

            for (let i = 0; i < BOARD_SIZE; i++) {
                ctx.beginPath();
                ctx.moveTo(PADDING + i * CELL_SIZE, PADDING);
                ctx.lineTo(PADDING + i * CELL_SIZE, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(PADDING, PADDING + i * CELL_SIZE);
                ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, PADDING + i * CELL_SIZE);
                ctx.stroke();
            }

            const starPoints = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
            ctx.fillStyle = '#000';
            starPoints.forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(PADDING + x * CELL_SIZE, PADDING + y * CELL_SIZE, 4, 0, Math.PI * 2);
                ctx.fill();
            });

            for (let i = 0; i < BOARD_SIZE; i++) {
                for (let j = 0; j < BOARD_SIZE; j++) {
                    if (board[i][j] !== 0) {
                        drawPiece(ctx, i, j, board[i][j]);
                    }
                }
            }
        }

        function drawPiece(ctx, x, y, color) {
            const centerX = PADDING + x * CELL_SIZE;
            const centerY = PADDING + y * CELL_SIZE;
            const radius = CELL_SIZE / 2 - 2;

            const gradient = ctx.createRadialGradient(centerX - 3, centerY - 3, 2, centerX, centerY, radius);
            if (color === 1) {
                gradient.addColorStop(0, '#666');
                gradient.addColorStop(1, '#000');
            } else {
                gradient.addColorStop(0, '#fff');
                gradient.addColorStop(1, '#ddd');
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();

            if (color === 2) {
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        function handleBoardClick(event) {
            if (!roomJoined.value || gameOver.value || currentTurn.value !== playerId.value || isReplaying.value || isMovePending.value) {
                return;
            }

            const canvas = boardCanvas.value;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const col = Math.round((x - PADDING) / CELL_SIZE);
            const row = Math.round((y - PADDING) / CELL_SIZE);

            if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE && board[col][row] === 0) {
                sendMove(col, row);
            }
        }

        let moveTimeout = null;

        function sendMove(x, y) {
            if (ws && ws.readyState === WebSocket.OPEN && !isMovePending.value) {
                isMovePending.value = true;
                ws.send(JSON.stringify({
                    type: 'move',
                    data: { x, y }
                }));

                if (moveTimeout) clearTimeout(moveTimeout);
                moveTimeout = setTimeout(() => {
                    isMovePending.value = false;
                }, 5000);
            }
        }

        function requestUndo() {
            if (ws && ws.readyState === WebSocket.OPEN && canUndo.value) {
                ws.send(JSON.stringify({
                    type: 'undo_request',
                    data: {}
                }));
                undoWaiting.value = true;
            }
        }

        function respondUndo(accept) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: accept ? 'undo_accept' : 'undo_reject',
                    data: {}
                }));
                undoRequestVisible.value = false;
            }
        }

        function restartGame() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'restart',
                    data: {}
                }));
            }
            isReplaying.value = false;
            replayIndex.value = 0;
            undoWaiting.value = false;
            undoRequestVisible.value = false;
        }

        function toggleReplay() {
            if (isReplaying.value) {
                isReplaying.value = false;
                stopAutoReplay();
                restoreBoard();
            } else {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'replay',
                        data: {}
                    }));
                } else {
                    startReplayWithHistory(history.value);
                }
            }
        }

        function startReplayWithHistory(moves) {
            history.value = moves;
            isReplaying.value = true;
            replayIndex.value = 0;
            initBoard();
            drawBoard();
        }

        function replayPrev() {
            if (replayIndex.value > 0) {
                replayIndex.value--;
                updateReplayBoard();
            }
        }

        function replayNext() {
            if (replayIndex.value < history.value.length) {
                replayIndex.value++;
                updateReplayBoard();
            }
        }

        function onSliderInput(e) {
            replayIndex.value = parseInt(e.target.value, 10);
            updateReplayBoard();
        }

        function updateReplayBoard() {
            initBoard();
            for (let i = 0; i < replayIndex.value; i++) {
                const move = history.value[i];
                board[move.x][move.y] = move.color;
            }
            drawBoard();
        }

        function autoReplay() {
            if (autoReplaying.value) {
                stopAutoReplay();
            } else {
                autoReplaying.value = true;
                autoReplayInterval = setInterval(() => {
                    if (replayIndex.value < history.value.length) {
                        replayIndex.value++;
                        updateReplayBoard();
                    } else {
                        stopAutoReplay();
                    }
                }, 500);
            }
        }

        function stopAutoReplay() {
            autoReplaying.value = false;
            if (autoReplayInterval) {
                clearInterval(autoReplayInterval);
                autoReplayInterval = null;
            }
        }

        function restoreBoard() {
            initBoard();
            history.value.forEach(move => {
                board[move.x][move.y] = move.color;
            });
            drawBoard();
        }

        function joinOrCreateRoom() {
            const roomId = roomIdInput.value || generateRoomId();
            connectWebSocket(roomId);
        }

        function generateRoomId() {
            return 'room-' + Math.random().toString(36).substring(2, 8);
        }

        function connectWebSocket(roomId) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws?room=${roomId}`;
            
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connected');
                currentRoom.value = roomId;
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleMessage(message);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                roomJoined.value = false;
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        function handleMessage(message) {
            console.log('Received:', message);

            switch (message.type) {
                case 'join':
                    playerId.value = message.data.playerId;
                    currentTurn.value = message.data.currentTurn;
                    history.value = message.data.history || [];
                    gameOver.value = message.data.gameOver;
                    winner.value = message.data.winner;
                    roomJoined.value = true;
                    
                    initBoard();
                    if (message.data.board) {
                        for (let i = 0; i < BOARD_SIZE; i++) {
                            for (let j = 0; j < BOARD_SIZE; j++) {
                                board[i][j] = message.data.board[i][j];
                            }
                        }
                    }
                    if (history.value.length > 0) {
                        const last = history.value[history.value.length - 1];
                        lastMove.value = { x: last.x, y: last.y };
                    }
                    drawBoard();
                    break;

                case 'move':
                    isMovePending.value = false;
                    if (moveTimeout) clearTimeout(moveTimeout);
                    undoWaiting.value = false;
                    board[message.data.x][message.data.y] = message.data.color;
                    currentTurn.value = message.data.currentTurn;
                    gameOver.value = message.data.gameOver;
                    winner.value = message.data.winner;
                    history.value.push({
                        x: message.data.x,
                        y: message.data.y,
                        color: message.data.color
                    });
                    lastMove.value = { x: message.data.x, y: message.data.y };
                    drawBoard();
                    break;

                case 'undo_request':
                    undoRequestVisible.value = true;
                    undoRequestFrom.value = message.data.playerId;
                    break;

                case 'undo_rejected':
                    undoWaiting.value = false;
                    break;

                case 'undo':
                    isMovePending.value = false;
                    undoWaiting.value = false;
                    undoRequestVisible.value = false;
                    if (moveTimeout) clearTimeout(moveTimeout);
                    history.value = message.data.history;
                    currentTurn.value = message.data.currentTurn;
                    initBoard();
                    for (let i = 0; i < BOARD_SIZE; i++) {
                        for (let j = 0; j < BOARD_SIZE; j++) {
                            board[i][j] = message.data.board[i][j];
                        }
                    }
                    if (history.value.length > 0) {
                        const last = history.value[history.value.length - 1];
                        lastMove.value = { x: last.x, y: last.y };
                    } else {
                        lastMove.value = null;
                    }
                    drawBoard();
                    break;

                case 'restart':
                    isMovePending.value = false;
                    undoWaiting.value = false;
                    undoRequestVisible.value = false;
                    if (moveTimeout) clearTimeout(moveTimeout);
                    initBoard();
                    currentTurn.value = message.data.currentTurn;
                    history.value = [];
                    gameOver.value = false;
                    winner.value = 0;
                    lastMove.value = null;
                    isReplaying.value = false;
                    replayIndex.value = 0;
                    drawBoard();
                    break;

                case 'replay':
                    startReplayWithHistory(message.data.history || []);
                    break;

                case 'playerJoined':
                case 'playerLeft':
                    playerCount.value = message.data.playerCount;
                    break;
            }
        }

        function copyRoomId() {
            navigator.clipboard.writeText(currentRoom.value).then(() => {
                alert('房间号已复制！');
            });
        }

        onMounted(() => {
            initBoard();
            drawBoard();
        });

        onUnmounted(() => {
            if (ws) {
                ws.close();
            }
            stopAutoReplay();
            if (moveTimeout) clearTimeout(moveTimeout);
        });

        return {
            roomIdInput,
            currentRoom,
            roomJoined,
            playerId,
            currentTurn,
            playerCount,
            gameOver,
            winner,
            history,
            lastMove,
            canUndo,
            isReplaying,
            replayIndex,
            autoReplaying,
            isMovePending,
            undoRequestVisible,
            undoRequestFrom,
            undoWaiting,
            boardCanvas,
            replaySlider,
            handleBoardClick,
            joinOrCreateRoom,
            copyRoomId,
            requestUndo,
            respondUndo,
            restartGame,
            toggleReplay,
            replayPrev,
            replayNext,
            onSliderInput,
            autoReplay
        };
    }
}).mount('#app');
