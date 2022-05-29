const DB_MINECRAFT = 'minecraft'
const COLLECTION_CHAT = 'chat'
const COLLECTION_DETAILS = 'details'
const COLLECTION_LOGS = 'logs'
const COLLECTION_MAIL = 'mail'
const COLLECTION_STATS = 'stats'

const DB_DISCORD = 'discord'
const COLLECTION_SERVERS = 'servers'

// mongodb connection
const { UUID } = require('bson')
const NULL_UUID = new UUID(Buffer.alloc(16, 0)).toBinary()
const NULL_UUID_S = "00000000-0000-0000-0000-000000000000"
const {
    Binary,
    ClientSession,
    Db,
    FindOneAndUpdateOptions,
    Long,
    MongoClient,
    ObjectId,
    ReturnDocument,
    ServerApiVersion,
} = require('mongodb')
const NULL_OBJECTID_S = "000000000000000000000000"
const NULL_OBJECTID = new ObjectId(NULL_OBJECTID_S)
const { flattenObject } = require('./palace-util')

const MINUTE_MILLIS = 1_000 * 60
const DAY_MILLIS = MINUTE_MILLIS * 60 * 24
const WEEK_MILLIS = DAY_MILLIS * 7
const MONTH_MILLIS = DAY_MILLIS * 30

// "Borrowed" from Buffer
const hexSliceLookupTable = (function () {
    let alphabet = '0123456789abcdef'
    let table = new Array(256)
    for (let i = 0; i < 16; ++i) {
        let i16 = i * 16
        for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j]
        }
    }
    return table
})()

/* 88888888888
/*     888
/*     888
/*     888  888  888 88888b.   .d88b.  .d8888b
/*     888  888  888 888 "88b d8P  Y8b 88K
/*     888  888  888 888  888 88888888 "Y8888b.
/*     888  Y88b 888 888 d88P Y8b.          X88
/*     888   "Y88888 88888P"   "Y8888   88888P'
/*               888 888
/*          Y8b d88P 888
/*           "Y88P"  888
/*
/* General jsDoc types, used in multiple locations. TypeDefs which are used only
 * in one place are kept where they are used. If multiple places use a single
 * TypeDef, it will be placed here.
 */

/**
 * Generic success response
 * @typedef {object} SuccessResult
 * @property {1} success
 */

/**
 * Object containing chat message properties
 * @typedef {object} ChatObject
 * @property {number} time - UTC milliseconds when the message was sent
 * @property {string} uuid - string uuid, sender of the message
 * @property {string} message - message
 * @property {string} [server] - server the message was sent from, private
 * and group messages will not return a server name
 * @property {string} [type] - message channel or type, private and group
 * messages will not return a type
 * @property {string[]} [receivers] - array of string uuids, recipients who
 * saw the message, only set on group messages, may be empty
 * @property {string} [to] - only set for private messages, the string uuid
 * of the recipient, not a guarantee that the target actually received the
 * message (they can ignore the sender)
 */

/**
 * Mail object
 * @typedef {object} MailObject
 * @property {string} id - the object id of this mail
 * @property {number} time - UTS milliseconds when mail was sent
 * @property {string} to - string uuid of target
 * @property {string} from - string uuid of sender
 * @property {string} message - message
 * @property {string} origin - server that the sender was on when mail was sent
 * @property {boolean} [read] - if mail is marked read, only set on first read.
 * when specifically set to `false`, it means the target read the mail, then
 * manually set it as unread
 * @property {boolean} [deleted] - if mail is marked deleted, **never returned
 * by the API**. this prevents the mail from being returned in "to" queries,
 * however it will still appear in "from" queries.
 */

/**
 * Name style object. The presence of any of these values may be sufficient to
 * assume they are "truthy" and should be used.
 *
 * `color` takes the highest priority, and will be used over the `mColor` value.
 * In storage, the two are mutually exclusive and only one is retained. If
 * `color` isn't present, `mColor` is used. If `mColor` isn't present, white is
 * the default color.
 *
 * `colorB` is used for gradients, where the name starts at `color` and ends at
 * `colorB`. See this Desmos graph for the gradient function: https://www.desmos.com/calculator/uiolk7zkmk.
 * This value is only stored if `color` is also present.
 *
 * @typedef {object} NameStyle
 * @property {boolean} [bold]
 * @property {boolean} [underline]
 * @property {string} [mColor] - Only set if player uses a Minecraft color code
 * @property {string} [color] - Custom hex color
 * @property {string} [colorB] - Custom hex color 2, if set it means the name
 * is a gradient
 */

/**
 * Player count result object
 * @typedef {object} PlayerCountResult
 * @property {number} time - time that the calculation was made
 * @property {number} count - total unique players who ever joined
 * @property {number} recent - unique players last online recently (24h)
 * @property {number} week - unique players last online within a week (168h)
 * @property {number} month - unique players last online within a month (720h)
 */

/**
 * Player object
 * @typedef {object} PlayerObject
 * @property {string} uuid
 * @property {number} firstLogin - first time this player ever connected
 * @property {string} name
 * @property {NameStyle} nameStyle - style of the player's name, can be empty
 */

/**
 * Player stats result
 * @typedef {object} PlayerStatsResult
 * @property {Object.<string, number>} stats - object containing one or many
 * full-path string keys and associated numerical stat
 */

/* 8888888888                         888    d8b
/* 888                                888    Y8P
/* 888                                888
/* 8888888 888  888 88888b.   .d8888b 888888 888  .d88b.  88888b.  .d8888b
/* 888     888  888 888 "88b d88P"    888    888 d88""88b 888 "88b 88K
/* 888     888  888 888  888 888      888    888 888  888 888  888 "Y8888b.
/* 888     Y88b 888 888  888 Y88b.    Y88b.  888 Y88..88P 888  888      X88
/* 888      "Y88888 888  888  "Y8888P  "Y888 888  "Y88P"  888  888  88888P'
/*
/* Helper functions */

/**
 * Compares a string UUID and a Binary UUID, returning `true` if they are equal.
 *
 * See the tests/uuid_perf_test for the reasoning on this choice of comparison.
 * TL;DR: This is the FaF method.
 *
 * @param {string} string - string UUID, may or may not contain dashes
 * @param {Binary} binary - {@link Binary} UUID from mongodb
 * @returns {boolean} if the string and binary represent the same UUID
 */
function compareUUID(string, binary) {
    let i = 0
    // the buffer of a binary is a glorified Uint8Array
    for (let int of binary.buffer) {
        if (string[i] == '-')
            i++
        if (string.substring(i++, ++i) != hexSliceLookupTable[int])
            return false
    }
    return true
}

/**
 * Error result
 * @typedef {object} ErrorResult
 * @property {1} error
 * @property {string} message
 */
/**
 * Standard error object generator
 *
 * @param {string} message
 * @returns {ErrorResult} {@link ErrorResult}
 */
function error(message) {
    return {error: 1, message}
}

/**
 * Check if `value` is null-ish.
 *
 * Identical to `(value === null || value === undefined)`
 *
 * @param {*} value
 * @returns {boolean} true if value is null-ish
 */
function isNull(value) {
    return (value === null || value === undefined)
}

/**
 * Convert a string uuid into a mongodb binary uuid. If this fails, it returns
 * the NULL uuid, all zero
 *
 * @param {string} uuid - string uuid
 * @returns {Binary} binary uuid for mongodb
 */
function toBinaryUUID(uuid) {
    try {
        return new UUID(uuid).toBinary()
    } catch (e) {
        return NULL_UUID
    }
}

/**
 * Convert a hex string objectId into a mongodb ObjectId. If this fails, it
 * returns the NULL ObjectId, all zero
 *
 * @param {string} objectId - objectId hex string
 * @returns {ObjectId} ObjectId for mongodb
 */
function toObjectId(objectId) {
    try {
        return new ObjectId(objectId)
    } catch (e) {
        return NULL_OBJECTID
    }
}

/**
 * Convert a mongodb `binary` into a string uuid. If this fails, it returns
 * an empty string.
 *
 * @param {Binary} binary - Binary result from mongodb
 * @returns {string} uuid string
 */
function toUUID(binary) {
    try {
        return new Binary(binary.read(0, binary.length()), Binary.SUBTYPE_UUID).toUUID().toHexString()
    } catch (e) {
        return ''
    }
}

/**
 * Check if `integer` is an integer value.
 *
 * Identical to `(typeof integer == 'number' && Math.round(integer) === integer)`
 *
 * If you need to ensure that the number is a safe integer, meaning it can be
 * represented as an integer in JavaScript, use {@link Number.isSafeInteger()}.
 *
 * To further guarantee that values are integers, you should use
 * {@link Math.round()} after these validations. Edge numbers or numbers with
 * floating points beyond the precision capabilities of JavaScript may still
 * pass all validation checks.
 *
 * @param {*} integer
 * @returns {boolean} if `integer` is an integer
 */
function validateInteger(integer) {
    return (typeof integer == 'number' && Math.round(integer) === integer)
}

/**
 * Check if `object` is a literal object, specifically `{}`.
 *
 * Identical to `!!object && object.constructor === Object`
 *
 * From: https://stackoverflow.com/a/16608074/4561008
 *
 * @param {*} object
 * @returns {boolean} if `object` is a literal object
 */
function validateObject(object) {
    return !!object && object.constructor === Object
}

/**
 * Check if `objectId` is a valid ObjectID. Must be a string.
 *
 * @param {string} objectId
 * @returns {boolean} if `objectId` is a valid ObjectId
 */
function validateObjectId(objectId) {
    // "Borrowed" from mongodb
    return !!/^[0-9a-fA-F]{24}$/.exec(
        objectId
    );
}

/**
 * Check if `string` is a non-empty string.
 *
 * Identical to `(string && typeof string == 'string')`
 *
 * @param {*} string
 * @returns {boolean} if `string` is a non-empty string
 */
function validateString(string) {
    return (string && typeof string == 'string')
}

/**
 * Check if `time` is a reasonable time. Must be a number.
 *
 * Identical to `(time > 1569587100000 && time < 1993494600000)`
 *
 * @param {number} time - UTC milliseconds
 * @returns {boolean} if `time` is a reasonable time
 */
function validateTime(time) {
    // Yes, these are magic numbers. Yes, this means the DB may break in the future unless these lines are modified.
    return (time > 1569587100000 && time < 1993494600000)
}

/**
 * Check if `uuid` is a valid uuid, dashes required. Must be a string.
 *
 * @param {string} uuid - string uuid
 * @returns true if valid
 */
function validateUUID(uuid) {
    // "Borrowed" from uuid-mongodb
    return !!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.exec(
        uuid
    );
}

/* 8888888b.           888             888
/* 888  "Y88b          888             888
/* 888    888          888             888
/* 888    888  8888b.  888888  8888b.  88888b.   8888b.  .d8888b   .d88b.
/* 888    888     "88b 888        "88b 888 "88b     "88b 88K      d8P  Y8b
/* 888    888 .d888888 888    .d888888 888  888 .d888888 "Y8888b. 88888888
/* 888  .d88P 888  888 Y88b.  888  888 888 d88P 888  888      X88 Y8b.
/* 8888888P"  "Y888888  "Y888 "Y888888 88888P"  "Y888888  88888P'  "Y8888
/*
/* Beginning of the Database class object */

/**
 * Important: ALL methods should be marked async. This enables us to work asynchronously if we want, or synchronously otherwise.
 * Because of the way mongodb is written, marking the methods async also makes writing the code simpler. So do it.
 *
 * Also, please keep the methods ordered alphabetically.
 *
 * Player data in the database is ONLY guaranteed to have these following properties set:
 *  - uuid
 *  - firstLogin
 *  - name
 *  - nameStyle
 *
 * NameStyle is only guaranteed to be an object, and may be an empty object.
 */
class Database {

    #client;
    #_minecraft;
    #_discord;

    #_playerBasicProjection = {uuid: 1, firstLogin: 1, name: 1, nameStyle: 1, _id: 0}

    /**
     * Player count cache.
     *
     * Reasoning behind using a "live" and "daily" result:
     * The live is useful for tracking "right now" values, useful for the ones
     * who like to get the latest data. The daily is useful for historical
     * tracking, as it effectively synchronizes player counts to the exact date
     * and provide comparable data.
     */
     #_playerCountCache = {
        /** @type {number} */
        daily_time: undefined,
        /** @type {PlayerCountResult} */
        daily: undefined,

        /** @type {number} */
        live_time: undefined,
        /** @type {PlayerCountResult} */
        live: undefined
    }

    /** Whitelist of stats that are allowed to be retrieved or set, with permitted range values for modification */
    #_stats = {
        // playtime is updated each second, give extra range for lag
        "playtime.all": [1, 2_000],
        "playtime.session": [1, 2_000],
        "playtime.creative": [1, 2_000],
        "playtime.survival": [1, 2_000],
        "survival.beta.kills": [-1, 1],
        "general.messages": [0, 1],
    }

    /** Wallets that players have, with permitted range values for modification */
    #_wallet = {
        "primary": [-100, 100],
        "creative": [-100, 100],
        "survival": [-100, 100],
    }

    constructor() {
        this.#client = new MongoClient("mongodb+srv://" + process.env.DB_USER + ":" + process.env.DB_PASS + "@master-waua9.mongodb.net/?retryWrites=true",
            {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true
                }
            }
        )

        // Put off connecting to the database until it is needed. #minecraft and #discord make the connection when first called

        // I believe this event is only called when a connection is first opened...
        // The reason I say "I believe" is because they barely explain events... fuckers
        this.#client.on('open', () => {
            console.log("Database connection opened")
        })

        this.#client.on('close', () => {
            console.log("Database connection closed")
        })
    }

    shutdown() {
        this.#client.close()
    }

    /**
     * @returns {Promise<Db>} minecraft database
     */
    get #minecraft () {
        if (!this.#_minecraft) {
            return (async () => {
                await this.#client.connect()
                this.#_minecraft = this.#client.db(DB_MINECRAFT)
                return this.#_minecraft
            })()
        }
        return (async() => { return this.#_minecraft })()
    }

    /**
     * @returns {Promise<Db>} discord database
     */
    get #discord () {
        if (!this.#_discord) {
            return (async() => {
                await this.#client.connect()
                this.#_discord = this.#client.db(DB_DISCORD)
                return this.#_discord
            })()
        }
        return (async() => { return this.#_discord })()
    }

    /**
     * @returns {Promise<ClientSession>} new client session
     */
    get #session () {
        return (async() => {
            await this.#client.connect()
            return this.#client.startSession()
        })()
    }

    /**
     * Internal use only. Get player document from DB. Has no error handling.
     *
     * @param {Binary} binary - Binary UUID of player
     * @param {object} projection - data to return in results, default to minimal player details:
     * `uuid`, `firstLogin`, `name`, `nameStyle`
     */
    async #getPlayer(binary, projection=undefined) {
        if (isNull(projection))
            projection = this.#_playerBasicProjection

        projection._id = 0 // never return the _id

        return await(await this.#minecraft).collection(COLLECTION_DETAILS).findOne({uuid: binary}, {projection})
    }

    /* 888b     d888          888    888                    888
    /* 8888b   d8888          888    888                    888
    /* 88888b.d88888          888    888                    888
    /* 888Y88888P888  .d88b.  888888 88888b.   .d88b.   .d88888 .d8888b
    /* 888 Y888P 888 d8P  Y8b 888    888 "88b d88""88b d88" 888 88K
    /* 888  Y8P  888 88888888 888    888  888 888  888 888  888 "Y8888b.
    /* 888   "   888 Y8b.     Y88b.  888  888 Y88..88P Y88b 888      X88
    /* 888       888  "Y8888   "Y888 888  888  "Y88P"   "Y88888  88888P'
    /*
    /* Generic database methods that do not belong to other groups */

    /**
     * List of chat messages result, ordered from newest to oldest
     * @typedef {object} ChatListResult
     * @property {number} count - number of chat messages in this result
     * @property {ChatObject[]} chats - array of {@link ChatObject}
     */
    /**
     * Retrieve chat messages sent by a given player.
     *
     * Unlike other methods involving player data, this will not tell you if a
     * player exists or not. Non-existent players will simply return the normal
     * result with a `count` of zero and an empty `chats` array.
     *
     * @param {string} uuid - string uuid
     * @param {number?} since - UTC milliseconds of earliest message, all messages sent before this time
     * @param {number?} offset - offset messages for pagination
     * @param {string?} type - message type to retrieve, falsy values return all types. values starting with `!` are
     * treated like "![type]" queries, and results will be all message that are not the given type
     * @returns {Promise<ChatListResult>} {@link ChatListResult}
     */
    async chatGet(uuid, since=Date.now(), offset=0, type=null) {
        if (isNull(since))
            since = Date.now()
        else if (!validateInteger(since))
            return error("Key 'since' must be an integer or unset")
        else if (!validateTime(since))
            return error("Key 'since' is not a reasonable time, must be in milliseconds")
        else
            since = Math.round(since)

        if (isNull(offset))
            offset = 0
        else if (!validateInteger(offset))
            return error("Key 'offset' must be an integer or unset")
        else if (offset < 0 || offset > 100)
            return error("Key 'offset' must be between 0-100")
        else
            offset = Math.round(offset)

        if (isNull(type) || !validateString(type))
            type = null // ensure null

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        let query = {
            uuid: binary,
            time: { $lte: since },
            sent: true
        }

        if (type != null) {
            if (type.charAt(0) == '!')
                query.type = { $ne: type.substring(1) }
            else
                query.type = type
        }

        let result = {
            count: 0,
            chats: []
        }

        await(await this.#minecraft).collection(COLLECTION_CHAT).find(
            query,
            {
                sort: [["time", -1]],
                skip: offset,
                limit: 20,
                projection: {
                    _id: 0,
                    time: 1,
                    uuid: 1,
                    formatted: 1,
                    server: 1,
                    type: 1,
                    receivers: 1,
                    to: 1
                }
            }
        ).forEach(doc => {
            let c = {
                time: doc.time,
                uuid: toUUID(doc.uuid),
                message: doc.formatted
            }
            if (doc.type == 'pm') {
                // exclude "type" and "server" from private messages
                if (doc.receivers) { // Backwards compatibility, delete later
                    c.to = toUUID(doc.receivers[0])
                } else {
                    c.to = toUUID(doc.to)
                }
                // In the future, "receivers" will be set for group messaging.
                // PMs will use the key "to"
            } else if (!doc.type.startsWith('group')) {
                // these are only included for non-private or group messages
                c.server = doc.server
                c.type = doc.type
            }

            // if receivers is set, and newer than MAGIC NUMBER (time i reworked the formatting), always load it.
            // Delete MAGIC NUMBER when old messages bite the dust.
            if (doc.receivers && doc.time > 1653172810813) {
                let receivers = []
                for (let other of doc.receivers) {
                    receivers.push(toUUID(other))
                }
                c.receivers = receivers
            }

            result.chats.push(c)
            result.count++
        })

        return result

    }

    /**
     * Save chat message record
     *
     * @param {object} chat - properties for this chat message
     * @param {number?} [chat.time] - UTC milliseconds when message was sent, only available for accurate time keeping,
     * times which are too far from the real time are cropped to the nearest 1 second of the real time. Default is the
     * current time.
     * @param {string} chat.uuid - string uuid
     * @param {string} chat.original - original message
     * @param {string} chat.formatted - formatted message, this is what was visible to players
     * @param {string} chat.type - message type or channel
     * @param {string} chat.server - original server of the message
     * @param {(string|string[])?} [chat.receivers] - receivers of the message, leave undefined if this was a "global"
     * message, which means it was sent to nobody in particular. for a `type` of "pm", this is expected to be a string,
     * for a `type` beginning with "group", this is expected to be an array. only populate with UUIDs who certainly
     * received the message, if no intended recipients saw it then use an empty array.
     * @param {boolean|true} [chat.sent] - whether the message was sent or if it was blocked, regardless if anyone
     * actually viewed the message. use `false` only to signal that the message was rejected, but still should be saved
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async chatSave(chat) {

        if (!validateObject(chat))
            return error("Key 'chat' must be an object")

        let time = chat.time ?? Date.now(),
            uuid = chat.uuid,
            original = chat.original,
            formatted = chat.formatted,
            type = chat.type,
            server = chat.server,
            receivers = chat.receivers ?? null,
            sent = chat.sent ?? true

        if (isNull(sent))
            sent = true
        else
            sent = !!sent

        if (isNull(time))
            time = Date.now()
        else if (!validateInteger(time))
            return error("Key 'time' must be an integer or unset")
        else {
            let now = Date.now()
            time = Math.max(now - 1000, Math.min(time, now + 1000)) // 1 second window of variation
        }

        if (isNull(original))
            return error("String 'original' is required")
        if (!validateString(original))
            return error("Key 'original' must be a non-empty string")

        if (isNull(formatted))
            return error("String 'formatted' is required")
        if (!validateString(formatted))
            return error("Key 'formatted' must be a non-empty string")

        if (isNull(type))
            return error("String 'type' is required")
        if (!validateString(type))
            return error("Key 'type' must be a non-empty string")

        if (isNull(server))
            return error("String 'server' is required")
        if (!validateString(server))
            return error("Key 'server' must be a non-empty string")

        if (isNull(receivers)) {
            if (type == 'pm')
                return error("Key 'receivers' is required for 'type' = 'pm', must be a non-empty string")
            else if (type.startsWith('group'))
                return error("Key 'receivers' is required for 'type' = 'group', must be a string array")
            // ensure null
            receivers = null
        } else if (Array.isArray(receivers)) {
            if (type == 'pm') // we should be a string
                return error("Key 'receivers' is expected to be a string for 'type' = 'pm'")

            // convert to binaries
            let binaries = []
            for (let r of receivers) {
                if (!validateString(r) || !validateUUID(r))
                    return error("Array 'receivers' contains an invalid UUID string, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
                let binary = toBinaryUUID(r)
                if (binary.value() == NULL_UUID.value())
                    return error("Array 'receivers' failed to parse a UUID string, it is invalid")
                binaries.push(binary)
            }
            receivers = binaries
        } else if (type.startsWith('group')) // we should be an array
            return error("Key 'receivers' is expected to be a string array for 'type' = 'group'")
        else if (!validateString(receivers))
            return error("Key 'receivers' must be a non-empty string, string array, or unset")
        else if (!validateUUID(receivers))
            return error("Key 'receivers' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
        else {
            let binary = toBinaryUUID(receivers)
            if (binary.value() == NULL_UUID.value())
                return error("Key 'receivers' could not be parsed, it is invalid")
            receivers = binary
        }

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        if (original.length > 303)
            original = original.substring(0, 300) + "..."
        if (formatted.length > 303)
            formatted = formatted.substring(0, 300) + "..."

        /** @type {ChatObject} */
        chat = {
            time,
            uuid: binary,
            message: original,
            formatted,
            server,
            type
        }

        if (receivers != null) {
            if (Array.isArray(receivers))
                chat.receivers = receivers
            else if (type == 'pm')
                chat.to = receivers // Only set "to" for private messages
            else // single receivers that are not "pm" become arrays
                chat.receivers = [receivers]
        }

        // Only store when false
        if (!sent) chat.sent = false

        if ((await(await this.#minecraft).collection(COLLECTION_CHAT).insertOne(chat)).acknowledged) {
            return {success: 1}
        }

        return error("Failed to save chat, try again")
    }

    /**
     * Save a log to the database. The plain message is saved on it's own, so it
     * is up to you to format them properly for future lookup.
     *
     * @param {string} message - message
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async logSave(message) {
        if (isNull(message))
            return error("String 'message' is required")
        if (!validateString(message))
            return error("Key 'message' must be a non-empty string")

        if (message.length > 1003) // permit big logs, but have some limit
            message = message.substring(0, 1000) + "..."

        if ((await(await this.#minecraft).collection(COLLECTION_LOGS).insertOne({
            time: Date.now(),
            message
        })).acknowledged) {
            return {success: 1}
        }

        return error("Failed to save log, try again")
    }

    /* 888b     d888          d8b 888
     * 8888b   d8888          Y8P 888
     * 88888b.d88888              888
     * 888Y88888P888  8888b.  888 888
     * 888 Y888P 888     "88b 888 888
     * 888  Y8P  888 .d888888 888 888
     * 888   "   888 888  888 888 888
     * 888       888 "Y888888 888 888
     *
     * Mail methods */

    /**
     * Mark a mail record as deleted, this hastens the purge times
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of "to"
     * @param {string} id - the object id of the mail
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
     async mailDelete(uuid, id) {


        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")


        return {success: 1}
    }

    /**
     * List of mail
     * @typedef {object} MailGetResult
     * @property {number} total - total mail in this box (to/ from)
     * @property {number} [unread] - for "to" box only, number of unread mail
     * @property {}
     */
    /**
     * Get inbox/ outbox of a given player, five at a time, optionally offset
     *
     * @todo implement
     *
     * @param {"to"|"from"} key - which term to search mail by
     * @param {string} uuid - string uuid of target
     * @param {number|0} offset - offset search for pagination
     * @returns {Promise<MailGetResult>} {@link MailGetResult}
     */
    async mailGet(key, uuid, offset=0) {
        return {}
    }

    /**
     * Mark a mail record as read, or unread
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of "to"
     * @param {string} id - the object id of the mail
     * @param {boolean|true} read - mark mail as read, or optionally unread to enable periodic notification
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async mailRead(uuid, id, read=true) {
        return {success: 1}
    }

    /**
     * Save a mail record, functionally required for the receiver to get mail
     *
     * @param {string} to - string uuid of target
     * @param {string} from - string uuid of sender
     * @param {string} origin - server mail was sent from
     * @param {string} message - message content
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async mailSave(to, from, origin, message) {
        if (isNull(origin))
            return error("String 'origin' is required")
        if (!validateString(origin))
            return error("Key 'origin' must be a non-empty string")

        if (isNull(message))
            return error("String 'message' is required")
        if (!validateString(message))
            return error("Key 'message' must be a non-empty string")

        if (isNull(to))
            return error("String 'to' is required")
        if (!validateString(to))
            return error("Key 'to' must be a non-empty string")
        if (!validateUUID(to))
            return error("Key 'to' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        if (isNull(from))
            return error("String 'from' is required")
        if (!validateString(from))
            return error("Key 'from' must be a non-empty string")
        if (!validateUUID(from))
            return error("Key 'from' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let to_binary = toBinaryUUID(to)
        if (to_binary.value() == NULL_UUID.value())
            return error("Key 'to' could not be parsed, it is invalid")

        let from_binary = toBinaryUUID(from)
        if (from_binary.value() == NULL_UUID.value())
            return error("Key 'from' could not be parsed, it is invalid")

        if (message.length > 200)
            message = message.substring(0, 200) // hard cut message, command should reject messages over 200 characters

        if ((await(await this.#minecraft).collection(COLLECTION_MAIL).insertOne({
            time: Date.now(),
            to: to_binary,
            from: from_binary,
            message,
            origin
        })).acknowledged) {
            return {success: 1}
        }

        return error("Failed to save mail, try again")
    }

    /* 888b     d888               888                          888    d8b
    /* 8888b   d8888               888                          888    Y8P
    /* 88888b.d88888               888                          888
    /* 888Y88888P888  .d88b.   .d88888  .d88b.  888d888 8888b.  888888 888  .d88b.  88888b.
    /* 888 Y888P 888 d88""88b d88" 888 d8P  Y8b 888P"      "88b 888    888 d88""88b 888 "88b
    /* 888  Y8P  888 888  888 888  888 88888888 888    .d888888 888    888 888  888 888  888
    /* 888   "   888 Y88..88P Y88b 888 Y8b.     888    888  888 Y88b.  888 Y88..88P 888  888
    /* 888       888  "Y88P"   "Y88888  "Y8888  888    "Y888888  "Y888 888  "Y88P"  888  888
    /*
    /* Moderation methods */

    /**
     * Mute or unmute a player. This is purely for informational purposes, and will not do anything on its own. When a
     * mute expires, it is up to you to unset the mute time, which you should do.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {number|null} time - UTC milliseconds of the expiration for the mute, leave undefined to unmute
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async moderationMute(uuid, time=undefined) {
        return {success: 1}
    }

    /* 8888888b.  888
    /* 888   Y88b 888
    /* 888    888 888
    /* 888   d88P 888  8888b.  888  888  .d88b.  888d888
    /* 8888888P"  888     "88b 888  888 d8P  Y8b 888P"
    /* 888        888 .d888888 888  888 88888888 888
    /* 888        888 888  888 Y88b 888 Y8b.     888
    /* 888        888 "Y888888  "Y88888  "Y8888  888
    /*                              888
    /*                         Y8b d88P
    /*                          "Y88P"
    /* Player methods */

    /**
     * Object containing array of players
     * @typedef {object} PlayerArrayResult
     * @property {number} count - number of players matching this name
     * @property {PlayerObject[]} players - array of matching players
     */
    /**
     * Returns a list of {@link PlayerObject} that match the given name. An
     * array is returned because it is possible that two accounts could share
     * the same name, if an older account hasn't been on after changing their
     * name.
     *
     * @param {string} name player name to lookup
     * @returns {Promise<PlayerArrayResult>} {@link PlayerArrayResult}
     */
    async playerByName(name) {
        if (isNull(name))
            return error("String 'name' is required")
        if (!validateString(name))
            return error("Key 'name' must be a non-empty string")

        let players = []
        await(await this.#minecraft).collection(COLLECTION_DETAILS).find(
            {name: name},
            {projection: this.#_playerBasicProjection}
        ).forEach(doc => {
            players.push({
                uuid: toUUID(doc.uuid),
                name: doc.name,
                nameStyle: doc.nameStyle,
                firstLogin: doc.firstLogin
            })
        })

        return {
            count: players.length,
            players
        }
    }

    /**
     * Find player from a given string uuid.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid to lookup
     * @returns {Promise<PlayerObject>} {@link PlayerObject}
     */
     async playerByUUID(uuid) {
        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let doc = this.#getPlayer(binary)
        if (isNull(doc))
            return {}

        return {
            uuid: toUUID(doc.uuid),
            firstLogin: doc.firstLogin,
            name: doc.name,
            nameStyle: doc.nameStyle
        }
    }

    /**
     * Find a player given a connection type and content, only returns if the
     * connection is presently valid and not expired.
     *
     * If no player is found, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {string} content - content of connection, such as an ID or username
     */
    async playerConnectionFind(type, content) {

    }

    /**
     * Get a specific connection from a player. The value of each pair is always
     * a string, with an expiration time. If multiple `content` or `token`
     * values exist, they will be a comma-delimited string. It is up to you to
     * store and process these values appropriately.
     *
     * `content` is for IDs or usernames, or otherwise unique identifiers
     *
     * `hash` is for authorization flow during the initial connection process
     *
     * `token` is for unique tokens associated with the connection, such as an API token to retrieve data from the
     * connection, or a refresh token.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {"content"|"hash"|"token"} pair - the specific connection pair to retrieve, default: `content`
     */
    async playerConnectionGet(uuid, type, pair="content") {

    }

    /**
     * Set a connection pair for a player. The value of a pair is always a
     * string, with an expiration time. If multiple values need to be set, they
     * must be a comma-delimited string. It is up to you to store and process
     * these values appropriately.
     *
     * `content` is for IDs or usernames, or otherwise unique identifiers
     *
     * `hash` is for authorization flow during the initial connection process. When this is the case, `value == null`
     * will remove the existing hash. **Any other `value` is ignored and a new, secure hash is generated.**
     *
     * `token` is for unique tokens associated with the connection, such as an API token to retrieve data from the
     * connection, or a refresh token.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {"content"|"hash"|"token"} pair - the specific connection pair to set
     * @param {string} value - value to set the pair to
     * @param {number} expire - expiration in UTC milliseconds
     */
    async playerConnectionSet(uuid, type, pair, value, expire) {

    }

    /**
     * Returns a live value of the player count.
     * Results are cached for 5 minutes.
     *
     * @returns {Promise<PlayerCountResult>} {@link PlayerCountResult}
     */
     async playerCount() {
        let now = Date.now()
        if (this.#_playerCountCache.live == undefined // calculate if undefined
            || this.#_playerCountCache.live_time <= now - (5 * MINUTE_MILLIS) // ... or if older than 5 minutes
        ) {
            let recent = 0, week = 0, month = 0,
            count = await(await this.#minecraft).collection(COLLECTION_DETAILS).countDocuments()

            // Pre-calculate times, loop could be in the millions someday ;)
            let lastMonthTime = now - MONTH_MILLIS,
                lastWeekTime = now - WEEK_MILLIS,
                lastDayTime = now - DAY_MILLIS

            await(await this.#minecraft).collection(COLLECTION_DETAILS).find(
                {$or: [
                    {lastLogin: {$gte: lastMonthTime}},
                    {lastLogout: {$gte: lastMonthTime}},
                ]},
                {projection: {_id: 0, lastLogin: 1, lastLogout: 1}}
            ).forEach(doc => {
                // Always within last month
                month++

                let lastTime = 0
                // Logout may not be set
                if (doc.lastLogout && doc.lastLogout > doc.lastLogin) {
                    lastTime = doc.lastLogout
                } else {
                    lastTime = doc.lastLogin
                }

                if (lastTime >= lastDayTime) {
                    week++
                    recent++
                } else if (lastTime >= lastWeekTime) {
                    week++
                }
            })

            this.#_playerCountCache.live_time = now
            this.#_playerCountCache.live = {
                time: this.#_playerCountCache.live_time,
                count, recent, week, month
            }
        }

        // Could still be undefined... maybe... idk, just in case
        return this.#_playerCountCache.live ?? error("Something went wrong, try again")
    }

    /**
     * Returns a cached value of the player count. Caches are refreshed daily.
     *
     * @returns {Promise<PlayerCountResult>} {@link PlayerCountResult}
     */
    async playerCountCache() {
        let now = new Date(Date.now())
        if (this.#_playerCountCache.daily == undefined // Calculate if undefined
            || now.toDateString() != (new Date(this.#_playerCountCache.daily_time).toDateString()) // ... or if today is not the same day
        ) {
            this.#_playerCountCache.daily = await this.playerCount()
            this.#_playerCountCache.daily_time = now.valueOf()
        }

        // Could still be undefined... maybe... idk, just in case
        return this.#_playerCountCache.daily ?? error("Something went wrong, try again")
    }

    /**
     * Get persistent player data. This is for storing player settings, **not
     * for stat tracking**. Use {@link playerStatsGet()} for that.
     *
     * `key` must match the given regex: `/[a-z_]{4,24}/`
     *
     * Results will either be a string, integer, or `null` (not set)
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} key - data to retrieve
     */
    async playerDataGet(uuid, key) {

    }

    /**
     * Set persistent player data. This is for storing player settings, **not
     * for stat tracking**. Use {@link playerStatsUpdate()} for that.
     *
     * `key` must match the given regex: `/[a-z_]{4,24}/`
     *
     * `value` must be either an integer, string, or `null` to delete `key`.
     * Accepted range for integers is {@link Number.MIN_SAFE_INTEGER} to
     * {@link Number.MAX_SAFE_INTEGER}. Strings may be anything, provided they
     * are under 200 characters
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} key - data to set
     * @param {string|number|null} value - value to set, use `null` to delete data
     */
    async playerDataSet(uuid, key, value) {

    }

    /**
     * List of ignored UUIDs
     * @typedef {object} IgnoreListResult
     * @property {number} count - number of ignored players, same as length of `ignored`
     * @property {string[]} ignored - array of string uuids that are ignored
     */
    /**
     * Get the list of UUIDs this player has ignored. Ignoring means that this
     * player will not see chat messages, be unable to send or receive private
     * messages or mail, and other limited interaction with the given player.
     *
     * This is for informational purposes only, it is up to you to retrieve this
     * and use it whenever sending mail or displaying chat messages.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid
     * @returns {Promise<IgnoreListResult>} {@link IgnoreListResult}
     */
    async playerIgnoreGet(uuid) {
        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let doc = await this.#getPlayer(binary, {ignore: 1})
        if (isNull(doc))
            return {}

        let ignored = []
        // This is not guaranteed to be set
        if (Array.isArray(doc.ignore)) {
            for (let other of doc.ignore) {
                // Ensure the uuids provided are valid, as these are the only results
                let otherUUID = toUUID(other)

                if (validateString(otherUUID) && validateUUID(otherUUID))
                    ignored.push(otherUUID)
            }
        }

        return {
            count: ignored.length,
            ignored
        }

    }

    /**
     * Set or remove an ignored player
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} other - string uuid or target to ignore
     * @param {boolean|true} ignore - true to ignore, false to undo an existing ignore
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
     async playerIgnoreSet(uuid, other, ignore=true) {
        return {success: 1}
    }

    /**
     * Specifically, this updates the "lastLogin" time and "name" of the player
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {string} name - Minecraft username of player
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
     async playerLogin(uuid, name) {
        return {success: 1}
    }

    /**
     * Specifically, this updates the "lastLogout" time of the player
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async playerLogout(uuid) {
        return {success: 1}
    }

    /**
     * Set the name style of the player. Review the {@link NameStyle} object to
     * understand the precendence of values.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @todo implement
     *
     * @param {string} uuid - string uuid of player
     * @param {NameStyle} style - new namestyle, empty object will reset to default (white, no formatting)
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async playerNameStyleSet(uuid, style) {
        return {success: 1}
    }

    /**
     * Retrieve stats of a given player. If you will be needing multiple stats,
     * you are encouraged to request all that you need in a single call.
     *
     * Stats which do not exist are not returned.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid
     * @param {string|string[]} stats - string or array of stat keys
     * @returns {Promise<PlayerStatsResult>} {@link PlayerStatsResult}
     */
    async playerStatsGet(uuid, stats) {

        if (isNull(stats))
            return error("String or String[] 'stats' is required")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        // special NULL uuid is for server-wide statistics
        if (binary.value() == NULL_UUID.value() && uuid != NULL_UUID_S)
            return {} // not valid, respond as if non-existent

        let projection = {}
        if (Array.isArray(stats)) {
            if (stats.length == 0) {
                return error("Array 'stats' is empty")
            }
            for (let key of stats) {
                if (!validateString(key))
                    return error("Array 'stats' contains an invalid value, only non-empty strings are allowed")
                if (!Object.hasOwn(this.#_stats, key))
                    return error("Array 'stats' contains invalid stat keys")
                projection[key] = 1
            }
        } else {
            if (!validateString(stats))
                return error("Key 'stats' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_stats, stats))
                return error("Key 'stats' is an invalid stat key")
            projection[stats] = 1
        }

        let doc = await(await this.#minecraft).collection(COLLECTION_STATS).findOne({uuid: binary}, {projection})
        if (isNull(doc))
            return {}

        delete doc._id // remove _id
        return {stats: flattenObject(doc)}
    }

    /**
     * Modifies the stats of a given player, returns new values.
     *
     * Stats which do not exist are set to the provided `delta` value.
     *
     * If the player does not exist, a new entry is created for the player.
     *
     * @param {string} uuid - string uuid
     * @param {string|string[]} stats - string or array of stat keys
     * @param {number} delta - integer change, can be negative
     * @returns {Promise<PlayerStatsResult>} {@link PlayerStatsResult}
     */
    async playerStatsUpdate(uuid, stats, delta) {

        if (isNull(stats))
            return error("String or String[] 'stats' is required")

        if (isNull(delta))
            return error("Integer 'delta' is required")
        if (!validateInteger(delta))
            return error("Key 'delta' must be an integer")
        else
            delta = Math.round(delta)

        if (delta == 0)
            return error("Key 'delta' cannot be zero")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        // special NULL uuid is for server-wide statistics
        if (binary.value() == NULL_UUID.value() && uuid != NULL_UUID_S)
            return error("Key 'uuid' could not be parsed, it is invalid")

        let updates = {
            $inc: {},
            $setOnInsert: {uuid: binary}
        }
        let projection = {}
        if (Array.isArray(stats)) {
            if (stats.length == 0) {
                return error("Array 'stats' is empty")
            }
            for (let key of stats) {
                if (!validateString(key))
                    return error("Array 'stats' contains an invalid value, only non-empty strings are allowed")
                if (!Object.hasOwn(this.#_stats, key))
                    return error("Array 'stats' contains invalid stat keys")
                updates.$inc[key] = Math.max(this.#_stats[key][0], Math.min(delta, this.#_stats[key][1]))
                projection[key] = 1
            }
        } else {
            if (!validateString(stats))
                return error("Key 'stats' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_stats, stats))
                return error("Key 'stats' is an invalid stat key")
            updates.$inc[stats] = Math.max(this.#_stats[stats][0], Math.min(delta, this.#_stats[stats][1]))
            projection[stats] = 1
        }

        let doc = (await(await this.#minecraft).collection(COLLECTION_STATS).findOneAndUpdate(
            {uuid: binary},
            updates,
            {
                projection,
                upsert: true,
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return error("Failed to upsert new stats for player, try again later")

        delete doc._id // remove _id
        return {stats: flattenObject(doc)}
    }

    /**
     * Player wallet result
     * @typedef {object} WalletResult
     * @property {Object.<string, number>} wallets - object containing one or many wallet values
     */
    /**
     * Retrieve the balance of the wallets for a given player.
     *
     * Unset wallets are not returned.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {string} wallets - wallet type(s)
     * @returns {Promise<WalletResult>} {@link WalletResult}
     */
    async playerWalletGet(uuid, wallets) {

        if (isNull(wallets))
            return error("String or String[] 'wallets' is required")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let projection = {}
        if (Array.isArray(wallets)) {
            if (wallets.length == 0) {
                return error("Array 'wallets' is empty")
            }
            for (let key of wallets) {
                if (!validateString(key))
                    return error("Array 'wallets' contains an invalid value, only non-empty strings are allowed")
                if (!Object.hasOwn(this.#_wallet, key))
                    return error("Array 'wallets' contains invalid wallets")
                projection["wallet." + key] = 1
            }
        } else {
            if (!validateString(wallets))
                return error("Key 'wallets' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_wallet, wallets))
                return error("Key 'wallets' is an invalid wallet")
            projection["wallet." + wallets] = 1
        }

        let doc = await this.#getPlayer(binary, projection)
        if (isNull(doc))
            return {}

        return {wallets: doc.wallet}
    }

    /**
     * Wallet modification result
     * @typedef {object} WalletModifyResult
     * @property {Object.<string, object>} wallets - object containing one or many updated wallet values
     * @property {Object.<string, boolean>} modified - object referring to whether or not that wallet was modified by
     * the transaction
     */
    /**
     * Modifies the wallets of a given player, returns new values.
     *
     * If a wallet is to be reduced, and that reduction were to leave the wallet
     * with a negative balance, `allowNegative=false` would rollback that wallet
     * to its previous state.
     *
     * If *ANY* wallet is rolled back, and `failIfPartial` is `true`, then the
     * entire operation is aborted, leaving *ALL* wallets unmodified.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {string|string[]} wallets - wallet(s) to modify
     * @param {number} delta - integer change, can be negative
     * @param {boolean|false} allowNegative - if this operation should allow reductions into the negatives, or if
     * reductions should be rolled back
     * @param {boolean|true} failIfPartial - if this operation should fail entirely if any single wallet is left
     * unmodified
     * @returns {Promise<WalletModifyResult>} {@link WalletModifyResult}
     */
    async playerWalletUpdate(uuid, wallets, delta, allowNegative=false, failIfPartial=true) {
        // coerce to bools
        allowNegative = !!allowNegative
        failIfPartial = !!failIfPartial

        if (isNull(wallets))
            return error("String or String[] 'wallets' is required")

        if (isNull(delta))
            return error("Integer 'delta' is required")
        if (!validateInteger(delta))
            return error("Key 'delta' must be an integer")
        else
            delta = Math.round(delta)

        if (delta == 0)
            return error("Key 'delta' cannot be zero")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let projection = {_id: 0}
        let update = {$inc: {}}
        if (Array.isArray(wallets)) {
            if (wallets.length == 0) {
                return error("Array 'wallets' is empty")
            }
            for (let key of wallets) {
                if (!validateString(key))
                    return error("Array 'wallets' contains an invalid value, only non-empty strings are allowed")
                if (!Object.hasOwn(this.#_wallet, key))
                    return error("Array 'wallets' contains invalid wallets")
                update.$inc["wallet." + key] = Math.max(this.#_wallet[key][0], Math.min(delta, this.#_wallet[key][1]))
                projection["wallet." + key] = 1
            }
        } else {
            if (!validateString(wallets))
                return error("Key 'wallets' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_wallet, wallets))
                return error("Key 'wallets' is an invalid wallet")
            update.$inc["wallet." + wallets] = Math.max(this.#_wallet[wallets][0], Math.min(delta, this.#_wallet[wallets][1]))
            projection["wallet." + wallets] = 1
        }

        const transactionOptions = {
            readConcern: { level: "majority" },
            writeConcern: { w: "majority" },
            readPreference: "primary",
            maxCommitTimeMS: 1000
        }
        const session = await this.#session
        try {
            session.startTransaction(transactionOptions)

            let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
                {uuid: binary},
                update,
                {
                    session,
                    projection,
                    returnDocument: ReturnDocument.AFTER
                }
            )).value

            // not found
            if (isNull(doc)) {
                await session.abortTransaction()
                return {}
            }

            // Initial result population
            let result = {
                wallets: doc.wallet,
                modified: {}
            }
            for (let wallet in result.wallets) {
                result.modified[wallet] = true
            }

            // Commit and return now
            if (allowNegative) {
                await session.commitTransaction()
                return result
            }

            // Check if rollbacks are needed
            let rollback = {$inc: {}}
            let shouldRollback = false
            projection = {_id: 0}
            for (let wallet in result.wallets) {
                // Only undo wallets with a currently negative balance, which had an amount REMOVED from them
                // It is ALWAYS safe to ADD amounts to a NEGATIVE balance
                if (result.wallets[wallet] < 0 && update.$inc["wallet." + wallet] < 0) {
                    rollback.$inc["wallet." + wallet] = -update.$inc["wallet." + wallet]
                    projection["wallet." + wallet] = 1
                    shouldRollback = true
                }
            }

            // Balances are negative, but they were not reduced by this operation
            if (!shouldRollback) {
                await session.commitTransaction()
                return result
            }

            // Full rollback
            if (shouldRollback && failIfPartial) {
                // Artificially undo the updates
                for (let wallet in result.wallets) {
                    result.wallets[wallet] += -update.$inc["wallet." + wallet]
                    result.modified[wallet] = false
                }
                await session.abortTransaction()
                return result
            }

            doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
                {uuid: binary},
                rollback,
                {
                    session,
                    projection,
                    returnDocument: ReturnDocument.AFTER
                }
            )).value

            // what?
            if (isNull(doc)) {
                await session.abortTransaction()
                return {}
            }

            // Set rollback wallets as unmodified
            for (let wallet in doc.wallet) {
                result.wallets[wallet] = doc.wallet[wallet]
                result.modified[wallet] = false
            }

            await session.commitTransaction()
            return result

        } catch (err) {
            console.error(err)
            await session.abortTransaction()
            return error("Failed to process request, try again")
        } finally {
            await session.endSession()
        }

    }

}

module.exports = new Database()
