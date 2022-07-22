const { doError, LimitedMap } = require('./palace-util')
const database = require('./database')
const discord = require('./discord')

const express = require('express')
const { Mutex } = require('async-mutex')
const crypto = require('crypto')
// Thank you so much H4O, i hate when people use unnecessary dependencies (and fix proto pollution in silly ways)
const JSONB = require('when-json-met-bigint').JSONB({strict: true, protoAction: 'ignore', constructorAction: 'ignore'})

function validatePublicToken(req, res) {
    // TODO: write this in the future to enable outsiders to access "private" endpoints
    return validateToken(req, res)
}

function validateToken(req, res) {
    if (!Object.hasOwn(ipTokens, req.remoteAddress)) {
        doError(res, 401)
        return false
    }
    let [expected, creation] = ipTokens[req.remoteAddress]
    let token = req.header('x-token')
    // check token FIRST... gives less info away
    if (!expected || typeof expected != 'string' || !token || typeof token != 'string' || expected !== token) {
        doError(res, 401)
        return false
    }
    // Only valid for 60 seconds, kindly let server know it is stupid
    if (creation < req.requestTime - 60_000) {
        doError(res, 401, "Token Expired")
        return false
    }
    return true
}

// Contains ips with ports that are allowed tokens
const ipTokens = {
    "144.217.248.78": null, // [token, creation]
    "54.39.221.94": null,
    "51.222.102.72": null,
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

        // Change the res.json() to use JSONB.stringify()
        res.json = jsonb

        // Do the parse thing if we have a string
        if (typeof req.body == 'string')
            req.body = JSONB.parse(req.body)

        next()

    }, (err, req, res, next) => {
        // Catch JSON parsing errors here
        if (err.name == 'SyntaxError') {
            doError(res, 400, `Payload syntax error: ${err.message}`)
        } else {
            doError(res, 500, "Unexpected error while parsing payload, check your data")
        }
    }, (req, res, next) => {
        // we ONLY take objects... or "ping"
        // if no payload, the result of req.body is an empty object
        if (req.body !== 'ping' && !(!!req.body && req.body.constructor === Object))
            doError(res, 400, "API only accepts object payloads")
        else
            next()
    }
)

// Store remote address with attached port to req, and rate limit
api.use(async (req, res, next) => {

    /* Rate limit here. Our ips are exempt
     * New IPs are given 50 requests to use every 100 seconds.
     * If the age of an entry is old enough, the value is reset back to 50 prior to the request.
     *
     * TODO: in the future, requests made with public tokens should be granted higher limits
     */
    if (!Object.hasOwn(ipTokens, req.remoteAddress)) {
        let release = await ipTokensMutex.acquire()
        try {
            // IP only, no port!!
            if (ipRateMap.has(req.remoteAddress)) {
                let [next, remaining] = ipRateMap.get(req.remoteAddress)
                if (req.requestTime > next) {
                    ipRateMap.set(req.remoteAddress, [req.requestTime + 100_000, 49])
                } else if (remaining > 0) {
                    ipRateMap.set(req.remoteAddress, [next, remaining - 1])
                } else {
                    return doError(res, 429, "You have exceeded the allowed requests, please wait")
                }
            } else {
                ipRateMap.set(req.remoteAddress, [req.requestTime + 100_000, 49])
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
api.get('/playerCount', async (req, res) => {
    if (!!req.header('x-token')) {
        if (!validatePublicToken(req, res))
            return 0;
        res.json(await database.playerCount())
    } else {
        res.json(await database.playerCountCache())
    }
})

// List players that match the given name
api.get('/playersFromName/:name', async (req, res) => {
    res.json(await database.playerByName(req.params.name))
})

// Get player from given UUID
api.get('/playerFromUUID/:uuid', async (req, res) => {
    res.json(await database.playerByUUID(req.params.uuid))
})

// List of UUIDs ignored by given UUID
api.get('/player/ignoreList/:uuid', async (req, res) => {
    res.json(await database.playerIgnoreGet(req.params.uuid))
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
 * X-Exchange-Token: exchange
 *
 * Generate new token
 * X-Refresh-Token: token
 */
api.get('/token', async (req, res) => {

    // Small note: We can theoretically return a mix of 4XX codes, however this would give away information to potential
    // intruders that they've gotten past certain checkpoints, so we cannot do that.
    // Always return "401 Unauthorized" until ip+tokens match up, in which case the response becomes "401 Token Expired"
    // just so the server doesn't freak out.

    // Ensure sufficient exchange token is set
    if (!process.env.API_TOKEN_SECRET || typeof process.env.API_TOKEN_SECRET != 'string' || process.env.API_TOKEN_SECRET.length != 128)
        return doError(res, 401)

    // Must be whitelisted IP:PORT
    if (!Object.hasOwn(ipTokens, req.remoteAddress))
        return doError(res, 401)

    let exchange = req.header('x-exchange-token')
    let refresh = req.header('x-refresh-token')

    // At least one is required, but not both, and it must be string
    if ((!!exchange == !!refresh) || (typeof exchange != 'string' && typeof refresh != 'string'))
        return doError(res, 401)

    let release = await ipTokensMutex.acquire()
    try {
        let tokenObj = ipTokens[req.remoteAddress]

        // Exchange
        if (exchange) {
            // Exchange only if null, or older than 60 seconds
            if (tokenObj == null || tokenObj[1] <= req.requestTime - 60_000) {
                // Compare exchange token
                if (process.env.API_TOKEN_SECRET !== exchange) {
                    req.log(`Warning! Invalid exchange token from [ ${req.remoteExpanded} ] !!`)
                    return doError(res, 401)
                }
            }
            // Deny if exchange provided when request should be used
            else {
                req.log(`Warning! Unexpected EXCHANGE request from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401)
            }
        }
        // Refresh token
        else if (refresh) {
            let [previous, creation] = tokenObj

            // Compare refresh token FIRST, gives less info away
            if (typeof previous != 'string' || previous !== refresh) {
                req.log(`Warning! Invalid refresh token from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401)
            }

            // Ensure we haven't made this request too soon or too late
            if (req.requestTime < creation + 30_000) {
                // clear whole entry, requires exchange to proceed
                ipTokens[req.remoteAddress] = null
                req.log(`Warning! Unexpected REFRESH request from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401)
            }

            // Ensure we haven't made this request too late, but nicely
            if (req.requestTime >= creation + 60_000) {
                req.log(`Warning! Late REFRESH request from [ ${req.remoteExpanded} ] !!`)
                return doError(res, 401, "Token Expired")
            }

        } else {
            req.log(`Warning! Invalid or missing request from [ ${req.remoteExpanded} ] !! How??`)
            return doError(res, 401)
        }

        // All good now, generate
        let token = crypto.randomBytes(64).toString('hex')
        ipTokens[req.remoteAddress] = [token, req.requestTime]
        res.json({token, refresh: req.requestTime + 60_000})
    } finally {
        release()
    }

})

/**
 * Used to clear out the token when server reboots
 */
api.get('/token/clear', async (req, res) => {
    if (!validateToken(req, res))
        return 0;

    ipTokens[req.remoteAddress] = null
    res.json({success: 1})
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
 * Get player activity, currently just the most recent login/ logout time
 *
 * {
 *     uuid: String
 * }
 */
api.get('/player/activity/:uuid', async (req, res) => {
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerActivity(req.params.uuid))
})

/**
 * Retrieve player stats by key(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 * }
 */
api.post('/player/getStats', async (req, res) => {
    let {uuid, stat, stats} = req.body
    if (!validatePublicToken(req, res))
        return 0;

    res.json(await database.playerStatsGet(uuid, stat ?? stats))
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
api.post('/chat', async (req, res) => {
    let {chat} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.chatSave(chat))
})

/**
 * Get chats
 *
 * {
 *     uuid: String
 *     since: Number
 *     offset: Number?
 * }
 */
api.post('/chat/get', async (req, res) => {
    let {uuid, since, offset} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.chatGet(uuid, since, offset))
})

/**
 * Send message to discord webhook
 *
 * {
 *     kind: String
 *     name: String?
 *     avatar: String?
 *     message: String
 * }
 */
api.post('/discord/webhook', async (req, res) => {
    let {kind, name, avatar, message} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await discord.webhookSend(kind, name, avatar, message))
})

/**
 * Log to database
 *
 * {
 *     message: String
 * }
 */
api.post('/log', async (req, res) => {
    let {message} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.logSave(message))
})

/**
 * Save mail
 *
 * {
 *     to: String
 *     from: String
 *     origin: String
 *     message: String
 * }
 */
api.post('/mail', async (req, res) => {
    let {to, from, origin, message} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailSave(to, from, origin, message))
})

/**
 * Mark mail as deleted
 *
 * {
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/delete', async (req, res) => {
    let {uuid, id} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailDelete(uuid, id))
})

/**
 * Get mail by 'from' value
 *
 * {
 *     uuid: String
 *     offset: Number?
 * }
 */
api.post('/mail/from', async (req, res) => {
    let {uuid, offset} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailGet('from', uuid, offset))
})

/**
 * Mark mail as read
 *
 * {
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/read', async (req, res) => {
    let {uuid, id} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailRead(uuid, id))
})

/**
 * Get mail by 'to' value
 *
 * {
 *     uuid: String
 *     offset: Number?
 * }
 */
api.post('/mail/to', async (req, res) => {
    let {uuid, offset} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailGet('to', uuid, offset))
})

/**
 * Mark mail as NOT read
 *
 * {
 *     uuid: String
 *     id: String
 * }
 */
api.post('/mail/unread', async (req, res) => {
    let {uuid, id} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.mailRead(uuid, id, false))
})

/**
 * Mute/ unmute a player, or retrieve mute time.
 *
 * {
 *     uuid: String
 *     time: null, Number, '?'
 * }
 *
 */
api.post('/moderation/mute', async (req, res) => {
    let {uuid, time} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.moderationMute(uuid, time))
})

/**
 * Set player connection
 *
 * {
 *     uuid: String
 *     type: String
 *     pair: "content", "hash", "token"
 *     value: String, null
 *     expire: Number
 * }
 */
api.post('/player/connection', async (req, res) => {
    let {uuid, type, pair, value, expire} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerConnectionSet(uuid, type, pair, value, expire))
})

/**
 * Find player by connection
 *
 * {
 *     type: String
 *     content: String
 * }
 */
api.post('/player/connection/find', async (req, res) => {
    let {type, content} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerConnectionFind(type, content))
})

/**
 * Get player connection
 *
 * {
 *     uuid: String
 *     type: String
 *     pair: "content", "hash", "token"
 * }
 */
api.post('/player/connection/get', async (req, res) => {
    let {uuid, type, pair} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerConnectionGet(uuid, type, pair))
})

/**
 * Set player persistent data
 *
 * {
 *     uuid: String
 *     name: String
 *     value: String?, Number?
 * }
 */
api.post('/player/data', async (req, res) => {
    let {uuid, name, value} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerDataSet(uuid, name, value))
})

/**
 * Get player persistent data
 *
 * {
 *     uuid: String
 *     name: String
 * }
 */
api.post('/player/data/get', async (req, res) => {
    let {uuid, name} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerDataGet(uuid, name))
})

/**
 * Add or remove an ignore for a player
 *
 * {
 *     uuid: String
 *     other: String
 *     ignore: true
 * }
 *
 */
api.post('/player/ignore', async (req, res) => {
    let {uuid, other, ignore} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerIgnoreSet(uuid, other, ignore))
})

/**
 * Login player
 *
 * {
 *     uuid: String
 *     name: String
 * }
 */
api.post('/player/login', async (req, res) => {
    let {uuid, name} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerLogin(uuid, name))
})

/**
 * Logout player
 *
 * {
 *     uuid: String
 * }
 */
api.post('/player/logout', async (req, res) => {
    let {uuid} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerLogout(uuid))
})

/**
 * Modify a player's stat(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 *     delta: Number
 * }
 */
api.post('/player/stat', async (req, res) => {
    let {uuid, stat, stats, delta} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerStatsUpdate(uuid, stat ?? stats, delta))

})

/**
 * Get a player's stat(s)
 *
 * Both "stat" and "stats" are aliases. They are provided for readability, and
 * both accept either a `string` or `string[]`. If both are defined, "stat"
 * will take priority if it isn't `null`.
 *
 * {
 *     uuid: String
 *     stat?: String, String[]
 *     stats?: String, String[]
 * }
 */
api.post('/player/stat/get', async (req, res) => {
    let {uuid, stat, stats} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerStatsGet(uuid, stat ?? stats))

})

/**
 * Set player name style
 *
 * {
 *     uuid: String
 *     style?: {
 *         bold?: true
 *         underline?: true
 *         mColor?: [null, "r"], "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"
 *         color?: null, "019fab"
 *         colorB?: null, "019fab"
 *     }
 * }
 */
api.post('/player/style', async (req, res) => {
    let {uuid, style} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerNameStyleSet(uuid, style))
})

/**
 * Modify a player's wallet(s)
 *
 * Both "wallet" and "wallets" are aliases. They are provided for readability,
 * and both accept either a `string` or `string[]`. If both are defined,
 * "wallet" will take priority if it isn't `null`.
 *
 * {
 *     uuid: String
 *     wallet?: String, String[]
 *     wallets?: String, String[]
 *     delta: Number
 *     allowNegative?: Boolean
 *     failIfPartial?: Boolean
 * }
 */
api.post('/player/wallet', async (req, res) => {
    let {uuid, wallet, wallets, delta, allowNegative, failIfPartial} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerWalletUpdate(uuid, wallet ?? wallets, delta, allowNegative, failIfPartial))
})

/**
 * Get a player's wallet(s)
 *
 * Both "wallet" and "wallets" are aliases. They are provided for readability,
 * and both accept either a `string` or `string[]`. If both are defined,
 * "wallet" will take priority if it isn't `null`.
 *
 * {
 *     uuid: String
 *     wallet?: String, String[]
 *     wallets?: String, String[]
 * }
 */
api.post('/player/wallet/get', async (req, res) => {
    let {uuid, wallet, wallets} = req.body
    if (!validateToken(req, res))
        return 0;

    res.json(await database.playerWalletGet(uuid, wallet ?? wallets))
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
    if (!res.headersSent)
        doError(res, 500)
})

module.exports = {
    apiRouter: api
}
