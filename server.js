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
                    saveUsersToFile(users);  // Atualiza o status do usuário
                    const newGame = {
                        id: Math.random().toString(36).substr(2, 9),
                        players: [data.username],
                        status: 'created',
                    };
                    ws.send(JSON.stringify({ type: 'game_created', game: newGame }));
                }
                break;

            case 'join_game':
                // Lógica para entrar em uma partida existente
                const player = users.find(user => user.username === data.username);
                if (player) {
                    player.inGame = true;
                    saveUsersToFile(users);  // Atualiza o status do usuário
                    ws.send(JSON.stringify({ type: 'game_joined' }));
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
                // Finalizar a partida e colocar o usuário de volta no lobby
                const endingPlayer = users.find(user => user.username === data.username);
                if (endingPlayer) {
                    endingPlayer.inGame = false;
                    saveUsersToFile(users);  // Atualiza o status do usuário
                    ws.send(JSON.stringify({ type: 'game_ended' }));
                }
                break;

            // Outras funcionalidades...
        }
    });

    ws.on('close', () => {
        // Implementar lógica de remoção de usuário se necessário
    });
});

// Função para salvar usuários no arquivo JSON
function saveUsersToFile(users) {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}
