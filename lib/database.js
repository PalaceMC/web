// TODO:
// - Move validation functions to something like a 'validation.js' file
// - Find a way to simplify input validation while also making it more difficult to improperly validate input
// - Possibly move data types to own file
// - Possibly move data validation to the API.js file instead
// - Write better documentation in the API.js file

const DB_MINECRAFT = 'minecraft'
const COLLECTION_CHAT = 'chat'
const COLLECTION_DETAILS = 'details'
const COLLECTION_LOGS = 'logs'
const COLLECTION_MAIL = 'mail'
const COLLECTION_MODERATION = 'modlogs'
const COLLECTION_STATS = 'stats'

const DB_DISCORD = 'discord'
const COLLECTION_SERVERS = 'servers'

// mongodb connection
const { UUID } = require('bson')
const NULL_UUID = new UUID(Buffer.alloc(16, 0)).toBinary()
const NULL_UUID_S = "00000000-0000-0000-0000-000000000000"
const crypto = require('crypto')
const {
    Binary,
    ClientSession,
    Db,
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
// Instant.MAX.getEpochSecond() ->
//                         31556889864403199
const INSTANT_SECOND_MAX = 31556889864403199n
// Instant.MIN.getEpochSeconds() ->
//                         -31557014167219200
const INSTANT_SECOND_MIN = -31557014167219200n

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
 *     888
 *     888
 *     888  888  888 88888b.   .d88b.  .d8888b
 *     888  888  888 888 "88b d8P  Y8b 88K
 *     888  888  888 888  888 88888888 "Y8888b.
 *     888  Y88b 888 888 d88P Y8b.          X88
 *     888   "Y88888 88888P"   "Y8888   88888P'
 *               888 888
 *          Y8b d88P 888
 *           "Y88P"  888
 *
 * General jsDoc types, used in multiple locations. TypeDefs which are used only
 * in one place are kept where they are used. If multiple places use a single
 * TypeDef, it will be placed here. */

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
 * @typedef {object} DiscordRoles
 * @property {string[]} [member] - list of member roles
 * @property {string[]} [moderator] - list of moderator roles
 * @property {string[]} [admin] - list of admin roles
 */

/**
 * Discord webhook object
 * @typedef {object} DiscordWebhook
 * @property {string} id - snowflake string of this webhook id
 * @property {string} channel - snowflake string of the associated channel
 * @property {string} token - base64 token string for the webhook
 * @property {string} kind - kind of webhook, such as `verify`, `chat`, or `moderation`
 * @property {string} name - user provided name of the webhook, original capitalization
 */

/**
 * Discord server object
 * @typedef {object} DiscordServer
 * @property {string} guild - guild id of the server
 * @property {DiscordRoles} [roles] - roles defined on this server
 * @property {DiscordWebhook[]} [webhooks] - webhooks defined on this server
 */

/**
 * Mail object
 * @typedef {object} MailObject
 * @property {string} id - the object id of this mail
 * @property {number} time - UTS milliseconds when mail was sent
 * @property {string} to - string uuid of target
 * @property {string} from - string uuid of sender
 * @property {string} origin - server that the sender was on when mail was sent
 * @property {string} message - message
 * @property {boolean} [read] - if mail is marked read, only set on first read.
 * When not present, the mail is "unread." When specifically set to `false`, it
 * means the target read the mail, then manually set it as unread
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
 * Player object. The only GUARANTEED properties in the database are the uuid,
 * name, and firstLogin. All other properties must be tested for existence,
 * otherwise assume they may be undefined/ null.
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
 * 888                                888    Y8P
 * 888                                888
 * 8888888 888  888 88888b.   .d8888b 888888 888  .d88b.  88888b.  .d8888b
 * 888     888  888 888 "88b d88P"    888    888 d88""88b 888 "88b 88K
 * 888     888  888 888  888 888      888    888 888  888 888  888 "Y8888b.
 * 888     Y88b 888 888  888 Y88b.    Y88b.  888 Y88..88P 888  888      X88
 * 888      "Y88888 888  888  "Y8888P  "Y888 888  "Y88P"  888  888  88888P'
 *
 * Helper functions */

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
 * Convert any type into a BigInt if it can be represented with 64 bits.
 * If this fails, it returns `null`.
 * Supports number-like strings ending with 'n' and 'l'
 *
 * @param {bigint|number|string} number - any type that could represent a number
 * @returns {bigint|null} resulting bigint, or `null`
 */
function toBigInt64(number) {
    if (typeof number == 'bigint' || typeof number == 'number') {
        try { return _toBigInt64(BigInt(number)) }
        catch (e) { return null }
    }

    // Any other value, try to convert to string
    if (typeof number != 'string') {
        try { number = number.toString() }
        catch (e) { return null }
    }

    // Just to be 100% certain
    if (typeof number != 'string')
        return null

    // limit size, and regex test strings
    if (number.length > 100 || !/^[1-9]+[0-9]*[LlNn]?$/.test(number))
        return null

    // strip supported endings
    if (/[LlNn]$/.test(number))
        number = number.substring(0, number.length - 1)

    try { return _toBigInt64(BigInt(number)) }
    catch (e) { return null }
}
/** For {@link toBigInt64()} */
const _toBigInt64Max = 2n ** (64n - 1n) - 1n
const _toBigInt64Min = BigInt.asIntN(64, _toBigInt64Max + 1n)
function _toBigInt64(bigint) {
    if (bigint > _toBigInt64Max || bigint < _toBigInt64Min)
        return null
    return BigInt.asIntN(64, bigint)
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
 * Check if `bigint` is a bigint value
 *
 * Identical to `typeof bigint == 'bigint' || validateInteger(bigint)`
 *
 * @param {*} bigint
 * @returns {boolean} `true` if `bigint` is a BigInt, or may be coerced to one
 */
function validateBigInt(bigint) {
    return typeof bigint == 'bigint' || validateInteger(bigint)
}

/**
 * Check if `color` is a color hex value. Must be a string.
 *
 * Identical to `/^#?[0-9a-fA-F]{6}$/.test(color)`
 *
 * @param {string} color
 * @returns {boolean} if `color` is a hex color string
 */
function validateHexColor(color) {
    return /^#?[0-9a-fA-F]{6}$/.test(color)
}

/**
 * Check if `integer` is an integer value.
 *
 * Identical to `typeof integer == 'number' && Number.isSafeInteger(number)`
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
    return typeof integer == 'number' && Number.isSafeInteger(integer)
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
    )
}

/**
 * Check if `snowflake` is a valid Snowflake ID. Must be a string.
 *
 * @param {string} snowflake
 * @returns {boolean} if `snowflake` is a valid Snowflake ID
 */
function validateSnowflake(snowflake) {
    // Discord snowflakes have a minimum numeric value of 4194304 and a maximum
    // theoretical value of 18446744073709551615, however they probably will
    // overflow and range from -9223372036854775808 to 9223372036854775807.
    // That is why this test accepts negative signs, purely as future proof
    return /^\-?[0-9]{7,20}$/.test(snowflake)
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
 * Check if `name` is a valid Minecraft username. Must be a string.
 *
 * Identical to `/^[a-zA-Z0-9_]{3,16}$/.test(name)`
 *
 * Minecraft username requirements: https://help.minecraft.net/hc/en-us/articles/4408950195341-Minecraft-Java-Edition-Username-VS-Gamertag-FAQ#:~:text=What%20are%20the%20requirements%20for%20creating%20a%20username%3F
 *
 * @param {string} name - username
 */
function validateUsername(name) {
    return /^[a-zA-Z0-9_]{3,16}$/.test(name)
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
    )
}

/* 8888888b.           888             888
 * 888  "Y88b          888             888
 * 888    888          888             888
 * 888    888  8888b.  888888  8888b.  88888b.   8888b.  .d8888b   .d88b.
 * 888    888     "88b 888        "88b 888 "88b     "88b 88K      d8P  Y8b
 * 888    888 .d888888 888    .d888888 888  888 .d888888 "Y8888b. 88888888
 * 888  .d88P 888  888 Y88b.  888  888 888 d88P 888  888      X88 Y8b.
 * 8888888P"  "Y888888  "Y888 "Y888888 88888P"  "Y888888  88888P'  "Y8888
 *
 * Beginning of the Database class object */

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
 *
 * nameStyle should always be returned for player results, and is an object, but may be an empty object.
 */
class Database {

    #client;
    #_minecraft;
    #_discord;

    /** Whitelist of connections that are allowed */
    #_connections = Object.freeze({
        "discord": 1
    })

    /** Default simple guild document projection */
    #_discordGuildBasicProjection = Object.freeze({
        guild: 1,
        roles: 1,
        _id: 0
    })

    /** Structure of nameStyle and valid values */
    #_nameStyle = Object.freeze({
        bold: Object.freeze([true, false]),
        underline: Object.freeze([true, false]),
        mColor: Object.freeze([...'0123456789abcdef']),
        color: '',
        colorB: ''
    })

    /** Default simply player object projection */
    #_playerBasicProjection = Object.freeze({
        uuid: 1,
        firstLogin: 1,
        name: 1,
        nameStyle: 1,
        _id: 0
    })

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
    #_stats = Object.freeze({
        // playtime is updated each second, give extra range for lag
        "playtime.all": Object.freeze([1, 2_000]),
        "playtime.session": Object.freeze([-2_147_483_648, 2_000]), // Session is reset using negative delta, so permit very large negative values
        "playtime.creative": Object.freeze([1, 2_000]),
        "playtime.survival": Object.freeze([1, 2_000]),
        "survival.beta.kills": Object.freeze([-1, 1]),
        "general.messages": Object.freeze([0, 1]),
    })

    /** Wallets that players have, with permitted range values for modification */
    #_wallet = Object.freeze({
        "primary": Object.freeze([-100, 100]),
        "creative": Object.freeze([-100, 100]),
        "survival": Object.freeze([-100, 100]),
    })

    constructor() {
        this.#client = new MongoClient(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@master-waua9.mongodb.net/?retryWrites=true`,
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

        this.#client.on('topologyClosed', () => {
            console.log("Database connection closed")
        })
    }

    shutdown() {
        return this.#client.close()
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
            projection = Object.assign({}, this.#_playerBasicProjection)

        projection._id = 0 // never return the _id

        return await(await this.#minecraft).collection(COLLECTION_DETAILS).findOne({uuid: binary}, {projection})
    }

    /**
     * Internal use only. Get guild document from DB. Has no error handling.
     *
     * Webhook tokens will be in this result, yet must NEVER be leaked by API.
     * Despite this warning, I expect it will inevitably somehow leak.
     *
     * @param {string} guild - guild ID
     * @param {object} projection - data to return in results, default to minimal guild details:
     * `guild`, `roles`
     */
    async #getDiscordGuild(guild, projection=undefined) {
        if (isNull(projection))
            projection = {_id: 0}
        else
            projection._id = 0 // never return the _id

        return await(await this.#discord).collection(COLLECTION_SERVERS).findOne({guild: guild}, {projection})
    }

    /* 888b     d888          888    888                    888
     * 8888b   d8888          888    888                    888
     * 88888b.d88888          888    888                    888
     * 888Y88888P888  .d88b.  888888 88888b.   .d88b.   .d88888 .d8888b
     * 888 Y888P 888 d8P  Y8b 888    888 "88b d88""88b d88" 888 88K
     * 888  Y8P  888 88888888 888    888  888 888  888 888  888 "Y8888b.
     * 888   "   888 Y8b.     Y88b.  888  888 Y88..88P Y88b 888      X88
     * 888       888  "Y8888   "Y888 888  888  "Y88P"   "Y88888  88888P'
     *
     * Generic database methods that do not belong to other groups */

    /*  .d8888b.  888               888
     * d88P  Y88b 888               888
     * 888    888 888               888
     * 888        88888b.   8888b.  888888
     * 888        888 "88b     "88b 888
     * 888    888 888  888 .d888888 888
     * Y88b  d88P 888  888 888  888 Y88b.
     *  "Y8888P"  888  888 "Y888888  "Y888
     *
     * Chat related methods */

    /**
     * List of chat messages result, ordered from newest to oldest
     * @typedef {object} ChatListResult
     * @property {number} total - total number of messages available by using `offset`
     * @property {number} count - number of chat messages in this result
     * @property {ChatObject[]} chats - array of {@link ChatObject}
     */
    /**
     * Retrieve up to 10 chat messages sent by a given player.
     *
     * Unlike other methods involving player data, this will not tell you if a
     * player exists or not. Non-existent players will simply return the normal
     * result with a `count` of zero and an empty `chats` array.
     *
     * @param {string} uuid - string uuid
     * @param {number?} since - UTC milliseconds of earliest message, all messages sent before this time
     * @param {number?} offset - offset messages for pagination
     * @param {string?} type - message type to retrieve, falsy values return all types. values starting with `!` are
     * treated like "not [type]" queries, and results will be all message that are not the given type
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
            sent: { $ne: false } // sent is only stored as false, assumed true if not present
        }

        if (type != null) {
            if (type.charAt(0) == '!')
                query.type = { $ne: type.substring(1) }
            else
                query.type = { $eq: type }
        }

        let total = await(await this.#minecraft).collection(COLLECTION_CHAT)
                .countDocuments(query)

        let result = {
            total,
            count: 0,
            chats: []
        }

        await(await this.#minecraft).collection(COLLECTION_CHAT).find(
            query,
            {
                sort: [["time", -1]],
                skip: offset,
// TODO: By returning 20 or 30 each time, we can reduce the number of API calls.
// However, the server only uses the first 10 and ignores the rest. Please update
// the server so it can cache the extra results temporarily.
                limit: 10,
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
            } else if (doc.type?.startsWith('group')) {
                // group only gets type, server excluded (effectively always "proxy")
                c.type = doc.type
            } else {
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

    /* 8888888b.  d8b                                       888
     * 888  "Y88b Y8P                                       888
     * 888    888                                           888
     * 888    888 888 .d8888b   .d8888b .d88b.  888d888 .d88888
     * 888    888 888 88K      d88P"   d88""88b 888P"  d88" 888
     * 888    888 888 "Y8888b. 888     888  888 888    888  888
     * 888  .d88P 888      X88 Y88b.   Y88..88P 888    Y88b 888
     * 8888888P"  888  88888P'  "Y8888P "Y88P"  888     "Y88888
     *
     * Discord stuff */

    /**
     * Get the specific roles of the guild, or all roles if not specified
     *
     * @param {string} guild - guild id
     * @param {"member"|"moderator"|"admin"|"all"} type - role type to retrieve
     * @returns {Promise<DiscordRoles>}
     */
    async discordRolesGet(guild, type="all") {

        if (isNull(guild))
            return error("String 'guild' is required")
        if (!validateString(guild))
            return error("Key 'guild' must be a non-empty string")
        if (!validateSnowflake(guild))
            return error("Key 'guild' must be a valid Discord Snowflake")

        if (isNull(type))
            type = "all"
        else if (!validateString(type))
            return error("Key 'type' must be a non-empty string or unset")
        else if (type !== 'member' && type !== 'moderator' && type !== 'admin' && type !== 'all')
            return error("Key 'type' must be one of \"member\", \"moderator\", \"admin\", or \"all\"")

        // default projection is guild id and roles
        let doc = await this.#getDiscordGuild(guild)

        if (isNull(doc))
            return {}

        if (type === 'all')
            return {
                member: doc.roles?.member ?? [],
                moderator: doc.roles?.moderator ?? [],
                admin: doc.roles?.admin ?? []
            }

        return {[type]: doc.roles?.[type] ?? []}

    }

    /**
     * Modify the roles of a guild, either adding, removing, or resetting them.
     * A list of roles is required for "add" and "remove" actions.
     *
     * Type "all" is only supported with action "reset".
     *
     * @param {string} guild - guild id
     * @param {"member"|"moderator"|"admin"|"all"} type - role type to modify
     * @param {"add"|"remove"|"reset"} action - action to perform
     * @param {string|string[]} roles - list of roles to use in the action
     * @returns {Promise<SuccessResult>}
     */
    async discordRolesModify(guild, type, action, roles=undefined) {

        if (isNull(guild))
            return error("String 'guild' is required")
        if (!validateString(guild))
            return error("Key 'guild' must be a non-empty string")
        if (!validateSnowflake(guild))
            return error("Key 'guild' must be a valid Discord Snowflake")

        if (isNull(action))
            return error("String 'action' is required")
        if (!validateString(action))
            return error("Key 'action' must be a non-empty string")
        if (action !== 'add' && action !== 'remove' && action !== 'reset')
            return error("Key 'action' must be one of \"add\", \"remove\", or \"reset\"")

        let reset = action === 'reset'

        if (isNull(type))
            return error("String 'type' is required")
        else if (!validateString(type))
            return error("Key 'type' must be a non-empty string")
        else if (type !== 'member' && type !== 'moderator' && type !== 'admin' && type !== 'all')
            return error("Key 'type' must be one of \"member\", \"moderator\", \"admin\", or \"all\"")

        let all = type === 'all'

        if (!reset) {

            if (all)
                return error("Type 'all' is only supported with action 'reset'")

            if (isNull(roles))
                return error("String or String[] 'roles' is required for this action")

            if (Array.isArray(roles)) {
                if (roles.length == 0)
                    return error("Array 'roles' is empty")

                for (let role of roles) {
                    if (!validateString(role))
                        return error("Array 'roles' contains an invalid value, only non-empty strings are allowed")
                    if (!validateSnowflake(role))
                        return error("Array 'roles' contains an invalid Discord Snowflake")
                }
            } else if (!validateString(roles))
                return error("Key 'roles' must be a non-empty string or string array")
            else if (!validateSnowflake(roles))
                return error("Key 'roles' must be a valid Discord Snowflake")
            else
                roles = [roles]

            let doc = (await(await this.#discord).collection(COLLECTION_SERVERS).findOneAndUpdate(
                {guild},
                (action === 'add'
                    ? {$addToSet: {[`roles.${type}`]: {$each: roles}}}
                    : {$pull: {[`roles.${type}`]: {$in: roles}}}
                ),
                {returnDocument: ReturnDocument.AFTER}
            )).value

            if (isNull(doc))
                return {}

            return {success: 1}

        }

        let doc = (await(await this.#discord).collection(COLLECTION_SERVERS).findOneAndUpdate(
            {guild},
            {$set : (all
                ? {'roles.member': [], 'roles.moderator': [], 'roles.admin': []}
                : {[`roles.${type}`]: []}
            )},
            {returnDocument: ReturnDocument.AFTER}
        )).value

        if (isNull(doc))
            return {}

        return {success: 1}

    }

    /**
     * Discord webhooks result
     * @typedef {object} DiscordWebhooksResult
     * @property {DiscordWebhook[]} webhooks - list of webhooks
     */
    /**
     * Get a list of all webhooks tracked in the guild. Returns an empty object
     * if the guild isn't found.
     *
     * @param {string} guild - guild ID
     * @param {boolean|false} tokens - whether to include tokens and ids in the results
     * @returns {Promise<DiscordWebhooksResult>} {@link DiscordWebhooksResult}
     */
    async discordWebhookGet(guild, tokens=false) {

        if (isNull(guild))
            return error("String 'guild' is required")
        if (!validateString(guild))
            return error("Key 'guild' must be a non-empty string")
        if (!validateSnowflake(guild))
            return error("Key 'guild' must be a valid Discord Snowflake")

        if (isNull(tokens))
            tokens = false
        else
            tokens = !!tokens

        let doc = await this.#getDiscordGuild(guild, {webhooks: 1})

        if (isNull(doc))
            return {}

        let webhooks = []
        if (doc.webhooks) {
            if (tokens) { // Output tokens and IDs
                for (let webhook of doc.webhooks) {
                    webhooks.push({
                        id: webhook.id,
                        token: webhook.token,
                        channel: webhook.channel,
                        name: webhook.name,
                        kind: webhook.kind
                    })
                }
            } else { // NO tokens
                for (let webhook of doc.webhooks) {
                    webhooks.push({
                        channel: webhook.channel,
                        name: webhook.name,
                        kind: webhook.kind
                    })
                }
            }
        }

        return {webhooks}

    }

    /**
     * Adds the given webhook data to the guild.
     *
     * INTERNAL FUNCTION! Problems are logged and generic errors are returned.
     * This is not for direct public access.
     *
     * @param {object} webhook - discord webhook data
     * @param {"chat"|"moderation"|"verify"} kind - type of webhook
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async discordWebhookAdd(webhook, kind) {

        let genericError = error('Operation failed, internal error occurred.')

        if (isNull(kind)) {
            console.error('Kind was not defined for discord webhook add')
            return genericError
        } else if (!validateString(kind)) {
            console.error('Kind was not a string for discord webhook add')
            return genericError
        } else if (kind !== 'chat' && kind !== 'moderation' && kind !== 'verify') {
            console.error(`Kind is not a valid type for discord webhook add, was "${kind}"`)
            return genericError
        }

        if (isNull(webhook)) {
            console.error('Discord webhook is null')
            return genericError
        } else if (!validateObject(webhook)) {
            console.error('Discord webhook is not an object')
            return genericError
        } else if (webhook.type !== 1) {
            console.error('Discord webhook has wrong type')
            console.error(webhook)
            return genericError
        }

        // Pull out data
        let {id, name, channel, guild, token} = webhook

        // Scrub token so it doesn't get logged
        delete webhook.token

        if (!validateString(id) || !validateSnowflake(id)) {
            console.error('Discord webhook has bad id')
            console.error(webhook)
            return genericError
        }
        if (!validateString(name)) {
            console.error('Discord webhook has bad name')
            console.error(webhook)
            return genericError
        }
        if (!validateString(channel) || !validateSnowflake(channel)) {
            console.error('Discord webhook has bad channel')
            console.error(webhook)
            return genericError
        }
        if (!validateString(guild) || !validateSnowflake(guild)) {
            console.error('Discord webhook has bad guild')
            console.error(webhook)
            return genericError
        }
        if (!validateString(token)) {
            // put this back in, it seems to be wrong
            webhook.token = token
            console.error('Discord webhook has bad token?')
            console.error(webhook)
            return genericError
        }

        // Stuff it into the database practically as-is
        let doc = await(await this.#discord).collection(COLLECTION_SERVERS).findOneAndUpdate(
            {guild},
            {
                $push: { webhooks: {
                    id,
                    name,
                    nameI: name.toLowerCase(),
                    kind,
                    channel,
                    token
                }}
            },
            {
                returnDocument: ReturnDocument.AFTER
            }
        )

        if (isNull(doc)) {
            // This sucks lol
            console.error('Failed to insert webhook, guild not found?')
            return error('Strange, I know not of this guild...')
        }

        return {success: 1}

    }

    /**
     * Removes the webhook data from the guild.
     *
     * @param {string} guild - guild ID
     * @param {string} id - webhook ID
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async discordWebhookRemove(guild, id) {

        if (isNull(guild))
            return error("String 'guild' is required")
        if (!validateString(guild))
            return error("Key 'guild' must be a non-empty string")
        if (!validateSnowflake(guild))
            return error("Key 'guild' must be a valid Discord Snowflake")

        if (isNull(id))
            return error("String 'id' is required")
        if (!validateString(id))
            return error("Key 'id' must be a non-empty string")
        if (!validateSnowflake(id))
            return error("Key 'id' must be a valid Discord Snowflake")

        let doc = (await (await this.#discord).collection(COLLECTION_SERVERS).findOneAndUpdate(
            {guild},
            {$pull: { webhooks: {id}}},
            {returnDocument: ReturnDocument.AFTER}
        )).value

        if (isNull(doc)) {
            // This sucks lol
            console.error('Failed to remove webhook, guild not found?')
            return error('Strange, I know not of this guild...')
        }

        return {success: 1}

    }

    /**
     * Discord servers result
     * @typedef {object} DiscordServersResult
     * @property {number} count - number of servers in this result
     * @property {DiscordServer[]} servers - list of discord servers
     */
    /**
     * Get a list of all discord servers. These are only added when the bot joins
     * a new server, and the bot can only join whitelisted servers.
     *
     * @param {boolean|false} tokens - whether to include tokens and ids in the results
     * @returns {Promise<DiscordServersResult>} {@link DiscordServersResult}
     */
    async discordServersGet(tokens=false) {

        if (isNull(tokens))
            tokens = false
        else
            tokens = !!tokens

        // Theoretically we can just return the original documents as-is, but that isn't very good for specifications of
        // an API. It primarily forces me to deliberately change internal formats, rather than alter them as I see fit.

        let servers = []
        await(await this.#discord).collection(COLLECTION_SERVERS).find().forEach(doc => {
            let server = {guild: doc.guild}

            if (doc.roles) {
                let roles = {}
                let set = false

                if (doc.roles.member) {
                    set = true
                    roles.member = []
                    for (let member of doc.roles.member) {
                        roles.member.push(member)
                    }
                }

                if (doc.roles.moderator) {
                    set = true
                    roles.moderator = []
                    for (let moderator of doc.roles.moderator) {
                        roles.moderator.push(moderator)
                    }
                }

                if (doc.roles.admin) {
                    set = true
                    roles.admin = []
                    for (let admin of doc.roles.admin) {
                        roles.admin.push(admin)
                    }
                }

                if (set) server.roles = roles
            }

            if (doc.webhooks) {
                let webhooks = []

                if (tokens) { // Output tokens and IDs
                    for (let webhook of doc.webhooks) {
                        webhooks.push({
                            id: webhook.id,
                            token: webhook.token,
                            channel: webhook.channel,
                            name: webhook.name,
                            kind: webhook.kind
                        })
                    }
                } else { // NO tokens
                    for (let webhook of doc.webhooks) {
                        webhooks.push({
                            channel: webhook.channel,
                            name: webhook.name,
                            kind: webhook.kind
                        })
                    }
                }

                server.webhooks = webhooks
            }

            servers.push(server)
        })

        return {count: servers.length, servers}
    }

    /* 888                                d8b
     * 888                                Y8P
     * 888
     * 888      .d88b.   .d88b.   .d88b.  888 88888b.   .d88b.
     * 888     d88""88b d88P"88b d88P"88b 888 888 "88b d88P"88b
     * 888     888  888 888  888 888  888 888 888  888 888  888
     * 888     Y88..88P Y88b 888 Y88b 888 888 888  888 Y88b 888
     * 88888888 "Y88P"   "Y88888  "Y88888 888 888  888  "Y88888
     *                       888      888                   888
     *                  Y8b d88P Y8b d88P              Y8b d88P
     *                   "Y88P"   "Y88P"                "Y88P"
     *
     * Uh yeah, loggging */

    /**
     * Save a log to the database. The plain message is saved on it's own, so it
     * is up to you to format them properly for future lookup.
     *
     * @param {string} message - message
     * @param {string} [exception] - optional exception message
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async logSave(message, exception=null) {
        if (isNull(message))
            return error("String 'message' is required")
        if (!validateString(message))
            return error("Key 'message' must be a non-empty string")

        if (isNull(exception))
            exception = null
        else if (!validateString(exception))
            return error("Key 'exception' must be a non-empty string or unset")

        if (message.length > 1003) // permit big logs, but have some limit
            message = message.substring(0, 1000) + "..."

        let doc = {time: Date.now(), message}

        if (exception != null) {
            if (exception.length > 1003) // same limit as above
                exception = exception.substring(0, 1000) + "..."
            doc.exception = exception
        }

        if ((await(await this.#minecraft).collection(COLLECTION_LOGS).insertOne(doc)).acknowledged) {
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
     * @param {string} uuid - string uuid of "to"
     * @param {string} id - the object id of the mail
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async mailDelete(uuid, id) {

        if (isNull(id))
            return error("String 'id' is required")
        if (!validateString(id))
            return error("Key 'id' must be a non-empty string")
        if (!validateObjectId(id))
            return error("Key 'id' is not a valid ObjectId, must be like xxxxxxxxxxxxxxxxxxxxxxxx")

        let objectId = toObjectId(id)
        if (objectId.equals(NULL_OBJECTID))
            return error("Key 'id' could not be parsed, it is invalid")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        let doc = (await(await this.#minecraft).collection(COLLECTION_MAIL).findOneAndUpdate(
            {_id: objectId, to: binary},
            {$set: {deleted: true}},
            {
                projection: {deleted: 1},
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return error("Not found")
        if (doc.deleted)
            return {success: 1}

        return error("Failed to mark mail, try again")
    }

    /**
     * List of mail
     * @typedef {object} MailGetResult
     * @property {number} total - total mail in this box (to/ from)
     * @property {number} [unread] - for "to" box only, total number of unread mail
     * @property {MailObject[]} mail - array of up to 5 mail, ordered from newest to oldest. Depending on the queried
     * box, only "to" or "from" will be present in the mail.
     */
    /**
     * Get inbox/ outbox of a given player, five at a time, optionally offset
     *
     * @param {"to"|"from"} key - which term to search mail by
     * @param {string} uuid - string uuid of target
     * @param {number|0} offset - offset search for pagination
     * @returns {Promise<MailGetResult>} {@link MailGetResult}
     */
    async mailGet(key, uuid, offset=0) {

        if (isNull(key))
            return error("String 'key' is required")
        if (!validateString(key))
            return error("Key 'key' must be a non-empty string")
        if (key !== 'to' && key !== 'from')
            return error("Key 'key' must be either \"to\" or \"from\"")

        // Helper bool for future
        let isFrom = key === 'from'

        if (isNull(offset))
            offset = 0
        else if (!validateInteger(offset))
            return error("Key 'offset' must be an integer")
        else if (offset < 0)
            return error("Key 'offset' must be positive")
        else
            offset = Math.round(offset)

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        let mail = []
        let query = isFrom ? {from: binary} : {to: binary, deleted: {$ne: true}}
        let projection = {_id: 1, time: 1, origin: 1, message: 1}
        isFrom ? projection.to = 1 : projection.from = 1, projection.read = 1

        // Collect mail
        await(await this.#minecraft).collection(COLLECTION_MAIL).find(
            query,
            {
                projection,
                sort: [["time", -1]],
                skip: offset,
                limit: 5
            }
        ).forEach(doc => {
            let m = {id: doc._id?.toHexString()}
            m.time = doc.time
            isFrom ? m.to = toUUID(doc.to) : m.from = toUUID(doc.from)
            m.origin = doc.origin
            m.message = doc.message
            if (Object.hasOwn(doc, "read"))
                m.read = doc.read
            mail.push(m)
        })

        // Count total and unread (if !isFrom)
        let total = await(await this.#minecraft).collection(COLLECTION_MAIL).countDocuments(query)

        if (isFrom)
            return {total, mail}

        query.read = {$ne: true}
        let unread = await(await this.#minecraft).collection(COLLECTION_MAIL).countDocuments(query)

        return {total, unread, mail}
    }

    /**
     * Mark a mail record as read, or unread
     *
     * @param {string} uuid - string uuid of "to"
     * @param {string} id - the object id of the mail
     * @param {boolean|true} read - mark mail as read, or unread, default: `true`
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async mailRead(uuid, id, read=true) {

        // This function differs from mailDelete() by just 7 lines
        if (isNull(read))
            read = true
        else
            read = !!read

        if (isNull(id))
            return error("String 'id' is required")
        if (!validateString(id))
            return error("Key 'id' must be a non-empty string")
        if (!validateObjectId(id))
            return error("Key 'id' is not a valid ObjectId, must be like xxxxxxxxxxxxxxxxxxxxxxxx")

        let objectId = toObjectId(id)
        if (objectId.equals(NULL_OBJECTID))
            return error("Key 'id' could not be parsed, it is invalid")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        let doc = (await(await this.#minecraft).collection(COLLECTION_MAIL).findOneAndUpdate(
            {_id: objectId, to: binary},
            {$set: {read: read}},
            {
                projection: {read: 1},
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return error("Not found")
        if (doc.read === read)
            return {success: 1}

        return error("Failed to mark mail, try again")
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
            origin,
            message
        })).acknowledged) {
            return {success: 1}
        }

        return error("Failed to save mail, try again")
    }

    /* 888b     d888               888                          888    d8b
     * 8888b   d8888               888                          888    Y8P
     * 88888b.d88888               888                          888
     * 888Y88888P888  .d88b.   .d88888  .d88b.  888d888 8888b.  888888 888  .d88b.  88888b.
     * 888 Y888P 888 d88""88b d88" 888 d8P  Y8b 888P"      "88b 888    888 d88""88b 888 "88b
     * 888  Y8P  888 888  888 888  888 88888888 888    .d888888 888    888 888  888 888  888
     * 888   "   888 Y88..88P Y88b 888 Y8b.     888    888  888 Y88b.  888 Y88..88P 888  888
     * 888       888  "Y88P"   "Y88888  "Y8888  888    "Y888888  "Y888 888  "Y88P"  888  888
     *
     * Moderation methods */

    /** @todo Implement moderation logs for all moderation actions in {@link COLLECTION_MODERATION}*/

    /**
     * MuteTime result
     * @typedef {object} MuteTime
     * @property {number|null} time - UTC milliseconds of mute expiration time, **not duration**. `null` value means no
     * mute time has been set.
     */
    /**
     * Mute/ unmute player, or retrieve mute time. This is purely for informational purposes, and will not do anything
     * on its own. When a mute expires, it is up to you to unset the mute time, which you should do.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {number|"?"|null} time - UTC milliseconds of the expiration time (**not duration**) for the mute, leave
     * undefined to unmute. `"?"` value will return the mute time.
     * @returns {Promise<SuccessResult>|Promise<MuteTime>} generic success, an error, or {@link MuteTime} if queried
     */
    async moderationMute(uuid, time=undefined) {

        if (isNull(time))
            time = null // ensure null
        else if (validateString(time)) {
            if (time != '?')
                return error("Key 'time' must be an integer, '?', or unset")
        }
        else if (!validateInteger(time))
            return error("Key 'time' must be an integer or unset")
        else if (!validateTime(time))
            return error("Key 'time' is not a reasonable time, must be in milliseconds")
        else
            time = Math.round(time)

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        if (time == '?') {
            let doc = await this.#getPlayer(binary, {mute: 1})

            if (isNull(doc))
                return {} // not found

            // enforce null result when not an integer
            return {time: (validateInteger(doc.mute) ? doc.mute : null)}
        }

        // It is valid to set a time in the past, ultimately this is just for informational purposes...

        let update = (time == null) ? {$unset: {mute: ""}} : {$set: {mute: time}}

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            update,
            {
                projection: {_id: 0, mute: 1},
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return {} // not found

        // Ensure successful update
        if ((time == null && !Object.hasOwn(doc, "mute")) || (time != null && doc.mute == time)) {
            return {success: 1}
        }

        return error("Failed to update, try again")

    }

    /* 8888888b.  888
     * 888   Y88b 888
     * 888    888 888
     * 888   d88P 888  8888b.  888  888  .d88b.  888d888
     * 8888888P"  888     "88b 888  888 d8P  Y8b 888P"
     * 888        888 .d888888 888  888 88888888 888
     * 888        888 888  888 Y88b 888 Y8b.     888
     * 888        888 "Y888888  "Y88888  "Y8888  888
     *                              888
     *                         Y8b d88P
     *                          "Y88P"
     * Player methods */

    /**
     * Player login/ logout activity.
     * @typedef {object} PlayerActivityResult
     * @property {number} lastLogin - UTC milliseconds of last login time
     * @property {number|null} lastLogout - UTC milliseconds of last logout time, `null` means the player is currently
     * connected. May not be accurate after a server crash, or if the server otherwise failed to correctly record
     * disconnection time.
     */
    /**
     * Get a player's recent login/ logout activity.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @returns {Promise<PlayerActivityResult>} {@link PlayerActivityResult}
     */
    async playerActivity(uuid) {
        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let doc = await this.#getPlayer(binary, {lastLogin: 1, lastLogout: 1})
        if (isNull(doc))
            return {}

        return {
            lastLogin: doc.lastLogin,
            lastLogout: doc.lastLogout
        }
    }

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
     * @param {string} name - player name to lookup
     * @returns {Promise<PlayerArrayResult>} {@link PlayerArrayResult}
     */
    async playerByName(name) {
        if (isNull(name))
            return error("String 'name' is required")
        if (!validateString(name))
            return error("Key 'name' must be a non-empty string")

        let players = []
        await(await this.#minecraft).collection(COLLECTION_DETAILS).find(
            {name: {$eq: name}},
            {projection: this.#_playerBasicProjection}
        ).forEach(doc => {
            players.push({
                uuid: toUUID(doc.uuid),
                firstLogin: doc.firstLogin,
                name: doc.name,
                nameStyle: doc.nameStyle ?? {}
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

        let doc = await this.#getPlayer(binary)
        if (isNull(doc))
            return {}

        return {
            uuid: toUUID(doc.uuid),
            firstLogin: doc.firstLogin,
            name: doc.name,
            nameStyle: doc.nameStyle ?? {}
        }
    }

    /**
     * Find a player given a connection type and content, only returns if the
     * connection is presently valid and not expired.
     *
     * If no player is found, or the connection is invalid/ expired, an empty
     * object is returned.
     *
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {string} content - content of connection, such as an ID or username
     * @returns {Promise<PlayerObject>} {@link PlayerObject}
     */
    async playerConnectionFind(type, content) {
        if (isNull(type))
            return error("String 'type' is required")
        if (!validateString(type))
            return error("Key 'type' must be a non-empty string")
        if (!Object.hasOwn(this.#_connections, type) || !this.#_connections[type])
            return error("Key 'type' is an invalid connection type")

        if (isNull(content))
            return error("String 'content' is required")
        if (!validateString(content))
            return error("Key 'content' must be a non-empty string")
        if (content.length > 200) // We should never be trying to store such a massive ID
            return error("Key 'content' is excessively long, cannot be more than 200 characters")

        let doc = await(await this.#minecraft).collection(COLLECTION_DETAILS).findOne(
            {$or: [
                {
                    // Temp compatibility, moving to hard object based connections, arrays are just too difficult to use
                    connections: {$elemMatch: {type: {$eq: type}, content: {$eq: content}}}
                },
                {
                    [`connections.${type}.content`]: {$eq: content}
                }
            ]},
            {projection: { // Temporary, set to `this.#_playerBasicProjection` in the future
                _id: 0,
                uuid: 1,
                firstLogin: 1,
                name: 1,
                nameStyle: 1,
                connections: 1
            }}
        )

        if (isNull(doc))
            return {}

        let connections = doc.connections ?? {}

        // Shift array to object model (yes, pause execution for this)
        if (Array.isArray(connections)) {
            connections = {}
            for (let connection of doc.connections) {
                connections[connection.type] = {
                    content: connection.content,
                    ttl: connection.ttl,
                    hash: connection.hash,
                    hash_ttl: connection.hash_ttl,
                    token: connection.token,
                    token_ttl: connection.token_ttl
                }
            }

            let doc2 = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
                {uuid: doc.uuid},
                {$set: {connections: connections}},
                {returnDocument: ReturnDocument.AFTER}
            )).value

            if (isNull(doc2))
                return error("Internal update failed, try again")
            if (!validateObject(doc2.connections))
                return error("Severe internal failure, report!")
            // Carry on
        }

        // Check value and expiration.

        // Null or empty value is "unset"
        let connectionContent = connections[type]?.content
        if (
            isNull(connectionContent) // theoretically it is impossible to search by null content... but to be sure
            || !validateString(connectionContent) // must be a non-empty string, all else is "unset"
        )
            return {}


        // Must "try" because BigInt() may fail
        try {
            let ttl = BigInt(connections[type]?.ttl)

            // TTL of Instant.MIN is "unset" / expired
            if (ttl == INSTANT_SECOND_MIN)
                return {}

            // Instant.MAX means no expiration, remember TTL is in seconds and Date.now() returns milliseconds
            if (ttl != INSTANT_SECOND_MAX && ttl <= Math.round(Date.now() / 1000) + 1)
                return {}

        } catch (e) {
            return {} // assume invalid
        }

        // Getting this far means the connection is valid and active

        return {
            uuid: toUUID(doc.uuid),
            firstLogin: doc.firstLogin,
            name: doc.name,
            nameStyle: doc.nameStyle ?? {}
        }
    }

    /**
     * Player connection object
     * @typedef {object} PlayerConnectionResult
     * @property {string} value - value of the pair
     * @property {bigint} ttl - the expiration time of the pair, in UTC **seconds**. This is a 64-bit number, ranging
     * from `-31557014167219200` to `31556889864403199`. These values are tied to the Java `Instant.MIN` and
     * `Instant.MAX` seconds. Respectively, these values refer to an "unset" time and a "no-expiration" time.
     */
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
     * @param {string} uuid - string uuid of player
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {"content"|"hash"|"token"} pair - the specific connection pair to retrieve, default: `content`
     * @returns {Promise<PlayerConnectionResult>}
     */
    async playerConnectionGet(uuid, type, pair="content") {

        if (isNull(type))
            return error("String 'type' is required")
        if (!validateString(type))
            return error("Key 'type' must be a non-empty string")
        if (!Object.hasOwn(this.#_connections, type) || !this.#_connections[type])
            return error("Key 'type' is an invalid connection type")

        if (isNull(pair))
            return error("String 'pair' is required")
        if (!validateString(pair))
            return error("Key 'pair' must be a non-empty string")
        if (pair !== "content" && pair !== "hash" && pair !== "token")
            return error("Key 'pair' is an invalid pair kind")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        // in the future, change this line back to:
        //let doc = await this.#getPlayer(binary, {[`connections.${type}`]: 1})
        let doc = await this.#getPlayer(binary, {connections: 1})

        if (isNull(doc))
            return {}

        let connections = doc.connections ?? {}

        // Shift array to object model (yes, pause execution for this)
        if (Array.isArray(connections)) {
            connections = {}
            for (let connection of doc.connections) {
                connections[connection.type] = {
                    content: connection.content,
                    ttl: connection.ttl,
                    hash: connection.hash,
                    hash_ttl: connection.hash_ttl,
                    token: connection.token,
                    token_ttl: connection.token_ttl
                }
            }

            let doc2 = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
                {uuid: binary},
                {$set: {connections: connections}},
                {returnDocument: ReturnDocument.AFTER}
            )).value

            if (isNull(doc2))
                return error("Internal update failed, try again")
            if (!validateObject(doc2.connections))
                return error("Severe internal failure, report!")
            // Carry on
        }

        if (isNull(connections[type]))
            // Default value is null, ttl is Java's Instant.MIN value
            // These are the "unset" values. TTL is always a number for simplicity
            return {value: null, ttl: INSTANT_SECOND_MIN}

        let value = null
        let ttl = null

        if (pair === 'hash') {
            value = connections[type].hash
            ttl = connections[type].hash_ttl
        } else if (pair === 'token') {
            value = connections[type].token,
            ttl = connections[type].token_ttl
        } else {
            // Default to content, returning hash or token by default is SUS
            value = connections[type].content,
            ttl = connections[type].ttl
        }

        // Check value
        if (isNull(value))
            // Default value is null, ttl is Java's Instant.MIN value
            // These are the "unset" values. TTL is always a number for simplicity
            return {value: null, ttl: INSTANT_SECOND_MIN}

        /* Amazingly... when BigInt doesn't know the type passed to its
         * constructor, it just calls `toString()` and uses that. Lovely. */
        try {
            ttl = BigInt(ttl)
        } catch (e) {
            // Somehow invalid, pretend it is unset
            return {value: null, ttl: INSTANT_SECOND_MIN}
        }

        return {value, ttl}

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
     * will remove the existing hash. **Any other `value` is ignored and a new, secure hash is generated, and the
     * `expire` will be capped to up to 300 seconds in the future. Just use `value=''` to generate the hash.**
     *
     * `token` is for unique tokens associated with the connection, such as an API token to retrieve data from the
     * connection, or a refresh token.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {string} type - connection type, e.g. `discord` or `xbox`
     * @param {"content"|"hash"|"token"} pair - the specific connection pair to set
     * @param {string} value - value to set the pair to
     * @param {bigint} expire - expiration in UTC **seconds**
     * @returns {Promise<PlayerConnectionResult>} the newly set {@link PlayerConnectionResult}
     */
    async playerConnectionSet(uuid, type, pair, value, expire) {

        if (isNull(type))
            return error("String 'type' is required")
        if (!validateString(type))
            return error("Key 'type' must be a non-empty string")
        if (!Object.hasOwn(this.#_connections, type) || !this.#_connections[type])
            return error("Key 'type' is an invalid connection type")

        if (isNull(pair))
            return error("String 'pair' is required")
        if (!validateString(pair))
            return error("Key 'pair' must be a non-empty string")
        if (pair !== "content" && pair !== "hash" && pair !== "token")
            return error("Key 'pair' is an invalid pair kind")

        // Do this before value validation, to avoid generating cryptos
        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        // null means value is being deleted
        if (isNull(value)) {
            value = null // ensure null
            expire = INSTANT_SECOND_MIN // always min if value is nullish
        } else if (pair == 'hash') {
            // special case for hash only, value is ingored (but must be non-null to get here)

            // TTL is always in seconds, Date.now() returns millis
            // clamp expire to up to 300 seconds in the future
            let now = BigInt(Math.round(Date.now() / 1000))
            let in5minutes = now + 300n

            if (isNull(expire)) // default time
                expire = in5minutes
            else {
                if (!validateBigInt(expire)) // don't support string numbers
                    return error("Key 'expire' must be a 64-bit integer or unset")

                expire = toBigInt64(expire)
                if (isNull(expire))
                    return error("Key 'expire' is not a valid 64-bit integer")

                // Clamp to now and in5minutes (why would we ever set a past expire time with a value?)
                expire = (expire <= now) ? now : (expire >= in5minutes) ? in5minutes : expire
            }

            // Ignoring value, generate new hash
            // Hash is small because it is only valid for 5 minutes, and must be paired with the MC UUID to do
            // anything. The UUID is 16 bytes, effectively providing 32 bytes of security for random guessing.
            // Even if someone knows the UUID, they only have up to 5 minutes to brute force 16 bytes.
            value = crypto.randomBytes(16).toString('hex')

        } else {
            // content & token validation is very similar

            if (!validateString(value))
                return error("Key 'value' must be a non-empty string or unset")

            if (pair == 'token') {
                if (value.length > 515) // We may have a few tokens, support more length (4x128 long token, comma separated)
                    return error("Key 'value' is excessively long, cannot be more than 515 characters for 'token'")
            } else if (pair == 'content') {
                if (value.length > 200) // We should never be trying to store such a massive ID
                    return error("Key 'value' is excessively long, cannot be more than 200 characters for 'content'")
            } else {
                // odd... reuse previous error for unknown pair
                return error("Key 'pair' is an invalid pair kind")
            }

            if (/\s/.test(value)) // Whitespace is absolutely not permitted
                return error("Key 'value' may not contain whitespace")

            if (isNull(expire))
                return error("Integer 'expire' is required")
            if (!validateBigInt(expire)) // don't support string numbers
                return error("Key 'expire' must be a 64-bit integer")

            expire = toBigInt64(expire)
            if (isNull(expire))
                return error("Key 'expire' is not a valid 64-bit integer")

            // Clamp to Instant.MIN and Instant.MAX
            expire = (expire <= INSTANT_SECOND_MIN) ? INSTANT_SECOND_MIN
                    : (expire >= INSTANT_SECOND_MAX) ? INSTANT_SECOND_MAX : expire
        }

        let conName = `connections.${type}.${pair}`
        let ttlName = `connections.${type}.${(pair == 'content' ? 'ttl' : `${pair}_ttl`)}`

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            {$set: {
                [conName]: value,
                [ttlName]: Long.fromBigInt(expire)
            }},
            {
                projection: {
                    _id: 0,
                    [conName]: 1,
                    [ttlName]: 1
                },
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return {} // not found

        let connections = doc.connections ?? {}

        if (!Object.hasOwn(connections, type))
            return error("Failed to update, try again")

        let ttl = connections[type][(pair == 'content' ? 'ttl' : `${pair}_ttl`)]
        try {
            ttl = BigInt(ttl)
        } catch (e) {
            // do not return a value, error so caller knows whatever they gave cannot be coerced back
            return error("Updated, but TTL could not be coerced into a BigInt... odd")
        }

        return {
            value: connections[type][pair],
            ttl
        }

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
     * Player custom data result, only one of `integer` or `string` property
     * will exist, depending on the type of data stored. If no data is stored,
     * the result is empty.
     * @typedef {object} PlayerCustomData
     * @property {bigint} [integer] - integer value of this custom data
     * @property {string} [string] - string value of this custom data
     */
    /**
     * Get persistent player data. This is for storing player settings, **not
     * for stat tracking**. Use {@link playerStatsGet()} for that.
     *
     * `name` must match the given regex: `/[a-z_]{4,24}/`
     *
     * Results will either be a string or integer, or empty if not set
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {string} name - data to retrieve
     * @returns {Promise<PlayerCustomData>} {@link PlayerCustomData}
     */
    async playerDataGet(uuid, name) {

        if (isNull(name))
            return error("String 'name' is required")
        if (!validateString(name))
            return error("Key 'name' must be a non-empty string")
        if (!(/^[a-z_]{4,24}$/.test(name)))
            return error("Key 'name' does not match /^[a-z_]{4,24}$/")

        // I'm just paranoid... okay?
        name = name.toLowerCase().substring(0, 24)
        if (name.length < 4 || name.length > 24 || /[\.$\[\]]/.test(name)) // make absolutely sure that no dots, brackets, or dollar signs appear
            return error("Key 'name' does not match /^[a-z_]{4,24}$/")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let doc = await this.#getPlayer(binary, {[`custom.${name}`]: 1})

        if (isNull(doc))
            return {}

        let custom = doc.custom ?? {}
        let value = custom[name]
        if (isNull(value))
            return {}

        if (typeof value == 'string')
            return {string: value}

        // Attempt to coerce to integer
        try {
            value = BigInt(value) // do BigInt, this handles longs and normal numbers
        } catch (e) {
            // I got nothing
            return error("Value stored is not a string or integer")
        }

        return {integer: value}

    }

    /**
     * Set persistent player data. This is for storing player settings, **not
     * for stat tracking**. Use {@link playerStatsUpdate()} for that.
     *
     * `name` must match the given regex: `/[a-z_]{4,24}/`
     *
     * `value` must be either an integer, string, or `null` to delete.
     * Accepted range for integers is a signed 64-bit integer, or specifically
     * `-9223372036854775808` to `9223372036854775807`. Strings must be 200
     * characters or fewer.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {string} name - data to set
     * @param {string|number|null} value - value to set, use `null` to delete data
     * @returns {Promise<SuccessResult>} {@link SuccessResult}
     */
    async playerDataSet(uuid, name, value) {

        if (isNull(name))
            return error("String 'name' is required")
        if (!validateString(name))
            return error("Key 'name' must be a non-empty string")
        if (!(/^[a-z_]{4,24}$/.test(name)))
            return error("Key 'name' does not match /^[a-z_]{4,24}$/")

        // I'm just paranoid... okay?
        name = name.toLowerCase().substring(0, 24)
        if (name.length < 4 || name.length > 24 || /[\.$\[\]]/.test(name)) // make absolutely sure that no dots, brackets, or dollar signs appear
            return error("Key 'name' does not match /^[a-z_]{4,24}$/")

        if (isNull(value)) {
            value = null // ensure null
        } else if (validateString(value)) {
            if (value.length > 200)
                return error("Key 'value' cannot be a string greater than 200 characters")
        } else if (validateBigInt(value)) {
            value = toBigInt64(value)
            if (isNull(value))
                return error("Key 'value' could not be parsed as a 64-bit signed integer")
            value = Long.fromBigInt(value)
        } else {
            return error("Key 'value' must be a string or 64-bit signed integer")
        }
        // Value is now either a good string or Long

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            (value == null ? {$unset: {[`custom.${name}`]: ""}} : {$set: {[`custom.${name}`]: value}}),
            {
                projection: {_id: 0, [`custom.${name}`]: 1},
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return {}

        let custom = doc.custom ?? {}

        // Ensure successful update
        if ((value == null && !Object.hasOwn(custom, name)) || (value != null && (typeof value == 'string' ? custom[name] == value : custom[name]?.equals(value)))) {
            return {success: 1}
        }

        return error("Failed to update, try again")

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
     * @param {string} uuid - string uuid of player
     * @param {string} other - string uuid or target to ignore
     * @param {boolean|true} ignore - true to ignore, false to undo an existing ignore
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async playerIgnoreSet(uuid, other, ignore=true) {

        if (isNull(ignore))
            ignore = true
        else
            ignore = !!ignore

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binaryTarget = toBinaryUUID(uuid)
        if (binaryTarget.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        if (isNull(other))
            return error("String 'other' is required")
        if (!validateString(other))
            return error("Key 'other' must be a non-empty string")
        if (!validateUUID(other))
            return error("Key 'other' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binaryOther = toBinaryUUID(other)
        if (binaryOther.value() == NULL_UUID.value())
            return error("Key 'other' could not be parsed, it is invalid")

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binaryTarget},
            (ignore ? {$addToSet: {ignore: binaryOther}} : {$pull: {ignore: binaryOther}}),
            {
                projection: {_id: 0, ignore: 1},
                returnDocument: ReturnDocument.AFTER
            }
        )).value

        if (isNull(doc))
            return {}

        // Validate update
        if ((!ignore && !Object.hasOwn(doc, "ignore")) // If ignore isn't present and ignore was false, the effect is successful
                // Otherwise, test for being an array, then check if the "exists" value is the same as the intended effect
                || Array.isArray(doc.ignore) && doc.ignore.some((bin) => bin.value() == binaryOther.value()) == ignore)
            return {success: 1}

        return error("Failed to update, try again")

    }

    /**
     * Login result
     * @typedef {object} LoginResult
     * @property {number} time - "official" login time, in UTC milliseconds
     * @property {number} firstLogin - first login time, in UTC milliseconds
     * @property {string} [oldName] - set to the previous username if it has changed
     * @property {true} [new] - set to `true` if this is a brand spanking new user
     */
    /**
     * Specifically, this updates the "lastLogin" & "lastLogout" time, as well
     * as the "name" of the player. Behavior is to set "lastLogout" to `null` to
     * signify presently online players, and to verify successful logouts.
     *
     * If the player does not exist, a new entry is created in the database.
     *
     * @param {string} uuid - string uuid of player
     * @param {string} name - Minecraft username of player
     * @returns {Promise<LoginResult>} {@link LoginResult}
     */
    async playerLogin(uuid, name) {

        if (isNull(name))
            return error("String 'name' is required")
        if (!validateString(name))
            return error("Key 'name' must be a non-empty string")
        if (!validateUsername(name))
            return error("Key 'name' is not a valid Minecraft username")

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return error("Key 'uuid' could not be parsed, it is invalid")

        let now = Date.now()

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            {
                $set: {
                    lastLogin: now,
                    lastLogout: null,
                    name: name
                },
                // New account stuff
                $setOnInsert: {
                    firstLogin: now
                }
            },
            {
                upsert: true,
                projection: {_id: 0, name: 1, firstLogin: 1}
            }
        )).value

        let result = {time: now}

        // For inserts, this will be null. While I would like to verify that things were set correctly, the Node.js
        // driver does not provide information to tell if an update caused an insert. This could be accomplished with
        // two operations, but I'm fine with using the single atomic operation and trusting MongoDB...
        if (isNull(doc)) {
            result.firstLogin = now
            result.new = true
        } else {
            result.firstLogin = doc.firstLogin
            if (doc.name && doc.name != name)
                result.oldName = doc.name
        }

        return result
    }

    /**
     * Logout result
     * @typedef {object} LogoutResult
     * @property {number} time - "official" logout time, in UTC milliseconds
     */
    /**
     * Specifically, this updates the "lastLogout" time of the player
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @returns {Promise<LogoutResult>} {@link LogoutResult}
     */
    async playerLogout(uuid) {

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        let now = Date.now()

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            {$set: {lastLogout: now}},
            {
                returnDocument: ReturnDocument.AFTER,
                projection: {_id: 0, lastLogout: 1}
            }
        )).value

        if (isNull(doc))
            return {}

        if (doc.lastLogout != now)
            return error("Failed to update, try again")

        return {time: now}
    }

    /**
     * Set the name style of the player. Review the {@link NameStyle} object to
     * understand the precendence of values. The provided `style` will overwrite
     * the current style completely, so cannot be used to change individual
     * options.
     *
     * If the player does not exist, an empty object is returned.
     *
     * @param {string} uuid - string uuid of player
     * @param {NameStyle|null} style - new namestyle, empty object will reset to default (white, no formatting)
     * @returns {Promise<SuccessResult>} generic success, or an error
     */
    async playerNameStyleSet(uuid, style=null) {

        let finalStyle = {}
        if (!isNull(style)) {
            if (!validateObject(style))
                return error("Key 'style' must be an object or unset")

            if (isNull(style.bold)) {
                finalStyle.bold = false
            } else {
                if (!this.#_nameStyle.bold.includes(style.bold))
                    return error(`Property 'bold' of 'style' is not a valid value: [${this.#_nameStyle.bold}]`)
                finalStyle.bold = style.bold
            }

            if (isNull(style.underline)) {
                finalStyle.underline = false
            } else {
                if (!this.#_nameStyle.underline.includes(style.underline))
                    return error(`Property 'underline' of 'style' is not a valid value: [${this.#_nameStyle.underline}]`)
                finalStyle.underline = style.underline
            }

            if (isNull(style.mColor)) {
                finalStyle.mColor = null
            } else {
                if (!this.#_nameStyle.mColor.includes(style.mColor))
                    return error(`Property 'mColor' of 'style' is not a valid value: [${this.#_nameStyle.mColor}]`)
                finalStyle.mColor = style.mColor
            }

            if (isNull(style.color)) {
                finalStyle.color = null
                finalStyle.colorB = null
            } else {
                if (!validateString(style.color))
                    return error("Property 'color' of 'style' must be a string")
                if (!validateHexColor(style.color))
                    return error("Property 'color' of 'style' is not a valid hex color, must be like #0169AF")
                finalStyle.mColor = null // set to null, defining color overrides mColor ALWAYS
                finalStyle.color = (style.color.length > 6 ? style.color.substring(1) : style.color)

                if (isNull(style.colorB)) {
                    finalStyle.colorB = null
                } else {
                    if (!validateString(style.colorB))
                        return error("Property 'colorB' of 'style' must be a string")
                    if (!validateHexColor(style.colorB))
                        return error("Property 'colorB' of 'style' is not a valid hex color, must be like #0169AF")
                    finalStyle.colorB = (style.colorB.length > 6 ? style.colorB.substring(1) : style.colorB)
                }

                // Null color & colorB if they are both effectively white
                if (finalStyle.color == 'ffffff' && (isNull(finalStyle.colorB) || finalStyle.colorB == 'ffffff')) {
                    finalStyle.color = null
                    finalStyle.colorB = null
                }
            }
        }

        if (isNull(uuid))
            return error("String 'uuid' is required")
        if (!validateString(uuid))
            return error("Key 'uuid' must be a non-empty string")
        if (!validateUUID(uuid))
            return error("Key 'uuid' is not a valid UUID, must be like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

        let binary = toBinaryUUID(uuid)
        if (binary.value() == NULL_UUID.value())
            return {} // not valid, respond as if non-existent

        // If the operation would effectively reset the style, we just unset the nameStyle entirely
        if (isNull(style) || (!finalStyle.mColor && !finalStyle.color && !finalStyle.bold && !finalStyle.underline)) {
            let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
                {uuid: binary},
                {$unset: {nameStyle: ''}},
                {
                    returnDocument: ReturnDocument.AFTER,
                    projection: {_id: 0, nameStyle: 1}
                }
            )).value

            if (isNull(doc))
                return {}

            if (doc.nameStyle)
                return error("Failed to update, try again")

            return {success: 1}
        }

        // Build update based on finalStyle values
        let update = {$set: {}, $unset: {}}

        if (finalStyle.bold)
            update.$set['nameStyle.bold'] = true
        else
            update.$unset['nameStyle.bold'] = ''

        if (finalStyle.underline)
            update.$set['nameStyle.underline'] = true
        else
            update.$unset['nameStyle.underline'] = ''

        // color takes highest priority
        if (!finalStyle.color) {
            update.$unset['nameStyle.color'] = ''
            update.$unset['nameStyle.colorB'] = ''

            if (finalStyle.mColor)
                update.$set['nameStyle.mColor'] = finalStyle.mColor
            else
                update.$unset['nameStyle.mColor'] = ''
        } else {
            update.$unset['nameStyle.mColor'] = ''

            update.$set['nameStyle.color'] = finalStyle.color

            if (finalStyle.colorB)
                update.$set['nameStyle.colorB'] = finalStyle.colorB
            else
                update.$unset['nameStyle.colorB'] = ''

        }

        let doc = (await(await this.#minecraft).collection(COLLECTION_DETAILS).findOneAndUpdate(
            {uuid: binary},
            update,
            {
                returnDocument: ReturnDocument.AFTER,
                projection: {_id: 0, nameStyle: 1}
            }
        )).value

        if (isNull(doc))
            return {}

        /* Verify nameStyle properties
         *
         * nameStyle should either be undefined, or contain properties in this way:
         * - mColor, color, and colorB may all be absent, but never null
         * - bold, if set, must be true
         * - underlined, if set, must be true
         * - mColor, if set, must not be 'f'
         * - color, if set, must not be 'ffffff' if colorB is unset
         * - colorB, if set, must not be 'ffffff' if color is also 'ffffff'
         * - mColor may only be set if color and colorB is not set
         * - colorB may only be set if color is set
         */
        if (doc.nameStyle !== undefined
                && doc.nameStyle.mColor === null
                || doc.nameStyle.color === null
                || doc.nameStyle.colorB === null

                || doc.nameStyle.bold === false
                || doc.nameStyle.underline === false
                || doc.nameStyle.mColor == 'f'
                || (doc.nameStyle.color == 'ffffff' && (!doc.nameStyle.colorB || doc.nameStyle.colorB == 'ffffff'))
                || (doc.nameStyle.mColor != undefined && (doc.nameStyle.color != undefined || doc.nameStyle.colorB != undefined))
                || (doc.nameStyle.colorB && !doc.nameStyle.color)
            )
            return error("Something went wrong!")

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
     * @todo Add 'unset' functionality, stats with value of 0 can be unset by
     * passing 'remove' to `delta`. You can only 'remove' stats that currently
     * have a value of 0!
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
                projection[`wallet.${key}`] = 1
            }
        } else {
            if (!validateString(wallets))
                return error("Key 'wallets' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_wallet, wallets))
                return error("Key 'wallets' is an invalid wallet")
            projection[`wallet.${wallets}`] = 1
        }

        let doc = await this.#getPlayer(binary, projection)
        if (isNull(doc))
            return {}

        return {wallets: doc.wallet ?? {}}
    }

    /**
     * Wallet modification result
     * @typedef {object} WalletModifyResult
     * @property {Object.<string, number>} wallets - object containing one or many updated wallet values
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
                update.$inc[`wallet.${key}`] = Math.max(this.#_wallet[key][0], Math.min(delta, this.#_wallet[key][1]))
                projection[`wallet.${key}`] = 1
            }
        } else {
            if (!validateString(wallets))
                return error("Key 'wallets' must be a non-empty string or string array")
            if (!Object.hasOwn(this.#_wallet, wallets))
                return error("Key 'wallets' is an invalid wallet")
            update.$inc[`wallet.${wallets}`] = Math.max(this.#_wallet[wallets][0], Math.min(delta, this.#_wallet[wallets][1]))
            projection[`wallet.${wallets}`] = 1
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
                wallets: doc.wallet ?? {},
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
                if (result.wallets[wallet] < 0 && update.$inc[`wallet.${wallet}`] < 0) {
                    rollback.$inc[`wallet.${wallet}`] = -update.$inc[`wallet.${wallet}`]
                    projection[`wallet.${wallet}`] = 1
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
                    result.wallets[wallet] += -update.$inc[`wallet.${wallet}`]
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

module.exports = Object.freeze(new Database())
