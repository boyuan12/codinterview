// server.js
// where your node app starts

// we've started you off with Express (https://expressjs.com/)
// but feel free to use whatever libraries or frameworks you'd like through `package.json`.
const express = require("express");
const http = require('http');
const path = require('path');
const app = express();
const server = http.createServer(app);
const { ExpressPeerServer } = require('peer');
const port = process.env.PORT || "8000";
const fs = require('fs');
const problemsPath = path.join(__dirname, 'problems');
const yaml = require('js-yaml');
const req = require('request');
const bodyParser = require('body-parser');
const { stringify } = require("querystring");
const { Server } = require("socket.io");
const { response } = require("express");
const io = new Server(server);

var id = []


const peerServer = ExpressPeerServer(server, {
    proxied: true,
    debug: true,
    path: '/myapp',
    ssl: {}
});

app.use(peerServer)
app.use(express.static(path.join(__dirname)))
app.use(express.json())
app.set('view engine', 'ejs');
const jsonParser = bodyParser.json()
const urlencodedParser = bodyParser.urlencoded({ extended: false })


app.get("/", (request, response) => {
    response.sendFile(__dirname + "/index.html");
});

app.get("/ide", (request, response) => {
    response.sendFile(__dirname + "/editor.html")
});

app.post("/api/compile", jsonParser, (request, response) => {
    var filename = request.body.filename
    var code = request.body.code + "\n"
    var fileData = yaml.load(fs.readFileSync(path.join(__dirname, 'problems', filename)))
    var type = request.body.type
    code += fileData["test_python_init"]

    for (let testcase=0; testcase<fileData[type]["inputs"].length; testcase++) {
        var args = fileData[type]["inputs"][testcase]
        var cmd = ""
        for (let arg=0; arg<fileData["input_arguments"]; arg++) {
            console.log(args[arg])
            if (cmd != "") {
                if (typeof(args[arg]) == typeof([])) {
                    cmd = cmd.replace("<arg" + arg + ">", "[" + args[arg] + "]")
                } else {
                    cmd = cmd.replace("<arg" + arg + ">", args[arg])
                }
            } else {
                if (typeof(args[arg]) == typeof([])) {
                    cmd += fileData["test_python_cmd"].replace("<arg" + arg + ">", "[" + args[arg] + "]") + "\n"
                } else {
                    cmd += fileData["test_python_cmd"].replace("<arg" + arg + ">", args[arg]) + "\n"
                }
            }
        }
        code += cmd + "\n"
    }

    console.log(code)

    req('https://emkc.org/api/v2/piston/execute', { json: true, method: "POST", body: {
        language: "python",
        version: "3.10.0",
        files: [
            {
                "content": code
            }
        ]
    } }, (err, res, body) => {
    if (err) { return console.log(err); }
        if (body["run"]["code"] == 0) {
            var output = body["run"]["output"].split("\n")
            output.pop()

            var results = [fileData["arguments"]]

            for (let actualOutput=0; actualOutput<output.length; actualOutput++) {
                var testCaseStatus = true

                var o = output[actualOutput]

                console.log('EXPECTED: ', JSON.stringify(fileData[type]["outputs"][actualOutput]).toLocaleLowerCase().valueOf().replaceAll("'", "").replaceAll('"', ''))
                console.log('ACTUAL', JSON.stringify(output[actualOutput]).toLocaleLowerCase().valueOf().replaceAll("'", "").replaceAll('"', ''))

                if (JSON.stringify(output[actualOutput]).toLocaleLowerCase().replaceAll("'", "").replaceAll('"', '') != JSON.stringify(fileData[type]["outputs"][actualOutput]).toLocaleLowerCase().replaceAll("'", "").replaceAll('"', '')) {
                    testCaseStatus = false
                }
                
                if (testCaseStatus) {
                    results.push(true)
                } else {
                    results.push({"Input": fileData[type]["inputs"][actualOutput], "Expected": fileData[type]["outputs"][actualOutput], "Actual": o})
                }
            }

            console.log(results)
            response.json(results);
        } else {
            var error = body["run"]["output"]
            response.json({
                "code": body["run"]["code"],
                "error": error,
                "checks": fileData["checks"]["inputs"].length
            })
        }
    });
})

app.get("/api/problem", (request, response) => {
    fs.readdir(problemsPath, function (err, files) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
        //listing all files using forEach
        file = files[Math.floor(Math.random() * files.length)];

        fileData = yaml.load(fs.readFileSync(path.join(__dirname, 'problems', file)))
        console.log(fileData)
        response.json(fileData)
    })
})

app.post("/api/debug", jsonParser, (request, response) => {
    var filename = request.body.filename
    var fileData = yaml.load(fs.readFileSync(path.join(__dirname, 'problems', filename)))
    var code = request.body.code + "\n"
    code += fileData["test_python_init"] + "\n"
    var expected = request.body.expected
    var args = request.body.args
    var cmd = fileData.test_python_cmd

    console.log(args)

    for (let arg=0; arg<args.length; arg++) {
        if (typeof(args[arg]) == typeof([])) {
            cmd = cmd.replace("<arg" + arg + ">", "[" + args[arg] + "]")
        } else {
            cmd = cmd.replace("<arg" + arg + ">", args[arg])
        }
    }

    code += cmd

    req('https://emkc.org/api/v2/piston/execute', { json: true, method: "POST", body: {
        language: "python",
        version: "3.10.0",
        files: [
            {
                "content": code
            }
        ]
    } }, (err, res, body) => {
        if (err) { return console.log(err); }
        console.log(body)
        return response.json(body)
    })
})

app.get("/chat", (request, response) => {
    response.sendFile(__dirname + "/chat.html")
})

io.on('connection', (socket) => {
    socket.on("editor_change", function(data) {
        if (!id.includes(data.data)) {
            console.log(data.data)
            socket.broadcast.emit("editor_change", data)
            id.push(data.data)
        } 
    });

});

server.listen(port);
console.log('Listening on: ' + port);