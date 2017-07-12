/**
 * Powered by jsCatJO, MMO Network 2014 - 2017
 **/
var net = require('net');
var sqlite3 = require('sqlite3').verbose();
var app = require('express')();
var express = require('express');
var server = require('http').Server(app);
var nodemailer = require('nodemailer');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var math = require('mathjs');
var transporter = nodemailer.createTransport();
var db = new sqlite3.Database('base.db');
var fs = require('fs');
var TelegramBot = require('node-telegram-bot-api');
var CachetAPI = require('cachet-api');
var ping = require ("net-ping");
var session = ping.createSession ();
var router = express.Router();
var checked = 0;
var toSend = [];
var version = "0.0.0.25";
var startTime = 0;
var smonit = 0; //0 - не запущен, 1 - запускается, 2 - запущен и работает
//Не трогать, грузится из базы
var hosts = [/* ip, port, name, status, notificated, количество попыток */];
var cookies = [];

//=====================================================
// Конфиг
//=====================================================
var esender = [
	['admin@example.com', true]
];

//cachet settings
var cachet = new CachetAPI({
    url: 'http://example.com',
	apiKey: 'cachet-key'
});

//telegram settings
//bot token
var token = 'bot_id:pass';
//bot channel
var tgBotChannel = -1;

//host ping
var hostPing = "127.0.0.1";

//sender mail
var senderEmail = "bot@example.ru";

//http port
var httpPort = 3002;
//=====================================================

var bot = new TelegramBot(token, {polling: true});

console.log("Starting Service Monitoring...");
smonit = 1;

bot.on('message', function (msg) {
    var chatId = msg.chat.id;
    console.log(msg);
	if(msg.text != "/status" && msg.text != "/hello" && msg.text != "/test") {
		bot.sendMessage(chatId, "Хватит страдать хуйней!", {caption: "I'm a bot!"});
	} else {
		if(msg.text == "/status") {
			var message = "Статус сервисов: \r\n\r\n";
			hosts.forEach(function(item, i, arr) {
				message += "Сервис " + item[2] + " статус: " + item[3] + " время проверки: " +  item[6] + "\r\n";
			});
			bot.sendMessage(chatId, message, {caption: "I'm a bot!"});
			
			message = "Статус сервисов: \r\n\r\n";
			hosts.forEach(function(item, i, arr) {
				var t = "";
				if(item[3] == "CHECKING") {
					t = "Проверяется...";
				} else if(item[3] == "ERROR") {
					t = "Лежит.";
				} else if(item[3] == "OK") {
					t = "Все нормально.";
				} else {
					t = "Не удалось проверить.";
				}
				message += "Сервис " + item[2] + " статус: " + t + "\r\n";
			});			
		} else if(msg.text == "/hello") {
			bot.sendMessage(chatId, "Привет!", {caption: "I'm a bot!"});
		}
	}
});

bot.onText(/\/echo (.+)/, function (msg, match) {
	var fromId = msg.from.id;
	var resp = match[1];
	bot.sendMessage(fromId, resp);
});

function startService() {
	db.all("SELECT id, name, host, port, s_id FROM services", function(err, rows) {
		if(err != null) {
			console.log(err);
			return;
		}
		console.log("startService BEGIN");
		
		rows.forEach(function (row) {
			var arr = new Array(row.host, row.port, row.name, 'CHECKING', 0, 0, 0, row.s_id);
			console.log("Host Configure -> " + arr[2]);
			hosts.push(arr);
		});
		
		console.log("startService END");
		db.close();
		
		start();
		checkerStatus();
		PingHosts();
	});
}
app.use('/static', express.static('data/static'));
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use(cookieParser());

app.use(function(err, req, res, next){
  console.error(err.stack);
  res.send(500, 'Internal Server Error');
});

app.get('/', function(req, res) {
	fs.readFile('data/index.html', function (err, logData) {
		if (err) throw err;
		var status_text = "";
		var gen_page = logData.toString();
		gen_page = gen_page.replace("$status_servers$", ((smonit == 1) ? " запускается..." : (smonit == 2) ? " запущен." : "."));
		hosts.forEach(function(item, i, arr) {
			var notif = "";
			
			if(item[4] == 0)
				notif = "";
			if(item[4] == 1)
				notif = " ";
			if(item[4] == 2) 
				notif = " ";

			var status = (item[3] == "OK" ? "<font color='green'>" + item[3] + "</font>" : "<font color='red'>" + item[3] + "</font>");
			var timeupdate = "";
			if(item[6] == 0) {
				timeupdate = "проверка выполняется...";
			}
			else {
				var date = new Date(item[6]*1000);
				var dtimes = (("0"+date.getHours()).substr(-2) + ':' + ("0"+date.getMinutes()).substr(-2) + ':' + ("0"+date.getSeconds()).substr(-2));
				timeupdate = "" + dtimes;
			}
			
			status_text += "<tr><td>" + item[2] + "</td><td>" + status + "</td><td>" +  timeupdate + "</td><td>" + notif + "</td></tr>";
		});
		gen_page = gen_page.replace("$status_content$", status_text);
		var c_time = Math.round(Date.now() / 1000);
		if(startTime != 0) {
			var uptime_second = c_time - startTime;
			var uptime = new Date(uptime_second * 1000);
			gen_page = gen_page.replace("$status_uptime$", " Дней: " + uptime.getDate() - 1 + " - Часов: " + uptime.getHours() - 3 + " - Минут: " + uptime.getMinutes() + " - Секунд: " + uptime.getSeconds()); //Math.round(Date.now() / 1000);
		} else {
			gen_page = gen_page.replace("$status_uptime$", "-");
		}
		gen_page += "Version: " + version + "</footer>";
		res.send(gen_page);
	});
});

app.get('/admin', function(req, res) {
	fs.readFile('data/admin.html', function (err, result) {
		if (err) res.status(404).send('404 Not Found');
		
		if(!req.cookies.session || isCookie(req.cookies.session)) {
			res.redirect('/admin/auth');
			return;
		}
		
		res.send(result.toString());
	});
});

app.use('/admin/auth', function(req, res){
	var login = req.body.login;
	var password = req.body.password;
	console.log("login: " + login + "; password: " + password + ";");
	//TODO implementation
	if(login == "admin" && password == "admin") {
		var session_gen = generateSession();
		addSession(session_gen);
		res.cookie('session', session_gen);
		res.redirect('/admin');
	} else {
		if(!login && !password) {
			fs.readFile('data/admin_form.html', function (err, result) {
				if (err) res.status(404).send('404 Not Found');
				
				res.send(result.toString());
			});
		} else {
			res.status(403).send('403 Access Forbidden');
		}
	}
});

app.use('/api/status', function(req, res) {
	var status = [];
	hosts.forEach(function(item, i, arr) {
		var status_s = "";
		var a = [];
		if(item[3] == "OK")
			status_s = "online";
		else 
			status_s = "offline";

		status.push({'host': item[2], 'status': status_s});
	});
	res.contentType('application/json');
	res.send(JSON.stringify(status));
});

var server = app.listen(httpPort, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Web Server listening at http://%s:%s', host, port);
})

startService();

/**
* Таск проверки портов
**/
function start() {
	setInterval(function() {
		hosts.forEach(function(item, i, arr) {
			var sock = new net.Socket();
			sock.setTimeout(5000);
			sock.on('connect', function() {
				sock.destroy();
				item[3] = "OK";
				item[6] = Math.round(Date.now() / 1000);
			}).on('error', function(e) {
				item[3] = "ERROR";
				item[6] = Math.round(Date.now() / 1000);
			}).on('timeout', function(e) {
				item[3] = "TIMEOUT_ERROR";
				item[6] = Math.round(Date.now() / 1000);
			}).connect(item[1], item[0]);
		});
	}, 10000);
}
	
/**
* Таск проверки статусов
**/
//0 - не оповещен.
//1 - уст оповещение(1)
//2 - оповещен(2)
function checkerStatus() {
	setInterval(function() {
		hosts.forEach(function(item, i, arr) {
			if(item[3] == "ERROR" || item[3] == "TIMEOUT_ERROR") {
				if(item[4] == 0) {
					item[4] = 1;
				}
				item[5] += 1;
	
				if(item[5] >= 6 && item[4] == 1) {
					toSend.push("Сервис " + item[2] + " упал/timeout. |Время проверки: " + item[6] + ".");
					console.log("Service " + item[2] + " down.");
					if(parseInt(item[7]) > 0) {
						var incident = {
							name: 'Проблемы в работе сервиса ' + item[2],
							message: 'Наблюдаются проблемы в работе сервиса ' + item[2] + '. Команда уже работает над исправлением данной проблемы.',
							status: 'Investigating',
							visible: true,
							notify: true,
							component_id: item[7],
							component_status: 'Partial Outage'
						};
						cachet.reportIncident(incident).then(function (response) {
							console.log('New incident reported at ' + response.data.created_at);
						}).catch(function (err) {
							console.log('Fatal Error', err);
						});
						
						bot.sendMessage(tgBotChannel, "Сервис " + item[2] + " упал/время проверки истекло.", {caption: "I'm a bot!"});
					}
					item[4] = 2;
				}
			} else {
				if(item[5] >= 4 && item[4] == 2) {
					bot.sendMessage(tgBotChannel, "Сервис " + item[2] + " поднялся.", {caption: "I'm a bot!"});
					toSend.push("Сервис " + item[2] + " поднялся. |Время проверки: " + item[6] + ".");
				}
				item[5] = 0;
				item[4] = 0;
			}
		});
			
		if(smonit == 1) {
			smonit = 2;
			startTime = Math.round(Date.now() / 1000);
			console.log("Monitoring started.");
		}
			
		if(toSend.length > 0) {
			var textMail = "";
			var textChat = "";
			toSend.forEach(function(item, i, arr) {
				textMail += "" + item + "\r\n";
				textChat += "" + item + "<br />";
			});
			
			sendEmails(textMail);
			toSend = [];
		}
	}, 5000);
}

function sendEmails(stext) {
	esender.forEach(function(item, i, arr) {
		transporter.sendMail({
			from: senderEmail,
			to: item[0],
			subject: 'Оповещение системы мониторинга',
			text: 'Уважаемый(е) разработчик(и), изменились статусы некоторых из сервисов.\r\n\r\n'+stext+"\r\n"
		});
	});
}

function isCookie(session) {
	cookies.forEach(function(item, i, arr) {
		if(item[0] == session) {
			return true;
		}
	});
	return false;
}

function getTimeStamp() {
	return Math.round(Date.now() / 1000);
}

function addSession(session) {
	cookies.push(new Array(session, true, getTimeStamp()));
}

function generateSession() {
	var sess = "";
	var alphavite = new Array('a','b','c','d','e','f','g','h','j','k','l','m','n','o','p','q','r','s','t','y','v','x','w','z','0','1','2','3','4','5','6','7','8','9');
	for(var i = 0; i < 20; i++) {
		sess += alphavite[math.randomInt(alphavite.length-1)];
	}
	return sess;
}

function PingHosts() {
	setInterval(function() {
		session.pingHost (hostPing, function (error, target, sent, rcvd) {
			var ms = rcvd - sent;
			if (error) {
				console.log (target + ": " + error.toString ());
			} else {
				var metricPoint = {
					id: 1,
					value: ms,
					timestamp: Math.round(new Date().getTime() / 1000)
				};
				console.log (target + ": Alive (ms=" + ms + ")");
				cachet.publishMetricPoint(metricPoint).then(function (response) {
					console.log('Metric point published at ' + response.data.created_at);
				});
			}
		});
	}, 1000);
}