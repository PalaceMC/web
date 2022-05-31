const { LimitedMap } = require('./palace-util')
const database = require('./database')

const express = require('express')
const { Mutex } = require('async-mutex')
const crypto = require('crypto')
// Thank you so much H4O, i hate when people use unnecessary dependencies (and fix proto pollution in silly ways)
const JSONB = require('when-json-met-bigint').JSONB({strict: true, protoAction: 'ignore', constructorAction: 'ignore'})

function doError(res, status, message) {
    if (!status || typeof status != 'number' || status < 400)
        status = 418 // I'm a teapot
    if (!message) {
        switch (status) {
            case 400:
                message = "Bad Request"
                break
            case 401:
                message = "Unauthorized"
                break
            case 403:
                message = "Forbidden"
                break
            case 404:
                message = "Not Found"
                break
            case 405:
                message = "Method Not Allowed"
                break
            case 429:
                message = "Too Many Requests"
                break
            case 500:
                message = "Internal Server Error"
                break
            case 501:
                message = "Not Implemented"
                break
            case 503:
                message = "Service Unavailable"
                break
            default:
                message = "I'm a teapot"
        }
    } else if (typeof message != 'string')
        message = JSON.stringify(message)
    res.status(status).json({error: 1, message})
}

function validatePublicToken(req, res, token) {
    // TODO: write this in the future to enable outsiders to access "private" endpoints
    return validateToken(req, res, token)
}

function validateToken(req, res, token) {
    if (!Object.hasOwn(ipTokens, req.remoteExpanded)) {
        doError(res, 401)
        return false
    }
    let [expected, creation] = ipTokens[req.remoteExpanded]
    // check token FIRST... gives less info away
    if (!expected || typeof expected != 'string' || !token || typeof token != 'string' || expected !== token) {
        doError(res, 401)
        return false
    }
    // Only valid for 60 seconds, kindly let server know it is stupid
    if (creation < req.requestTime - 60_000) {
        doError(res, 400, "Token Expired")
        return false
    }
    return true
}

// Contains ips with ports that are allowed tokens
const ipTokens = {
    "144.217.248.78:25565": null, // [token, creation]
    "54.39.221.94:25569": null,
    "51.222.102.72:25571": null
}

// Map for rate limiting, very big for a reason
const ipRateMap = new LimitedMap(1000)

// Mutex for manipulating the above objects
const ipTokensMutex = new Mutex()

// router setup
const api = express.Router()

function jsonb(obj) {
    // I'm honestly kinda amazed that "this" works in functions... javascript is cool
    let app = this.app
    let body = JSONB.stringify(obj, app.get('json replacer'), app.get('json spaces'))

    if (app.get('json escape')) {
        body = body.replace(/[<>&]/g, function (c) {
            switch (c.charCodeAt(0)) {
              case 0x3c:
                return '\\u003c'
              case 0x3e:
                return '\\u003e'
              case 0x26:
                return '\\u0026'
              default:
                return c
            }
        })
    }

    this.set('Content-Type', 'application/json')
    this.send(body)
}

// We use our own JSON parsing because we need to handle BIG numbers
api.use(express.text(
    {
        limit: "10kb", // heck outta here with that big json
        type: "application/json"
    }), (req, res, next) => {

        // Do the parse thing
        req.body = JSONB.parse(req.body)

        // Also, change the res.json() to use JSONB.stringify()
        res.json = jsonb

        next()

    }, (err, req, res, next) => {
        // Catch JSON parsing errors here
        if (err.name == 'SyntaxError') {
            doError(res, 400, `Payload syntax error: ${err.message}`)
        } else {
            doError(res, 500, "Unexpected error while parsing payload, check your data")
        }
    }, (req, res, next) => {
        // we ONLY take objects...
        // if no payload, the result of req.body is an empty object
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
            doError(res, 400, "API only accepts object payloads")
        else
            next()
    }
)

// Store remote address with attached port to req, and rate limit
api.use((req, res, next) => {

    /* Rate limit here. Our ips are exempt
     * New IPs are given 50 requests to use every 100 seconds.
     * If the age of an entry is old enough, the value is reset back to 50 prior to the request.
     *
     * TODO: in the future, requests made with public tokens should be granted higher limits
     */
    if (!Object.hasOwn(ipTokens, req.remoteExpanded)) {
        let release = ipTokensMutex.acquire()
        try {
            // IP only, no port!!
            if (ipRateMap.has(ip)) {
                let [next, remaining] = ipRateMap.get(ip)
                if (req.requestTime > next) {
                    ipRateMap.set(ip, [req.requestTime + 100_000, 49])
                } else if (remaining > 0) {
                    ipRateMap.set(ip, [next, remaining - 1])
                } else {
                    return doError(res, 429, "You have exceeded the allowed requests, please wait")
                }
            } else {
                ipRateMap.set(ip, [req.requestTime + 100_000, 49])
            }
        } finally {
            release()
        }
    }

    next()

})

/* 8888888b.  888     888 888888b.   888      8888888 .d8888b.
/* 888   Y88b 888     888 888  "88b  888        888  d88P  Y88b
/* 888    888 888     888 888  .88P  888        888  888    888
/* 888   d88P 888     888 8888888K.  888        888  888
/* 8888888P"  888     888 888  "Y88b 888        888  888
/* 888        888     888 888    888 888        888  888    888
/* 888        Y88b. .d88P 888   d88P 888        888  Y88b  d88P
/* 888         "Y88888P"  8888888P"  88888888 8888888 "Y8888P"
/*
/* Public facing API endpoints */

// Ping/ version
api.all('/', (req, res) => {
    if (req.body == "ping") {
        res.json("pong!")
    } else {
        // store to temp variable... makes me feel better than putting a "process.env" into a result
        let version = process.env.npm_package_version
        res.json({version})
    }
})

// Returns cached count of all documents in player details collection, cached on first call of the day
api.get('/playerCount', (req, res) => {
    res.json(database.playerCountCache())
})

// List players that match the given name
api.get('/playersFromName/:name', (req, res) => {
    res.json(database.playerByName(req.params.name))
})

// Get player from given UUID
api.get('/playerFromUUID/:uuid', (req, res) => {
    res.json(database.playerByUUID(req.params.uuid))
})

// List of UUIDs ignored by given UUID
api.get('/player/ignoreList/:uuid', (req, res) => {
    res.json(database.playerIgnoreGet(req.params.uuid))
})


// System works by servers sending a special exchange token, requesting a new temp token.
// If the IP and exchange token look good, a new API temp token is generated and returned.
// Subsequent requests must wait at least 30 seconds to get a new API token.
// Subsequent requests must pass the old API token, rather than the exchange token.
// The exchange token must be used if the previous API token is older than 60 seconds.
/**
 * Token access point
 *
 * Exchange for new token
 * {
 *     exchange: String
 * }
 *
 * Generate new token
 * {
 *     refresh: String
 * }
 */
api.post('/token', (req, res) => {

    // Must be whitelisted IP:PORT
    if (!Object.hasOwn(ipTokens, req.remoteExpanded))
        return doError(res, 401)

    let {exchange, refresh} = req.body

    // At least one is required, but not both, and it must be string
    if ((!exchange && !refresh) || (exchange && refresh) || (typeof exchange != 'string' && typeof refresh != 'string'))
        return doError(res, 401)

    let release = ipTokensMutex.acquire()
    try {
        let tokenObj = ipTokens[req.remoteExpanded]

        // Exchange
        if (exchange) {
            // Exchange only if null, or older than 60 seconds
            if (tokenObj == null || tokenObj[1] <= req.requestTime - 60_000) {
                // Compare exchange token
                if (typeof process.env.API_TOKEN_SECRET != 'string' || process.env.API_TOKEN_SECRET !== exchange) {
                    console.error(`Warning! Invalid exchange token from [ ${req.remoteExpanded} ] !!`)
                    return doError(res, 401)
                }
            }
            // Deny if exchange provided when request should be used
            else {
                console.error(`Warning! Unexpected EXCHANGE request from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401)
            }
        }
        // Refresh token
        else if (refresh) {
            let [previous, creation] = tokenObj

            // Compare refresh token FIRST, gives less info away
            if (typeof previous != 'string' || previous !== refresh) {
                console.error(`Warning! Invalid refresh token from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401)
            }

            // Ensure we haven't made this request too soon
            if (req.requestTime < creation + 30_000) {
                // clear key, stops future api calls
                ipTokens[req.remoteExpanded] = [null, creation]
                console.error(`Warning! Too many token requests recieved from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 429)
            }

            // Ensure refresh is still good, or if an exchange was required
            if (req.requestTime > creation + 60_000) {
                // clear key, despite not really being necessary
            }

        } else {
            console.error(`Warning! Invalid or missing request from [ ${req.remoteExpanded} ] !! How??`)
            return doError(res, 401)
        }

        // All good now, generate
        let token = crypto.randomBytes(64).toString('hex')
        ipTokens[req.remoteExpanded] = [token, req.requestTime]
        res.json({token, refresh: req.requestTime + 60_000})
    } finally {
        release()
    }

})

/* 8888888b.  8888888b.  8888888 888     888     d8888 88888888888 8888888888
/* 888   Y88b 888   Y88b   888   888     888    d88888     888     888
/* 888    888 888    888   888   888     888   d88P888     888     888
/* 888   d88P 888   d88P   888   Y88b   d88P  d88P 888     888     8888888
/* 8888888P"  8888888P"    888    Y88b d88P  d88P  888     888     888
/* 888        888 T88b     888     Y88o88P  d88P   888     888     888
/* 888        888  T88b    888      Y888P  d8888888888     888     888
/* 888        888   T88b 8888888     Y8P  d88P     888     888     8888888888
/*
/* Private API endpoints, requiring valid token */

/**
 * Counts all documents in player details collection
 *
 * {
 *     token: String
 * }
 */
api.post('/playerCount', (req, res) => {
    let {token} = req.body
    if (!validatePublicToken(req, res, token))
        return;

    res.json(database.playerCount())
})

/**
 * Retrieve player stats by key(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     token: String
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 * }
 */
api.post('/player/getStats', (req, res) => {
    let {token, uuid, get} = req.body
    if (!validatePublicToken(req, res, token))
        return;

    res.json(database.playerStatsGet(uuid, get))
})


/* 8888888 888b    888 88888888888 8888888888 8888888b.  888b    888        d8888 888
/*   888   8888b   888     888     888        888   Y88b 8888b   888       d88888 888
/*   888   88888b  888     888     888        888    888 88888b  888      d88P888 888
/*   888   888Y88b 888     888     8888888    888   d88P 888Y88b 888     d88P 888 888
/*   888   888 Y88b888     888     888        8888888P"  888 Y88b888    d88P  888 888
/*   888   888  Y88888     888     888        888 T88b   888  Y88888   d88P   888 888
/*   888   888   Y8888     888     888        888  T88b  888   Y8888  d8888888888 888
/* 8888888 888    Y888     888     8888888888 888   T88b 888    Y888 d88P     888 88888888
/*
/* Internal API endpoints, requiring valid IP and token */

/**
 * Save chat message
 *
 * {
 *     token: String
 *     chat: {
 *         time: Number?
 *         uuid: String
 *         original: String
 *         formatted: String
 *         type: String
 *         server: String
 *         receivers: String?, String[]?
 *         sent: Boolean?
 *     }
 * }
 */
api.post('/chat', (req, res) => {
    let {token, chat} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.chatSave(chat))
})

/**
 * Get chats
 *
 * {
 *     token: String
 *     uuid: String
 *     since: Number
 *     offset: Number?
 * }
 */
api.post('/chat/get', (req, res) => {
    let {token, uuid, since, offset} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.chatGet(uuid, since, offset))
})

/**
 * Send message to discord webhook
 *
 * {
 *     token: String
 *     type: String
 *     message: String
 *     name: String?
 *     avatar: String?
 * }
 */
api.post('/discord/webhook', (req, res) => {
    let {token, type, name, avatar, message} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(discord.webhookSend(type, name, avatar, message))
})

/**
 * Log to database
 *
 * {
 *     token: String
 *     message: String
 * }
 */
api.post('/log', (req, res) => {
    let {token, message} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.logSave(message))
})

/**
 * Save mail
 *
 * {
 *     token: String
 *     to: String
 *     from: String
 *     origin: String
 *     message: String
 * }
 */
api.post('/mail', (req, res) => {
    let {token, to, from, origin, message} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailSave(to, from, origin, message))
})

/**
 * Mark mail as deleted
 *
 * {
 *     token: String
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/delete', (req, res) => {
    let {token, uuid, id} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailDelete(uuid, id))
})

/**
 * Get mail by 'from' value
 *
 * {
 *     token: String
 *     uuid: String
 *     offset: Number?
 * }
 */
api.post('/mail/from', (req, res) => {
    let {token, uuid, offset} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailGet('from', uuid, offset))
})

/**
 * Mark mail as read
 *
 * {
 *     token: String
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/read', (req, res) => {
    let {token, uuid, id} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailRead(uuid, id))
})

/**
 * Get mail by 'to' value
 *
 * {
 *     token: String
 *     uuid: String
 *     offset: Number?
 * }
 */
api.post('/mail/to', (req, res) => {
    let {token, uuid, offset} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailGet('to', uuid, offset))
})

/**
 * Mark mail as NOT read
 *
 * {
 *     token: String
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/unread', (req, res) => {
    let {token, uuid, id} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.mailRead(uuid, id, false))
})

/**
 * Mute or unmute a player
 *
 * {
 *     token: String
 *     uuid: String
 *     time: null, Number
 * }
 *
 */
api.post('/moderation/mute', (req, res) => {
    let {token, uuid, time} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.moderationMute(uuid, time))
})

/**
 * Set player connection
 *
 * {
 *     token: String
 *     uuid: String
 *     type: String
 *     pair: "content", "hash", "token"
 *     value: String, null
 *     expire: Number
 * }
 */
api.post('/player/connection', (req, res) => {
    let {token, uuid, type, pair, value, expire} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerConnectionSet(uuid, type, pair, value, expire))
})

/**
 * Find player by connection
 *
 * {
 *     token: String
 *     type: String
 *     content: String
 * }
 */
api.post('/player/connection/find', (req, res) => {
    let {token, type, content} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerConnectionFind(type, content))
})

/**
 * Get player connection
 *
 * {
 *     token: String
 *     uuid: String
 *     type: String
 *     pair: "content", "hash", "token"
 * }
 */
api.post('/player/connection/get', (req, res) => {
    let {token, uuid, type, pair} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerConnectionGet(uuid, type, pair))
})

/**
 * Set player persistent data
 *
 * {
 *     token: String
 *     uuid: String
 *     key: String
 *     value: String?, Number?
 * }
 */
api.post('/player/data', (req, res) => {
    let {token, uuid, key, value} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerDataSet(uuid, key, value))
})

/**
 * Get player persistent data
 *
 * {
 *     token: String
 *     uuid: String
 *     key: String
 * }
 */
api.post('/player/data/get', (req, res) => {
    let {token, uuid, key} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerDataGet(uuid, key))
})

/**
 * Add or remove an ignore for a player
 *
 * {
 *     token: String
 *     uuid: String
 *     other: String
 *     ignore: true
 * }
 *
 */
api.post('/player/ignore', (req, res) => {
    let {token, uuid, other, ignore} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerIgnoreSet(uuid, other, ignore))
})

/**
 * Login player
 *
 * {
 *     token: String
 *     uuid: String
 *     name: String
 * }
 */
api.post('/player/login', (req, res) => {
    let {token, uuid, name} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerLogin(uuid, name))
})

/**
 * Logout player
 *
 * {
 *     token: String
 *     uuid: String
 * }
 */
api.post('/player/logout', (req, res) => {
    let {token, uuid} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerLogout(uuid))
})

/**
 * Modify a player's stat(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     token: String
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 *     delta: Number
 * }
 */
api.post('/player/stat', (req, res) => {
    let {token, uuid, stat, stats, delta} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerStatsUpdate(uuid, stat ?? stats, delta))

})

/**
 * Get a player's stat(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     token: String
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 * }
 */
api.post('/player/stat/get', (req, res) => {
    let {token, uuid, stat, stats} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerStatsGet(uuid, stat ?? stats))

})

/**
 * Set player name style
 *
 * {
 *     token: String
 *     uuid: String
 *     style: {
 *         bold?: true
 *         underline?: true
 *         mColor?: [null, "r"], "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"
 *         color?: null, "019fab"
 *         colorB?: null, "019fab"
 *     }
 * }
 */
api.post('/player/style', (req, res) => {
    let {token, uuid, style} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerNameStyleSet(uuid, style))
})

/**
 * Modify a player's wallet(s)
 *
 * Both "wallet" and "wallets" are aliases. They are provided for readability,
 * and both accept either a `string` or `string[]`. If both are defined,
 * "wallet" will take priority if it isn't `null`.
 *
 * {
 *     token: String
 *     uuid: String
 *     wallet?: String, String[]
 *     wallets?: String, String[]
 *     delta: Number
 *     allowNegative?: Boolean
 *     failIfPartial?: Boolean
 * }
 */
api.post('/player/wallet', (req, res) => {
    let {token, uuid, wallet, wallets, delta, allowNegative, failIfPartial} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerWalletUpdate(uuid, wallet ?? wallets, delta, allowNegative, failIfPartial))
})

/**
 * Get a player's wallet(s)
 *
 * Both "wallet" and "wallets" are aliases. They are provided for readability,
 * and both accept either a `string` or `string[]`. If both are defined,
 * "wallet" will take priority if it isn't `null`.
 *
 * {
 *     token: String
 *     uuid: String
 *     wallet?: String, String[]
 *     wallets?: String, String[]
 * }
 */
api.post('/player/wallet/get', (req, res) => {
    let {token, uuid, wallet, wallets} = req.body
    if (!validateToken(req, res, token))
        return;

    res.json(database.playerWalletGet(uuid, wallet ?? wallets))
})

/* 8888888888 888b    888 8888888b.
/* 888        8888b   888 888  "Y88b
/* 888        88888b  888 888    888
/* 8888888    888Y88b 888 888    888
/* 888        888 Y88b888 888    888
/* 888        888  Y88888 888    888
/* 888        888   Y8888 888  .d88P
/* 8888888888 888    Y888 8888888P"
/*
/* End of the road */

// No endpoint
api.use((req, res, next) => {
    if (!res.headersSent)
        doError(res, 404, `Endpoint [ ${req.path} ] does not exist`)
    next()
})

// 500 Server Error response
api.use((err, req, res, next) => {
    console.error(err.stack)
    if (!res.headersSet)
        doError(res, 500)
})

module.exports = {
    apiRouter: api
}
