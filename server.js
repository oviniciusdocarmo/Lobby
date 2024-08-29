const WebSocket = require('ws');
const fs = require('fs');

// Caminho para o arquivo JSON onde os usuários serão salvos
const usersFilePath = './users.json';

// Carrega usuários salvos no arquivo, se existir
let users = [];
if (fs.existsSync(usersFilePath)) {
    const rawData = fs.readFileSync(usersFilePath);
    users = JSON.parse(rawData);
}

const gamesFilePath = './games.json';
let games = [];
if (fs.existsSync(gamesFilePath)) {
    const rawData = fs.readFileSync(gamesFilePath);
    games = JSON.parse(rawData);
}

const minPlayers = 2; // Configurável
const maxPlayers = 4; // Configurável

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'register':
                // Verificar se os campos de email, username e password foram preenchidos
                if (!data.email || !data.username || !data.password) {
                    ws.send(JSON.stringify({ type: 'register_failed', message: 'Todos os campos (email, username, password) são obrigatórios.' }));
                    break;
                }

                // Verificar se o username ou email já existem
                if (users.some(user => user.username === data.username)) {
                    ws.send(JSON.stringify({ type: 'register_failed', message: 'O username já está em uso.' }));
                } else if (users.some(user => user.email === data.email)) {
                    ws.send(JSON.stringify({ type: 'register_failed', message: 'O email já está em uso.' }));
                } else {
                    const newUser = { username: data.username, email: data.email, password: data.password, inGame: false };
                    users.push(newUser);
                    saveUsersToFile(users);  // Salva usuários no arquivo
                    ws.send(JSON.stringify({ type: 'register_success' }));
                }
                break;

            case 'login':
                // Verificar se o username e password foram preenchidos
                if (!data.username || !data.password) {
                    ws.send(JSON.stringify({ type: 'login_failed', message: 'Username e senha são obrigatórios.' }));
                    break;
                }

                // Login do usuário
                const user = users.find(user => user.username === data.username && user.password === data.password);
                if (user) {
                    ws.send(JSON.stringify({ type: 'login_success' }));
                    ws.username = user.username;  // Salvar o username na conexão WebSocket
                } else {
                    ws.send(JSON.stringify({ type: 'login_failed', message: 'Username ou senha incorretos.' }));
                }
                break;

            case 'create_game':
                // Lógica para criar uma nova partida
                const gameCreator = users.find(user => user.username === data.username);
                if (gameCreator) {
                    gameCreator.inGame = true;
                    saveUsersToFile(users);
                    const newGame = {
                        id: Math.random().toString(36).substr(2, 9),
                        creator: data.username,
                        players: [data.username],
                        status: 'created',
                    };
                    games.push(newGame);
                    saveGamesToFile(games);
                    broadcast({ type: 'game_created', game: newGame });
                }
                break;

            case 'join_game':
                const game = games.find(game => game.id === data.gameId);
                
                if (game && game.players.length < maxPlayers) {
                    game.players.push(data.username);
                    saveGamesToFile(games);
                    ws.send(JSON.stringify({ type: 'game_joined' }));
                    broadcast({ type: 'game_list', games: games });
                }
                break;

            case 'leave_game':
                const leavingGame = games.find(game => game.id === data.gameId);
                if (leavingGame) {
                    leavingGame.players = leavingGame.players.filter(player => player !== data.username);
                    const user = users.find(user => user.username === data.username);
                    if (user) user.inGame = false;
                    saveUsersToFile(users);
                    saveGamesToFile(games);
                    
                    // Notificar o cliente que saiu
                    ws.send(JSON.stringify({ type: 'game_left' }));
            
                    // Atualizar a lista de partidas para todos
                    broadcast({ type: 'game_list', games: games });
                }
                break;
            

            case 'send_message':
                // Enviar mensagem para todos os usuários no lobby, exceto aqueles que estão em uma partida
                wss.clients.forEach(client => {
                    const recipient = users.find(user => user.username === client.username);
                    if (client.readyState === WebSocket.OPEN && recipient && !recipient.inGame) {
                        client.send(JSON.stringify({
                            type: 'new_message',
                            username: data.username,
                            message: data.message
                        }));
                    }
                });
                break;

            case 'end_game':
                const endingGame = games.find(game => game.players.includes(data.username));
                if (endingGame) {
                    endingGame.players.forEach(username => {
                        const user = users.find(user => user.username === username);
                        if (user) user.inGame = false;
                    });
                    games = games.filter(game => game.id !== endingGame.id);
                    saveUsersToFile(users);  // Atualiza o status dos usuários
                    saveGamesToFile(games);  // Remove a partida do arquivo

                    // Notificar todos os clientes sobre o fim da partida
                    broadcast({ type: 'game_ended' });
                }
                break;

            // Outras funcionalidades...

        }
    });

    ws.on('close', () => {
        // remover usuário da lista de usuários conectados
        const user = users.find(user => user.username === ws.username);
        if (user) user.inGame = false;
        saveUsersToFile(users);
        // remover usuário da lista de jogadores da partida
        const game = games.find(game => game.players.includes(ws.username));
        if (game) {
            game.players = game.players.filter(username => username !== ws.username);
            if (game.players.length === 0) {
                games = games.filter(g => g.id !== game.id);
            }
            saveGamesToFile(games);
            broadcast({ type: 'game_list', games: games });
        }
    });
});

// Função para salvar usuários no arquivo JSON
function saveUsersToFile(users) {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

// Função para salvar partidas no arquivo JSON
function saveGamesToFile(games) {
    fs.writeFileSync(gamesFilePath, JSON.stringify(games, null, 2));
}

// Função para transmitir dados para todos os clientes conectados
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}
