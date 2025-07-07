const WebSocket = require('ws');
const { spawn } = require('child_process');

// CHANGE THESE VALUES TO FIT YOUR KATAGO PATH!!!
const KATAGO_PATH = '/home/cmk/katago/katago';
const KATAGO_NET = '/home/cmk/katago/kata1-b10c128.txt.gz';
const KATAGO_CONFIG = '/home/cmk/katago/gtp.cfg';

katago = spawn(KATAGO_PATH, ['gtp', '-model', KATAGO_NET, '-config', KATAGO_CONFIG]);
setTimeout(function () { socket = connect(); }, 5000);
side = 0;
katagoSide = -1;
TABLE = 0;
joinedTable = 0;
activeGame = 0;

function acceptChallenge(socket, color, player, table) {
  message(socket, 'join', table);
  message(socket, color, table);
  message(socket, 'start', table);
}

function message(socket, action, table) {
  let request = {"i": [], "s": []};
  switch (action) {
    case 'join':
      request.i = [72, table];
      TABLE = table;
      joinedTable = 1;
      katagoSide = -1;
      console.log('playok: joined table #' + table);
      break;
    case 'leave':
      console.log('playok: leaving table #' + table);
      katago.stdin.write('clear_board\n');
      request.i = [73, table];
      side = 0;
      katagoSide = -1;
      TABLE = 0;
      joinedTable = 0;
      activeGame = 0;
      break;
    case 'white':
      request.i = [83, table, 1];
      katagoSide = 1;
      console.log('playok: took white stones at table #' + table);
      break;
    case 'black':
      request.i = [83, table, 0];
      katagoSide = 0;
      console.log('playok: took black stones at table #' + table);
      break;
    case 'start':
      request.i = [85, table];
      console.log('playok: attempting to start a game at table #' + table);
      setTimeout(function() {
        if (!activeGame) {
          console.log('playok: opponent refused to start game at table #' + table);
          message(socket, 'leave', table);
        } else if (activeGame) {
          if (katagoSide == 0) {
            katago.stdin.write('genmove B\n');
            katago.stdin.write('showboard\n');
          }
        }
      }, 2000);
      break;
    case 'resign':
      request.i = [93, table, 4, 0];
      break;
    case 'pass':
      request.i = [92, table, 0, 400, 0];
      break;
  } socket.send(JSON.stringify(request));
}

function connect() {
  const socket = new WebSocket('wss:x.playok.com:17003/ws/', {
    headers: {
     'Origin': 'null',
    }
  });
  socket.on('open', function () {
    const initialMessage = JSON.stringify({
      "i":[1721],
      "s":[
        "+9301980859678439|1959167412|20201458",  // guest "cgn811g"
        "en",
        "b",
        "",
        "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
        "/1751794473996/1",
        "w","1920x1080 1",
        "ref:https://www.playok.com/en/go/","ver:263"
      ]}
    );
    socket.send(initialMessage);
    console.log('playok: connected to PlayOK');
    setInterval(function() {
      const keepAliveMessage = JSON.stringify({ "i": [] });
      socket.send(keepAliveMessage);
    }, 5000);
  });
  socket.on('message', function (data) {
    let response = JSON.parse(data);
    // DEBUG
    // console.log(response);
    if (response.i[0] == 70) { // lobby & pairing
      let boardSize = response.s[0].split(',')[1];
      if (parseInt(boardSize) != 19) return;
      let table = response.i[1];
      let player1 = response.s[1];
      let player2 = response.s[2];
      if (joinedTable == 1) return;
      // DEBUG
      //if (player1 != 'cmk') return;
      if (response.i[3] == 1 && response.i[4] == 0) {
        acceptChallenge(socket, 'white', player1, table);
      }
      if (response.i[3] == 0 && response.i[4] == 1) {
        acceptChallenge(socket, 'black', player2, table);
      }
    }
    
    if (response.i[0] == 91 && response.i[1] == TABLE && joinedTable) { // load game
      katago.stdin.write('clear_board\n');
      side = 0;
      let moves = response.s;
      if (moves != undefined) {
        for (let move of moves) {
          let color = side ? 'W' : 'B';
          if (move == '-') katago.stdin.write('play ' + color + ' pass\n');
          else katago.stdin.write('play ' + color + ' ' + move.replace('-', '').split(' ')[0] + '\n');
          side ^= 1;
        }
      }
      katago.stdin.write('showboard\n');
      console.log('playok: loaded game at table #' + TABLE);
    }
  
    if (response.i[0] == 92 && response.i[1] == TABLE && joinedTable) { // update move
      let color = '';
      let move = response.s[0];
      if (move != undefined) {
        if (side == katagoSide ^ 1) {
          color = side ? 'W' : 'B';
          if (move == '-') {
            console.log('playok: received move PASS');
            katago.stdin.write('play ' + color + ' pass\n');
          } else {
            console.log('playok: received move ' + move.split('-')[0].toUpperCase() + move.split('-')[1]);
            katago.stdin.write('play ' + color + ' ' + move.replace('-', '').split(' ')[0] + '\n');
            katago.stdin.write('showboard\n');
          }
        }
        side ^= 1;
        if (side == katagoSide) {
          color = katagoSide ? 'W' : 'B';
          katago.stdin.write('genmove ' + color + '\n');
          katago.stdin.write('showboard\n');
        }
      }
    }
    
    if (response.i[0] == 81 && response.i[1] == TABLE) { // chat messages & system notifications
      console.log('playok:', response.s[0]);
      //if (response.s[0].includes('does not agree')) message(socket, 'resign', response.i[1]);
      if (response.s[0].includes('resigns') ||
          response.s[0].includes('territory') ||
          response.s[0].includes('exceeded') ||
          response.s[0].includes('booted') ||
          response.s[0].includes('offline') ||
          response.s[0].includes('displaced')) {
            message(socket, 'leave', response.i[1]);
          }
    }

    if (response.i[0] == 90) {
      if (response.i[3] == -1) activeGame = 0;
      else activeGame = 1;
    }

    if (response.i[0] == 90 && response.i[2] == 53) {
      if (joinedTable) {
        message(socket, 'pass', response.i[1]);
        console.log('playok: counting game');
      }
    }
    
    // DEBUG
    //if (response.i[1] == TABLE) console.log('playok:', response);
  });
  socket.on('error', function (error) { console.log('playok: error'); });
  socket.on('close', function () {
    katago.kill();
    console.log('\n\nkatago: killed');
    console.log('playok: connection closed');
    process.exit();
  }); return socket;
}

katago.stdout.on('data', (data) => {
  let response = data.toString();
  const isMove = response.match(/= ([A-T][0-9]+)\n\n/);
  if (isMove) {
    let move = isMove[1];
    let col = 'ABCDEFGHJKLMNOPQRST'.indexOf(move[0]);
    let row = 19-parseInt(move.slice(1));
    let sq = row * 19 + col;
    setTimeout(function() {
      console.log('katago: generated move', move);
      let message = JSON.stringify({"i": [92, TABLE, 0, (row * 19 + col), 0]});
      socket.send(message);
    }, 1000);
  } else if (response.includes('pass')) {
    console.log('katago: PASS');
    message(socket, 'pass', TABLE);
  } else if (response.includes('resign')) {
    console.log('katago: RESIGN');
    message(socket, 'resign', TABLE);
  } else if (response.includes('A B C D E F')) {
    // DEBUG
    //console.log('katago:', '#' + TABLE, response);
  } else {
    if (data.toString().includes('illegal')) {
      console.log('katago: something went wrong')
    }
    //DEBUG
    //console.log('katago(DEBUG):', data.toString());
  }
});

katago.stderr.on('data', (data) => {
  console.log('katago(err):', data.toString());
});

process.on('SIGINT', function() { // Ctrl-C: force resign
  if (side == katagoSide) message(socket, 'resign', TABLE);
});

// Ctrl-\ to quit
