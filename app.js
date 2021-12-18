if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

// request (promisify)
const util = require('util')
const request = require('request')

// mongodb connection
const MUUID = require('uuid-mongodb').mode('relaxed')
const { MongoClient, Long } = require('mongodb')
const client = new MongoClient("mongodb+srv://" + process.env.DB_USER + ":" + process.env.DB_PASS + "@master-waua9.mongodb.net/?retryWrites=true")

// express app setup
const express = require('express')
const app = express()
const { createProxyMiddleware } = require('http-proxy-middleware')
//const path = require('path')
const PORT = process.env.PORT || 8080
const CREATIVEIP = process.env.CREATIVEIP
const CREATIVEPORT = process.env.CREATIVEPORT
const SURVIVALIP = process.env.SURVIVALIP
const SURVIVALPORT = process.env.SURVIVALPORT

// discord setup
const DISCORD_CLIENTID = process.env.DISCORD_CLIENTID
const DISCORD_SECRET = process.env.DISCORD_SECRET
const DISCORD_REDIRECT = "https://palacemc.net/discord"
const DISCORD_URL = "https://discord.gg/4mzWHGE"
const DISCORD_AUTH = "https://discord.com/api/oauth2/authorize?client_id=782453797007786024&redirect_uri=https%3A%2F%2Fpalacemc.net%2Fdiscord&response_type=code&scope=identify"


async function main() {

    await client.connect()
    console.log("Connected to database")
    const database = client.db("minecraft")

    // configure static resources (stylesheets, images, etc.)
    //app.use(express.static(path.join(__dirname, 'static')))
    app.use(express.static('static'))

    // strip trailing slashes (they fuck up resource loading)
    app.use((req, res, next) => {
        if (req.path.substr(-1) == '/' && req.path.length > 1) {
            let query = req.url.slice(req.path.length)
            res.redirect(301, req.path.slice(0, -1) + query)
        } else {
            next()
	    }
	})

    // configure rendering engine
    //app.set('views', path.join(__dirname, 'views'))
    app.set('views', 'views')
    app.set('view engine', 'ejs')

    // internal routing
    app.get('/', (req, res) => res.render('index'))
    app.get('/help/?', (req, res) => res.render('help'))
    app.get('/jobs/?', (req, res) => res.render('jobs'))
    app.get('/shop/?', (req, res) => res.render('shop'))

    // proxy work (dynmap stuff)
    app.use('^/map/hub$', createProxyMiddleware({
        target: `http://${CREATIVEIP}:${CREATIVEPORT}`,
        pathRewrite: { '^/map/hub': '' }
    }))

    app.use('^/map/survival$', createProxyMiddleware({
        target: `http://${SURVIVALIP}:${SURVIVALPORT}`,
        pathRewrite: { '^/map/survival': '' }
    }))

    // Discord account verification
    // final url match catches anything else
    app.get('/discord', async (req, res) => {

        if (req.query.state == null) {
            res.send('redirect')
            //res.redirect(DISCORD_URL)
            return
        }

        let uuid, hash, code, details
        try {

            // verify state
            if (!req.query.state instanceof String) {
                throw Error("state not string")
            }

            let matches = req.query.state.match(/^(\w{8}-(?:\w{4}-){3}\w{12})-([A-Z0-9]{10})$/)
            matches.shift()

            if (matches.length != 2) {
                throw Error("bad state format")
			}

            uuid = MUUID.from(matches[0])
            hash = matches[1]

            // no code verification, just accept it
            code = req.query.code

        } catch (error) {
            console.log(error)
            res.send('redirect')
            //res.redirect(DISCORD_URL)
            return
        }

        if (code == null) {
            //res.redirect(DISCORD_AUTH + `&state=${uuid.toString()}-${hash}`)
            res.redirect("https://discord.com/api/oauth2/authorize?client_id=782453797007786024&redirect_uri=https%3A%2F%2Fpalacemc.net%2Fdiscord&response_type=code&scope=identify" +
                `&state=${uuid.toString()}-${hash}`)
        } else {

            // check uuid and hash match in DB, and not expired
            let details = await database.collection("details").find({ uuid: uuid }).toArray()

            const tryAgainMessage = '<br/>You can go back onto the Minecraft server and try running ' +
                '<code class="inline-box\">/discord verify</code> to get a new verification link.<br/>' +
                'If you keep seeing this error, contact staff on the server for help.'
            const badOrExpiredMessage = 'The provided state is malformed or expired.' + tryAgainMessage
            const discordFailMessage = 'Either discord isn\'t playing nice, or this link has expired.' + tryAgainMessage
            const alreadyConnected = 'Your account has already been linked.<br/>If you need to connect a new account, please unlink first.<br/>You can go back onto the Minecraft' +
                ' server and run <code class="inline-box">/discord unlink</code>, then <code class="inline-box">/discord verify</code> to get a new verification link.'
            const alreadyUsedAnother = 'That Discord account is already linked to a different Minecraft account.<br/>Please contact staff on the server for assistance.'
            const successMessage = `Your discord account has been linked!<br/>If you haven't already, <a href="${DISCORD_URL}" target="_blank">join the discord</a>. It might ` +
                `take a few moments to get your Member role, so have patience.<br/>If it takes longer than five minutes, contact staff on the server for help.`

            if (details.length != 1) {
                console.log("no such uuid")
                res.render("discord", { success: false, message: badOrExpiredMessage })
                return
            }

            details = details[0]
            let now = Math.round(Date.now() / 1000);

            let discordConnection
            for (let connection of details.connections) {
                if (connection.type.localeCompare("discord") == 0) {
                    discordConnection = connection
                    break
                }
            }

            if (discordConnection == null) {
                console.log("no active discord connection")
                res.render("discord", { success: false, message: badOrExpiredMessage })
                return
            }

            // Consider the connection active only if content is provided and the TTL is in the future
            if (discordConnection.content != null && discordConnection.ttl > now) {
                console.log("already connected")
                res.render("discord", { success: false, message: alreadyConnected })
                return
			}

            if (discordConnection.hash != hash) {
                console.log("hash mismatch")
                res.render("discord", { success: false, message: badOrExpiredMessage })
                return
            }

            if (discordConnection.hash_ttl < now) {
                console.log("expired hash")
                res.render("discord", { success: false, message: badOrExpiredMessage })
                return
            }

            let data = {
                'client_id': DISCORD_CLIENTID,
                'client_secret': DISCORD_SECRET,
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': 'https://palacemc.net/discord'
            }

            //console.log(data)

            // try to get valid token using code
            let discordResponse = JSON.parse((await util.promisify(request.post)({
                url: 'https://discord.com/api/v8/oauth2/token',
                form: data
            })).toJSON().body)

            if (discordResponse.error != null) {
                console.log(`discord: ${discordResponse.error} ${discordResponse.error_description}`)
                res.render("discord", { success: false, message: discordFailMessage })
                return
            }

            // Make sure we have what we need
            let access_token = discordResponse.access_token,
                refresh_token = discordResponse.refresh_token,
                expires_in = discordResponse.expires_in

            if (access_token == null) {
                console.log("discord: missing access_token")
                res.render("discord", { success: false, message: discordFailMessage })
                return
            }

            if (refresh_token == null) {
                console.log("discord: missing refresh_token")
                res.render("discord", { success: false, message: discordFailMessage })
                return
            }

            if (expires_in == null) {
                console.log("discord: missing expires_in")
                res.render("discord", { success: false, message: discordFailMessage })
                return
            }

            // now we get the id, because for some reason discord makes us perform two requests
            discordResponse = JSON.parse((await util.promisify(request.get)({
                url: 'https://discordapp.com/api/users/@me',
                headers: {
                    'Authorization': `Bearer ${access_token}`
				}
            })).toJSON().body)

            if (discordResponse.message != null) {
                console.log("discord: " + discordResponse.message)
                res.render("discord", { success: false, message: discordFailMessage })
                return
			}

            let id = discordResponse.id
            if (id == null) {
                console.log("discord: missing id")
                res.render("discord", { success: false, message: discordFailMessage })
                return
            }

            // after fucking ALL of this, we have to make sure the ID isn't used already
            const findResult = await database.collection("details").findOne({
                connections: {
                    $elemMatch: {
                        type: 'discord',
                        content: id
					}
				}
            })

            if (findResult != null) {
                res.render("discord", { success: false, message: alreadyUsedAnother })
                return
			}

            // FINALLY save all the shit to DB
            const updateResult = await database.collection("details").findOneAndUpdate({
                uuid: uuid
            }, {
                $set: {
                    'connections.$[con].content': id,
                    // max instant time in Java, no clue if there's a better way to put this
                    // it is important to be a string, because javascript simply cannot accurately represent this as a plain number
                    'connections.$[con].ttl': Long.fromString("31556889864403199"),
                    'connections.$[con].token': `${access_token},${refresh_token}`,
                    'connections.$[con].token_ttl': Long.fromNumber(now + expires_in),
                    'connections.$[con].hash': null,
                     // min instant time in Java, no clue if there's a better way to put this
                    // it is important to be a string, because javascript simply cannot accurately represent this as a plain number
                    'connections.$[con].hash_ttl': Long.fromString("-31557014167219200")
				}
            }, {
                arrayFilters: [{
                    'con.type': 'discord'
				}]
            })

            if (updateResult.lastErrorObject.updatedExisting) {
                res.render("discord", { success: true, message: successMessage })
                return
			}

            res.render("discord", { success: false, message: discordFailMessage })

		}

    })

    const server = app.listen(PORT, () => {
        console.log(`Listening on port ${server.address().port}`)
    })

    return 'Started'

}

main()
    .then(console.log)
    .catch(console.error)

