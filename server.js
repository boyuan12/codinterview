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
const bodyParser = require('body-parser')

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
    response.render(__dirname + "/editor.ejs")
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

            var results = []

            for (let actualOutput=0; actualOutput<output.length; actualOutput++) {
                var testCaseStatus = true

                var o = output[actualOutput]

                if (String(output[actualOutput]).toLocaleLowerCase() != String(fileData[type]["outputs"][actualOutput]).toLocaleLowerCase()) {
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



server.listen(port);
console.log('Listening on: ' + port);